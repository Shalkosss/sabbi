/**
 * La macro del portafolio: los numeros que deciden que sale.
 *
 * Es el segundo pilar del modelo Sabbi. El primero son los pesos de benchmark
 * —cuanto le toca a cada clase en cada perfil—; este es el resto: los minimos
 * que hacen que una linea sea ejecutable, los umbrales que abren o cierran una
 * clase y las tolerancias con las que la cascada reparte los ETFs.
 *
 * Hasta ahora vivian como constantes de modulo, una en cada regla. Eso estaba
 * bien mientras nadie los tocara, pero la mesa los toca: son las palancas con
 * las que se calibra el modelo. Como constantes, cambiarlos era abrir siete
 * archivos y desplegar; como argumento, es guardar una version de la macro y
 * que la propuesta, el benchmark y los dos decks la lean del mismo lugar.
 *
 * El motor sigue siendo puro: esto es un argumento, no una lectura. Quien lo
 * llama decide de donde salen los numeros — de la base, de la URL o de aqui.
 */

/**
 * A donde va el capital de Inmobiliario Directo cuando la clase se disuelve.
 *
 * `prorratear` lo reparte entre las cinco receptoras en proporcion a lo que ya
 * tenian, que es lo que hace la macro v8 y lo que fija el golden test de Ana
 * Tumi. `alternativos` lo manda entero al bloque de Privados, Club y Otros,
 * que es lo que hace la hoja con la que la mesa venia trabajando.
 */
export type ReglaInmobiliario = 'prorratear' | 'alternativos' | 'publicos'

export interface ReglasInmobiliario {
  /** Debajo de este ticket, Inmobiliario Directo se disuelve. */
  readonly umbralUsd: number
  readonly destino: ReglaInmobiliario
}

export interface ReglasCash {
  /**
   * Puntos porcentuales del portafolio que se le quitan a Cash en el perfil
   * Conservador, y que se reparten pro rata entre las otras seis clases.
   *
   * Son PUNTOS, no una fraccion del cash: 0.05 lleva un 16.47% de Cash a un
   * 11.47%, no a un 15.65%. La v4 de la mesa lo pone en 0.05 con el argumento
   * de que el benchmark conservador carga mas liquidez de la que un cliente
   * que ya vino a invertir necesita; la v8 no lo tenia, y por eso su valor
   * neutro es cero.
   *
   * Solo el perfil Conservador. Los demas ya traen el cash que les toca.
   */
  readonly recorteConservador: number
}

/**
 * Que pasa cuando un subfondo institucional no llega a su minimo.
 *
 * `todo_o_nada` es la v8: basta con que uno no llegue para que no se abra
 * ninguno y el bloque entero quede en el Fondo Oportunidad. `uno_a_uno` es la
 * v4: cada subfondo se mide por separado y los que pasan se reparten tambien
 * el monto de los que no. Con que uno califique, se abre.
 */
export type ReglaSubfondos = 'todo_o_nada' | 'uno_a_uno'

/**
 * Como se reparte el dinero nuevo entre Mercados Privados y Club Deals.
 *
 * `benchmark` es la v8: cada clase se queda con lo que su peso le dio, y lo
 * que no llega al minimo de Club Deals cae al destino de residuos.
 *
 * `tramos` es la v4: las dos clases comparten un solo monto y los minimos
 * deciden que vehiculo existe. Debajo del minimo del Fondo Oportunidad no hay
 * fondo y todo va al club; entre ese minimo y la suma de los dos no entra el
 * club y todo va al fondo; por encima conviven, cada uno toma su minimo y el
 * sobrante se parte segun el peso de benchmark de cada uno. Si no alcanza ni
 * para el club, el dinero se devuelve a mercados publicos.
 */
export type ReglaPrivados = 'benchmark' | 'tramos'

export interface ReglasPrivados {
  /** Minimo por subfondo institucional. Debajo no se abre ninguno. */
  readonly minSubfondoUsd: number
  /** Ticket minimo de Vision Dividendos Global, el destino de flujos. */
  readonly minDividendosGlobalUsd: number
  /** Todo o nada, o cada subfondo por su cuenta. */
  readonly subfondos: ReglaSubfondos
  /**
   * Minimo para que el Fondo Oportunidad exista, en la cascada por tramos.
   *
   * Solo lo mira `tramos`. En la v8 el Fondo Oportunidad es el destino sin
   * minimo de todo lo que no llego a ningun lado, y por eso su valor neutro
   * es cero.
   */
  readonly minOportunidadUsd: number
  /** Como se reparten Privados y Club Deals el dinero nuevo. */
  readonly reparto: ReglaPrivados
}

export interface ReglasClub {
  /** Minimo para que Club Deals se abra como linea propia. */
  readonly minUsd: number
  /** Frontera entre las dos clases del fondo Edifica. */
  readonly umbralClaseAUsd: number
}

export interface ReglasOtros {
  /** Minimo de la clase entera. Debajo, la clase no abre. */
  readonly minUsd: number
  /**
   * Minimo de cada linea dentro de la clase. En cero manda el de la clase,
   * que es lo que hacia la v8 cuando los dos eran el mismo numero.
   */
  readonly minLineaUsd: number
}

/**
 * Con que algoritmo se reparte una clase de mercados publicos.
 *
 * `cascada` es la v8: poda por costo, cadena de pisos escalonados y limite de
 * sacrificio. `nucleo_satelites` es el motor propio que la v8 le dio a Renta
 * Variable, con un instrumento que financia los rescates de rango.
 *
 * `poda` es la v4, y es la mas simple de las tres: se saca el instrumento mas
 * chico, su monto se reparte pro rata entre los que quedan, y se repite hasta
 * que el mas chico llegue al ticket. Sin factor de descarte, sin cadena y sin
 * limite de sacrificio — los tres campos de la cascada quedan sin mirar.
 */
export type MotorPublico = 'cascada' | 'nucleo_satelites' | 'poda'

export interface ReglasCascada {
  /** Con que algoritmo se reparte la clase. */
  readonly motor: MotorPublico
  /** Por debajo de esta fraccion del ticket minimo, el ETF se descarta. */
  readonly factorDescarte: number
  /** Un ETF no puede perder mas de esta fraccion de su objetivo por los pisos. */
  readonly maxSacrificio: number
  /** Separacion entre pisos consecutivos de la cadena. */
  readonly separacion: number
}

export interface ReglasVariable {
  /** Con que algoritmo se reparte la clase. */
  readonly motor: MotorPublico
  /** Piso del rescate de rango. Debajo de esto el satelite se descarta. */
  readonly pisoRescateUsd: number
  /** El salto del rescate se redondea a un multiplo de este bloque. */
  readonly bloqueRescateUsd: number
  /** Separacion minima obligatoria entre satelites consecutivos. */
  readonly separacion: number
  /**
   * Como se reconoce al nucleo del bloque.
   *
   * El motor de Variable no reparte parejo: hay un nucleo que financia los
   * rescates y la separacion, y satelites que se financian entre ellos. Cual
   * es el nucleo se decidia por un nombre escrito en el codigo; aca es un dato,
   * porque el dia que el S&P 500 se cambie por otro instrumento la mesa no
   * puede quedar esperando un despliegue.
   *
   * Se compara ignorando mayusculas, espacios y simbolos: `S&P 500` reconoce
   * tanto `iShares Core S&P 500` como `SP500`.
   */
  readonly nucleo: string
}

/** Las clases que pueden quedarse con el dinero que no llego a su minimo. */
export type ClaseResiduo = 'privados' | 'cash' | 'fijo' | 'variable'

export interface ReglasResiduos {
  /**
   * Primera opcion para el dinero de Club y Otros que no abrio linea.
   *
   * Si la clase elegida esta fijada por un ajuste del asesor, el motor sigue
   * con las demas en su orden. La v8 manda todo al Fondo Oportunidad de
   * Mercados Privados, que es la unica casa sin minimo.
   */
  readonly destino: ClaseResiduo
}

export interface ReglasMotor {
  /** Monto minimo para que una linea de ETF sea ejecutable. */
  readonly ticketEtfUsd: number
  /** Ticket propio de Renta Fija. En cero manda el general. */
  readonly ticketFijoUsd: number
  /** Ticket propio de Renta Variable. En cero manda el general. */
  readonly ticketVariableUsd: number
  readonly inmobiliario: ReglasInmobiliario
  /** El recorte de liquidez del perfil conservador. */
  readonly cash: ReglasCash
  readonly privados: ReglasPrivados
  readonly club: ReglasClub
  readonly otros: ReglasOtros
  /** Cascada pro rata de Mercados Publicos - Fijo. */
  readonly fijo: ReglasCascada
  /** Nucleo y satelites de Mercados Publicos - Variable. */
  readonly variable: ReglasVariable
  /** Donde cae lo que no llega al minimo de su clase. */
  readonly residuos: ReglasResiduos
}

/**
 * La macro v8: la que el motor reproduce y la que fija el golden test.
 *
 * Es el punto de partida de todo. Una macro guardada que se aparte de estos
 * numeros produce otro portafolio, y esta bien que lo haga — para eso se puede
 * cambiar —, pero el caso Ana Tumi se reproduce solo con estos.
 *
 * Los campos que la v8 no tenia entran en su valor neutro: un ticket por clase
 * en cero es «usa el general», un minimo de linea en cero es «el de la clase».
 * Asi, agregar una palanca nueva nunca mueve una cifra ya calculada.
 */
export const REGLAS_V8: ReglasMotor = {
  ticketEtfUsd: 20_000,
  ticketFijoUsd: 0,
  ticketVariableUsd: 0,
  inmobiliario: { umbralUsd: 500_000, destino: 'prorratear' },
  cash: { recorteConservador: 0 },
  privados: {
    minSubfondoUsd: 50_000,
    minDividendosGlobalUsd: 80_000,
    subfondos: 'todo_o_nada',
    minOportunidadUsd: 0,
    reparto: 'benchmark',
  },
  club: { minUsd: 10_000, umbralClaseAUsd: 70_000 },
  otros: { minUsd: 10_000, minLineaUsd: 0 },
  fijo: { motor: 'cascada', factorDescarte: 0.5, maxSacrificio: 0.2, separacion: 0.15 },
  variable: {
    motor: 'nucleo_satelites',
    pisoRescateUsd: 14_500,
    bloqueRescateUsd: 1_000,
    separacion: 0.1,
    nucleo: 'S&P 500',
  },
  residuos: { destino: 'privados' },
}

/**
 * La macro v4: la que la mesa escribio en «BENCHMARK SABBI - MACROS v4».
 *
 * Es la de fabrica desde que la mesa la trajo, y difiere de la v8 en seis
 * decisiones que mueven dinero. Ninguna es un numero suelto: cada una es una
 * palanca de esta misma lista, asi que se puede volver a la v8 campo por campo
 * sin desplegar nada.
 *
 *  1. **El conservador lleva menos liquidez.** Cinco puntos de Cash pasan a
 *     las otras clases, pro rata. Los otros cuatro perfiles no se tocan.
 *  2. **El inmobiliario se ejecuta desde 100,000, no desde 500,000**, y cuando
 *     no se puede ejecutar su capital va a mercados publicos y no al bloque
 *     alternativo: con ticket chico, meterle mas a privados solo lo deja
 *     atrapado en los minimos del fondo y del club.
 *  3. **Privados y Club Deals comparten un solo monto**, y los minimos deciden
 *     que vehiculo existe: el Fondo Oportunidad desde 25,000 y el club desde
 *     5,000. Si no alcanza para ninguno, el dinero vuelve a mercados publicos.
 *  4. **Los subfondos se miden uno por uno.** Con que uno llegue a 50,000 se
 *     abre, y se reparte tambien lo de los que no llegaron.
 *  5. **Renta Fija y Renta Variable usan el mismo motor simple**: sacar el mas
 *     chico y repartirlo pro rata. La v4 no tiene nucleo ni satelites.
 *  6. **Otros abre desde 20,000** y no desde los 10,000 de la v8. En la hoja
 *     el minimo es el ticket de la propuesta, que aca el asesor puede mover
 *     ficha por ficha; como campo de la macro es un numero fijo, y 20,000 es
 *     el ticket con el que la mesa trabaja.
 *
 * Los tres campos de la cascada y los cuatro del motor de variable siguen con
 * los valores de la v8 aunque `poda` no los mire: son los que vuelven a valer
 * en cuanto alguien cambie el motor, y ponerlos en cero seria perder la
 * calibracion de la v8 sin decirlo.
 */
export const REGLAS_V4: ReglasMotor = {
  ticketEtfUsd: 20_000,
  ticketFijoUsd: 0,
  ticketVariableUsd: 0,
  inmobiliario: { umbralUsd: 100_000, destino: 'publicos' },
  cash: { recorteConservador: 0.05 },
  privados: {
    minSubfondoUsd: 50_000,
    minDividendosGlobalUsd: 80_000,
    subfondos: 'uno_a_uno',
    minOportunidadUsd: 25_000,
    reparto: 'tramos',
  },
  club: { minUsd: 5_000, umbralClaseAUsd: 70_000 },
  otros: { minUsd: 20_000, minLineaUsd: 0 },
  fijo: { motor: 'poda', factorDescarte: 0.5, maxSacrificio: 0.2, separacion: 0.15 },
  variable: {
    motor: 'poda',
    pisoRescateUsd: 14_500,
    bloqueRescateUsd: 1_000,
    separacion: 0.1,
    nucleo: 'S&P 500',
  },
  residuos: { destino: 'privados' },
}

/**
 * Cada regla con su nombre, su unidad y que decide.
 *
 * Vive en el motor y no en la pantalla por la misma razon que `NOMBRE_CLASE`:
 * el texto que explica un umbral tiene que envejecer junto al codigo que lo
 * aplica. La pantalla de Macro lo lee para construir sus campos, asi que
 * agregar una regla aqui la hace editable sin tocar la interfaz.
 *
 * El orden de la lista es el orden en el que se muestran, y no es arbitrario:
 * es el recorrido del dinero por el motor. Primero el ticket que decide si una
 * linea existe, despues los dos motores de mercados publicos que reparten la
 * mayor parte del patrimonio, despues las clases que se abren o no por su
 * minimo, y al final donde cae lo que no llego. Leerla de arriba abajo es leer
 * lo que le pasa a un monto desde que entra hasta que sale en lineas.
 */
export type UnidadDeMacro = 'usd' | 'pct' | 'texto' | 'opcion'

export interface OpcionDeCampo {
  readonly valor: string
  readonly etiqueta: string
}

export interface CampoDeMacro {
  /** Ruta dentro de `ReglasMotor`, con puntos: `club.minUsd`. */
  readonly ruta: string
  readonly etiqueta: string
  readonly unidad: UnidadDeMacro
  /** Que decide este numero, en una linea. */
  readonly explica: string
  /** El bloque en el que se muestra. */
  readonly grupo: string
  /**
   * El rango con el que la pantalla arma su deslizador y sus botones de paso,
   * en la unidad del campo — fraccion para `pct`, dolares para `usd`.
   *
   * Es una ayuda para teclear, no una validacion: quien necesite un valor
   * fuera del rango lo escribe en la celda y el esquema decide si entra.
   */
  readonly rango?: { readonly min: number; readonly max: number; readonly paso: number }
  /** Los valores posibles de un campo `opcion`. */
  readonly opciones?: readonly OpcionDeCampo[]
  /** Que significa dejarlo en cero, cuando cero no es cero sino «heredado». */
  readonly ceroEs?: string
}

export const CAMPOS_DE_MACRO: readonly CampoDeMacro[] = [
  // ── 1. Lo que hace que una linea exista ──────────────────────────────────
  {
    ruta: 'ticketEtfUsd',
    etiqueta: 'Ticket mínimo de ETF',
    unidad: 'usd',
    explica:
      'Debajo de esto una línea de ETF no es ejecutable. La clase que no llega junta todo su ' +
      'dinero en un instrumento de consolidación. Es el único umbral que el asesor puede pisar ' +
      'propuesta por propuesta desde la ficha.',
    grupo: 'El ticket de las líneas',
    // El minimo no es cero: el esquema lo exige positivo, y unos botones que
    // pueden dejarlo en un valor que no guarda son botones que engañan.
    rango: { min: 1_000, max: 100_000, paso: 1_000 },
  },
  {
    ruta: 'ticketFijoUsd',
    etiqueta: 'Ticket propio de Renta Fija',
    unidad: 'usd',
    explica:
      'Cuando los bonos aguantan un ticket distinto del de la renta variable, se pone acá y ' +
      'manda sobre el general para las líneas de Renta Fija.',
    grupo: 'El ticket de las líneas',
    rango: { min: 0, max: 100_000, paso: 1_000 },
    ceroEs: 'usa el ticket general',
  },
  {
    ruta: 'ticketVariableUsd',
    etiqueta: 'Ticket propio de Renta Variable',
    unidad: 'usd',
    explica:
      'Lo mismo del lado de la renta variable: el núcleo y los satélites se miden contra este ' +
      'ticket en vez del general.',
    grupo: 'El ticket de las líneas',
    rango: { min: 0, max: 100_000, paso: 1_000 },
    ceroEs: 'usa el ticket general',
  },

  // ── 2. Cash: lo primero que toca el motor ────────────────────────────────
  {
    ruta: 'cash.recorteConservador',
    etiqueta: 'Recorte de Cash del conservador',
    unidad: 'pct',
    explica:
      'Puntos porcentuales del portafolio que se le sacan a Cash en el perfil Conservador y se ' +
      'reparten entre las otras clases según su peso. Son puntos, no una parte del cash: 5 ' +
      'puntos llevan un 16.47% a un 11.47%. Los otros cuatro perfiles no se tocan.',
    grupo: 'Cash · la liquidez del conservador',
    rango: { min: 0, max: 0.2, paso: 0.005 },
    ceroEs: 'el conservador se queda con todo su cash',
  },

  // ── 3. Renta Fija ────────────────────────────────────────────────────────
  {
    ruta: 'fijo.motor',
    etiqueta: 'Motor de Renta Fija',
    unidad: 'opcion',
    explica:
      'Con qué algoritmo se reparten los ETFs. La poda pro rata saca el más chico y lo reparte ' +
      'entre los que quedan, y no mira ninguno de los tres campos de abajo. La cascada sí: es ' +
      'la de la v8, con rescate por costo y pisos escalonados.',
    grupo: 'Renta Fija · cómo se reparte',
    opciones: [
      { valor: 'poda', etiqueta: 'poda pro rata — saca el más chico y reparte' },
      { valor: 'cascada', etiqueta: 'cascada v8 — rescate por costo y cadena de pisos' },
    ],
  },
  {
    ruta: 'fijo.factorDescarte',
    etiqueta: 'Poda por costo',
    unidad: 'pct',
    explica:
      'La cascada solo descarta lo que quedaría por debajo de esta fracción del ticket mínimo. ' +
      'Un ETF que llega al 60% del mínimo se rescata en vez de tirarse.',
    grupo: 'Renta Fija · cómo se reparte',
    rango: { min: 0, max: 1, paso: 0.05 },
  },
  {
    ruta: 'fijo.maxSacrificio',
    etiqueta: 'Sacrificio máximo',
    unidad: 'pct',
    explica:
      'Ningún ETF puede perder más de esta parte de su objetivo para que otros lleguen a su ' +
      'piso. Si la combinación no cierra, se descarta el más chico y se reintenta.',
    grupo: 'Renta Fija · cómo se reparte',
    rango: { min: 0, max: 1, paso: 0.05 },
  },
  {
    ruta: 'fijo.separacion',
    etiqueta: 'Separación de la cadena',
    unidad: 'pct',
    explica:
      'Los ETFs sobrevivientes no quedan todos pegados al mínimo: cada uno recibe un piso un ' +
      'tanto por ciento más alto que el anterior.',
    grupo: 'Renta Fija · cómo se reparte',
    rango: { min: 0, max: 1, paso: 0.05 },
  },

  // ── 4. Renta Variable ────────────────────────────────────────────────────
  {
    ruta: 'variable.motor',
    etiqueta: 'Motor de Renta Variable',
    unidad: 'opcion',
    explica:
      'La poda pro rata es el mismo motor simple de Renta Fija y deja sin efecto los cuatro ' +
      'campos de abajo. Núcleo y satélites es el motor propio de la v8: un instrumento financia ' +
      'los rescates de rango y la separación de los demás.',
    grupo: 'Renta Variable · cómo se reparte',
    opciones: [
      { valor: 'poda', etiqueta: 'poda pro rata — saca el más chico y reparte' },
      { valor: 'nucleo_satelites', etiqueta: 'núcleo y satélites — el motor v8' },
    ],
  },
  {
    ruta: 'variable.nucleo',
    etiqueta: 'Cómo se reconoce el núcleo',
    unidad: 'texto',
    explica:
      'El instrumento cuyo nombre contenga este texto es el núcleo: el que financia los ' +
      'rescates y la separación de los satélites. Se compara sin mayúsculas ni símbolos, así ' +
      'que «S&P 500» reconoce también «SP500».',
    grupo: 'Renta Variable · cómo se reparte',
  },
  {
    ruta: 'variable.pisoRescateUsd',
    etiqueta: 'Piso de rescate',
    unidad: 'usd',
    explica:
      'Un satélite que queda entre este piso y el ticket mínimo no se mata: se le compra el ' +
      'salto y lo financian el núcleo y los demás satélites.',
    grupo: 'Renta Variable · cómo se reparte',
    rango: { min: 0, max: 100_000, paso: 500 },
  },
  {
    ruta: 'variable.bloqueRescateUsd',
    etiqueta: 'Bloque del rescate',
    unidad: 'usd',
    explica: 'El salto del rescate se redondea hacia arriba a un múltiplo de este bloque.',
    grupo: 'Renta Variable · cómo se reparte',
    rango: { min: 100, max: 10_000, paso: 100 },
  },
  {
    ruta: 'variable.separacion',
    etiqueta: 'Separación de satélites',
    unidad: 'pct',
    explica:
      'Cada satélite tiene que superar al anterior en al menos esta proporción. El ajuste lo ' +
      'paga el núcleo, no el satélite de al lado.',
    grupo: 'Renta Variable · cómo se reparte',
    rango: { min: 0, max: 1, paso: 0.05 },
  },

  // ── 5. Inmobiliario Directo: la clase que puede no existir ───────────────
  {
    ruta: 'inmobiliario.umbralUsd',
    etiqueta: 'Umbral del inmobiliario',
    unidad: 'usd',
    explica:
      'Debajo de este ticket la clase Inmobiliario Directo se disuelve y su capital engorda a ' +
      'las demás: es el monto a partir del cual un inmueble se puede ejecutar de verdad. Un ' +
      'inmueble conservado, o una restricción sobre la clase, la salvan igual.',
    grupo: 'Inmobiliario Directo',
    rango: { min: 0, max: 2_000_000, paso: 25_000 },
  },
  {
    ruta: 'inmobiliario.destino',
    etiqueta: 'Cuando se disuelve, su capital',
    unidad: 'opcion',
    explica:
      'Es la regla en la que difieren las hojas con las que la mesa viene trabajando; sobre un ' +
      'Moderado la diferencia son casi siete puntos en Renta Fija. Con ticket chico, mandarlo a ' +
      'Privados solo lo deja atrapado en los mínimos del fondo y del club: por eso la v4 lo ' +
      'manda a mercados públicos.',
    grupo: 'Inmobiliario Directo',
    opciones: [
      { valor: 'publicos', etiqueta: 'se reparte entre Renta Fija y Renta Variable' },
      { valor: 'prorratear', etiqueta: 'se prorratea entre las cinco clases' },
      { valor: 'alternativos', etiqueta: 'pasa entero a Privados, Club y Otros' },
    ],
  },

  // ── 6. Mercados Privados ─────────────────────────────────────────────────
  {
    ruta: 'privados.reparto',
    etiqueta: 'Privados y Club Deals se reparten',
    unidad: 'opcion',
    explica:
      'Por tramos, las dos clases comparten un solo monto y los mínimos deciden qué vehículo ' +
      'existe; si no alcanza ni para el club, el dinero vuelve a mercados públicos. Por ' +
      'benchmark, cada una se queda con lo que su peso le dio y lo que no llega al mínimo cae ' +
      'al destino de residuos.',
    grupo: 'Mercados Privados',
    opciones: [
      { valor: 'tramos', etiqueta: 'por tramos — los mínimos deciden qué se abre' },
      { valor: 'benchmark', etiqueta: 'por benchmark — cada clase con su peso' },
    ],
  },
  {
    ruta: 'privados.minOportunidadUsd',
    etiqueta: 'Mínimo del Fondo Oportunidad',
    unidad: 'usd',
    explica:
      'Debajo de esto el fondo no existe y su dinero va al club deal. Solo lo mira el reparto ' +
      'por tramos: por benchmark el Fondo Oportunidad es el destino sin mínimo de todo lo que ' +
      'no llegó a ningún lado.',
    grupo: 'Mercados Privados',
    rango: { min: 0, max: 200_000, paso: 5_000 },
    ceroEs: 'el fondo no tiene mínimo',
  },
  {
    ruta: 'privados.subfondos',
    etiqueta: 'Los subfondos se miden',
    unidad: 'opcion',
    explica:
      'Uno por uno, con que un subfondo llegue a su mínimo se abre, y se reparte también el ' +
      'monto de los que no llegaron. Todo o nada, basta con que uno no llegue para que no se ' +
      'abra ninguno y el bloque entero quede en el Fondo Oportunidad.',
    grupo: 'Mercados Privados',
    opciones: [
      { valor: 'uno_a_uno', etiqueta: 'uno por uno — el que califica se abre' },
      { valor: 'todo_o_nada', etiqueta: 'todo o nada — o los tres, o ninguno' },
    ],
  },
  {
    ruta: 'privados.minSubfondoUsd',
    etiqueta: 'Mínimo por subfondo',
    unidad: 'usd',
    explica:
      'El ticket que un subfondo institucional tiene que alcanzar para abrirse. Qué pasa con el ' +
      'que no llega lo decide el campo de arriba.',
    grupo: 'Mercados Privados',
    rango: { min: 0, max: 500_000, paso: 5_000 },
  },
  {
    ruta: 'privados.minDividendosGlobalUsd',
    etiqueta: 'Mínimo de Visión Dividendos Global',
    unidad: 'usd',
    explica:
      'Con el toggle de flujos activo, este es el ticket que separa Visión Dividendos Global ' +
      'del Fondo Oportunidad.',
    grupo: 'Mercados Privados',
    rango: { min: 0, max: 500_000, paso: 5_000 },
  },

  // ── 7. Club Deals ────────────────────────────────────────────────────────
  {
    ruta: 'club.minUsd',
    etiqueta: 'Mínimo de Club Deals',
    unidad: 'usd',
    explica:
      'Debajo de esto la clase no abre línea propia y su dinero pasa al destino de residuos, ' +
      'que por defecto es el Fondo Oportunidad.',
    grupo: 'Club Deals',
    rango: { min: 0, max: 200_000, paso: 5_000 },
  },
  {
    ruta: 'club.umbralClaseAUsd',
    etiqueta: 'Frontera Edifica A / B',
    unidad: 'usd',
    explica: 'Desde este monto el fondo Edifica entra por su Clase A; por debajo, por la Clase B.',
    grupo: 'Club Deals',
    rango: { min: 0, max: 500_000, paso: 5_000 },
  },

  // ── 8. Otros: BTC y Oro ──────────────────────────────────────────────────
  {
    ruta: 'otros.minUsd',
    etiqueta: 'Mínimo de la clase',
    unidad: 'usd',
    explica:
      'Debajo de esto la clase entera no abre y su dinero pasa al destino de residuos.',
    grupo: 'Otros · BTC y Oro',
    rango: { min: 0, max: 200_000, paso: 5_000 },
  },
  {
    ruta: 'otros.minLineaUsd',
    etiqueta: 'Mínimo de cada línea',
    unidad: 'usd',
    explica:
      'La línea que no llega se pliega sobre la más grande, que en la práctica siempre es BTC. ' +
      'Separado del mínimo de la clase se puede abrir Otros con poco y aun así no imprimir un ' +
      'oro de cuatro cifras.',
    grupo: 'Otros · BTC y Oro',
    rango: { min: 0, max: 200_000, paso: 5_000 },
    ceroEs: 'usa el mínimo de la clase',
  },

  // ── 9. Lo que no llego a ningun lado ─────────────────────────────────────
  {
    ruta: 'residuos.destino',
    etiqueta: 'El dinero que no abrió línea va a',
    unidad: 'opcion',
    explica:
      'Cuando Club Deals u Otros no llegan a su mínimo, su dinero tiene que quedarse en algún ' +
      'lado. Si la clase elegida está fijada por un ajuste, el motor sigue con las demás.',
    grupo: 'El dinero que sobra',
    opciones: [
      { valor: 'privados', etiqueta: 'Mercados Privados (Fondo Oportunidad)' },
      { valor: 'cash', etiqueta: 'Cash' },
      { valor: 'fijo', etiqueta: 'Mercados Públicos · Renta Fija' },
      { valor: 'variable', etiqueta: 'Mercados Públicos · Renta Variable' },
    ],
  },
]

/** Lee un campo de la macro por su ruta con puntos. */
export function valorDeMacro(reglas: ReglasMotor, ruta: string): number {
  const valor = leerDeMacro(reglas, ruta)
  return typeof valor === 'number' ? valor : Number.NaN
}

/** Lee un campo de texto o de opción — el núcleo, el destino del inmobiliario. */
export function textoDeMacro(reglas: ReglasMotor, ruta: string): string {
  const valor = leerDeMacro(reglas, ruta)
  return typeof valor === 'string' ? valor : ''
}

/** Devuelve una macro nueva con un campo cambiado. No muta la original. */
export const conValorDeMacro = (reglas: ReglasMotor, ruta: string, valor: number): ReglasMotor =>
  escribirEnMacro(reglas, ruta, valor)

/** Lo mismo para un campo que no es un número. */
export const conTextoDeMacro = (reglas: ReglasMotor, ruta: string, valor: string): ReglasMotor =>
  escribirEnMacro(reglas, ruta, valor)

function leerDeMacro(reglas: ReglasMotor, ruta: string): unknown {
  let actual: unknown = reglas
  for (const parte of ruta.split('.')) {
    if (typeof actual !== 'object' || actual === null) return undefined
    actual = (actual as Record<string, unknown>)[parte]
  }
  return actual
}

function escribirEnMacro(reglas: ReglasMotor, ruta: string, valor: unknown): ReglasMotor {
  const partes = ruta.split('.')

  const clonar = (nodo: unknown, nivel: number): unknown => {
    const clave = partes[nivel]
    if (clave === undefined) return valor
    const objeto = (nodo ?? {}) as Record<string, unknown>
    return { ...objeto, [clave]: clonar(objeto[clave], nivel + 1) }
  }

  return clonar(reglas, 0) as ReglasMotor
}
