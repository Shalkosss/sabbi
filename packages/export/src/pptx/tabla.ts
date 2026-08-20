/**
 * Tablas de una lamina, a nivel de fila.
 *
 * La plantilla trae la tabla del anexo con la cantidad de filas que tenia el
 * portafolio del cliente original, y con los encabezados de grupo en las
 * posiciones que ese portafolio necesitaba. Rellenar esos huecos tal cual
 * significaria que todo cliente tenga la misma forma de cartera, que es falso.
 *
 * Asi que las filas no se rellenan: se generan. Se toman las que la plantilla
 * ya trae como molde —una de grupo y una de dato, con su formato resuelto— y
 * se emiten tantas como el portafolio pida. El diseno se hereda; la cantidad
 * la manda el dato.
 */

const FILA = /<a:tr\b/g
const TOKEN = /\{\{[a-zA-Z0-9._]+\}\}/g

export interface Tabla {
  /** Todo lo que va antes de la primera fila. */
  readonly cabecera: string
  readonly filas: readonly string[]
  /** Todo lo que va despues de la ultima fila. */
  readonly pie: string
}

/** `null` cuando la lamina no tiene tabla, que no es un error. */
export function leerTabla(xml: string): Tabla | null {
  const inicio = xml.search(FILA)
  if (inicio === -1) return null

  const cierre = xml.lastIndexOf('</a:tr>')
  if (cierre === -1) return null
  const fin = cierre + '</a:tr>'.length

  const cuerpo = xml.slice(inicio, fin)

  return {
    cabecera: xml.slice(0, inicio),
    filas: cuerpo.split(/(?=<a:tr\b)/).filter((f) => f !== ''),
    pie: xml.slice(fin),
  }
}

export const escribirTabla = (tabla: Tabla, filas: readonly string[]): string =>
  tabla.cabecera + filas.join('') + tabla.pie

function escapar(valor: string): string {
  return valor.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * Rellena una fila molde con valores por posicion.
 *
 * Por posicion y no por nombre a proposito: los tokens de la plantilla se
 * llaman segun lo que habia en la celda del deck original —una celda con el
 * nombre de un producto puede haber quedado como `monto` si ese nombre
 * empezaba con una cifra— asi que el nombre del token no dice que columna es.
 * El orden de aparicion si.
 */
export function rellenarFila(molde: string, valores: readonly string[]): string {
  let i = 0

  return molde.replace(TOKEN, () => {
    const valor = valores[i]
    i += 1
    return valor === undefined ? '' : escapar(valor)
  })
}

/** Cuantos tokens espera una fila molde. Sirve para validar el molde. */
export const huecosDe = (molde: string): number => (molde.match(TOKEN) ?? []).length
