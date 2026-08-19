/**
 * El vocabulario canonico del catalogo.
 *
 * La hoja se llena a mano desde hace anios y cada quien escribio como pudo:
 * «Club deal» y «Club Deals», «Mercado publico variable» y «Mercados Publicos
 * - Variable», «USA» y «EEUU». Ninguna de esas variantes esta mal; lo que
 * estaba mal era no tener una lista.
 *
 * Los sinonimos de aca son los que aparecen de verdad en la hoja, contados uno
 * por uno. Lo que no figura no se adivina: vuelve como aviso para que alguien
 * decida, porque meter «Private Debt» en Private Credit Senior o en
 * Subordinated cambia el score de performance del producto.
 */

import { normalizar } from '../texto.js'
import { LIQUIDECES } from './tipos.js'
import type { Liquidez, Moneda } from './tipos.js'

/** La hoja de origen escribe «Imobiliario»; se corrige al entrar. */
export const CLASES_ACTIVO = [
  'Inmobiliario Directo',
  'Mercados Públicos - Fijo',
  'Mercados Públicos - Variable',
  'Mercados Privados',
  'Club deals',
  'Cash y Otros',
] as const

export const REGIONES = [
  'EEUU',
  'Desarrollados ex-US',
  'Emergentes ex-Perú',
  'Latam ex-Perú',
  'Perú',
] as const

const SINONIMOS_CLASE: Readonly<Record<string, string>> = {
  'imobiliario directo': 'Inmobiliario Directo',
  'inmobiliario directo': 'Inmobiliario Directo',
  'mercado publico fijo': 'Mercados Públicos - Fijo',
  'mercados publico fijo': 'Mercados Públicos - Fijo',
  'mercados publicos fijo': 'Mercados Públicos - Fijo',
  'mercado publico variable': 'Mercados Públicos - Variable',
  'mercados publico variable': 'Mercados Públicos - Variable',
  'mercados publicos variable': 'Mercados Públicos - Variable',
  'mercado privado': 'Mercados Privados',
  'mercados privado': 'Mercados Privados',
  'club deal': 'Club deals',
  'club deals': 'Club deals',
  // Efectivo y Otros son las dos mitades de la misma clase macro. Al unificarse
  // pueden caer dos veces en el mismo producto, y ahi se suman.
  efectivo: 'Cash y Otros',
  cash: 'Cash y Otros',
  otros: 'Cash y Otros',
}

const SINONIMOS_REGION: Readonly<Record<string, string>> = {
  usa: 'EEUU',
  eeuu: 'EEUU',
  'estados unidos': 'EEUU',
  emergentes: 'Emergentes ex-Perú',
  'emergentes ex peru': 'Emergentes ex-Perú',
  'latam ex peru': 'Latam ex-Perú',
  'desarrollados ex us': 'Desarrollados ex-US',
  peru: 'Perú',
}

const SINONIMOS_SUBYACENTE: Readonly<Record<string, string>> = {
  'club deal real estate peru': 'Club Deals Real Estate Peru',
  'club deal deuda privada peru': 'Club Deals Deuda Privada Peru',
  'bonos corp investment grade': 'Bonos Corporativos Investment Grade (AAA–BBB)',
  'bonos corporativos ig': 'Bonos Corporativos Investment Grade (AAA–BBB)',
  'bonos latam': 'Bonos Latinoamérica',
  'emergentes ex peru': 'Mercados Emergentes ex Perú',
  'hedge funds otros': 'Hedge Funds',
  'cash y otros': 'Cash',
}

const SINONIMOS_MONEDA: Readonly<Record<string, Moneda>> = {
  dolares: 'USD',
  dolar: 'USD',
  'dolar estadounidense': 'USD',
  usd: 'USD',
  soles: 'PEN',
  sol: 'PEN',
  pen: 'PEN',
}

/**
 * `Alta`, `Media` y `Baja` son otra escala que alguien mezclo en la columna.
 * Se traducen al horizonte equivalente en vez de perder las filas.
 */
const SINONIMOS_LIQUIDEZ: Readonly<Record<string, Liquidez>> = {
  inmediata: 'Inmediata',
  inmediato: 'Inmediata',
  alta: 'Inmediata',
  'corto plazo': 'Corto plazo',
  'mediano plazo': 'Mediano plazo',
  media: 'Mediano plazo',
  'largo plazo': 'Largo plazo',
  baja: 'Largo plazo',
}

/**
 * La conjuncion que quedo pegada al separar por comas.
 *
 * «Cash 85% y Bonos Peru 15%» parte en dos, y el segundo trozo arranca con
 * «y ». No es parte del nombre.
 */
const CONJUNCION = /^(?:y|e|and)\s+/

/**
 * Caracteres invisibles.
 *
 * Varias celdas arrancan con decenas de espacios de ancho cero, seguramente de
 * un copiar y pegar desde la web. No se ven, pero rompen cualquier comparacion.
 */
const INVISIBLES = /[\p{Cf}\p{Zl}\p{Zp}]/gu

export const limpiarTermino = (bruto: string): string =>
  bruto
    .replace(INVISIBLES, '')
    .trim()
    .replace(CONJUNCION, '')
    .replace(/[\s:.;]+$/, '')
    .trim()

/**
 * La clave con la que se compara un termino contra la lista.
 *
 * Ademas de minusculas y tildes, borra la puntuacion. La hoja de
 * subyacentes escribe «Mercados Publicos – Fijo» con guion largo y la lista
 * de clases con guion corto; son el mismo nombre y hay que tratarlo asi.
 * Lo mismo con «Hedge Funds / Otros» y con los parentesis de
 * «Investment Grade (AAA–BBB)».
 */
const clave = (texto: string): string =>
  normalizar(limpiarTermino(texto))
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()

/** Indice de forma normalizada a nombre canonico, con sus sinonimos. */
function indice(
  canonicos: readonly string[],
  sinonimos: Readonly<Record<string, string>>,
): ReadonlyMap<string, string> {
  const mapa = new Map<string, string>()
  for (const nombre of canonicos) mapa.set(clave(nombre), nombre)
  for (const [alias, nombre] of Object.entries(sinonimos)) mapa.set(clave(alias), nombre)
  return mapa
}

const CLASES = indice(CLASES_ACTIVO, SINONIMOS_CLASE)
const REGIONES_IDX = indice(REGIONES, SINONIMOS_REGION)

export const resolverClase = (bruto: string): string | null =>
  CLASES.get(clave(bruto)) ?? null

export const resolverRegion = (bruto: string): string | null =>
  REGIONES_IDX.get(clave(bruto)) ?? null

/** Los subyacentes canonicos salen de la hoja, no de una lista escrita aca. */
export function resolverSubyacente(bruto: string, canonicos: readonly string[]): string | null {
  const idx = indice(canonicos, SINONIMOS_SUBYACENTE)
  return idx.get(clave(bruto)) ?? null
}

export { clave as claveVocabulario }

/** Version reutilizable del indice de subyacentes, para no rearmarlo por fila. */
export const indiceSubyacentes = (canonicos: readonly string[]): ReadonlyMap<string, string> =>
  indice(canonicos, SINONIMOS_SUBYACENTE)

export const resolverMoneda = (bruto: string): Moneda | null =>
  SINONIMOS_MONEDA[clave(bruto)] ?? null

export function resolverLiquidez(bruto: string): Liquidez | null {
  const buscado = clave(bruto)
  const directa = LIQUIDECES.find((liquidez) => clave(liquidez) === buscado)
  return directa ?? SINONIMOS_LIQUIDEZ[buscado] ?? null
}
