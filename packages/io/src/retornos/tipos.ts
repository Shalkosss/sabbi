/**
 * Lo que se puede sacar del libro `Macro_Base_Retornos_Master_Funds`.
 *
 * El libro tiene diecinueve hojas y una sola sirve: `Retornos`. Las seis de
 * clase (`PD`, `PE`, `VC`, `INFRA`, `RE`, `HF`) son vistas cualitativas — AUM,
 * estrategia, lock up — y las de `Distributivos` son un recorte de catorce
 * fondos con NAV. `Retornos` es la unica que tiene las setenta series
 * completas y la ficha de cada fondo debajo.
 *
 * Nada de esto es el formato de la base: es el formato del libro. La
 * traduccion a `fondos` y `fondos_observaciones` la hace el importador, que es
 * quien decide que columna se descarta y cual se fusiona.
 */

/** Una serie mensual: el mes y el retorno total publicado, como fraccion. */
export interface PuntoSerie {
  readonly mes: string
  readonly retornoTotal: number
}

/** Una columna de la hoja `Retornos`, ya leida. */
export interface FondoDelLibro {
  readonly nombre: string
  /** `null` cuando el codigo de la fila «Asset Class» no es uno de los seis. */
  readonly assetClass: string | null
  readonly inception: string | null
  /** Retorno objetivo de corto plazo, como fraccion. */
  readonly guidanceCortoPlazo: number | null
  readonly domicilio: string | null
  /**
   * `true` para las lineas que la hoja compara pero nadie compra: HYG, IVV,
   * IYR, los indices BDC, el Barclay Hedge Fund Index. Ver `ES_REFERENCIA`.
   */
  readonly esReferencia: boolean
  /** Del mes mas viejo al mas nuevo, sin huecos vacios. */
  readonly serie: readonly PuntoSerie[]
  /** Las columnas del libro de las que salio, en A1. Mas de una si se fusiono. */
  readonly columnas: readonly string[]
}

/**
 * El bloque de metricas que la macro dejo escrito debajo de cada columna.
 *
 * No se importa: se usa para contrastar. Es el unico registro de lo que la
 * mesa publico hasta hoy, y si el motor no lo reproduce, la diferencia hay que
 * poder explicarla antes de reemplazar la hoja.
 *
 * Las claves son las de `VENTANAS` mas `a<anio>`; el valor es `null` donde la
 * celda estaba vacia o en `#NUM!`.
 */
export interface MetricasDelLibro {
  readonly retorno: Readonly<Record<string, number | null>>
  readonly desviacion: Readonly<Record<string, number | null>>
  readonly sharpe: Readonly<Record<string, number | null>>
  readonly anios: Readonly<Record<number, number | null>>
}

export type MotivoAvisoRetornos =
  | 'columna sin nombre'
  | 'columna sin serie'
  | 'clase desconocida'
  | 'columnas fusionadas'
  | 'inception ilegible'
  | 'mes fuera de rango'

export interface AvisoRetornos {
  readonly motivo: MotivoAvisoRetornos
  /** El fondo al que afecta, cuando se lo pudo nombrar. */
  readonly fondo: string | null
  readonly detalle: string
}

export interface RetornosParseados {
  readonly fondos: readonly FondoDelLibro[]
  /**
   * Los doce cierres del Treasury 10Y que la hoja tiene por mes.
   *
   * Vienen sin anio: la hoja los rotula «Treasury 10Y (enero)» y en ningun
   * lado dice de que anio son. Quien importe tiene que decirlo; adivinarlo
   * escribe doce filas con la fecha equivocada y nadie lo nota, porque el
   * Sharpe no los usa.
   */
  readonly treasuryPorMes: Readonly<Record<string, number>>
  /** El bloque de metricas de la hoja, por nombre de fondo. */
  readonly declaradas: ReadonlyMap<string, MetricasDelLibro>
  readonly avisos: readonly AvisoRetornos[]
}
