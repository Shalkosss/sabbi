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
  porNombre: ReadonlyMap<string, ProductoCatalogo>,
): ProductoCatalogo | null {
  const candidatos = [...porNombre.entries()]
    .filter(([nombre]) => nombre.includes(buscado) || buscado.includes(nombre))
    .map(([, producto]) => producto)

  return candidatos.length === 1 ? (candidatos[0] ?? null) : null
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
  const exactos = new Map(catalogo.map((producto) => [producto.nombre, producto]))
  const normalizados = new Map(
    catalogo.map((producto) => [normalizarNombre(producto.nombre), producto]),
  )

  const indice = new Map<string, DatosProducto>()

  for (const instrumento of new Set(instrumentos)) {
    const normalizado = normalizarNombre(instrumento)
    const encontrado =
      exactos.get(instrumento) ??
      normalizados.get(normalizado) ??
      porSubcadena(normalizado, normalizados)

    if (encontrado === undefined || encontrado === null) continue

    indice.set(instrumento, {
      retMin: encontrado.retMin,
      retMax: encontrado.retMax,
      distMin: encontrado.distMin,
      distMax: encontrado.distMax,
      distFrecuencia: encontrado.distFrecuencia,
      moneda: encontrado.moneda,
    })
  }

  return indice
}
