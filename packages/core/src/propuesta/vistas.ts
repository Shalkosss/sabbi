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

import type { Benchmark, ClaseModelo } from '../domain/tipos.js'
import { CLASES } from '../domain/tipos.js'
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
 * Cuantos puntos de la rentabilidad del portafolio pone esta parte.
 *
 * Es la otra mitad de la pregunta que el peso deja a medias, y se lee en la
 * misma unidad que la cifra grande de arriba: si el portafolio rinde 4.9%, esta
 * columna dice que Inmobiliario pone 2.4 de esos puntos y Cash 0.3. Las siete
 * filas suman exactamente la rentabilidad del portafolio, y esa suma es lo que
 * hace la columna legible — un peso del 16% con un aporte de 0.3 puntos dice de
 * un vistazo que ese dinero no esta trabajando.
 *
 * Es el aporte clasico: peso por retorno. Sale del punto medio de cada banda,
 * que es el unico numero con el que se pueden sumar aportes — una banda no se
 * suma con otra — y se divide por el dinero que tiene retorno conocido, que es
 * la misma base de la rentabilidad de al lado. Por eso las dos cuadran: la
 * suma de la columna es el punto medio de la banda que dice la cabecera, y la
 * cobertura que ya se muestra vale para las dos.
 *
 * `null` cuando nada en el portafolio tiene retorno conocido: sin base, un
 * aporte no es cero, es una cifra que no se puede afirmar.
 */
export type AporteRenta = number | null

export interface SubfilaVista {
  readonly etiqueta: string
  readonly usd: number
  /** Sobre el total del portafolio, no de la clase: se lee contra el 100%. */
  readonly share: number
  readonly rentabilidad: RentabilidadPonderada | null
  /** Puntos de la rentabilidad del portafolio que pone esta linea. */
  readonly aporteRenta: AporteRenta
  /** Lo mismo, pero mirando solo lo que distribuye en efectivo. */
  readonly rentabilidadDist: RentabilidadPonderada | null
  readonly aporteDist: AporteRenta
  /** Solo en el despues: la linea ya la tenia el cliente y se conserva. */
  readonly conservada?: boolean
}

export interface FilaVistaClase {
  readonly clase: ClaseModelo
  readonly usd: number
  readonly share: number
  readonly rentabilidad: RentabilidadPonderada | null
  /** Puntos de la rentabilidad del portafolio que pone esta clase. */
  readonly aporteRenta: AporteRenta
  /** Retorno y aporte mirando solo lo que distribuye en efectivo. */
  readonly rentabilidadDist: RentabilidadPonderada | null
  readonly aporteDist: AporteRenta
  readonly subfilas: readonly SubfilaVista[]
}

/** Vista 1: el portafolio de hoy. */
export interface VistaHoy {
  readonly filas: readonly FilaVistaClase[]
  readonly totalUsd: number
  readonly rentabilidad: RentabilidadPonderada | null
  /** Renta anual estimada en dolares: rentabilidad por total. */
  readonly rentaAnualUsd: Rango | null
  /** El distributivo ponderado: la parte del retorno que se cobra en efectivo. */
  readonly rentabilidadDist: RentabilidadPonderada | null
  /** Distribucion anual estimada en dolares: distributivo por total. */
  readonly distribucionAnualUsd: Rango | null
}

export interface FilaComparativa {
  readonly clase: ClaseModelo
  readonly antesUsd: number
  readonly antesShare: number
  readonly despuesUsd: number
  readonly despuesShare: number
  /** Despues menos antes, en puntos porcentuales. */
  readonly deltaPp: number
  /**
   * El peso teórico de la clase en el benchmark del perfil, como fracción.
   *
   * Es el objetivo del modelo antes de que el cliente entre en la cuenta. El
   * «después» se aparta de acá por lo que el cliente ya conserva, por lo que el
   * asesor clavó y por las clases que se disuelven —el inmobiliario que no
   * toma, Otros bajo el ticket—. Comparar los dos es lo que dice si una clase
   * quedó sub o sobreponderada contra la teoría.
   */
  readonly benchmarkShare: number
  /** Puntos porcentuales del «después» sobre el benchmark. Negativo es subponderado. */
  readonly vsBenchmarkPp: number
  readonly antesSub: readonly SubfilaVista[]
  readonly despuesSub: readonly SubfilaVista[]
  readonly rentabilidadAntes: RentabilidadPonderada | null
  readonly rentabilidadDespues: RentabilidadPonderada | null
  readonly aporteRentaAntes: AporteRenta
  readonly aporteRentaDespues: AporteRenta
  /** Los mismos aportes, pero al distributivo — lo que se cobra en efectivo. */
  readonly rentabilidadDistAntes: RentabilidadPonderada | null
  readonly rentabilidadDistDespues: RentabilidadPonderada | null
  readonly aporteDistAntes: AporteRenta
  readonly aporteDistDespues: AporteRenta
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
  /** Distributivo ponderado y distribucion anual en dolares, cada lado. */
  readonly rentabilidadDistAntes: RentabilidadPonderada | null
  readonly rentabilidadDistDespues: RentabilidadPonderada | null
  readonly distribucionAnualAntesUsd: Rango | null
  readonly distribucionAnualDespuesUsd: Rango | null
  /** Si se pasó el benchmark: la vista solo muestra la columna teórica con él. */
  readonly conBenchmark: boolean
}

/**
 * Una parte del portafolio con sus dos retornos.
 *
 * `rango` es el retorno total —lo que sube el activo—; `rangoDist` es solo la
 * parte que se cobra en efectivo. Van juntos porque cada vista se calcula dos
 * veces, una por cada metrica, sobre exactamente las mismas partes.
 */
interface Ponderable {
  readonly usd: number
  readonly rango: Rango | null
  readonly rangoDist: Rango | null
}

/** Cual de los dos retornos mira un calculo: el total o el distributivo. */
type Selector = (p: Ponderable) => Rango | null

const RETORNO: Selector = (p) => p.rango
const DIST: Selector = (p) => p.rangoDist

const share = (parte: number, total: number): number => (total > EPS ? parte / total : 0)

/**
 * Banda ponderada sobre lo que tiene dato, con su cobertura.
 *
 * `null` cuando nada tiene dato: una rentabilidad sin base no se afirma.
 */
function ponderar(partes: readonly Ponderable[], sel: Selector = RETORNO): RentabilidadPonderada | null {
  const total = partes.reduce((acc, p) => acc + p.usd, 0)
  const conDato = partes.filter((p) => sel(p) !== null && p.usd > EPS)
  const base = conDato.reduce((acc, p) => acc + p.usd, 0)
  if (base <= EPS) return null

  const min = conDato.reduce((acc, p) => acc + p.usd * (sel(p)?.min ?? 0), 0) / base
  const max = conDato.reduce((acc, p) => acc + p.usd * (sel(p)?.max ?? 0), 0) / base

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

/**
 * El aporte de una parte a la rentabilidad del portafolio, en fraccion.
 *
 * Renta de la parte sobre la base con dato, no sobre la renta total: dividir
 * por la renta daria el reparto de la renta —cuanto del total sale de aca, en
 * porcentaje de la renta— y la columna sumaria 100% siempre, dijera lo que
 * dijera la rentabilidad. Dividiendo por la base, la columna suma la
 * rentabilidad del portafolio y se lee en sus mismas unidades.
 *
 * La base es el dinero con retorno conocido, la misma de `ponderar`. Es lo que
 * hace que las dos cifras cuadren: la suma de esta columna es el punto medio
 * de la banda que muestra la cabecera.
 */
const aporte = (renta: number, baseUsd: number): AporteRenta =>
  baseUsd <= EPS ? null : renta / baseUsd

/** La renta anual esperada de un conjunto de partes, por la metrica pedida. */
const rentaTotalDe = (partes: readonly Ponderable[], sel: Selector = RETORNO): number =>
  partes.reduce((acc, p) => acc + rentaDe(p.usd, sel(p)), 0)

/**
 * El dinero que sostiene la rentabilidad: el que tiene retorno conocido.
 *
 * Es el mismo denominador que usa `ponderar`, escrito una sola vez para que no
 * puedan desincronizarse. Si se calcularan por separado, la suma de la columna
 * de aportes dejaria de dar la cifra de la cabecera el dia que uno de los dos
 * cambiara de criterio, y esa es exactamente la clase de descuadre que nadie
 * encuentra despues.
 */
const baseConDato = (partes: readonly Ponderable[], sel: Selector = RETORNO): number =>
  partes.reduce((acc, p) => (sel(p) !== null && p.usd > EPS ? acc + p.usd : acc), 0)

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
  catalogo: ReadonlyMap<string, DatosProducto> = new Map(),
): VistaHoy {
  const invertibles = cuentanEnElCalculo(posiciones, incluirInmueblesDeRenta)
  const totalUsd = invertibles.reduce((acc, p) => acc + p.valorUsd, 0)

  // El retorno total sale de la ficha —lo que el asesor confirmo—; el
  // distributivo, del catalogo, porque la ficha no lo guarda: es un dato del
  // producto, no de la posicion. Lo que el catalogo no conoce queda sin dato
  // distributivo y no aporta, en vez de suponerle un cero que baje el promedio.
  const ponderable = (p: PosicionPropuesta): Ponderable => ({
    usd: p.valorUsd,
    rango: rangoDe(p.rendimientoEst),
    rangoDist: distDeProducto(catalogo.get(p.institucionProducto)),
  })
  const baseUsd = baseConDato(invertibles.map(ponderable))
  const baseDistUsd = baseConDato(invertibles.map(ponderable), DIST)

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
        const partes = grupo.map(ponderable)
        return {
          etiqueta,
          usd: usdSub,
          share: share(usdSub, totalUsd),
          rentabilidad: ponderar(partes),
          aporteRenta: aporte(rentaTotalDe(partes), baseUsd),
          rentabilidadDist: ponderar(partes, DIST),
          aporteDist: aporte(rentaTotalDe(partes, DIST), baseDistUsd),
        }
      })
      .sort((a, b) => b.usd - a.usd)

    const partes = propias.map(ponderable)
    return [
      {
        clase,
        usd,
        share: share(usd, totalUsd),
        rentabilidad: ponderar(partes),
        aporteRenta: aporte(rentaTotalDe(partes), baseUsd),
        rentabilidadDist: ponderar(partes, DIST),
        aporteDist: aporte(rentaTotalDe(partes, DIST), baseDistUsd),
        subfilas,
      },
    ]
  })

  const partes = invertibles.map(ponderable)
  const rentabilidad = ponderar(partes)
  const rentabilidadDist = ponderar(partes, DIST)

  return {
    filas,
    totalUsd,
    rentabilidad,
    rentaAnualUsd: rentaAnual(rentabilidad, totalUsd),
    rentabilidadDist,
    distribucionAnualUsd: rentaAnual(rentabilidadDist, totalUsd),
  }
}

/** El distributivo de un producto del catalogo, como banda. */
const distDeProducto = (producto: DatosProducto | undefined): Rango | null =>
  producto !== undefined && producto.distMin !== null && producto.distMax !== null
    ? { min: producto.distMin, max: producto.distMax }
    : null

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

/**
 * El distributivo de una linea del plan, del catalogo.
 *
 * No hereda de la posicion como el retorno: una posicion no guarda su
 * distributivo, es un dato del producto. Lo que el catalogo no conoce queda
 * sin dato y no aporta.
 */
const lectorDeDist =
  (catalogo: ReadonlyMap<string, DatosProducto>) =>
  (instrumento: string): Rango | null =>
    distDeProducto(catalogo.get(instrumento))

/** Un plan leido como portafolio: cuanto hay en cada clase y en cada linea. */
interface LadoDelPlan {
  readonly totalUsd: number
  readonly rentabilidad: RentabilidadPonderada | null
  readonly rentaAnualUsd: Rango | null
  readonly rentabilidadDist: RentabilidadPonderada | null
  readonly distribucionAnualUsd: Rango | null
  readonly usdDe: (clase: ClaseModelo) => number
  readonly fijadaEn: (clase: ClaseModelo) => boolean
  readonly subfilasDe: (clase: ClaseModelo) => readonly SubfilaVista[]
  readonly rentabilidadDe: (clase: ClaseModelo) => RentabilidadPonderada | null
  readonly aporteRentaDe: (clase: ClaseModelo) => AporteRenta
  readonly rentabilidadDistDe: (clase: ClaseModelo) => RentabilidadPonderada | null
  readonly aporteDistDe: (clase: ClaseModelo) => AporteRenta
}

function leerPlan(
  plan: Plan,
  rangoDeLinea: (instrumento: string) => Rango | null,
  distDeLinea: (instrumento: string) => Rango | null,
  conservadas: ReadonlySet<string>,
): LadoDelPlan {
  const totalUsd = plan.totalObjetivoUsd
  const lineasDe = (clase: ClaseModelo) => plan.lineas.filter((l) => l.clase === clase)

  const ponderable = (l: { readonly usd: number; readonly instrumento: string }): Ponderable => ({
    usd: l.usd,
    rango: rangoDeLinea(l.instrumento),
    rangoDist: distDeLinea(l.instrumento),
  })
  const rentabilidad = ponderar(plan.lineas.map(ponderable))
  const rentabilidadDist = ponderar(plan.lineas.map(ponderable), DIST)
  const baseUsd = baseConDato(plan.lineas.map(ponderable))
  const baseDistUsd = baseConDato(plan.lineas.map(ponderable), DIST)

  return {
    totalUsd,
    rentabilidad,
    rentaAnualUsd: rentaAnual(rentabilidad, totalUsd),
    rentabilidadDist,
    distribucionAnualUsd: rentaAnual(rentabilidadDist, totalUsd),
    usdDe: (clase) => plan.reparto.porClase.find((c) => c.clase === clase)?.objetivoUsd ?? 0,
    fijadaEn: (clase) => plan.reparto.porClase.find((c) => c.clase === clase)?.fijada ?? false,
    subfilasDe: (clase) =>
      lineasDe(clase)
        .map((l): SubfilaVista => {
          const rango = rangoDeLinea(l.instrumento)
          const rangoDist = distDeLinea(l.instrumento)
          return {
            etiqueta: l.instrumento,
            usd: l.usd,
            share: share(l.usd, totalUsd),
            rentabilidad: rango === null ? null : { rango, cobertura: 1 },
            aporteRenta: aporte(rentaDe(l.usd, rango), baseUsd),
            rentabilidadDist: rangoDist === null ? null : { rango: rangoDist, cobertura: 1 },
            aporteDist: aporte(rentaDe(l.usd, rangoDist), baseDistUsd),
            conservada: conservadas.has(l.instrumento),
          }
        })
        .sort((a, b) => b.usd - a.usd),
    rentabilidadDe: (clase) => ponderar(lineasDe(clase).map(ponderable)),
    aporteRentaDe: (clase) => aporte(rentaTotalDe(lineasDe(clase).map(ponderable)), baseUsd),
    rentabilidadDistDe: (clase) => ponderar(lineasDe(clase).map(ponderable), DIST),
    aporteDistDe: (clase) => aporte(rentaTotalDe(lineasDe(clase).map(ponderable), DIST), baseDistUsd),
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
  benchmark?: Benchmark,
): VistaComparativa {
  // El benchmark normalizado a fracción, para leerlo contra el share del
  // «después». Sin benchmark —un llamador viejo— la comparación queda en cero
  // y la vista simplemente no la muestra.
  const escalaBench = benchmark === undefined ? 0 : CLASES.reduce((a, c) => a + benchmark[c], 0)
  const benchShareDe = (clase: ClaseModelo): number =>
    benchmark === undefined || escalaBench <= EPS ? 0 : benchmark[clase] / escalaBench
  // El "antes" tambien lee el catalogo, pero solo para el distributivo: el
  // retorno total sigue saliendo de la ficha. El catalogo aca cubre tanto los
  // nombres del plan como los de las posiciones (ver `armar-propuesta`).
  const hoy = armarVistaHoy(posiciones, incluirInmueblesDeRenta, catalogo)
  const rangoDeLinea = lectorDeRango(posiciones, catalogo)
  const despues = leerPlan(plan, rangoDeLinea, lectorDeDist(catalogo), lineasConservadas(posiciones))

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
        benchmarkShare: benchShareDe(clase),
        vsBenchmarkPp: (share(despuesUsd, despues.totalUsd) - benchShareDe(clase)) * 100,
        antesSub: antes?.subfilas ?? [],
        despuesSub: despues.subfilasDe(clase),
        rentabilidadAntes: antes?.rentabilidad ?? null,
        rentabilidadDespues: despues.rentabilidadDe(clase),
        aporteRentaAntes: antes?.aporteRenta ?? null,
        aporteRentaDespues: despues.aporteRentaDe(clase),
        rentabilidadDistAntes: antes?.rentabilidadDist ?? null,
        rentabilidadDistDespues: despues.rentabilidadDistDe(clase),
        aporteDistAntes: antes?.aporteDist ?? null,
        aporteDistDespues: despues.aporteDistDe(clase),
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
    rentabilidadDistAntes: hoy.rentabilidadDist,
    rentabilidadDistDespues: despues.rentabilidadDist,
    distribucionAnualAntesUsd: hoy.distribucionAnualUsd,
    distribucionAnualDespuesUsd: despues.distribucionAnualUsd,
    conBenchmark: benchmark !== undefined && escalaBench > EPS,
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
