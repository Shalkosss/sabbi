import type { DatosProducto } from '@sabbi/core'

/**
 * Emparejar los instrumentos del plan contra el catálogo.
 *
 * El mismo archivo de configuración trae dos espacios de nombres: la hoja Data
 * — de donde salen los pesos y, con ellos, el nombre que el motor imprime en
 * cada línea — y la lista de productos, con los retornos. No siempre escriben
 * igual el mismo instrumento: «Corporate Bond» contra «Corp Bond», un «Acc»
 * de más, un «UCITS ETF» de menos.
 *
 * La regla es deliberadamente cobarde: exacta, luego normalizada, luego
 * subcadena solo si hay un único candidato. Nada de distancias ni de elegir el
 * más parecido. Adjudicarle a un ETF el retorno esperado de otro es un error
 * que sale impreso en un documento que el cliente firma, y una celda vacía se
 * nota; una celda con el número equivocado, no.
 */

export interface ProductoCatalogo extends DatosProducto {
  readonly nombre: string
}

/**
 * Los instrumentos que el motor nombra por su cuenta y el catálogo escribe de
 * otra manera.
 *
 * No es una lista de parecidos: cada línea es el mismo producto con dos
 * nombres — el corto que el motor imprime desde sus reglas y el completo con
 * el que la mesa lo carga. Sin esta tabla, la propuesta muestra «—» en la
 * mitad de los productos de la propia Sabbi, que es peor que un nombre feo.
 *
 * El oro queda deliberadamente fuera: qué instrumento implementa esa posición
 * es una decisión de la mesa, no un problema de nombres, y hasta que la tomen
 * la celda vacía es la respuesta honesta.
 */
const ALIAS: Readonly<Record<string, string>> = {
  'FM RE Infra': 'Sabbi FM Real Estate & Infrastructure',
  'FM PC': 'Sabbi FM Private Credit',
  'FM PE VC': 'Sabbi FM Private Equity & Venture Capital',
  'Sabbi Fondo Oportunidad': 'Fondo Oportunidad',
  'Fondo Edifica Diversificado Clase A': 'Fondo Diversificados Edifica — Clase A',
  'Fondo Edifica Diversificado Clase B': 'Fondo Diversificados Edifica — Clase B',
  'BTC (IBIT)': 'IBIT',
  // El reparto de Cash es de producto único: es este, desde la hoja Data.
  Cash: 'Sura Ultracash Dólares',
  // Los ETFs que la hoja Data escribe completos y la mesa abrevia.
  'iShares $ High Yield Corporate Bond UCITS ETF Acc': 'iShares $ High Yield Corp Bond UCITS ETF',
  'iShares Core MSCI EMU UCITS ETF USD Hedged': 'iShares Core MSCI EMU UCITS ETF Hedged',
  'iShares Core MSCI Emerging Markets IMI ETF': 'iShares Core MSCI EM IMI UCITS ETF',
}

/** Todo a minúsculas, sin tildes y sin puntuación: «S&P 500» y «S&P500» son lo mismo. */
export function normalizarNombre(nombre: string): string {
  return nombre
    .toLowerCase()
    .normalize('NFD')
    // Los diacríticos que NFD dejó sueltos.
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** El único candidato que contiene o está contenido en el nombre buscado. */
function porSubcadena(
  buscado: string,
  porNombre: ReadonlyMap<string, ProductoCatalogo | AMBIGUO>,
): ProductoCatalogo | null {
  const candidatos = [...porNombre.entries()]
    .filter(([nombre]) => nombre.includes(buscado) || buscado.includes(nombre))
    .map(([, producto]) => producto)

  const unico = candidatos.length === 1 ? candidatos[0] : null
  return unico === undefined || unico === null || unico === AMBIGUO ? null : unico
}

/**
 * Dos productos del catálogo con el mismo nombre y distinto retorno.
 *
 * Pasa de verdad: el catálogo trae «iShares Core MSCI EM IMI UCITS ETF» dos
 * veces, una al 7–9% y otra al 6.5–9.5%. Elegir una es inventar el número que
 * va impreso en la propuesta que el cliente firma, así que no se elige: el
 * instrumento queda sin dato y la vista lo dice en su nota de cobertura. La
 * vista `productos_duplicados` lo pone en la cola de trabajo de la mesa.
 */
const AMBIGUO = Symbol('varios productos con el mismo nombre')
type AMBIGUO = typeof AMBIGUO

/** Índice por nombre normalizado, marcando los nombres que repiten producto. */
function indexarPorNombre(
  catalogo: readonly ProductoCatalogo[],
): Map<string, ProductoCatalogo | AMBIGUO> {
  const indice = new Map<string, ProductoCatalogo | AMBIGUO>()

  for (const producto of catalogo) {
    const clave = normalizarNombre(producto.nombre)
    const previo = indice.get(clave)

    if (previo === undefined) {
      indice.set(clave, producto)
      continue
    }
    if (previo === AMBIGUO) continue

    // Repetir el mismo producto con los mismos datos no es ambigüedad: es una
    // fila duplicada que da igual cuál se lea.
    const mismosDatos =
      previo.retMin === producto.retMin &&
      previo.retMax === producto.retMax &&
      previo.distMin === producto.distMin &&
      previo.distMax === producto.distMax
    // Uno de los dos sin retorno tampoco lo es: el que tiene el dato manda.
    const soloUnoTieneDato =
      (previo.retMin === null) !== (producto.retMin === null)

    if (mismosDatos) continue
    if (soloUnoTieneDato) {
      indice.set(clave, previo.retMin === null ? producto : previo)
      continue
    }
    indice.set(clave, AMBIGUO)
  }

  return indice
}

/**
 * Índice de instrumento del plan a datos del catálogo.
 *
 * Lo que no empareja queda fuera del mapa, y la propuesta lo muestra como
 * «sin dato» en vez de inventarlo.
 */
export function emparejarCatalogo(
  instrumentos: readonly string[],
  catalogo: readonly ProductoCatalogo[],
): ReadonlyMap<string, DatosProducto> {
  const normalizados = indexarPorNombre(catalogo)
  const indice = new Map<string, DatosProducto>()

  for (const instrumento of new Set(instrumentos)) {
    const conAlias = ALIAS[instrumento] ?? instrumento
    const normalizado = normalizarNombre(conAlias)
    const porNombre = normalizados.get(normalizado)
    const encontrado =
      porNombre === AMBIGUO
        ? null
        : (porNombre ?? porSubcadena(normalizado, normalizados))

    if (encontrado === undefined || encontrado === null) continue

    const [retMin, retMax] = conDispersion(encontrado.retMin, encontrado.retMax)
    const [distMin, distMax] = conDispersion(encontrado.distMin, encontrado.distMax)

    indice.set(instrumento, {
      retMin,
      retMax,
      distMin,
      distMax,
      distFrecuencia: encontrado.distFrecuencia,
      moneda: encontrado.moneda,
      liquidez: encontrado.liquidez,
    })
  }

  return indice
}

/**
 * La dispersión estándar de un retorno esperado, arriba y abajo del punto.
 *
 * El catálogo carga muchos productos con un solo número —«5%», no «4–6%»—, y
 * un solo número imprime un portafolio objetivo sin rango, como si el retorno
 * fuera una certeza. No lo es: es una estimación. Se le abre una banda
 * simétrica de ±20% relativo, así el 10% se lee 8–12% y el 4% se lee 3.2–4.8%
 * —la incertidumbre crece con el retorno, que es lo que uno espera—.
 *
 * Es relativo y no absoluto a propósito: dos puntos absolutos harían del 4% un
 * 2–6% y del 26% un 24–28%, al revés de como se comporta el riesgo.
 */
const DISPERSION = 0.2

/**
 * Abre un punto en banda; deja intacto lo que ya venía con rango real.
 *
 * Un producto que el catálogo cargó como «4–6%» ya trae la banda que la mesa
 * quiso; solo se ensancha el que vino como un único número. `null` sigue
 * siendo `null`: sin dato no se inventa una banda alrededor de la nada.
 */
function conDispersion(
  min: number | null,
  max: number | null,
): readonly [number | null, number | null] {
  if (min === null || max === null) return [min, max]
  if (min !== max) return [min, max]
  // Con un retorno negativo, `v*(1-d)` queda por encima de `v*(1+d)`; se ordena
  // para que el «min» sea siempre el piso de la banda.
  const a = min * (1 - DISPERSION)
  const b = max * (1 + DISPERSION)
  return [Math.min(a, b), Math.max(a, b)]
}
