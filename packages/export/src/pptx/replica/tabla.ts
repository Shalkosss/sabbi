import { escapar } from './xml.js'

/**
 * Filas de tabla, tantas como el cliente tenga.
 *
 * Las laminas 20 a 22 de la plantilla son tablas de verdad — `<a:tbl>` — pero
 * de largo fijo: tienen las filas que tenia el cliente de referencia. Un
 * cliente con veinte instrumentos necesita veinte filas, no las cinco que
 * quedaron dibujadas.
 *
 * Este modulo rehace la tabla: toma las filas de la plantilla como modelos de
 * formato y escribe una tabla nueva con las filas que se le pidan. Copiar el
 * formato de una fila existente en vez de construirlo es lo que mantiene el
 * diseno: los rellenos, los bordes, la tipografia y el ancho de columna siguen
 * siendo los del deck de referencia.
 *
 * Y ajusta el alto del marco. Una tabla mas larga que su `graphicFrame` se
 * dibuja por encima de lo que tenga debajo, que es la forma silenciosa de
 * arruinar una lamina.
 */

/** Una fila a imprimir. */
export interface FilaNueva {
  /**
   * Que fila de la plantilla copiar, contando desde cero.
   *
   * De ahi salen el alto, el relleno, los bordes y la tipografia de cada
   * celda: una fila de cabecera y una de instrumento no se parecen en nada, y
   * la plantilla ya tiene una de cada.
   */
  readonly modelo: number
  /**
   * Que dice cada celda, en orden de columna.
   *
   * `null` deja el texto que traia la plantilla — es lo que se usa para las
   * cabeceras. Menos valores que columnas deja las ultimas como estaban.
   */
  readonly celdas: readonly (string | null)[]
}

export interface ResultadoTabla {
  readonly xml: string
  /** Alto de la tabla resultante, en EMU. Lo que decide si entra en la lamina. */
  readonly altoEmu: number
}

const TABLA = /<a:tbl>[\s\S]*?<\/a:tbl>/
const FILA = /<a:tr h="\d+">[\s\S]*?<\/a:tr>/g
const CELDA = /<a:tc(?:\s[^>]*)?>[\s\S]*?<\/a:tc>/g

/** Las filas de la primera tabla de una lamina, tal como estan. */
export function filasDe(xml: string): readonly string[] {
  const tabla = TABLA.exec(xml)?.[0]
  return tabla === undefined ? [] : (tabla.match(FILA) ?? [])
}

/** El alto de cada fila de la plantilla, en EMU. */
export function altosDe(xml: string): readonly number[] {
  return filasDe(xml).map((fila) => Number(/<a:tr h="(\d+)"/.exec(fila)?.[1] ?? 0))
}

/**
 * Rehace la tabla de una lamina con las filas que se le pidan.
 *
 * La lamina tiene que traer una tabla; si trae mas de una, se rehace la
 * primera, que en esta plantilla es siempre la unica.
 */
export function rehacerTabla(xml: string, filas: readonly FilaNueva[]): ResultadoTabla {
  const tabla = TABLA.exec(xml)?.[0]
  if (tabla === undefined) throw new Error('La lamina no trae ninguna tabla.')

  const modelos = tabla.match(FILA) ?? []
  if (modelos.length === 0) throw new Error('La tabla de la lamina no trae ninguna fila.')

  const nuevas = filas.map((fila) => {
    const modelo = modelos[fila.modelo]
    if (modelo === undefined) {
      throw new Error(
        `La tabla no tiene la fila modelo ${fila.modelo}; trae ${modelos.length}.`,
      )
    }
    return escribirFila(modelo, fila.celdas)
  })

  const altoEmu = filas.reduce((acc, fila) => {
    const modelo = modelos[fila.modelo] ?? ''
    return acc + Number(/<a:tr h="(\d+)"/.exec(modelo)?.[1] ?? 0)
  }, 0)

  // Todo lo que no es una fila —`tblPr`, `tblGrid`— se conserva: ahi viven el
  // ancho de cada columna y el estilo de la tabla entera.
  let indice = 0
  const tablaNueva = tabla.replace(FILA, () => (indice++ === 0 ? nuevas.join('') : ''))

  return { xml: xml.replace(TABLA, tablaNueva), altoEmu }
}

/** Estira o encoge el marco de la tabla para que la tabla quepa exacta. */
export function ajustarMarco(xml: string, altoEmu: number): string {
  const marco = /<p:graphicFrame>[\s\S]*?<\/p:graphicFrame>/.exec(xml)?.[0]
  if (marco === undefined) return xml

  const ajustado = marco.replace(
    /<a:ext cx="(\d+)" cy="\d+"\/>/,
    (_completo, cx: string) => `<a:ext cx="${cx}" cy="${altoEmu}"/>`,
  )

  return xml.replace(marco, ajustado)
}

/**
 * Escribe el texto de cada celda conservando el formato de la del modelo.
 *
 * De cada celda sobrevive el primer parrafo y, dentro de el, la primera
 * corrida: ahi estan el tamano, el color y la tipografia. Las demas se
 * descartan, porque una celda con dos corridas escritas a mano — «ya tenia X,
 * objetivo Y» — no tiene forma de recibir un solo valor sin elegir cual de las
 * dos manda.
 *
 * Una celda sin ninguna corrida se deja como esta: no hay de donde sacarle el
 * formato al texto que se le quiera poner.
 */
function escribirFila(modelo: string, celdas: readonly (string | null)[]): string {
  let columna = 0

  return modelo.replace(CELDA, (celda) => {
    const valor = celdas[columna]
    columna += 1
    return valor === null || valor === undefined ? celda : escribirCelda(celda, valor)
  })
}

function escribirCelda(celda: string, valor: string): string {
  const cuerpo = /<a:txBody>[\s\S]*?<\/a:txBody>/.exec(celda)?.[0]
  if (cuerpo === undefined) return celda

  const parrafos = cuerpo.match(/<a:p>[\s\S]*?<\/a:p>/g) ?? []
  const primero = parrafos[0]
  if (primero === undefined) return celda

  const corridas = primero.match(/<a:r>[\s\S]*?<\/a:r>/g) ?? []
  const corrida = corridas[0]
  if (corrida === undefined) return celda

  const conTexto = corrida.replace(/<a:t>[\s\S]*?<\/a:t>/, `<a:t>${escapar(valor)}</a:t>`)

  // Las propiedades del parrafo van primero si las hay: al reves el XML deja
  // de ser valido y PowerPoint se niega a abrir el archivo.
  const propiedades = /<a:pPr(?:\s[^>]*)?(?:\/>|>[\s\S]*?<\/a:pPr>)/.exec(primero)?.[0] ?? ''
  const parrafoNuevo = `<a:p>${propiedades}${conTexto}</a:p>`

  const cuerpoNuevo = cuerpo
    .replace(/<a:p>[\s\S]*?<\/a:p>/g, () => '')
    .replace('</a:txBody>', `${parrafoNuevo}</a:txBody>`)

  return celda.replace(cuerpo, cuerpoNuevo)
}


/** El alto que el diseno le reservo a la tabla en la lamina, en EMU. */
export function altoDelMarco(xml: string): number {
  const marco = /<p:graphicFrame>[\s\S]*?<\/p:graphicFrame>/.exec(xml)?.[0] ?? ''
  return Number(/<a:ext cx="\d+" cy="(\d+)"\/>/.exec(marco)?.[1] ?? 0)
}

export interface OpcionesPaginado {
  /** Alto disponible en una lamina, en EMU. Sale de `altoDelMarco`. */
  readonly altoEmu: number
  /**
   * Filas que se repiten al principio de cada lamina.
   *
   * La cabecera, casi siempre. Una tabla que sigue en la lamina siguiente sin
   * repetir sus titulos obliga a volver atras para saber que columna es cual.
   */
  readonly fijas?: readonly FilaNueva[]
}

/**
 * Reparte las filas en tantas laminas como hagan falta.
 *
 * El alto de cada fila es el de la fila de la plantilla que copia, asi que
 * `altos` es lo que devuelve `altosDe` sobre esa misma lamina. Una fila que ni
 * siquiera cabe sola en una lamina vacia entra igual: dejarla afuera seria
 * perderla en silencio, y el desborde al menos se ve.
 */
export function paginarFilas(
  filas: readonly FilaNueva[],
  altos: readonly number[],
  opciones: OpcionesPaginado,
): readonly (readonly FilaNueva[])[] {
  const fijas = opciones.fijas ?? []
  const alto = (fila: FilaNueva) => altos[fila.modelo] ?? 0
  const altoFijas = fijas.reduce((acc, fila) => acc + alto(fila), 0)

  const paginas: FilaNueva[][] = []
  let actual: FilaNueva[] = [...fijas]
  let acumulado = altoFijas

  for (const fila of filas) {
    if (actual.length > fijas.length && acumulado + alto(fila) > opciones.altoEmu) {
      paginas.push(actual)
      actual = [...fijas]
      acumulado = altoFijas
    }
    actual.push(fila)
    acumulado += alto(fila)
  }

  if (actual.length > fijas.length) paginas.push(actual)
  return paginas.length === 0 ? [[...fijas]] : paginas
}
