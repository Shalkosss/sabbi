/**
 * La macro del portafolio: los numeros que deciden que sale.
 *
 * Es el segundo pilar del modelo Sabbi. El primero son los pesos de benchmark
 * —cuanto le toca a cada clase en cada perfil—; este es el resto: los minimos
 * que hacen que una linea sea ejecutable, los umbrales que abren o cierran una
 * clase y el recorte de liquidez del perfil conservador.
 *
 * Vivian como constantes de modulo, una en cada regla. Eso estaba bien
 * mientras nadie los tocara, pero la mesa los toca: son las palancas con las
 * que se calibra el modelo. Como constantes, cambiarlos era abrir siete
 * archivos y desplegar; como argumento, es guardar una version de la macro y
 * que la propuesta, el benchmark y los dos decks la lean del mismo lugar.
 *
 * El motor sigue siendo puro: esto es un argumento, no una lectura. Quien lo
 * llama decide de donde salen los numeros — de la base, de la URL o de aqui.
 *
 * Los valores por defecto son los de `Benchmark Sabbi - Macros v4`, el modulo
 * VBA que la mesa usa hoy.
 */

/**
 * Que hacer con Inmobiliario Directo cuando el cliente no accede a la clase.
 *
 * `publicos` prorratea su benchmark entre Mercados Publicos Fijo y Variable en
 * proporcion al peso de cada uno. `privados` lo manda entero a Mercados
 * Privados, donde un tercio se destina al club deal.
 *
 * En la v4 no es una opcion sino una consecuencia del ticket: por debajo del
 * umbral va a publicos y por encima a privados. Se deja como tipo porque la
 * pantalla de Benchmark permite mirar las dos.
 */
export type DestinoInmobiliario = 'publicos' | 'privados'

export interface ReglasInmobiliario {
  /**
   * Ticket a partir del cual Inmobiliario Directo se puede ejecutar.
   *
   * Igual o por debajo de este monto, si el cliente no accede, el benchmark de
   * la clase se prorratea entre Fijo y Variable. Por encima va a Mercados
   * Privados. Que el cliente acceda manda siempre, sin importar el ticket.
   */
  readonly umbralUsd: number
  /**
   * Parte del inmobiliario derivado a privados que se destina al club deal.
   *
   * El resto va al Fondo Oportunidad. Es la regla de un tercio y dos tercios.
   */
  readonly parteClub: number
}

export interface ReglasPrivados {
  /**
   * Minimo para que el Sabbi Fondo Oportunidad exista.
   *
   * Si el monto libre de la clase no llega, no hay fondo: todo se va al club
   * deal, y si el club tampoco llega a su minimo, a Mercados Publicos.
   */
  readonly minFondoUsd: number
  /** Minimo para que el club deal aparezca como linea propia. */
  readonly minClubUsd: number
  /** Minimo por subfondo institucional. Cada uno se evalua por separado. */
  readonly minSubfondoUsd: number
  /** Frontera entre las dos etiquetas del club deal. No decide si entra. */
  readonly umbralClaseAUsd: number
}

export interface ReglasCash {
  /**
   * Recorte al peso de Cash del perfil Conservador, en puntos porcentuales.
   *
   * 0.05 son cinco puntos del portafolio — 16.4730% pasa a 11.4730% — y esos
   * puntos se reparten pro-rata entre las otras cinco clases segun su propio
   * peso. No es un 5% relativo. Cero desactiva el recorte.
   *
   * Solo aplica al Conservador: es el unico perfil cuyo benchmark deja tanta
   * liquidez parada.
   */
  readonly recorteConservadorPp: number
}

export interface ReglasMotor {
  /**
   * Monto minimo ejecutable de una linea.
   *
   * Manda en dos sitios: un ETF que no llega se pliega sobre los demas, y la
   * clase Otros que no llega deja de existir y su peso pasa a Privados. En la
   * hoja es una sola celda —Portafolio!C4— y aqui tambien es un solo numero.
   */
  readonly ticketMinimoUsd: number
  readonly inmobiliario: ReglasInmobiliario
  readonly privados: ReglasPrivados
  readonly cash: ReglasCash
}

/**
 * Version del motor.
 *
 * No es la version de la macro ni la del paquete: identifica el codigo que
 * convierte un reparto en lineas ejecutables. Una propuesta publicada la
 * guarda junto a sus cifras, porque el mismo reparto corrido por otro motor
 * puede dar otras lineas y eso hay que poder verlo un ano despues.
 *
 * Que diga `v8` y la macro se llame v4 no es un descuido: son dos cosas que se
 * versionan por separado y a distinto ritmo. La macro la numera la mesa —hoy
 * corre la Benchmark Sabbi v4— y el motor se numera solo.
 */
export const VERSION_MOTOR = 'v8'

/**
 * La macro v4: la que la mesa corre hoy y la que el motor reproduce.
 *
 * Es el punto de partida de todo. Una macro guardada que se aparte de estos
 * numeros produce otro portafolio, y esta bien que lo haga — para eso se puede
 * cambiar.
 */
export const REGLAS_V4: ReglasMotor = {
  ticketMinimoUsd: 20_000,
  inmobiliario: { umbralUsd: 100_000, parteClub: 1 / 3 },
  privados: {
    minFondoUsd: 25_000,
    minClubUsd: 5_000,
    minSubfondoUsd: 50_000,
    umbralClaseAUsd: 70_000,
  },
  cash: { recorteConservadorPp: 0.05 },
}

/**
 * Cada regla con su nombre, su unidad y que decide.
 *
 * Vive en el motor y no en la pantalla por la misma razon que `NOMBRE_CLASE`:
 * el texto que explica un umbral tiene que envejecer junto al codigo que lo
 * aplica. La pantalla de Macro lo lee para construir sus campos, asi que
 * agregar una regla aqui la hace editable sin tocar la interfaz.
 */
export interface CampoDeMacro {
  /** Ruta dentro de `ReglasMotor`, con puntos: `privados.minClubUsd`. */
  readonly ruta: string
  readonly etiqueta: string
  readonly unidad: 'usd' | 'pct'
  /** Que decide este numero, en una linea. */
  readonly explica: string
  /** El bloque en el que se muestra. */
  readonly grupo: string
}

export const CAMPOS_DE_MACRO: readonly CampoDeMacro[] = [
  {
    ruta: 'ticketMinimoUsd',
    etiqueta: 'Ticket mínimo',
    unidad: 'usd',
    explica:
      'Debajo de esto una línea no es ejecutable. Un ETF que no llega se pliega sobre los demás, ' +
      'y la clase Otros que no llega deja de existir y su peso pasa a Mercados Privados.',
    grupo: 'General',
  },
  {
    ruta: 'cash.recorteConservadorPp',
    etiqueta: 'Recorte de Cash del Conservador',
    unidad: 'pct',
    explica:
      'Puntos porcentuales del portafolio que se le quitan a Cash en el perfil Conservador y se ' +
      'reparten pro-rata entre las otras cinco clases. No es un porcentaje relativo: 5% baja el ' +
      'peso de Cash de 16.47% a 11.47%.',
    grupo: 'Cash',
  },
  {
    ruta: 'inmobiliario.umbralUsd',
    etiqueta: 'Ticket mínimo del inmobiliario',
    unidad: 'usd',
    explica:
      'Hasta este monto, un cliente que no accede a Inmobiliario Directo ve su benchmark ' +
      'prorrateado entre Renta Fija y Variable. Por encima va a Mercados Privados. Que el ' +
      'cliente acceda manda siempre.',
    grupo: 'Inmobiliario Directo',
  },
  {
    ruta: 'inmobiliario.parteClub',
    etiqueta: 'Parte al club deal',
    unidad: 'pct',
    explica:
      'Del inmobiliario que se deriva a Mercados Privados, la parte que se destina al club deal. ' +
      'El resto va al Fondo Oportunidad.',
    grupo: 'Inmobiliario Directo',
  },
  {
    ruta: 'privados.minFondoUsd',
    etiqueta: 'Mínimo del Fondo Oportunidad',
    unidad: 'usd',
    explica:
      'Si el monto libre de Mercados Privados no llega, el fondo no existe y todo se va al club ' +
      'deal. Si el club tampoco llega a su mínimo, el dinero vuelve a Mercados Públicos.',
    grupo: 'Mercados Privados',
  },
  {
    ruta: 'privados.minClubUsd',
    etiqueta: 'Mínimo del club deal',
    unidad: 'usd',
    explica: 'Debajo de esto el club deal no abre como línea propia.',
    grupo: 'Mercados Privados',
  },
  {
    ruta: 'privados.minSubfondoUsd',
    etiqueta: 'Mínimo por subfondo',
    unidad: 'usd',
    explica:
      'Cada subfondo institucional se evalúa por separado. Con que uno califique se abre, y el ' +
      'monto de los que no califican se reparte entre los que sí. Si ninguno llega, todo queda ' +
      'en el Fondo Oportunidad.',
    grupo: 'Mercados Privados',
  },
  {
    ruta: 'privados.umbralClaseAUsd',
    etiqueta: 'Frontera de etiqueta del club deal',
    unidad: 'usd',
    explica:
      'Desde este monto el club deal se nombra con la etiqueta mayor. No decide si el club entra: ' +
      'solo cómo se llama.',
    grupo: 'Mercados Privados',
  },
]

/** Lee un campo de la macro por su ruta con puntos. */
export function valorDeMacro(reglas: ReglasMotor, ruta: string): number {
  let actual: unknown = reglas
  for (const parte of ruta.split('.')) {
    if (typeof actual !== 'object' || actual === null) return Number.NaN
    actual = (actual as Record<string, unknown>)[parte]
  }
  return typeof actual === 'number' ? actual : Number.NaN
}

/** Devuelve una macro nueva con un campo cambiado. No muta la original. */
export function conValorDeMacro(reglas: ReglasMotor, ruta: string, valor: number): ReglasMotor {
  const partes = ruta.split('.')

  const clonar = (nodo: unknown, nivel: number): unknown => {
    const clave = partes[nivel]
    if (clave === undefined) return valor
    const objeto = (nodo ?? {}) as Record<string, unknown>
    return { ...objeto, [clave]: clonar(objeto[clave], nivel + 1) }
  }

  return clonar(reglas, 0) as ReglasMotor
}
