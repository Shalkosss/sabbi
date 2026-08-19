/**
 * El catalogo de productos, normalizado.
 *
 * La hoja de origen guarda la composicion de cada producto como texto libre:
 * «Peru 75%, Emergentes ex-Peru 15%, Latam ex-Peru 10%» en una sola celda. Eso
 * no se puede validar, ni filtrar, ni sumar. Aca se abre en filas hijas, cada
 * una apuntando a un nombre canonico, que es lo que despues permite que la
 * pantalla ofrezca una lista en vez de un campo de texto.
 */

/** Una parte de la composicion de un producto. `pct` es fraccion, no puntos. */
export interface Componente {
  readonly nombre: string
  readonly pct: number
}

export type Moneda = 'USD' | 'PEN'

/** Las cuatro que usa la mesa. `Alta`, `Media` y `Baja` se traducen a estas. */
export const LIQUIDECES = ['Inmediata', 'Corto plazo', 'Mediano plazo', 'Largo plazo'] as const
export type Liquidez = (typeof LIQUIDECES)[number]

export interface ProductoCatalogo {
  readonly nombre: string
  readonly moneda: Moneda | null
  readonly liquidez: Liquidez | null
  /** Fraccion anual. `null` cuando la hoja no lo dice o dice «PENDIENTE». */
  readonly comisionPct: number | null
  readonly rentabilidadMin: number | null
  readonly rentabilidadMax: number | null
  readonly administrador: string | null
  readonly gestor: string | null
  readonly esProductoSabbi: boolean
  readonly subidoACircle: boolean
  readonly focoGeografico: readonly Componente[]
  readonly claseActivo: readonly Componente[]
  readonly subyacentes: readonly Componente[]
}

export interface SubyacenteCatalogo {
  readonly nombre: string
  readonly claseActivo: string
  /** Score de performance de la mesa, de 0 a 10. */
  readonly scorePerformance: number | null
}

export interface RegionCatalogo {
  readonly nombre: string
  /** Peso de la region en el benchmark geografico, como fraccion. */
  readonly benchmarkPct: number | null
}

export interface ActorCatalogo {
  readonly nombre: string
  /** Score de riesgo de la mesa, de 0 a 10. */
  readonly score: number | null
}

export type MotivoAviso =
  | 'nombre_vacio'
  | 'duplicado'
  | 'sin_composicion'
  | 'termino_desconocido'
  | 'suma_distinta_de_cien'
  | 'valor_ambiguo'

export interface AvisoCatalogo {
  readonly motivo: MotivoAviso
  readonly producto: string | null
  readonly campo: string | null
  readonly detalle: string
}

export interface CatalogoParseado {
  readonly productos: readonly ProductoCatalogo[]
  readonly clasesActivo: readonly string[]
  readonly subyacentes: readonly SubyacenteCatalogo[]
  readonly regiones: readonly RegionCatalogo[]
  readonly gestores: readonly ActorCatalogo[]
  readonly administradores: readonly ActorCatalogo[]
  /** Todo lo que no entro, con su motivo. Nada se descarta en silencio. */
  readonly avisos: readonly AvisoCatalogo[]
}
