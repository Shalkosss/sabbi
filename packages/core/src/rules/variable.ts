/**
 * Reparto del bloque de Mercados Publicos - Variable.
 *
 * Port de `AsignarBloqueVariable` de la macro Benchmark Sabbi v8. Es el cambio
 * mas grande de v8 y el que explica por que las lineas de Variable de la
 * propuesta de Ana Tumi ya no se reproducen: hasta v6 Variable pasaba por la
 * misma cascada que Fijo, y ahora tiene motor propio.
 *
 * La idea es que el S&P 500 es nucleo y el resto son satelites, y que los
 * satelites se financian entre ellos:
 *
 *  1. Prorrateo satelital exclusivo. Cuando un satelite muere por no llegar al
 *     ticket, su monto se reparte solo entre los satelites vivos. El nucleo no
 *     crece con los restos; solo recoge al ultimo satelite si mueren todos.
 *  2. Rescate de rango. Si queda exactamente un satelite por debajo del ticket
 *     y esta entre el piso de rescate y el minimo, en vez de matarlo se le
 *     compra el salto: se redondea la diferencia hacia arriba a un multiplo del
 *     bloque y la financian el nucleo y los demas satelites a prorrata. El
 *     ciclo termina ahi.
 *  3. Separacion entre satelites. Los sobrevivientes no pueden quedar pegados
 *     entre si: cada uno debe superar al anterior en al menos una proporcion, y
 *     el ajuste lo paga el nucleo.
 *
 * Si el nucleo se queda bajo el ticket despues de financiar todo eso, el bloque
 * colapsa a una sola linea de S&P 500 con el monto entero.
 *
 * Los tres numeros salen de la macro. En la v8 son 14,500 de piso de rescate,
 * el millar como bloque y un 10% de separacion. Quien es el nucleo tambien:
 * es el texto con el que se reconoce su nombre, `S&P 500` en la v8.
 */

import { REGLAS_V8 } from '../domain/reglas.js'
import type { ReglasVariable } from '../domain/reglas.js'
import type { AsignacionEtf } from './cascada.js'

const EPS = 1e-6

/**
 * Lo que necesita el motor de Variable.
 *
 * Misma forma que `OpcionesCascada` — ticket y fallback — con los tres numeros
 * propios del rescate y la separacion, que salen de la macro. Es un tipo
 * aparte y no el de la cascada porque los ajustes no son los mismos: mezclarlos
 * dejaria a cada motor recibiendo campos que no mira.
 */
export interface OpcionesVariable {
  /** Ticket minimo por instrumento. */
  readonly ticketMinimo: number
  /** Instrumento al que cae todo el monto cuando no alcanza para un ticket. */
  readonly fallback: string
  /** Rescate y separacion. Sin ellos manda la v8, que fija el golden test. */
  readonly ajustes?: ReglasVariable
}

/** Un satelite en curso de reparto. */
interface Satelite {
  nombre: string
  usd: number
  vivo: boolean
}

/**
 * Reconoce al nucleo del bloque por nombre.
 *
 * La macro traia el nombre escrito en el codigo — `S&P 500` o `SP500` — y eso
 * dejaba al motor atado a un instrumento concreto: el dia que el nucleo cambie
 * habria que desplegar. Ahora el texto sale de la macro y la comparacion
 * ignora mayusculas, espacios y simbolos, de modo que un solo campo con
 * `S&P 500` sigue reconociendo tanto `iShares Core S&P 500` como `SP500`.
 */
const canonico = (texto: string): string => texto.toUpperCase().replace(/[^A-Z0-9]/g, '')

function esNucleo(nombre: string, nucleo: string): boolean {
  const aguja = canonico(nucleo)
  return aguja !== '' && canonico(nombre).includes(aguja)
}

/**
 * Reparte el dinero nuevo de Variable entre nucleo y satelites.
 *
 * Misma firma que `repartirEtfs` para que el ensamblador trate los dos bloques
 * igual.
 */
export function repartirVariable(
  pesos: Readonly<Record<string, number>>,
  montoUsd: number,
  opciones: OpcionesVariable,
): AsignacionEtf[] {
  const { ticketMinimo, fallback, ajustes = REGLAS_V8.variable } = opciones
  if (ticketMinimo <= 0) throw new Error('El ticket minimo debe ser mayor que cero.')
  if (montoUsd <= EPS) return []

  const nombres = Object.keys(pesos).filter((n) => (pesos[n] ?? 0) > 0)
  const sumaPesos = nombres.reduce((acc, n) => acc + (pesos[n] ?? 0), 0)

  if (montoUsd < ticketMinimo || nombres.length === 0 || sumaPesos <= 0) {
    return [{ nombre: fallback, usd: montoUsd }]
  }

  const nombreNucleo = nombres.find((n) => esNucleo(n, ajustes.nucleo))
  if (nombreNucleo === undefined) return [{ nombre: fallback, usd: montoUsd }]

  const valorDe = (n: string) => (montoUsd * (pesos[n] ?? 0)) / sumaPesos

  let nucleo = valorDe(nombreNucleo)
  const satelites: Satelite[] = nombres
    .filter((n) => n !== nombreNucleo)
    .map((n) => ({ nombre: n, usd: valorDe(n), vivo: true }))
    .filter((s) => s.usd > EPS)

  nucleo = podarSatelites(satelites, nucleo, ticketMinimo, ajustes)
  nucleo = separarSatelites(satelites, nucleo, ajustes.separacion)

  // El nucleo pago los rescates y la separacion; si quedo corto, el bloque no
  // se sostiene desglosado y colapsa a una sola linea.
  if (nucleo < ticketMinimo) {
    return [{ nombre: nombreNucleo, usd: montoUsd }]
  }

  return [
    { nombre: nombreNucleo, usd: nucleo },
    ...satelites.filter((s) => s.vivo).map((s) => ({ nombre: s.nombre, usd: s.usd })),
  ]
}

/**
 * Mata satelites bajo el ticket, o rescata al unico que este cerca.
 *
 * Devuelve el nuevo valor del nucleo.
 */
function podarSatelites(
  satelites: Satelite[],
  nucleoInicial: number,
  minimo: number,
  ajustes: ReglasVariable,
): number {
  let nucleo = nucleoInicial

  // Cada vuelta mata a uno o termina: el tope solo protege de un empate raro.
  for (let vuelta = 0; vuelta <= satelites.length; vuelta += 1) {
    const vivos = satelites.filter((s) => s.vivo)
    if (vivos.length === 0) return nucleo

    const bajos = vivos.filter((s) => s.usd < minimo)
    if (bajos.length === 0) return nucleo

    const suma = vivos.reduce((acc, s) => acc + s.usd, 0)
    const menor = vivos.reduce((a, b) => (a.usd <= b.usd ? a : b))

    if (bajos.length === 1 && menor.usd >= ajustes.pisoRescateUsd) {
      return rescatar(satelites, nucleo, menor, minimo, ajustes.bloqueRescateUsd)
    }

    menor.vivo = false
    const restantes = satelites.filter((s) => s.vivo)
    const base = suma - menor.usd

    if (restantes.length === 0 || base <= EPS) {
      nucleo += menor.usd
      continue
    }
    // Prorrateo exclusivo: el monto del muerto se queda entre satelites.
    for (const s of restantes) s.usd += (menor.usd * s.usd) / base
  }

  return nucleo
}

/**
 * Compra el salto al ticket para el satelite rescatado.
 *
 * Lo financian el nucleo y los demas satelites vivos a prorrata. El monto se
 * redondea hacia arriba a un multiplo del bloque de la macro —el millar, en la
 * v8—: es lo que hace que la linea rescatada quede en un numero limpio por
 * encima del minimo.
 */
function rescatar(
  satelites: readonly Satelite[],
  nucleoInicial: number,
  rescatado: Satelite,
  minimo: number,
  bloque: number,
): number {
  let nucleo = nucleoInicial
  const salto = (Math.floor((minimo - rescatado.usd) / bloque) + 1) * bloque

  const otros = satelites.filter((s) => s.vivo && s !== rescatado)
  const disponible = nucleo + otros.reduce((acc, s) => acc + s.usd, 0)

  if (disponible > EPS) {
    nucleo -= (salto * nucleo) / disponible
    for (const s of otros) s.usd -= (salto * s.usd) / disponible
  }
  rescatado.usd += salto

  return nucleo
}

/**
 * Impone la separacion minima entre satelites consecutivos.
 *
 * El ajuste lo paga el nucleo, no los satelites: si se lo cobrara a ellos, la
 * separacion se rompería en la linea siguiente.
 */
function separarSatelites(
  satelites: readonly Satelite[],
  nucleoInicial: number,
  separacion: number,
): number {
  let nucleo = nucleoInicial
  const vivos = satelites.filter((s) => s.vivo).sort((a, b) => a.usd - b.usd)
  if (vivos.length <= 1) return nucleo

  for (let i = 0; i < vivos.length - 1; i += 1) {
    const menor = vivos[i]
    const mayor = vivos[i + 1]
    if (!menor || !mayor) continue

    const objetivo = menor.usd * (1 + separacion)
    if (mayor.usd < objetivo) {
      const falta = objetivo - mayor.usd
      mayor.usd += falta
      nucleo -= falta
    }
  }

  return nucleo
}
