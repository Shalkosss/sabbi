import 'server-only'

import { benchmarkDe, pesosDeClase } from '@sabbi/config'
import type { Macro } from '@sabbi/config'
import { generarPlan, NOMBRE_CLASE, PERFILES } from '@sabbi/core'
import type { ClaseModelo, Perfil, ReglaInmobiliario, ReglasMotor } from '@sabbi/core'

import { FALLBACKS } from './catalogo'

/**
 * El universo del motor: cada ticket contra cada perfil.
 *
 * No es una propuesta de nadie. Es el motor corrido en vacío —sin ficha, sin
 * posiciones conservadas, sin ajustes— para ver qué produce la macro con un
 * cliente que llega con dinero y nada más. Sirve para mirar las reglas de
 * frente: cuáles clases abren, cuáles no llegan a su mínimo y a dónde va lo
 * que queda cuando no llega.
 *
 * Sale abierto en instrumentos y no solo en porcentajes por clase, que es como
 * la mesa lo lee en el Excel: qué ETF entró y cuál no es justamente lo que hay
 * que mirar cuando el ticket es chico, y agregando por clase eso se pierde. La
 * misma estructura alimenta la tabla y el gráfico — un dato, dos formas de
 * verlo, y ninguna posibilidad de que se contradigan.
 *
 * Se corre en el servidor por la razón de siempre: los pesos del benchmark son
 * el modelo Sabbi y no bajan al navegador. Lo que baja son los portafolios ya
 * calculados.
 *
 * Es una función pura envuelta en una lectura de la macro, así que dos cargas
 * de la página dan exactamente lo mismo mientras la macro no cambie. Cuando la
 * mesa la toque, esta vista lo muestra sin que nadie suba una ficha de prueba.
 */

/** Los tickets que la mesa quiere mirar, en dólares. */
export const TICKETS: readonly number[] = [25_000, 50_000, 75_000, 100_000]

/**
 * Las reglas del portafolio que esta pantalla deja cambiar en caliente.
 *
 * No son «la macro» entera —esa se edita en su propia pantalla y se guarda—:
 * son las tres palancas que la mesa mueve para comparar antes de decidir. Van
 * en la URL para que una corrida se pueda pegar en un mensaje y el otro vea
 * exactamente la misma.
 */
export interface Reglas {
  /** A dónde va el capital de Inmobiliario cuando la clase se disuelve. */
  readonly inmobiliario: ReglaInmobiliario
  /** Debajo de este ticket, Inmobiliario Directo se disuelve. */
  readonly umbralInmobiliarioUsd: number
  /** Monto mínimo para que una línea de ETF sea ejecutable. */
  readonly ticketEtfUsd: number
}

/** Las tres palancas tal como están en la macro guardada. */
export const reglasDeLaMacro = (macro: Macro): Reglas => ({
  inmobiliario: macro.reglas.inmobiliario.destino,
  umbralInmobiliarioUsd: macro.reglas.inmobiliario.umbralUsd,
  ticketEtfUsd: macro.reglas.ticketEtfUsd,
})

/** La macro con las tres palancas de la pantalla encima. */
const conLasPalancas = (base: ReglasMotor, reglas: Reglas): ReglasMotor => ({
  ...base,
  ticketEtfUsd: reglas.ticketEtfUsd,
  inmobiliario: { umbralUsd: reglas.umbralInmobiliarioUsd, destino: reglas.inmobiliario },
})

/**
 * Los perfiles que se pueden mirar a la vez.
 *
 * Cinco es el universo entero, que es lo que hay que ver para juzgar el
 * modelo. Menos son para leer la forma sin que las curvas se tapen, y con dos
 * o menos el gráfico además escribe las cifras encima de cada punto: ahí ya no
 * se solapan y no hace falta bajar la vista a la tabla.
 */
export const PERFILES_MIRABLES: readonly Perfil[] = [...PERFILES]

/** Debajo de esta cantidad de perfiles, el gráfico rotula cada punto. */
export const PERFILES_PARA_ROTULAR = 3

export interface FilaInstrumento {
  readonly instrumento: string
  /** Monto de la línea. */
  readonly usd: number
  /** Sobre el total del portafolio, que es como lo lee el Excel. */
  readonly share: number
  /** Lo que el motor anotó de esta línea, si anotó algo. */
  readonly nota: string | null
}

/**
 * Las dos clases que no se pueden vender cuando uno quiere.
 *
 * Mercados Privados y Club Deals tienen plazos de permanencia y ventanas de
 * salida; las demas se liquidan en dias. Es el corte que la mesa mira antes
 * que ningun otro, porque decide si el portafolio aguanta un imprevisto — y
 * no coincide con ninguna de las siete clases, asi que hay que sumarlo aparte.
 */
export const CLASES_ILIQUIDAS: ReadonlySet<ClaseModelo> = new Set(['privados', 'club'])

export interface Liquidez {
  readonly liquidoUsd: number
  readonly iliquidoUsd: number
  readonly liquidoShare: number
  readonly iliquidoShare: number
}

export interface BloqueClase {
  readonly clase: ClaseModelo
  readonly nombre: string
  readonly usd: number
  readonly share: number
  readonly instrumentos: readonly FilaInstrumento[]
}

export interface Portafolio {
  readonly ticketUsd: number
  readonly perfil: Perfil
  /** Monto por clase, en el orden del motor. */
  readonly porClase: Readonly<Record<ClaseModelo, number>>
  /**
   * Las clases que abrieron, con sus instrumentos dentro.
   *
   * Solo las que reciben dinero: una fila en cero no dice nada que la ausencia
   * de la fila no diga mejor, y son la mitad de la tabla en los tickets bajos.
   */
  readonly bloques: readonly BloqueClase[]
  /**
   * El mismo portafolio partido en dos: lo que se puede vender y lo que no.
   *
   * Sale de sumar las mismas clases, no de una segunda corrida: la vista de
   * liquidez y la de clases tienen que decir lo mismo o una de las dos miente.
   */
  readonly liquidez: Liquidez
  /** Lo que el motor decidió y hay que poder leer: mínimos, derivaciones. */
  readonly avisos: readonly string[]
  /** Suma de las líneas. Tiene que ser el ticket. */
  readonly totalUsd: number
}

/**
 * Como se mira la matriz.
 *
 * `clase` es el reparto entre las siete clases del modelo. `liquidez` es el
 * mismo dinero partido en dos — lo que se puede vender y lo que no — que es
 * la pregunta que la mesa hace antes de mirar ninguna clase.
 */
export type Mirada = 'clase' | 'liquidez'

export interface Matriz {
  readonly portafolios: readonly Portafolio[]
  readonly tickets: readonly number[]
  readonly perfiles: readonly Perfil[]
  /** Con qué palancas se corrió esta matriz. */
  readonly reglas: Reglas
  /** `true` cuando son las de la macro guardada, que es lo que sale hoy. */
  readonly esLaMacroGuardada: boolean
  /** Versión de la macro con la que se corrió, para poder nombrarla. */
  readonly versionMacro: number
  /** `true` cuando la base no tiene macro guardada y corre la de fábrica. */
  readonly esDeFabrica: boolean
  /** Cuál de las dos miradas está puesta. */
  readonly mirada: Mirada
}

const CLASES_VACIAS: Readonly<Record<ClaseModelo, number>> = {
  inm: 0,
  fijo: 0,
  variable: 0,
  privados: 0,
  club: 0,
  otros: 0,
  cash: 0,
}

/** El orden de bloques de la hoja Allocation detallado, que usa el motor. */
const ORDEN: readonly ClaseModelo[] = [
  'inm',
  'fijo',
  'variable',
  'privados',
  'club',
  'otros',
  'cash',
]

const EPS = 0.005

/** Un portafolio del universo: un ticket, un perfil, el motor en vacío. */
function correr(ticketUsd: number, perfil: Perfil, macro: Macro, reglas: Reglas): Portafolio {
  const plan = generarPlan({
    perfil,
    patrimonioTotalUsd: ticketUsd,
    benchmark: benchmarkDe(perfil, macro.pesos),
    pesos: {
      fijo: pesosDeClase('fijo', perfil, macro.pesos),
      variable: pesosDeClase('variable', perfil, macro.pesos),
      otros: pesosDeClase('otros', perfil, macro.pesos),
    },
    // Sin pisos: es un cliente que llega con dinero y nada mas. Esa es la
    // condicion que deja ver el modelo sin nada encima.
    pisos: [],
    ticketMinimoUsd: reglas.ticketEtfUsd,
    fallbacks: FALLBACKS,
    reglas: conLasPalancas(macro.reglas, reglas),
  })

  const porClase = { ...CLASES_VACIAS }
  for (const clase of plan.reparto.porClase) {
    porClase[clase.clase] = clase.objetivoUsd
  }

  const total = plan.totalObjetivoUsd
  const share = (usd: number) => (total > 0 ? usd / total : 0)

  const bloques = ORDEN.filter((clase) => porClase[clase] > EPS).map(
    (clase): BloqueClase => ({
      clase,
      nombre: NOMBRE_CLASE[clase],
      usd: porClase[clase],
      share: share(porClase[clase]),
      instrumentos: plan.lineas
        .filter((linea) => linea.clase === clase)
        .map((linea) => ({
          instrumento: linea.instrumento,
          usd: linea.usd,
          share: share(linea.usd),
          nota: linea.nota ?? null,
        })),
    }),
  )

  const iliquidoUsd = ORDEN.reduce(
    (acc, clase) => (CLASES_ILIQUIDAS.has(clase) ? acc + porClase[clase] : acc),
    0,
  )
  const liquidoUsd = total - iliquidoUsd

  return {
    ticketUsd,
    perfil,
    porClase,
    bloques,
    liquidez: {
      liquidoUsd,
      iliquidoUsd,
      liquidoShare: share(liquidoUsd),
      iliquidoShare: share(iliquidoUsd),
    },
    avisos: plan.avisos,
    totalUsd: total,
  }
}

/** La matriz: cada ticket contra cada perfil elegido, con estas palancas. */
export function matrizDeBenchmark(
  macro: Macro,
  reglas: Reglas,
  perfiles: readonly Perfil[],
  mirada: Mirada = 'clase',
  esDeFabrica = false,
): Matriz {
  const base = reglasDeLaMacro(macro)

  return {
    portafolios: TICKETS.flatMap((ticket) =>
      perfiles.map((perfil) => correr(ticket, perfil, macro, reglas)),
    ),
    tickets: TICKETS,
    perfiles: [...perfiles],
    reglas,
    esLaMacroGuardada:
      reglas.inmobiliario === base.inmobiliario &&
      reglas.umbralInmobiliarioUsd === base.umbralInmobiliarioUsd &&
      reglas.ticketEtfUsd === base.ticketEtfUsd,
    versionMacro: macro.version,
    esDeFabrica,
    mirada,
  }
}

/** Lee la mirada de la URL. Ante cualquier duda, el reparto por clase. */
export function miradaDeLaUrl(
  parametros: Record<string, string | string[] | undefined>,
): Mirada {
  const crudo = parametros['mirada']
  const valor = Array.isArray(crudo) ? crudo[0] : crudo
  return valor === 'liquidez' ? 'liquidez' : 'clase'
}

/**
 * Lee los perfiles a mirar de la URL.
 *
 * Acepta la lista por nombre —`?perfiles=Conservador,Arriesgado`— y también
 * las tres vistas fijas que la pantalla tenía antes, para que un enlace
 * guardado en un mensaje viejo siga abriendo lo mismo. Sin nada legible, los
 * cinco: el universo entero es el punto de partida honesto.
 */
export function perfilesDeLaUrl(
  parametros: Record<string, string | string[] | undefined>,
): readonly Perfil[] {
  const crudo = parametros['perfiles']
  const valor = Array.isArray(crudo) ? crudo[0] : crudo
  if (valor === undefined || valor.trim() === '') return PERFILES_MIRABLES

  if (valor === '5') return PERFILES_MIRABLES
  if (valor === '3') return ['Conservador', 'Moderado', 'Arriesgado']
  if (valor === '2') return ['Conservador', 'Moderado']

  const pedidos = new Set(valor.split(',').map((p) => p.trim()))
  // Se filtra contra el orden canónico y no contra lo que vino: los perfiles
  // son ordinales, y una leyenda con Arriesgado antes que Moderado se lee mal.
  const elegidos = PERFILES_MIRABLES.filter((perfil) => pedidos.has(perfil))

  return elegidos.length === 0 ? PERFILES_MIRABLES : elegidos
}

/** Lee las palancas de la URL, cayendo en las de la macro ante cualquier duda. */
export function reglasDeLaUrl(
  parametros: Record<string, string | string[] | undefined>,
  macro: Macro,
): Reglas {
  const base = reglasDeLaMacro(macro)

  const numero = (clave: string, porDefecto: number) => {
    const crudo = parametros[clave]
    const valor = Number(Array.isArray(crudo) ? crudo[0] : crudo)
    return Number.isFinite(valor) && valor > 0 ? valor : porDefecto
  }

  const inm = parametros['inm']
  const destino = Array.isArray(inm) ? inm[0] : inm

  // Cada valor se compara contra el nombre que el motor conoce, y lo que no
  // coincide deja la regla de la macro: un parametro tecleado a mano no puede
  // cambiar el modelo por un valor que el esquema despues rechaza.
  const conocidos: readonly ReglaInmobiliario[] = ['prorratear', 'alternativos', 'publicos']

  return {
    inmobiliario:
      conocidos.find((r) => r === destino) ?? base.inmobiliario,
    umbralInmobiliarioUsd: numero('umbral', base.umbralInmobiliarioUsd),
    ticketEtfUsd: numero('etf', base.ticketEtfUsd),
  }
}
