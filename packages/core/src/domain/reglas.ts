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
export type ReglaInmobiliario = 'prorratear' | 'alternativos'

export interface ReglasInmobiliario {
  /** Debajo de este ticket, Inmobiliario Directo se disuelve. */
  readonly umbralUsd: number
  readonly destino: ReglaInmobiliario
}

export interface ReglasPrivados {
  /** Minimo por subfondo institucional. Debajo no se abre ninguno. */
  readonly minSubfondoUsd: number
  /** Ticket minimo de Vision Dividendos Global, el destino de flujos. */
  readonly minDividendosGlobalUsd: number
}

export interface ReglasClub {
  /** Minimo para que Club Deals se abra como linea propia. */
  readonly minUsd: number
  /** Frontera entre las dos clases del fondo Edifica. */
  readonly umbralClaseAUsd: number
}

export interface ReglasOtros {
  /** Minimo de la clase y de cada una de sus lineas. */
  readonly minUsd: number
}

export interface ReglasCascada {
  /** Por debajo de esta fraccion del ticket minimo, el ETF se descarta. */
  readonly factorDescarte: number
  /** Un ETF no puede perder mas de esta fraccion de su objetivo por los pisos. */
  readonly maxSacrificio: number
  /** Separacion entre pisos consecutivos de la cadena. */
  readonly separacion: number
}

export interface ReglasVariable {
  /** Piso del rescate de rango. Debajo de esto el satelite se descarta. */
  readonly pisoRescateUsd: number
  /** El salto del rescate se redondea a un multiplo de este bloque. */
  readonly bloqueRescateUsd: number
  /** Separacion minima obligatoria entre satelites consecutivos. */
  readonly separacion: number
}

export interface ReglasMotor {
  /** Monto minimo para que una linea de ETF sea ejecutable. */
  readonly ticketEtfUsd: number
  readonly inmobiliario: ReglasInmobiliario
  readonly privados: ReglasPrivados
  readonly club: ReglasClub
  readonly otros: ReglasOtros
  /** Cascada pro rata de Mercados Publicos - Fijo. */
  readonly fijo: ReglasCascada
  /** Nucleo y satelites de Mercados Publicos - Variable. */
  readonly variable: ReglasVariable
}

/**
 * La macro v8: la que el motor reproduce y la que fija el golden test.
 *
 * Es el punto de partida de todo. Una macro guardada que se aparte de estos
 * numeros produce otro portafolio, y esta bien que lo haga — para eso se puede
 * cambiar —, pero el caso Ana Tumi se reproduce solo con estos.
 */
export const REGLAS_V8: ReglasMotor = {
  ticketEtfUsd: 20_000,
  inmobiliario: { umbralUsd: 500_000, destino: 'prorratear' },
  privados: { minSubfondoUsd: 50_000, minDividendosGlobalUsd: 80_000 },
  club: { minUsd: 10_000, umbralClaseAUsd: 70_000 },
  otros: { minUsd: 10_000 },
  fijo: { factorDescarte: 0.5, maxSacrificio: 0.2, separacion: 0.15 },
  variable: { pisoRescateUsd: 14_500, bloqueRescateUsd: 1_000, separacion: 0.1 },
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
  /** Ruta dentro de `ReglasMotor`, con puntos: `club.minUsd`. */
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
    ruta: 'ticketEtfUsd',
    etiqueta: 'Ticket mínimo de ETF',
    unidad: 'usd',
    explica:
      'Debajo de esto una línea de ETF no es ejecutable. La clase que no llega junta todo su ' +
      'dinero en un instrumento de consolidación.',
    grupo: 'Mercados Públicos',
  },
  {
    ruta: 'fijo.factorDescarte',
    etiqueta: 'Poda por costo (Fijo)',
    unidad: 'pct',
    explica:
      'La cascada solo descarta lo que quedaría por debajo de esta fracción del ticket mínimo. ' +
      'Un ETF que llega al 60% del mínimo se rescata en vez de tirarse.',
    grupo: 'Mercados Públicos',
  },
  {
    ruta: 'fijo.maxSacrificio',
    etiqueta: 'Sacrificio máximo (Fijo)',
    unidad: 'pct',
    explica:
      'Ningún ETF puede perder más de esta parte de su objetivo para que otros lleguen a su ' +
      'piso. Si la combinación no cierra, se descarta el más chico y se reintenta.',
    grupo: 'Mercados Públicos',
  },
  {
    ruta: 'fijo.separacion',
    etiqueta: 'Separación de la cadena (Fijo)',
    unidad: 'pct',
    explica:
      'Los ETFs sobrevivientes no quedan todos pegados al mínimo: cada uno recibe un piso un ' +
      'tanto por ciento más alto que el anterior.',
    grupo: 'Mercados Públicos',
  },
  {
    ruta: 'variable.pisoRescateUsd',
    etiqueta: 'Piso de rescate (Variable)',
    unidad: 'usd',
    explica:
      'Un satélite que queda entre este piso y el ticket mínimo no se mata: se le compra el ' +
      'salto y lo financian el núcleo y los demás satélites.',
    grupo: 'Mercados Públicos',
  },
  {
    ruta: 'variable.bloqueRescateUsd',
    etiqueta: 'Bloque del rescate (Variable)',
    unidad: 'usd',
    explica: 'El salto del rescate se redondea hacia arriba a un múltiplo de este bloque.',
    grupo: 'Mercados Públicos',
  },
  {
    ruta: 'variable.separacion',
    etiqueta: 'Separación de satélites (Variable)',
    unidad: 'pct',
    explica:
      'Cada satélite tiene que superar al anterior en al menos esta proporción. El ajuste lo ' +
      'paga el núcleo, no el satélite de al lado.',
    grupo: 'Mercados Públicos',
  },
  {
    ruta: 'privados.minSubfondoUsd',
    etiqueta: 'Mínimo por subfondo',
    unidad: 'usd',
    explica:
      'Todo o nada: basta con que un subfondo institucional no llegue para que no se abra ' +
      'ninguno y el bloque entero quede en el Fondo Oportunidad.',
    grupo: 'Mercados Privados',
  },
  {
    ruta: 'privados.minDividendosGlobalUsd',
    etiqueta: 'Mínimo de Visión Dividendos Global',
    unidad: 'usd',
    explica:
      'Con el toggle de flujos activo, este es el ticket que separa Visión Dividendos Global ' +
      'del Fondo Oportunidad.',
    grupo: 'Mercados Privados',
  },
  {
    ruta: 'club.minUsd',
    etiqueta: 'Mínimo de Club Deals',
    unidad: 'usd',
    explica:
      'Debajo de esto la clase no abre línea propia y su dinero pasa al Fondo Oportunidad, que ' +
      'no tiene mínimo.',
    grupo: 'Club Deals y Otros',
  },
  {
    ruta: 'club.umbralClaseAUsd',
    etiqueta: 'Frontera Edifica A / B',
    unidad: 'usd',
    explica: 'Desde este monto el fondo Edifica entra por su Clase A; por debajo, por la Clase B.',
    grupo: 'Club Deals y Otros',
  },
  {
    ruta: 'otros.minUsd',
    etiqueta: 'Mínimo de Otros',
    unidad: 'usd',
    explica:
      'Vale para la clase entera y para cada una de sus líneas. La que no llega se pliega sobre ' +
      'la más grande, que en la práctica siempre es BTC.',
    grupo: 'Club Deals y Otros',
  },
  {
    ruta: 'inmobiliario.umbralUsd',
    etiqueta: 'Umbral del inmobiliario',
    unidad: 'usd',
    explica:
      'Debajo de este ticket la clase Inmobiliario Directo se disuelve y su capital engorda a ' +
      'las demás. Un inmueble conservado la salva.',
    grupo: 'Inmobiliario Directo',
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
