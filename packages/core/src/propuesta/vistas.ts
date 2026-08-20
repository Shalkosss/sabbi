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
 * Las posiciones que entran al calculo, que son las que el "antes" muestra.
 *
 * Con el toggle de inmuebles de renta apagado, esos inmuebles salen del
 * patrimonio financiero — el motor no los reparte — y por lo tanto tampoco son
 * parte de la foto que se compara contra el plan.
 */
export function cuentanEnElCalculo(
  posiciones: readonly PosicionPropuesta[],
  incluirInmueblesDeRenta = true,
): readonly PosicionPropuesta[] {
  return posiciones.filter(
    (p) =>
      p.esInvertible &&
      p.claseModelo !== null &&
      (incluirInmueblesDeRenta || p.origen !== 'inmueble'),
  )
}

/**
 * El "antes" se arma de las posiciones invertibles enteras: es la foto del
 * patrimonio, no de lo que se vende. La subclase es el asset class de la
 * ficha; lo que no lo tiene no se esconde, se llama por su falta.
 */
export function armarVistaHoy(
  posiciones: readonly PosicionPropuesta[],
  incluirInmueblesDeRenta = true,
): VistaHoy {
  const invertibles = cuentanEnElCalculo(posiciones, incluirInmueblesDeRenta)
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
 * Como leer la rentabilidad de una linea del plan.
 *
 * Manda el catalogo. Un instrumento conservado que el catalogo no conoce hereda
 * el rendimiento estimado de la posicion que lo produjo — es el mismo activo —
 * antes que quedarse vacio.
 */
function lectorDeRango(
  posiciones: readonly PosicionPropuesta[],
  catalogo: ReadonlyMap<string, DatosProducto>,
): (instrumento: string) => Rango | null {
  const rendimientoPorNombre = new Map(
    posiciones
      .filter((p) => p.rendimientoEst !== null)
      .map((p) => [p.institucionProducto, p.rendimientoEst]),
  )

  return (instrumento: string): Rango | null => {
    const producto = catalogo.get(instrumento)
    if (producto !== undefined && producto.retMin !== null && producto.retMax !== null) {
      return { min: producto.retMin, max: producto.retMax }
    }
    return rangoDe(rendimientoPorNombre.get(instrumento) ?? null)
  }
}

/** Un plan leido como portafolio: cuanto hay en cada clase y en cada linea. */
interface LadoDelPlan {
  readonly totalUsd: number
  readonly rentabilidad: RentabilidadPonderada | null
  readonly rentaAnualUsd: Rango | null
  readonly usdDe: (clase: ClaseModelo) => number
  readonly fijadaEn: (clase: ClaseModelo) => boolean
  readonly subfilasDe: (clase: ClaseModelo) => readonly SubfilaVista[]
  readonly rentabilidadDe: (clase: ClaseModelo) => RentabilidadPonderada | null
}

function leerPlan(
  plan: Plan,
  rangoDeLinea: (instrumento: string) => Rango | null,
  conservadas: ReadonlySet<string>,
): LadoDelPlan {
  const totalUsd = plan.totalObjetivoUsd
  const lineasDe = (clase: ClaseModelo) => plan.lineas.filter((l) => l.clase === clase)

  const rentabilidad = ponderar(
    plan.lineas.map((l) => ({ usd: l.usd, rango: rangoDeLinea(l.instrumento) })),
  )

  return {
    totalUsd,
    rentabilidad,
    rentaAnualUsd: rentaAnual(rentabilidad, totalUsd),
    usdDe: (clase) => plan.reparto.porClase.find((c) => c.clase === clase)?.objetivoUsd ?? 0,
    fijadaEn: (clase) => plan.reparto.porClase.find((c) => c.clase === clase)?.fijada ?? false,
    subfilasDe: (clase) =>
      lineasDe(clase)
        .map((l): SubfilaVista => {
          const rango = rangoDeLinea(l.instrumento)
          return {
            etiqueta: l.instrumento,
            usd: l.usd,
            share: share(l.usd, totalUsd),
            rentabilidad: rango === null ? null : { rango, cobertura: 1 },
            conservada: conservadas.has(l.instrumento),
          }
        })
        .sort((a, b) => b.usd - a.usd),
    rentabilidadDe: (clase) =>
      ponderar(lineasDe(clase).map((l) => ({ usd: l.usd, rango: rangoDeLinea(l.instrumento) }))),
  }
}

/** Las lineas del plan que el cliente ya tiene, por nombre. */
const lineasConservadas = (posiciones: readonly PosicionPropuesta[]): ReadonlySet<string> =>
  new Set(posiciones.filter((p) => seConservaUsd(p) > EPS).map((p) => p.institucionProducto))

/**
 * El "despues" sale del plan; su rentabilidad, del catalogo.
 */
export function armarComparativa(
  posiciones: readonly PosicionPropuesta[],
  plan: Plan,
  catalogo: ReadonlyMap<string, DatosProducto>,
  incluirInmueblesDeRenta = true,
): VistaComparativa {
  const hoy = armarVistaHoy(posiciones, incluirInmueblesDeRenta)
  const rangoDeLinea = lectorDeRango(posiciones, catalogo)
  const despues = leerPlan(plan, rangoDeLinea, lineasConservadas(posiciones))

  const filas = ORDEN_CLASES.flatMap((clase): FilaComparativa[] => {
    const antes = hoy.filas.find((f) => f.clase === clase)

    const antesUsd = antes?.usd ?? 0
    const despuesUsd = despues.usdDe(clase)
    if (antesUsd <= EPS && despuesUsd <= EPS) return []

    return [
      {
        clase,
        antesUsd,
        antesShare: share(antesUsd, hoy.totalUsd),
        despuesUsd,
        despuesShare: share(despuesUsd, despues.totalUsd),
        deltaPp: (share(despuesUsd, despues.totalUsd) - share(antesUsd, hoy.totalUsd)) * 100,
        antesSub: antes?.subfilas ?? [],
        despuesSub: despues.subfilasDe(clase),
        rentabilidadAntes: antes?.rentabilidad ?? null,
        rentabilidadDespues: despues.rentabilidadDe(clase),
      },
    ]
  })

  return {
    filas,
    totalAntesUsd: hoy.totalUsd,
    totalDespuesUsd: despues.totalUsd,
    rentabilidadAntes: hoy.rentabilidad,
    rentabilidadDespues: despues.rentabilidad,
    rentaAnualAntesUsd: hoy.rentaAnualUsd,
    rentaAnualDespuesUsd: despues.rentaAnualUsd,
  }
}

// --- Vista 3: los dos portafolios ---

/** Un portafolio entero, para la cabecera de su columna. */
export interface LadoPortafolio {
  readonly totalUsd: number
  readonly rentabilidad: RentabilidadPonderada | null
  readonly rentaAnualUsd: Rango | null
}

export interface FilaDosPortafolios {
  readonly clase: ClaseModelo
  readonly hoyUsd: number
  readonly hoyShare: number
  readonly sistemaUsd: number
  readonly sistemaShare: number
  readonly ajustadoUsd: number
  readonly ajustadoShare: number
  /** Ajustado menos sistema, en dolares. Lo que movio la mano del asesor. */
  readonly deltaUsd: number
  /** Ajustado menos sistema, en puntos porcentuales del portafolio. */
  readonly deltaPp: number
  /** La clase quedo en ese monto porque el asesor lo pidio, no el benchmark. */
  readonly fijada: boolean
  readonly hoySub: readonly SubfilaVista[]
  readonly sistemaSub: readonly SubfilaVista[]
  readonly ajustadoSub: readonly SubfilaVista[]
  readonly rentabilidadHoy: RentabilidadPonderada | null
  readonly rentabilidadSistema: RentabilidadPonderada | null
  readonly rentabilidadAjustado: RentabilidadPonderada | null
}

/**
 * Los dos portafolios objetivo, contra la foto de hoy.
 *
 * El de la ficha es el punto de partida; el del sistema es lo que el motor
 * propone solo, con el benchmark del perfil; el ajustado es ese mismo motor
 * despues de que el asesor clavo montos, agrego activos o saco clases del
 * calculo. Las tres columnas se leen a la misma altura para que la pregunta
 * "que cambio por lo que yo toque" tenga una respuesta y no una sospecha.
 */
export interface VistaDosPortafolios {
  readonly filas: readonly FilaDosPortafolios[]
  readonly hoy: LadoPortafolio
  readonly sistema: LadoPortafolio
  readonly ajustado: LadoPortafolio
  /**
   * Cuanto dinero cambio de clase entre los dos objetivos.
   *
   * Es la mitad de la suma de las diferencias absolutas: cada dolar que sale de
   * una clase entra en otra, y contarlo dos veces duplicaria el movimiento.
   */
  readonly movidoUsd: number
}

export function armarDosPortafolios(
  posiciones: readonly PosicionPropuesta[],
  planSistema: Plan,
  planAjustado: Plan,
  catalogo: ReadonlyMap<string, DatosProducto>,
  incluirInmueblesDeRenta = true,
): VistaDosPortafolios {
  const hoy = armarVistaHoy(posiciones, incluirInmueblesDeRenta)
  const rangoDeLinea = lectorDeRango(posiciones, catalogo)
  const conservadas = lineasConservadas(posiciones)

  const sistema = leerPlan(planSistema, rangoDeLinea, conservadas)
  const ajustado = leerPlan(planAjustado, rangoDeLinea, conservadas)

  const filas = ORDEN_CLASES.flatMap((clase): FilaDosPortafolios[] => {
    const enLaFicha = hoy.filas.find((f) => f.clase === clase)
    const hoyUsd = enLaFicha?.usd ?? 0
    const sistemaUsd = sistema.usdDe(clase)
    const ajustadoUsd = ajustado.usdDe(clase)
    if (hoyUsd <= EPS && sistemaUsd <= EPS && ajustadoUsd <= EPS) return []

    const sistemaShare = share(sistemaUsd, sistema.totalUsd)
    const ajustadoShare = share(ajustadoUsd, ajustado.totalUsd)

    return [
      {
        clase,
        hoyUsd,
        hoyShare: share(hoyUsd, hoy.totalUsd),
        sistemaUsd,
        sistemaShare,
        ajustadoUsd,
        ajustadoShare,
        deltaUsd: ajustadoUsd - sistemaUsd,
        deltaPp: (ajustadoShare - sistemaShare) * 100,
        fijada: ajustado.fijadaEn(clase),
        hoySub: enLaFicha?.subfilas ?? [],
        sistemaSub: sistema.subfilasDe(clase),
        ajustadoSub: ajustado.subfilasDe(clase),
        rentabilidadHoy: enLaFicha?.rentabilidad ?? null,
        rentabilidadSistema: sistema.rentabilidadDe(clase),
        rentabilidadAjustado: ajustado.rentabilidadDe(clase),
      },
    ]
  })

  const movidoUsd = filas.reduce((acc, fila) => acc + Math.abs(fila.deltaUsd), 0) / 2

  const lado = (plan: LadoDelPlan): LadoPortafolio => ({
    totalUsd: plan.totalUsd,
    rentabilidad: plan.rentabilidad,
    rentaAnualUsd: plan.rentaAnualUsd,
  })

  return {
    filas,
    hoy: {
      totalUsd: hoy.totalUsd,
      rentabilidad: hoy.rentabilidad,
      rentaAnualUsd: hoy.rentaAnualUsd,
    },
    sistema: lado(sistema),
    ajustado: lado(ajustado),
    movidoUsd,
  }
}
