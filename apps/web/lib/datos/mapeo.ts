import type { DestinoVenta } from '@sabbi/core'
import type { DeudaFicha, PosicionFicha } from '@sabbi/io'

import type { PosicionEditada } from '../estado'

/**
 * Traducción entre la ficha parseada y las filas de `ficha_positions`.
 *
 * Un solo lugar para las dos direcciones: si aparece una columna nueva, se ve
 * enseguida si se guarda y si vuelve.
 */

/** Solo estos dos valores acepta la restricción de la columna. */
const usoValido = (uso: string | null): 'Renta' | 'Uso propio' | null => {
  if (uso === null) return null
  const normal = uso.trim().toLowerCase()
  if (normal.startsWith('uso propio')) return 'Uso propio'
  if (normal.startsWith('renta')) return 'Renta'
  return null
}

/**
 * Fila vacía con todas las columnas.
 *
 * Las posiciones y las deudas entran en el mismo insert, y PostgREST exige que
 * todos los objetos de un insert múltiple tengan exactamente las mismas
 * claves: la primera fila define las columnas y una segunda con otras claves
 * rebota el lote entero. Partir de acá lo garantiza.
 */
const filaBase = (fichaId: string) => ({
  ficha_id: fichaId,
  orden: 0,
  origen: 'financiero' as string,
  institucion_producto: '',
  tipo_ficha: null as string | null,
  asset_class: null as string | null,
  clase_modelo: null as string | null,
  producto_id: null as string | null,
  moneda: null as string | null,
  plaza: 'Perú' as string,
  pertenencia: null as string | null,
  pct_pertenencia: 1,
  valor_usd: 0,
  valor_original: null as number | null,
  rendimiento_est: null as number | null,
  fee_pct: null as number | null,
  pais: null as string | null,
  alquiler_mensual_usd: null as number | null,
  uso: null as string | null,
  es_invertible: true,
  cta: 'sin_marcar' as string,
  monto_venta_parcial: 0,
  destinos: [] as unknown[],
  nota: null as string | null,
  editado_manualmente: false,
  campos_editados: [] as string[],
  oculta: false,
})

export const filaDePosicion = (posicion: PosicionFicha, fichaId: string) => ({
  ...filaBase(fichaId),
  orden: posicion.orden,
  origen: posicion.origen,
  institucion_producto: posicion.institucionProducto,
  tipo_ficha: posicion.tipoFicha,
  asset_class: posicion.assetClass,
  clase_modelo: posicion.claseModelo,
  producto_id: posicion.productoId,
  moneda: posicion.moneda,
  plaza: posicion.plaza,
  pertenencia: posicion.pertenencia,
  pct_pertenencia: posicion.pctPertenencia,
  valor_usd: posicion.valorUsd,
  valor_original: posicion.valorDeclaradoUsd,
  rendimiento_est: posicion.rendimientoEst,
  fee_pct: posicion.feePct,
  pais: posicion.pais,
  alquiler_mensual_usd: posicion.alquilerMensualUsd,
  uso: usoValido(posicion.uso),
  es_invertible: posicion.esInvertible,
  cta: posicion.cta,
  monto_venta_parcial: posicion.montoVentaParcial,
  destinos: posicion.destinos ?? [],
})

/**
 * Las deudas viajan con las posiciones.
 *
 * No entran a ningún cálculo del motor, pero la propuesta las muestra y perder
 * la lista obligaría a volver al archivo. Quedan detrás de las posiciones en el
 * orden y marcadas como no invertibles.
 */
export const filaDeDeuda = (deuda: DeudaFicha, fichaId: string, desplazamiento: number) => ({
  ...filaBase(fichaId),
  orden: desplazamiento + deuda.orden,
  origen: 'deuda',
  institucion_producto: deuda.nombre,
  pertenencia: deuda.pertenencia,
  valor_usd: deuda.valorUsd,
  rendimiento_est: deuda.interesAnual,
  es_invertible: false,
})

export interface FilaPosicion {
  id: string
  orden: number | null
  origen: string
  institucion_producto: string
  tipo_ficha: string | null
  asset_class: string | null
  clase_modelo: string | null
  producto_id: string | null
  moneda: string | null
  plaza: string
  pertenencia: string | null
  pct_pertenencia: number
  valor_usd: number
  valor_original: number | null
  rendimiento_est: number | null
  fee_pct: number | null
  pais: string | null
  alquiler_mensual_usd: number | null
  uso: string | null
  es_invertible: boolean
  cta: string
  monto_venta_parcial: number
  destinos: unknown
  nota: string | null
  editado_manualmente: boolean
  campos_editados: string[] | null
  oculta: boolean | null
}

export const posicionDeFila = (fila: FilaPosicion): PosicionEditada => ({
  id: fila.id,
  orden: fila.orden ?? 0,
  origen: fila.origen === 'inmueble' ? 'inmueble' : 'financiero',
  fila: fila.orden ?? 0,
  institucionProducto: fila.institucion_producto,
  tipoFicha: fila.tipo_ficha,
  assetClass: fila.asset_class,
  claseModelo: (fila.clase_modelo ?? null) as PosicionEditada['claseModelo'],
  // Lo que vuelve sin clase es exactamente lo que hay que confirmar: el parser
  // no inventa una y el motor no corre sin ella.
  requiereConfirmacion: fila.clase_modelo === null,
  // El enlace al catálogo lo escribió el alta automática al subir la ficha;
  // descartarlo acá dejaba a toda la revisión creyendo que ninguna posición
  // tenía producto, que es justo lo que decide qué se conserva.
  productoId: fila.producto_id,
  moneda: fila.moneda === 'PEN' ? 'PEN' : 'USD',
  plaza: fila.plaza === 'Offshore' ? 'Offshore' : 'Perú',
  pertenencia: fila.pertenencia,
  pctPertenencia: fila.pct_pertenencia,
  valorUsd: fila.valor_usd,
  valorDeclaradoUsd: fila.valor_original ?? fila.valor_usd,
  rendimientoEst: fila.rendimiento_est,
  feePct: fila.fee_pct,
  pais: fila.pais,
  alquilerMensualUsd: fila.alquiler_mensual_usd,
  uso: fila.uso,
  esInvertible: fila.es_invertible,
  cta: fila.cta as PosicionEditada['cta'],
  montoVentaParcial: fila.monto_venta_parcial,
  // El reparto llega como jsonb y puede venir de una fila escrita antes de que
  // la columna existiera. Lo que no es una lista se lee como sin reparto, que
  // es lo que el motor bloquea con nombre propio.
  destinos: Array.isArray(fila.destinos) ? (fila.destinos as readonly DestinoVenta[]) : [],
  nota: fila.nota ?? '',
  editadoManualmente: fila.editado_manualmente,
  camposEditados: fila.campos_editados ?? [],
  oculta: fila.oculta ?? false,
})

/** Columna de `ficha_positions` para cada campo que el asesor puede corregir. */
export const COLUMNA_DE_CAMPO: Readonly<Record<string, string>> = {
  institucionProducto: 'institucion_producto',
  tipoFicha: 'tipo_ficha',
  assetClass: 'asset_class',
  claseModelo: 'clase_modelo',
  moneda: 'moneda',
  plaza: 'plaza',
  valorUsd: 'valor_usd',
  rendimientoEst: 'rendimiento_est',
  feePct: 'fee_pct',
  cta: 'cta',
  montoVentaParcial: 'monto_venta_parcial',
  destinos: 'destinos',
  nota: 'nota',
  esInvertible: 'es_invertible',
  camposEditados: 'campos_editados',
  oculta: 'oculta',
}
