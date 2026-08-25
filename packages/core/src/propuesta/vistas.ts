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

/**
 * Cuanto de la renta del portafolio sale de esta parte.
 *
 * Es la otra mitad de la pregunta que el peso deja a medias. Cash puede ser el
 * 16% del dinero y aportar el 2% de la renta; un club deal puede ser el 5% del
 * dinero y aportar el 15%. Sin esta columna las dos lineas se leen igual de
 * grandes, y la conversacion con el cliente —de donde viene lo que gana— se
 * tiene mirando el peso, que no es de donde viene.
 *
 * Se calcula sobre el punto medio de cada banda, que es el unico numero con el
 * que se pueden sumar aportes: una banda no se suma con otra. Y sobre el dinero
 * que tiene retorno conocido, igual que la rentabilidad de al lado — por eso la
 * cobertura que ya se muestra vale para las dos.
 *
 * `null` cuando nada en el portafolio tiene retorno conocido: sin base, una
 * parte de la renta no es cero, es una cifra que no se puede afirmar.
 */
export type AporteRenta = number | null

export interface SubfilaVista {
  readonly etiqueta: string
  readonly usd: number
  /** Sobre el total del portafolio, no de la clase: se lee contra el 100%. */
  readonly share: number
  readonly rentabilidad: RentabilidadPonderada | null
  /** Parte de la renta anual del portafolio que sale de esta linea. */
  readonly aporteRenta: AporteRenta
  /** Solo en el despues: la linea ya la tenia el cliente y se conserva. */
  readonly conservada?: boolean
}

export interface FilaVistaClase {
  readonly clase: ClaseModelo
  readonly usd: number
  readonly share: number
  readonly rentabilidad: RentabilidadPonderada | null
  /** Parte de la renta anual del portafolio que sale de esta clase. */
  readonly aporteRenta: AporteRenta
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
  readonly aporteRentaAntes: AporteRenta
  readonly aporteRentaDespues: AporteRenta
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

/**
 * Renta anual esperada de una parte, en dolares.
 *
 * El punto medio de la banda. Es el unico numero de una banda que se puede
 * sumar con el de otra, y sumarlos es exactamente lo que hace falta para saber
 * que parte de la renta sale de donde. Lo que no tiene banda no aporta: no se
 * le supone un retorno para que la cuenta cierre.
 */
const rentaDe = (usd: number, rango: Rango | null): number =>
  rango === null ? 0 : (usd * (rango.min + rango.max)) / 2

/** Un aporte contra la renta total. Sin renta que repartir, no hay aporte. */
const aporte = (renta: number, rentaTotal: number): AporteRenta =>
  rentaTotal <= EPS ? null : renta / rentaTotal

/** La renta anual esperada de un conjunto de partes. */
const rentaTotalDe = (partes: readonly Ponderable[]): number =>
  partes.reduce((acc, p) => acc + rentaDe(p.usd, p.rango), 0)

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

  const ponderable = (p: PosicionPropuesta) => ({
    usd: p.valorUsd,
    rango: rangoDe(p.rendimientoEst),
  })
  const rentaTotal = rentaTotalDe(invertibles.map(ponderable))

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
          rentabilidad: ponderar(grupo.map(ponderable)),
          aporteRenta: aporte(rentaTotalDe(grupo.map(ponderable)), rentaTotal),
        }
      })
      .sort((a, b) => b.usd - a.usd)

    return [
      {
        clase,
        usd,
        share: share(usd, totalUsd),
        rentabilidad: ponderar(propias.map(ponderable)),
        aporteRenta: aporte(rentaTotalDe(propias.map(ponderable)), rentaTotal),
        subfilas,
      },
    ]
  })

  const rentabilidad = ponderar(invertibles.map(ponderable))

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
  readonly aporteRentaDe: (clase: ClaseModelo) => AporteRenta
}

function leerPlan(
  plan: Plan,
  rangoDeLinea: (instrumento: string) => Rango | null,
  conservadas: ReadonlySet<string>,
): LadoDelPlan {
  const totalUsd = plan.totalObjetivoUsd
  const lineasDe = (clase: ClaseModelo) => plan.lineas.filter((l) => l.clase === clase)

  const ponderable = (l: { readonly usd: number; readonly instrumento: string }) => ({
    usd: l.usd,
    rango: rangoDeLinea(l.instrumento),
  })
  const rentabilidad = ponderar(plan.lineas.map(ponderable))
  const rentaTotal = rentaTotalDe(plan.lineas.map(ponderable))

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
            aporteRenta: aporte(rentaDe(l.usd, rango), rentaTotal),
            conservada: conservadas.has(l.instrumento),
          }
        })
        .sort((a, b) => b.usd - a.usd),
    rentabilidadDe: (clase) => ponderar(lineasDe(clase).map(ponderable)),
    aporteRentaDe: (clase) => aporte(rentaTotalDe(lineasDe(clase).map(ponderable)), rentaTotal),
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
        aporteRentaAntes: antes?.aporteRenta ?? null,
        aporteRentaDespues: despues.aporteRentaDe(clase),
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

// --- Vista 3: antes y despues, producto por producto ---

/** Una linea de la comparacion detallada: un producto con su monto. */
export interface FilaAntesDespues {
  readonly etiqueta: string
  readonly usd: number
  /** Solo en el despues: el cliente ya la tenia y se conserva. */
  readonly conservada: boolean
}

export interface ClaseAntesDespues {
  readonly clase: ClaseModelo
  readonly antesUsd: number
  readonly despuesUsd: number
  readonly antes: readonly FilaAntesDespues[]
  readonly despues: readonly FilaAntesDespues[]
}

/**
 * El antes y el despues de cada clase, posicion por posicion.
 *
 * Distinta de la comparativa en un punto que importa: el "antes" son las
 * posiciones del cliente con su nombre —«Cuenta ahorros BCP»— y no las
 * subclases agrupadas. Es la vista que el deck pone lado a lado para que el
 * cliente reconozca lo suyo en la columna de la izquierda; agrupar por asset
 * class ahi lo obligaria a adivinar cual de sus cuentas es cual.
 *
 * El "despues" son las lineas del plan, que es lo que el motor imprime.
 */
export function armarAntesYDespues(
  posiciones: readonly PosicionPropuesta[],
  plan: Plan,
  incluirInmueblesDeRenta = true,
): readonly ClaseAntesDespues[] {
  const cuentan = cuentanEnElCalculo(posiciones, incluirInmueblesDeRenta)
  const conservadas = lineasConservadas(posiciones)

  return ORDEN_CLASES.flatMap((clase): ClaseAntesDespues[] => {
    const antes = cuentan
      .filter((p) => p.claseModelo === clase && p.valorUsd > EPS)
      .map((p): FilaAntesDespues => ({
        etiqueta: p.institucionProducto,
        usd: p.valorUsd,
        conservada: false,
      }))
      .sort((a, b) => b.usd - a.usd)

    const despues = plan.lineas
      .filter((l) => l.clase === clase && l.usd > EPS)
      .map((l): FilaAntesDespues => ({
        etiqueta: l.instrumento,
        usd: l.usd,
        conservada: conservadas.has(l.instrumento),
      }))
      .sort((a, b) => b.usd - a.usd)

    if (antes.length === 0 && despues.length === 0) return []

    return [
      {
        clase,
        antesUsd: antes.reduce((acc, f) => acc + f.usd, 0),
        despuesUsd: despues.reduce((acc, f) => acc + f.usd, 0),
        antes,
        despues,
      },
    ]
  })
}
