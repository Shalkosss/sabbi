/**
 * Las dos miradas de la propuesta.
 *
 * La primera — "hoy" — es el portafolio del cliente tal como esta: su
 * distribucion por clase y subclase, y la rentabilidad que ese portafolio ya
 * genera. La segunda es el comparativo: el antes y el despues lado a lado,
 * clase por clase, con la rentabilidad de cada lado. No hay "que mover a
 * donde": el blotter existe para la mesa, pero la historia que se le cuenta
 * al cliente es la foto contra la foto.
 *
 * Dos niveles en las dos miradas. El primero son las clases del motor; el
 * segundo abre cada clase en lo que la compone — las subclases de la ficha en
 * el antes, los instrumentos del plan en el despues: los ETFs, los ETFs de
 * bonos, los fondos, el oro y el BTC.
 *
 * La regla de producto de siempre: no inventar. La rentabilidad se pondera
 * solo sobre lo que tiene dato y cada cifra viaja con su cobertura — que
 * fraccion del dinero la sostiene. Sin base, la celda queda vacia.
 */

import type { ClaseModelo } from '../domain/tipos.js'
import type { Plan } from '../plan.js'
import type { DatosProducto, PosicionPropuesta, Rango } from './tipos.js'
import { seConservaUsd } from './foto.js'

const EPS = 1e-6

/** El orden de bloques de la hoja Allocation detallado. */
const ORDEN_CLASES: readonly ClaseModelo[] = [
  'inm',
  'fijo',
  'variable',
  'privados',
  'club',
  'otros',
  'cash',
]

export const SUBCLASE_SIN_DATO = 'Sin asset class'

/** Una cifra de rentabilidad y el dinero que la sostiene. */
export interface RentabilidadPonderada {
  /** Banda anual esperada, ponderada sobre el dinero con dato. */
  readonly rango: Rango
  /** Fraccion del monto total que tiene retorno conocido. */
  readonly cobertura: number
}

export interface SubfilaVista {
  readonly etiqueta: string
  readonly usd: number
  /** Sobre el total del portafolio, no de la clase: se lee contra el 100%. */
  readonly share: number
  readonly rentabilidad: RentabilidadPonderada | null
  /** Solo en el despues: la linea ya la tenia el cliente y se conserva. */
  readonly conservada?: boolean
}

export interface FilaVistaClase {
  readonly clase: ClaseModelo
  readonly usd: number
  readonly share: number
  readonly rentabilidad: RentabilidadPonderada | null
  readonly subfilas: readonly SubfilaVista[]
}

/** Vista 1: el portafolio de hoy. */
export interface VistaHoy {
  readonly filas: readonly FilaVistaClase[]
  readonly totalUsd: number
  readonly rentabilidad: RentabilidadPonderada | null
  /** Renta anual estimada en dolares: rentabilidad por total. */
  readonly rentaAnualUsd: Rango | null
}

export interface FilaComparativa {
  readonly clase: ClaseModelo
  readonly antesUsd: number
  readonly antesShare: number
  readonly despuesUsd: number
  readonly despuesShare: number
  /** Despues menos antes, en puntos porcentuales. */
  readonly deltaPp: number
  readonly antesSub: readonly SubfilaVista[]
  readonly despuesSub: readonly SubfilaVista[]
  readonly rentabilidadAntes: RentabilidadPonderada | null
  readonly rentabilidadDespues: RentabilidadPonderada | null
}

/** Vista 2: antes contra despues. */
export interface VistaComparativa {
  readonly filas: readonly FilaComparativa[]
  readonly totalAntesUsd: number
  readonly totalDespuesUsd: number
  readonly rentabilidadAntes: RentabilidadPonderada | null
  readonly rentabilidadDespues: RentabilidadPonderada | null
  readonly rentaAnualAntesUsd: Rango | null
  readonly rentaAnualDespuesUsd: Rango | null
}

interface Ponderable {
  readonly usd: number
  readonly rango: Rango | null
}

const share = (parte: number, total: number): number => (total > EPS ? parte / total : 0)

/**
 * Banda ponderada sobre lo que tiene dato, con su cobertura.
 *
 * `null` cuando nada tiene dato: una rentabilidad sin base no se afirma.
 */
function ponderar(partes: readonly Ponderable[]): RentabilidadPonderada | null {
  const total = partes.reduce((acc, p) => acc + p.usd, 0)
  const conDato = partes.filter((p) => p.rango !== null && p.usd > EPS)
  const base = conDato.reduce((acc, p) => acc + p.usd, 0)
  if (base <= EPS) return null

  const min = conDato.reduce((acc, p) => acc + p.usd * (p.rango?.min ?? 0), 0) / base
  const max = conDato.reduce((acc, p) => acc + p.usd * (p.rango?.max ?? 0), 0) / base

  return { rango: { min, max }, cobertura: total > EPS ? base / total : 0 }
}

const rangoDe = (valor: number | null): Rango | null =>
  valor === null ? null : { min: valor, max: valor }

const rentaAnual = (
  rentabilidad: RentabilidadPonderada | null,
  totalUsd: number,
): Rango | null =>
  rentabilidad === null
    ? null
    : { min: rentabilidad.rango.min * totalUsd, max: rentabilidad.rango.max * totalUsd }

// --- Vista 1: hoy ---

/**
 * El "antes" se arma de las posiciones invertibles enteras: es la foto del
 * patrimonio, no de lo que se vende. La subclase es el asset class de la
 * ficha; lo que no lo tiene no se esconde, se llama por su falta.
 */
export function armarVistaHoy(posiciones: readonly PosicionPropuesta[]): VistaHoy {
  const invertibles = posiciones.filter((p) => p.esInvertible && p.claseModelo !== null)
  const totalUsd = invertibles.reduce((acc, p) => acc + p.valorUsd, 0)

  const filas = ORDEN_CLASES.flatMap((clase): FilaVistaClase[] => {
    const propias = invertibles.filter((p) => p.claseModelo === clase)
    if (propias.length === 0) return []

    const usd = propias.reduce((acc, p) => acc + p.valorUsd, 0)

    const porSubclase = new Map<string, PosicionPropuesta[]>()
    for (const p of propias) {
      const etiqueta = p.assetClass ?? SUBCLASE_SIN_DATO
      porSubclase.set(etiqueta, [...(porSubclase.get(etiqueta) ?? []), p])
    }

    const subfilas = [...porSubclase.entries()]
      .map(([etiqueta, grupo]): SubfilaVista => {
        const usdSub = grupo.reduce((acc, p) => acc + p.valorUsd, 0)
        return {
          etiqueta,
          usd: usdSub,
          share: share(usdSub, totalUsd),
          rentabilidad: ponderar(
            grupo.map((p) => ({ usd: p.valorUsd, rango: rangoDe(p.rendimientoEst) })),
          ),
        }
      })
      .sort((a, b) => b.usd - a.usd)

    return [
      {
        clase,
        usd,
        share: share(usd, totalUsd),
        rentabilidad: ponderar(
          propias.map((p) => ({ usd: p.valorUsd, rango: rangoDe(p.rendimientoEst) })),
        ),
        subfilas,
      },
    ]
  })

  const rentabilidad = ponderar(
    invertibles.map((p) => ({ usd: p.valorUsd, rango: rangoDe(p.rendimientoEst) })),
  )

  return { filas, totalUsd, rentabilidad, rentaAnualUsd: rentaAnual(rentabilidad, totalUsd) }
}

// --- Vista 2: el comparativo ---

/**
 * El "despues" sale del plan; su rentabilidad, del catalogo. Un instrumento
 * conservado que el catalogo no conoce hereda el rendimiento estimado de la
 * posicion que lo produjo — es el mismo activo — antes que quedarse vacio.
 */
export function armarComparativa(
  posiciones: readonly PosicionPropuesta[],
  plan: Plan,
  catalogo: ReadonlyMap<string, DatosProducto>,
): VistaComparativa {
  const hoy = armarVistaHoy(posiciones)
  const totalDespuesUsd = plan.totalObjetivoUsd

  const rendimientoPorNombre = new Map(
    posiciones
      .filter((p) => p.rendimientoEst !== null)
      .map((p) => [p.institucionProducto, p.rendimientoEst]),
  )

  const rangoDeLinea = (instrumento: string): Rango | null => {
    const producto = catalogo.get(instrumento)
    if (producto !== undefined && producto.retMin !== null && producto.retMax !== null) {
      return { min: producto.retMin, max: producto.retMax }
    }
    return rangoDe(rendimientoPorNombre.get(instrumento) ?? null)
  }

  const conservadas = new Set(
    posiciones.filter((p) => seConservaUsd(p) > EPS).map((p) => p.institucionProducto),
  )

  const filas = ORDEN_CLASES.flatMap((clase): FilaComparativa[] => {
    const antes = hoy.filas.find((f) => f.clase === clase)
    const reparto = plan.reparto.porClase.find((c) => c.clase === clase)
    const lineas = plan.lineas.filter((l) => l.clase === clase)

    const antesUsd = antes?.usd ?? 0
    const despuesUsd = reparto?.objetivoUsd ?? 0
    if (antesUsd <= EPS && despuesUsd <= EPS) return []

    const despuesSub = lineas
      .map((l): SubfilaVista => {
        const rango = rangoDeLinea(l.instrumento)
        return {
          etiqueta: l.instrumento,
          usd: l.usd,
          share: share(l.usd, totalDespuesUsd),
          rentabilidad: rango === null ? null : { rango, cobertura: 1 },
          conservada: conservadas.has(l.instrumento),
        }
      })
      .sort((a, b) => b.usd - a.usd)

    const rentabilidadDespues = ponderar(
      lineas.map((l) => ({ usd: l.usd, rango: rangoDeLinea(l.instrumento) })),
    )

    return [
      {
        clase,
        antesUsd,
        antesShare: share(antesUsd, hoy.totalUsd),
        despuesUsd,
        despuesShare: share(despuesUsd, totalDespuesUsd),
        deltaPp: (share(despuesUsd, totalDespuesUsd) - share(antesUsd, hoy.totalUsd)) * 100,
        antesSub: antes?.subfilas ?? [],
        despuesSub,
        rentabilidadAntes: antes?.rentabilidad ?? null,
        rentabilidadDespues,
      },
    ]
  })

  const rentabilidadDespues = ponderar(
    plan.lineas.map((l) => ({ usd: l.usd, rango: rangoDeLinea(l.instrumento) })),
  )

  return {
    filas,
    totalAntesUsd: hoy.totalUsd,
    totalDespuesUsd,
    rentabilidadAntes: hoy.rentabilidad,
    rentabilidadDespues,
    rentaAnualAntesUsd: hoy.rentaAnualUsd,
    rentaAnualDespuesUsd: rentaAnual(rentabilidadDespues, totalDespuesUsd),
  }
}
