import { escapar } from './xml.js'

/**
 * Las formas sueltas de una lamina, y como moverlas.
 *
 * Las laminas de "antes y despues" no traen una tabla sino cajas de texto en
 * una grilla: una por nombre de producto, una por monto, una linea divisoria
 * debajo de cada fila. Son las ranuras que tenia el cliente de referencia, ni
 * una mas.
 *
 * Reproducirlas para otro cliente es clonar cajas y recalcular su posicion. Se
 * puede porque quien dibujo el deck les puso nombre —`Row Nombre`, `Card
 * Header Cambio`, `Subtotal A Val`— y ese nombre viaja en el XML: cada forma
 * dice que papel cumple, asi que se la puede encontrar y usar de molde en vez
 * de construir uno desde cero. Clonar conserva la tipografia, el color, el
 * relleno y la alineacion; construir los perderia todos.
 */

/** Donde esta una forma y cuanto mide, en EMU. */
export interface Caja {
  readonly x: number
  readonly y: number
  readonly cx: number
  readonly cy: number
}

const FORMA = /<p:sp>[\s\S]*?<\/p:sp>/g

/** Las formas de una lamina, en el orden en que estan dibujadas. */
export const formasDe = (xml: string): readonly string[] => xml.match(FORMA) ?? []

/** El nombre que el diseno le puso a la forma. Vacio si no tiene. */
export const nombreDe = (forma: string): string =>
  /<p:cNvPr id="\d+" name="([^"]*)"/.exec(forma)?.[1] ?? ''

export function cajaDe(forma: string): Caja {
  const off = /<a:off x="(-?\d+)" y="(-?\d+)"\/>/.exec(forma)
  const ext = /<a:ext cx="(\d+)" cy="(\d+)"\/>/.exec(forma)

  return {
    x: Number(off?.[1] ?? 0),
    y: Number(off?.[2] ?? 0),
    cx: Number(ext?.[1] ?? 0),
    cy: Number(ext?.[2] ?? 0),
  }
}

/** La misma forma en otro lugar. Lo que no se pasa se deja como estaba. */
export function colocar(forma: string, caja: Partial<Caja>): string {
  const actual = cajaDe(forma)
  const { x, y, cx, cy } = { ...actual, ...caja }

  return forma
    .replace(/<a:off x="-?\d+" y="-?\d+"\/>/, `<a:off x="${x}" y="${y}"/>`)
    .replace(/<a:ext cx="\d+" cy="\d+"\/>/, `<a:ext cx="${cx}" cy="${cy}"/>`)
}

/**
 * Le cambia el texto a una forma conservando su formato.
 *
 * Sobrevive el primer parrafo y, dentro de el, la primera corrida: ahi estan
 * el tamano, el color y la tipografia que el diseno eligio. Una forma sin
 * ninguna corrida se deja intacta — no hay de donde sacarle el formato al
 * texto que se le quiera poner.
 */
export function escribir(forma: string, texto: string): string {
  const cuerpo = /<p:txBody>[\s\S]*?<\/p:txBody>/.exec(forma)?.[0]
  if (cuerpo === undefined) return forma

  const primero = (cuerpo.match(/<a:p>[\s\S]*?<\/a:p>/g) ?? [])[0]
  if (primero === undefined) return forma

  const corrida = (primero.match(/<a:r>[\s\S]*?<\/a:r>/g) ?? [])[0]
  if (corrida === undefined) return forma

  const conTexto = corrida.replace(/<a:t>[\s\S]*?<\/a:t>/, `<a:t>${escapar(texto)}</a:t>`)

  // Las propiedades del parrafo van primero si las hay: al reves el XML deja
  // de ser valido y PowerPoint se niega a abrir el archivo.
  const propiedades = /<a:pPr(?:\s[^>]*)?(?:\/>|>[\s\S]*?<\/a:pPr>)/.exec(primero)?.[0] ?? ''

  const cuerpoNuevo = cuerpo
    .replace(/<a:p>[\s\S]*?<\/a:p>/g, () => '')
    .replace('</p:txBody>', `<a:p>${propiedades}${conTexto}</a:p></p:txBody>`)

  return forma.replace(cuerpo, cuerpoNuevo)
}

/**
 * Le da un identificador propio a la forma.
 *
 * Dos formas con el mismo id en una lamina dejan el archivo invalido, y clonar
 * repite el del molde tantas veces como copias se hagan.
 */
export const conId = (forma: string, id: number): string =>
  forma.replace(/<p:cNvPr id="\d+"/, `<p:cNvPr id="${id}"`)

/**
 * Cambia todas las formas de la lamina por las que se le den.
 *
 * Lo que no es una forma —las imagenes, el fondo, el grupo raiz— se conserva:
 * ahi viven el logo y la marca de agua de cada lamina.
 */
export function reemplazarFormas(xml: string, formas: readonly string[]): string {
  return xml
    .replace(FORMA, () => '')
    .replace('</p:spTree>', `${formas.join('')}</p:spTree>`)
}

/** La primera forma que se llame asi y cumpla la condicion que se pida. */
export function molde(
  formas: readonly string[],
  nombre: string,
  condicion: (caja: Caja) => boolean = () => true,
): string | null {
  return formas.find((f) => nombreDe(f) === nombre && condicion(cajaDe(f))) ?? null
}
