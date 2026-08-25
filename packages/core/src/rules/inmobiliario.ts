/**
 * Umbral de Inmobiliario Directo.
 *
 * Port del PASO PREVIO B de `AjustarPorPosicionesFijas` de la macro v4. Es la
 * regla que menos se ve en la especificacion y mas mueve las cifras.
 *
 * La pregunta no es cuanto le toca a la clase sino si el cliente la puede
 * ejecutar. Si accede, se queda con su peso sin importar el ticket. Si no
 * accede, su benchmark se reparte y el destino depende del tamano:
 *
 *   ticket <= umbral  ->  Mercados Publicos, entre Fijo y Variable a prorrata
 *   ticket >  umbral  ->  Mercados Privados, con un tercio al club deal
 *
 * El corte por ticket no es cosmetico. Con un ticket chico la clase de
 * privados ya viene ajustada, y meterle mas solo la deja atrapada en los
 * minimos del Fondo Oportunidad y del club deal: el dinero entraria a una
 * clase que no lo puede colocar. Por eso abajo del umbral va a publicos, que
 * es donde si se puede ejecutar.
 *
 * Cash nunca recibe este monto —no es destino de dinero que busca retorno— y
 * Otros tampoco, que es satelite.
 *
 * El escape es el piso: un inmueble que el cliente conserva, o una restriccion
 * del asesor sobre la clase, la clavan y la regla no se aplica. En la macro
 * son la misma cosa y aqui tambien: ambas llegan como piso de la clase.
 *
 * Se corre despues del recorte de Cash y antes del solver de pisos, que es el
 * orden de la macro.
 */

import type { Benchmark, ClaseModelo } from '../domain/tipos.js'
import { CLASES } from '../domain/tipos.js'

const EPS = 1e-9

/** A donde fue a parar el peso del inmobiliario, para poder explicarlo. */
export interface ResultadoInmobiliario {
  readonly benchmark: Benchmark
  /** `true` cuando la clase se disolvio. */
  readonly disuelta: boolean
  /** Peso que se movio. Cero cuando la clase se conserva. */
  readonly pesoMovido: number
  /** A donde fue: `null` cuando no se movio nada. */
  readonly destino: 'publicos' | 'privados' | null
}

export interface OpcionesInmobiliario {
  /** Ticket de la propuesta: el patrimonio invertible total. */
  readonly patrimonioTotalUsd: number
  /**
   * El cliente accede a Inmobiliario Directo.
   *
   * Es el Si/No de la hoja. En `true` la clase se conserva pase lo que pase.
   */
  readonly accede: boolean
  /** La clase trae un piso: un inmueble conservado o una restriccion. */
  readonly tienePiso: boolean
  /** Ticket a partir del cual la clase se puede ejecutar. */
  readonly umbralUsd: number
}

/**
 * Reparte el peso de Inmobiliario Directo cuando el cliente no lo puede tomar.
 *
 * Devuelve el benchmark intacto cuando la regla no aplica, de modo que el
 * llamador puede invocarla siempre sin preguntar.
 */
export function resolverInmobiliario(
  benchmark: Benchmark,
  opciones: OpcionesInmobiliario,
): ResultadoInmobiliario {
  const { patrimonioTotalUsd, accede, tienePiso, umbralUsd } = opciones
  const intacto: ResultadoInmobiliario = {
    benchmark,
    disuelta: false,
    pesoMovido: 0,
    destino: null,
  }

  if (accede || tienePiso || benchmark.inm <= EPS) return intacto

  const peso = benchmark.inm
  const alPublico = patrimonioTotalUsd <= umbralUsd
  const receptoras: readonly ClaseModelo[] = alPublico
    ? ['fijo', 'variable']
    : ['privados', 'club']

  const base = receptoras.reduce((acc, clase) => acc + benchmark[clase], 0)

  // Perfil sin las clases que deberian recibir: el unico destino posible es el
  // otro bloque. Si tampoco tiene peso, la regla no se aplica y la clase se
  // queda — mejor un inmobiliario que el cliente no toma que dinero perdido.
  if (base <= EPS) {
    const alternativas: readonly ClaseModelo[] = alPublico
      ? ['privados', 'club']
      : ['fijo', 'variable']
    const baseAlterna = alternativas.reduce((acc, clase) => acc + benchmark[clase], 0)
    if (baseAlterna <= EPS) return intacto

    return {
      benchmark: repartir(benchmark, alternativas, baseAlterna, peso),
      disuelta: true,
      pesoMovido: peso,
      destino: alPublico ? 'privados' : 'publicos',
    }
  }

  return {
    benchmark: repartir(benchmark, receptoras, base, peso),
    disuelta: true,
    pesoMovido: peso,
    destino: alPublico ? 'publicos' : 'privados',
  }
}

/** Pone `inm` en cero y reparte su peso entre las receptoras, a prorrata. */
function repartir(
  benchmark: Benchmark,
  receptoras: readonly ClaseModelo[],
  base: number,
  peso: number,
): Benchmark {
  const recibe = new Set(receptoras)

  return Object.fromEntries(
    CLASES.map((clase) => {
      if (clase === 'inm') return [clase, 0]
      if (!recibe.has(clase)) return [clase, benchmark[clase]]
      return [clase, benchmark[clase] + peso * (benchmark[clase] / base)]
    }),
  ) as Benchmark
}
