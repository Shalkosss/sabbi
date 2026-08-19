/**
 * Secciones 6 y 7: el portafolio objetivo y el blotter.
 *
 * Estas dos si salen del motor. La 6 pone el plan al lado del modelo puro —
 * el mismo benchmark corrido ignorando lo que el cliente ya tiene — porque esa
 * comparacion es la que explica cada desvio. La 7 cierra: lo que se vende
 * contra lo que se compra, con un cuadre que tiene que dar cero.
 *
 * Nada se inventa. Un instrumento que no esta en el catalogo viaja sin retorno
 * esperado en vez de con uno supuesto.
 */

import type { ClaseModelo, Piso } from '../domain/tipos.js'
import type { Plan } from '../plan.js'
import type {
  DatosProducto,
  FilaComparativo,
  GrupoObjetivo,
  LineaCompra,
  LineaObjetivo,
  LineaVenta,
  ParametrosPropuesta,
  ParametrosVisibles,
  PosicionPropuesta,
  Rango,
} from './tipos.js'
import { seVendeUsd } from './foto.js'

const EPS = 1e-6

/** El mismo orden de bloques que usa el motor y la hoja Allocation detallado. */
const ORDEN_CLASES: readonly ClaseModelo[] = [
  'inm',
  'fijo',
  'variable',
  'privados',
  'club',
  'otros',
  'cash',
]

const share = (parte: number, total: number): number => (total > EPS ? parte / total : 0)

const suma = (valores: readonly number[]): number => valores.reduce((acc, v) => acc + v, 0)

const rango = (min: number | null, max: number | null): Rango | null =>
  min === null || max === null ? null : { min, max }

/**
 * Una linea del plan es conservada cuando su nombre es el de un piso.
 *
 * El motor emite las conservadas con la etiqueta del piso que las produjo, asi
 * que la comparacion es exacta y no hace falta volver a emparejar contra el
 * catalogo. Mercados Privados es la excepcion: reparte el objetivo entero de
 * la clase y no emite lineas de piso, y por eso el motor ya avisa cuando esa
 * clase trae algo conservado.
 */
const esConservada = (
  instrumento: string,
  clase: ClaseModelo,
  pisos: readonly Piso[],
): boolean => pisos.some((piso) => piso.clase === clase && piso.etiqueta === instrumento)

// --- Seccion 6 ---

export function armarParametros(
  plan: Plan,
  parametros: ParametrosPropuesta,
  pctModeloInmobiliario: number,
): ParametrosVisibles {
  return {
    ticketFinancieroTotalUsd: plan.totalObjetivoUsd,
    montoAReinvertirUsd: plan.dineroNuevoUsd,
    fxPenUsd: parametros.fxPenUsd,
    colchonLiquidezUsd: parametros.colchonLiquidezUsd,
    pctModeloInmobiliario,
    baseRedistribucionUsd: plan.reparto.baseRedistribucion,
  }
}

export function armarGrupos(
  plan: Plan,
  pisos: readonly Piso[],
  catalogo: ReadonlyMap<string, DatosProducto>,
): readonly GrupoObjetivo[] {
  const total = plan.totalObjetivoUsd

  return ORDEN_CLASES.map((clase) => {
    const reparto = plan.reparto.porClase.find((candidata) => candidata.clase === clase)
    const lineas = plan.lineas
      .filter((linea) => linea.clase === clase)
      .map((linea): LineaObjetivo => {
        const producto = catalogo.get(linea.instrumento)
        const distributivo = rango(producto?.distMin ?? null, producto?.distMax ?? null)

        return {
          instrumento: linea.instrumento,
          usd: linea.usd,
          share: share(linea.usd, total),
          conservada: esConservada(linea.instrumento, clase, pisos),
          retornoTotal: rango(producto?.retMin ?? null, producto?.retMax ?? null),
          retornoDistributivo: distributivo,
          distribucionAnualUsd:
            distributivo === null
              ? null
              : { min: linea.usd * distributivo.min, max: linea.usd * distributivo.max },
          moneda: producto?.moneda ?? null,
          nota: linea.nota ?? null,
        }
      })

    return {
      clase,
      objetivoUsd: reparto?.objetivoUsd ?? 0,
      share: share(reparto?.objetivoUsd ?? 0, total),
      cerrada: reparto?.cerrada ?? false,
      lineas,
    }
  }).filter((grupo) => grupo.objetivoUsd > EPS || grupo.lineas.length > 0)
}

/**
 * Recomendado contra modelo puro.
 *
 * La diferencia va en puntos porcentuales sobre el total objetivo, no en
 * dolares: lo que el asesor tiene que poder decir es "esta clase quedo tres
 * puntos por encima del modelo porque el cliente conserva un plazo fijo", y
 * eso no se lee en una diferencia de montos.
 */
export function armarComparativo(plan: Plan, modeloPuro: Plan): readonly FilaComparativo[] {
  const total = plan.totalObjetivoUsd
  const totalModelo = modeloPuro.totalObjetivoUsd

  const montoDe = (lineas: Plan['lineas'], clase: ClaseModelo, instrumento: string): number =>
    suma(
      lineas
        .filter((linea) => linea.clase === clase && linea.instrumento === instrumento)
        .map((linea) => linea.usd),
    )

  return ORDEN_CLASES.flatMap((clase): FilaComparativo[] => {
    const recomendado = plan.reparto.porClase.find((c) => c.clase === clase)?.objetivoUsd ?? 0
    const modelo = modeloPuro.reparto.porClase.find((c) => c.clase === clase)?.objetivoUsd ?? 0
    if (recomendado <= EPS && modelo <= EPS) return []

    const instrumentos = [
      ...new Set(
        [...plan.lineas, ...modeloPuro.lineas]
          .filter((linea) => linea.clase === clase)
          .map((linea) => linea.instrumento),
      ),
    ]

    const filaClase: FilaComparativo = {
      nivel: 'clase',
      clase,
      etiqueta: clase,
      modeloUsd: modelo,
      recomendadoUsd: recomendado,
      difPp: (share(recomendado, total) - share(modelo, totalModelo)) * 100,
    }

    const filasInstrumento = instrumentos
      .map((instrumento): FilaComparativo => {
        const rec = montoDe(plan.lineas, clase, instrumento)
        const mod = montoDe(modeloPuro.lineas, clase, instrumento)
        return {
          nivel: 'instrumento',
          clase,
          etiqueta: instrumento,
          modeloUsd: mod,
          recomendadoUsd: rec,
          difPp: (share(rec, total) - share(mod, totalModelo)) * 100,
        }
      })
      .sort((a, b) => b.recomendadoUsd - a.recomendadoUsd || b.modeloUsd - a.modeloUsd)

    return [filaClase, ...filasInstrumento]
  })
}

// --- Seccion 7 ---

export function armarVentas(posiciones: readonly PosicionPropuesta[]): readonly LineaVenta[] {
  return posiciones
    .filter((posicion) => posicion.esInvertible && seVendeUsd(posicion) > EPS)
    .map(
      (posicion): LineaVenta => ({
        instrumento: posicion.institucionProducto,
        accion: posicion.cta === 'venta_total' ? 'Venta total' : 'Venta parcial',
        usd: seVendeUsd(posicion),
      }),
    )
    .sort((a, b) => b.usd - a.usd)
}

/**
 * Las compras, clase por clase.
 *
 * El monto de cada clase es el `dineroNuevoUsd` del reparto, que es la verdad
 * del motor. Repartirlo entre las lineas no conservadas da el detalle por
 * instrumento; cuando esas lineas no suman exactamente ese monto — pasa en
 * Mercados Privados, que reparte el objetivo entero de la clase — se prorratea
 * para que el bloque cierre en la cifra del motor y no en otra.
 */
export function armarCompras(plan: Plan, pisos: readonly Piso[]): readonly LineaCompra[] {
  return ORDEN_CLASES.flatMap((clase): LineaCompra[] => {
    const dineroNuevo = plan.reparto.porClase.find((c) => c.clase === clase)?.dineroNuevoUsd ?? 0
    if (dineroNuevo <= EPS) return []

    const candidatas = plan.lineas.filter(
      (linea) => linea.clase === clase && !esConservada(linea.instrumento, clase, pisos),
    )
    const bruto = suma(candidatas.map((linea) => linea.usd))
    if (bruto <= EPS) return []

    const factor = dineroNuevo / bruto

    return candidatas
      .map((linea): LineaCompra => ({
        instrumento: linea.instrumento,
        clase,
        usd: linea.usd * factor,
      }))
      .sort((a, b) => b.usd - a.usd)
  })
}
