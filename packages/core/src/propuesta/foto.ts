/**
 * Secciones 1 a 5: la foto actual.
 *
 * Todo sale de las posiciones revisadas y nada del motor: es el patrimonio del
 * cliente tal como esta hoy, antes de que nadie proponga moverlo. La regla que
 * gobierna las cinco es la misma — la suma tiene que dar el patrimonio
 * financiero — y por eso las particiones de las secciones 3 y 4 se construyen
 * como particiones y no como filtros sueltos que casualmente sumen.
 */

import type {
  FilaActivo,
  FilaAssetClass,
  FilaExposicion,
  FilaResumenCta,
  FilaUsoPropio,
  PosicionPropuesta,
} from './tipos.js'

const EPS = 1e-6

export const SIN_CLASIFICAR = 'Sin clasificar'

/** Lo que sale de una posicion. Una venta parcial nunca supera la posicion. */
export function seVendeUsd(posicion: PosicionPropuesta): number {
  if (posicion.cta === 'venta_total') return posicion.valorUsd
  if (posicion.cta !== 'venta_parcial') return 0
  return Math.min(posicion.montoVentaParcial, posicion.valorUsd)
}

/** Lo que se queda. Una sin marcar cuenta entera: nadie decidio venderla. */
export const seConservaUsd = (posicion: PosicionPropuesta): number =>
  posicion.valorUsd - seVendeUsd(posicion)

const share = (parte: number, total: number): number => (total > EPS ? parte / total : 0)

const suma = (valores: readonly number[]): number => valores.reduce((acc, v) => acc + v, 0)

// --- Seccion 1 ---

export function armarSeccion1(posiciones: readonly PosicionPropuesta[]): {
  filas: readonly FilaActivo[]
  totalUsd: number
} {
  const filas = posiciones
    .filter((posicion) => posicion.esInvertible)
    .map(
      (posicion): FilaActivo => ({
        orden: posicion.orden,
        institucionProducto: posicion.institucionProducto,
        tipoFicha: posicion.tipoFicha,
        assetClass: posicion.assetClass,
        moneda: posicion.moneda,
        plaza: posicion.plaza,
        valorUsd: posicion.valorUsd,
        rendimientoEst: posicion.rendimientoEst,
        cta: posicion.cta,
        nota: posicion.nota,
        montoVentaParcialUsd: posicion.cta === 'venta_parcial' ? posicion.montoVentaParcial : 0,
        esInmuebleDeRenta: posicion.origen === 'inmueble',
      }),
    )
    .sort((a, b) => a.orden - b.orden)

  return { filas, totalUsd: suma(filas.map((fila) => fila.valorUsd)) }
}

// --- Seccion 2 ---

export function armarSeccion2(posiciones: readonly PosicionPropuesta[]): {
  filas: readonly FilaUsoPropio[]
  totalUsd: number
} {
  const filas = posiciones
    .filter((posicion) => !posicion.esInvertible)
    .map(
      (posicion): FilaUsoPropio => ({
        institucionProducto: posicion.institucionProducto,
        pais: posicion.pais,
        pctPertenencia: posicion.pctPertenencia,
        valorTotalUsd: posicion.valorDeclaradoUsd,
        valorTuyoUsd: posicion.valorUsd,
        uso: posicion.uso,
        rendimientoEst: posicion.rendimientoEst,
        cta: posicion.cta,
        nota: posicion.nota,
      }),
    )

  return { filas, totalUsd: suma(filas.map((fila) => fila.valorTuyoUsd)) }
}

// --- Seccion 3 ---

/**
 * Distribucion por asset class, generada desde las clases presentes.
 *
 * No hay lista fija: si el asesor creo una clase nueva en la revision, aca
 * aparece. Lo que no tiene clase no se tira a un cajon en silencio, se muestra
 * como "Sin clasificar" — y como el gate de revision no deja calcular con una
 * posicion sin clase, verla aca significa que algo se salteo.
 */
export function armarSeccion3(
  posiciones: readonly PosicionPropuesta[],
  catalogo: readonly string[] = [],
): { filas: readonly FilaAssetClass[]; totalUsd: number } {
  const invertibles = posiciones.filter((posicion) => posicion.esInvertible)
  const totalUsd = suma(invertibles.map((posicion) => posicion.valorUsd))

  const acumulado = new Map<string, { valorUsd: number; seConservaUsd: number; seVendeUsd: number }>()
  for (const nombre of catalogo) {
    acumulado.set(nombre, { valorUsd: 0, seConservaUsd: 0, seVendeUsd: 0 })
  }

  for (const posicion of invertibles) {
    const clave = posicion.assetClass ?? SIN_CLASIFICAR
    const previo = acumulado.get(clave) ?? { valorUsd: 0, seConservaUsd: 0, seVendeUsd: 0 }
    acumulado.set(clave, {
      valorUsd: previo.valorUsd + posicion.valorUsd,
      seConservaUsd: previo.seConservaUsd + seConservaUsd(posicion),
      seVendeUsd: previo.seVendeUsd + seVendeUsd(posicion),
    })
  }

  const filas = [...acumulado.entries()]
    .map(
      ([assetClass, valores]): FilaAssetClass => ({
        assetClass,
        valorUsd: valores.valorUsd,
        share: share(valores.valorUsd, totalUsd),
        seConservaUsd: valores.seConservaUsd,
        seVendeUsd: valores.seVendeUsd,
      }),
    )
    .sort((a, b) => b.valorUsd - a.valorUsd || a.assetClass.localeCompare(b.assetClass))

  return { filas, totalUsd }
}

// --- Seccion 4 ---

const ETIQUETAS_CTA = {
  conservar: 'Conservar (completo)',
  venta_total: 'Venta total (completo)',
  parcial_vende: 'Venta parcial, se vende',
  parcial_conserva: 'Venta parcial, se conserva',
  venta_condicionada: 'Venta condicionada',
  sin_marcar: 'Sin marcar',
} as const

/**
 * Resumen de decisiones.
 *
 * Las cinco categorias son una particion del patrimonio financiero: cada dolar
 * cae en una y solo una. Por eso el total da 100% y sirve de control.
 */
export function armarSeccion4(posiciones: readonly PosicionPropuesta[]): {
  filas: readonly FilaResumenCta[]
  totalUsd: number
} {
  const invertibles = posiciones.filter((posicion) => posicion.esInvertible)
  const totalUsd = suma(invertibles.map((posicion) => posicion.valorUsd))

  const parciales = invertibles.filter((posicion) => posicion.cta === 'venta_parcial')
  const porCta = (cta: PosicionPropuesta['cta']): number =>
    suma(invertibles.filter((posicion) => posicion.cta === cta).map((posicion) => posicion.valorUsd))

  const valores = {
    conservar: porCta('conservar'),
    venta_total: porCta('venta_total'),
    parcial_vende: suma(parciales.map(seVendeUsd)),
    parcial_conserva: suma(parciales.map(seConservaUsd)),
    // Se vende entera, como la venta total, pero se muestra aparte: el dinero
    // no cae al pozo comun y el resumen tiene que poder decirlo.
    venta_condicionada: porCta('venta_condicionada'),
    sin_marcar: porCta('sin_marcar'),
  }

  const filas = (Object.keys(ETIQUETAS_CTA) as (keyof typeof ETIQUETAS_CTA)[]).map(
    (categoria): FilaResumenCta => ({
      categoria,
      etiqueta: ETIQUETAS_CTA[categoria],
      valorUsd: valores[categoria],
      share: share(valores[categoria], totalUsd),
    }),
  )

  return { filas, totalUsd }
}

// --- Seccion 5 ---

function exposicion(
  invertibles: readonly PosicionPropuesta[],
  totalUsd: number,
  clave: (posicion: PosicionPropuesta) => string,
  orden: readonly string[],
): readonly FilaExposicion[] {
  const acumulado = new Map<string, number>()
  for (const posicion of invertibles) {
    acumulado.set(clave(posicion), (acumulado.get(clave(posicion)) ?? 0) + posicion.valorUsd)
  }

  return [...acumulado.entries()]
    .map(([etiqueta, valorUsd]): FilaExposicion => ({
      etiqueta,
      valorUsd,
      share: share(valorUsd, totalUsd),
    }))
    .sort((a, b) => {
      const posicionA = orden.indexOf(a.etiqueta)
      const posicionB = orden.indexOf(b.etiqueta)
      if (posicionA !== posicionB) return posicionA - posicionB
      return b.valorUsd - a.valorUsd
    })
}

export function armarSeccion5(posiciones: readonly PosicionPropuesta[]): {
  porMoneda: readonly FilaExposicion[]
  porPlaza: readonly FilaExposicion[]
} {
  const invertibles = posiciones.filter((posicion) => posicion.esInvertible)
  const totalUsd = suma(invertibles.map((posicion) => posicion.valorUsd))

  return {
    porMoneda: exposicion(invertibles, totalUsd, (posicion) => posicion.moneda, ['PEN', 'USD']),
    porPlaza: exposicion(invertibles, totalUsd, (posicion) => posicion.plaza, ['Perú', 'Offshore']),
  }
}
