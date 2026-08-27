/**
 * Tipos del modulo de retornos de fondos.
 *
 * Es un dominio aparte del motor de portafolios: no comparte tipos con
 * `domain/tipos.ts` ni entra en el solver. Lo unico que tienen en comun es la
 * regla de la casa — funcion pura, sin red, sin DOM, sin reloj.
 *
 * La unidad de observacion es el mes. La hoja `Distributivos` fecha cada
 * observacion en el primer dia del mes y aca se conserva esa convencion: una
 * clave `AAAA-MM` en vez de una fecha, porque el dia no significa nada y dos
 * formatos de fecha distintos es como se pierde el emparejamiento.
 */

/** Un mes calendario, `AAAA-MM`. Es la clave de toda la serie. */
export type Mes = string

/**
 * Una observacion mensual de un fondo.
 *
 * Son dos numeros distintos y ninguno se deduce del otro:
 *
 * - `nav` es el valor cuota que publica el manager. Solo produce la ganancia
 *   de capital.
 * - `retornoTotal` es el retorno del mes con distribuciones reinvertidas, tal
 *   como lo publica el manager. Es el que manda: **todas** las metricas se
 *   calculan sobre esta serie.
 *
 * En un fondo distributivo los dos divergen y esa divergencia es justamente lo
 * que la hoja mide. Calcular el retorno como `nav_t / nav_t-1 - 1` descarta la
 * distribucion, que en credito privado es casi todo el retorno: ORENT cerro
 * 2024 con el NAV practicamente plano y 7.65% de retorno total.
 *
 * `retornoTotal` viaja como fraccion (0.0086 es 0.86%), nunca como porcentaje.
 */
export interface ObservacionMensual {
  readonly mes: Mes
  /** `null` cuando el manager todavia no publico el NAV del mes. */
  readonly nav: number | null
  /** `null` cuando no hay retorno publicado: el mes no entra a ninguna ventana. */
  readonly retornoTotal: number | null
}

/**
 * La apertura del retorno de un mes.
 *
 * `capital` sale del NAV contra el mes anterior y `distribucion` es el resto
 * hasta el retorno total. La resta es la definicion, no una aproximacion: es
 * como la hoja arma la columna (`=R100-S100`).
 *
 * Los tres son `null` si falta el retorno total, y `capital` y `distribucion`
 * tambien lo son si falta alguno de los dos NAV: sin el NAV previo no hay
 * contra que comparar, y repartir el retorno entero a distribucion seria
 * inventar la apertura.
 */
export interface AperturaMensual {
  readonly mes: Mes
  readonly total: number | null
  readonly capital: number | null
  readonly distribucion: number | null
}

/**
 * Una ventana de calculo: cuantos meses mira y si el resultado se anualiza.
 *
 * No hay ventanas sueltas en el codigo. La lista vive en `ventanas.ts` y todo
 * lo que recorre ventanas la recorre a ella, que es lo que hace que agregar
 * una `10Y` sea una linea y no una caceria.
 */
export interface Ventana {
  /** Clave estable. Es lo que viaja a la base y a la URL. */
  readonly clave: string
  /** Como se lee en pantalla. */
  readonly etiqueta: string
  /**
   * Meses que abarca. `null` es «desde inception»: toda la serie disponible,
   * que es lo unico que no se puede escribir como un numero fijo.
   */
  readonly meses: number | null
}

/** Lo que se sabe de un fondo mas alla de su serie. */
export interface FichaFondo {
  readonly id: string
  readonly nombre: string
  readonly assetClass: string
  /** Mes de la primera observacion segun el manager, que puede no ser la primera de la serie. */
  readonly inception: Mes | null
  /** Retorno objetivo de corto plazo que publica el manager, como fraccion. */
  readonly guidanceCortoPlazo: number | null
  readonly domicilio: string | null
}

/** Retorno, desviacion y Sharpe de una ventana. Cualquiera puede faltar. */
export interface MetricaVentana {
  readonly ventana: string
  /**
   * Retorno de la ventana. Hasta doce meses es acumulado; mas alla es
   * anualizado. `null` si la serie no cubre la ventana entera.
   */
  readonly retorno: number | null
  /** Desviacion estandar poblacional de los retornos mensuales, anualizada. */
  readonly desviacion: number | null
  /** `(retorno - riskFree) / desviacion`. `null` si falta cualquiera de los dos. */
  readonly sharpe: number | null
  /** Meses efectivamente usados. Cero cuando la ventana no se pudo calcular. */
  readonly mesesUsados: number
}

/** Retorno de un anio calendario. */
export interface MetricaAnual {
  readonly anio: number
  readonly retorno: number | null
  /**
   * `true` cuando el anio no tiene sus doce meses en la serie — el anio en
   * curso, o el de inception. La pantalla lo rotula «YTD»: un 4.8% de medio
   * anio al lado de un 10.9% de anio completo se compara mal sin la marca.
   */
  readonly parcial: boolean
  readonly mesesUsados: number
}

/** Todo lo que la tabla maestra muestra de un fondo. */
export interface MetricasFondo {
  readonly fondo: FichaFondo
  /** Primer y ultimo mes con retorno publicado. `null` si la serie esta vacia. */
  readonly primerMes: Mes | null
  readonly ultimoMes: Mes | null
  /** Una por cada ventana de `VENTANAS`, en el mismo orden. */
  readonly ventanas: readonly MetricaVentana[]
  /** Una por anio con dato, del mas reciente al mas viejo. */
  readonly anios: readonly MetricaAnual[]
  /** La apertura mes a mes, para el detalle y para la carga. */
  readonly apertura: readonly AperturaMensual[]
}

/**
 * Los parametros del calculo.
 *
 * Existe para que ningun numero de negocio quede escrito adentro de una
 * funcion. El `riskFree` es el unico que la mesa toca seguido y por eso entra
 * como argumento en vez de vivir en una constante: es el mismo escalar que la
 * hoja tenia clavado en `$R$141`, y el dia que se decida moverlo a una serie
 * mensual promediada por ventana, se cambia el que llena este campo y no el
 * motor.
 */
export interface ParametrosMetricas {
  /** Tasa libre de riesgo anual, como fraccion. La hoja usa 0.04475. */
  readonly riskFree: number
  /** Anio mas reciente que la tabla muestra. Entra como dato: el motor no lee el reloj. */
  readonly anioTope: number
  /** Cuantos anios calendario hacia atras se calculan. */
  readonly aniosAtras: number
}
