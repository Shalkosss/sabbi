/**
 * Reparto de Mercados Privados.
 *
 * Port de `ProcesarMercadosPrivados` de la macro Benchmark Sabbi v8. A
 * diferencia de la cascada de ETFs, esta rutina da el mismo resultado que la
 * propuesta de Ana Tumi: el reparto de privados no cambio entre versiones.
 *
 * La clase se abre en tres familias. Club y Otros toman su parte segun los
 * pesos del benchmark; lo que queda es el Fondo Oportunidad, que a su vez puede
 * desglosarse en los tres fondos institucionales.
 *
 * Las dos reglas que gobiernan el resultado:
 *
 *  - Umbral por familia. Si Club no llega a 10,000 o si Otros no llega al
 *    ticket minimo, esa familia no se abre y su monto cae al Fondo Oportunidad.
 *    Sumarlo alli y no antes es lo que evita el bug que reporto Max: netear la
 *    familia antes hacia aparecer residuos chicos como dinero nuevo aunque la
 *    clase ya estuviera sobrecubierta.
 *  - Todo o nada. Si algun subfondo activo no llega a 50,000, no se abre
 *    ninguno: todo se muestra como Fondo Oportunidad. Media apertura no existe.
 */

import type { Perfil } from '../domain/tipos.js'

/** Minimo para que Club deals se abra como linea propia. */
const MIN_CLUB = 10_000

/** Minimo por subfondo institucional. Debajo de esto no se abre ninguno. */
const MIN_SUBFONDO = 50_000

/** Frontera entre las dos clases del fondo Edifica. */
const UMBRAL_CLASE_A = 70_000

const EPS = 1e-6
const TOL = 0.01

export const FONDO_OPORTUNIDAD = 'Sabbi Fondo Oportunidad'
export const FONDO_RE_INFRA = 'FM RE Infra'
export const FONDO_PRIVATE_CREDIT = 'FM PC'
export const FONDO_PE_VC = 'FM PE VC'
export const OTROS_IBIT = 'Otros - IBIT'

/**
 * Nota que arrastra todo fondo institucional.
 *
 * El motor no usa el check institucional como compuerta: siempre abre el split
 * y estampa la nota. Quien decide es el asesor.
 */
export const NOTA_INSTITUCIONAL =
  'Disponible solo para clientes Institucionales; caso contrario, asignar a Sabbi Fondo Oportunidad.'

export interface LineaPrivados {
  readonly instrumento: string
  readonly usd: number
  readonly familia: 'club' | 'otros' | 'oportunidad'
  readonly nota?: string
}

export interface PesosPrivados {
  /** Peso de la clase entera sobre el patrimonio. */
  readonly clase: number
  readonly club: number
  readonly otros: number
}

export interface OpcionesPrivados {
  readonly perfil: Perfil
  readonly pesos: PesosPrivados
  /** Ticket minimo general. Es el umbral que debe superar Otros. */
  readonly ticketMinimo: number
  /** Club y Otros clavados por restriccion no se disuelven aunque no lleguen. */
  readonly clubFijado?: boolean
  readonly otrosFijado?: boolean
}

/** Split del Fondo Oportunidad entre los tres institucionales, por perfil. */
function splitInstitucional(perfil: Perfil): { reInfra: number; pc: number; pevc: number } {
  return perfil === 'Arriesgado'
    ? { reInfra: 0, pc: 0.3, pevc: 0.7 }
    : { reInfra: 0.5, pc: 0.5, pevc: 0 }
}

/**
 * Nombre de la clase del fondo Edifica segun el monto.
 *
 * Con Ana Tumi el club queda en 67,979 y por eso la propuesta dice Clase B.
 */
export function etiquetaClubDeal(montoUsd: number): string {
  return montoUsd >= UMBRAL_CLASE_A
    ? 'Fondo Edifica Diversificado Clase A'
    : 'Fondo Edifica Diversificado Clase B'
}

/**
 * Reparte el objetivo de Mercados Privados entre sus instrumentos.
 *
 * @param objetivoUsd  monto total de la clase, no el dinero nuevo
 */
export function repartirPrivados(
  objetivoUsd: number,
  opciones: OpcionesPrivados,
): LineaPrivados[] {
  const { perfil, pesos, ticketMinimo, clubFijado = false, otrosFijado = false } = opciones
  if (objetivoUsd <= EPS) return []
  if (pesos.clase <= EPS) {
    return [{ instrumento: FONDO_OPORTUNIDAD, usd: objetivoUsd, familia: 'oportunidad' }]
  }

  let club = objetivoUsd * (pesos.club / pesos.clase)
  let otros = objetivoUsd * (pesos.otros / pesos.clase)

  // Una familia que no llega a su umbral no se abre: su monto engorda el Fondo
  // Oportunidad en lugar de quedar como una linea inviable.
  if (!clubFijado && club < MIN_CLUB - TOL) club = 0
  if (!otrosFijado && otros < ticketMinimo - TOL) otros = 0

  const oportunidad = Math.max(0, objetivoUsd - club - otros)

  const lineas: LineaPrivados[] = []

  if (club > EPS) {
    lineas.push({ instrumento: etiquetaClubDeal(club), usd: club, familia: 'club' })
  }
  if (otros > EPS) {
    lineas.push({ instrumento: OTROS_IBIT, usd: otros, familia: 'otros' })
  }

  lineas.push(...abrirOportunidad(oportunidad, perfil))

  return lineas.sort((a, b) => b.usd - a.usd)
}

/**
 * Abre el Fondo Oportunidad en sus tres subfondos, o lo deja entero.
 *
 * La regla es de todo o nada: basta con que un subfondo activo no llegue a
 * 50,000 para que no se abra ninguno.
 */
function abrirOportunidad(montoUsd: number, perfil: Perfil): LineaPrivados[] {
  if (montoUsd <= EPS) return []

  const split = splitInstitucional(perfil)
  const candidatos = [
    { instrumento: FONDO_RE_INFRA, usd: montoUsd * split.reInfra },
    { instrumento: FONDO_PRIVATE_CREDIT, usd: montoUsd * split.pc },
    { instrumento: FONDO_PE_VC, usd: montoUsd * split.pevc },
  ].filter((c) => c.usd > EPS)

  const todosPasan =
    candidatos.length > 0 && candidatos.every((c) => c.usd >= MIN_SUBFONDO - TOL)

  if (!todosPasan) {
    return [{ instrumento: FONDO_OPORTUNIDAD, usd: montoUsd, familia: 'oportunidad' }]
  }

  return candidatos.map((c) => ({
    instrumento: c.instrumento,
    usd: c.usd,
    familia: 'oportunidad' as const,
    nota: NOTA_INSTITUCIONAL,
  }))
}
