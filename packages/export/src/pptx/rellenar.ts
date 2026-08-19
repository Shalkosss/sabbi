/**
 * Sustitucion de tokens sobre el XML de una lamina.
 *
 * El tokenizador garantiza que ningun `{{token}}` queda partido entre varios
 * runs de texto — colapsa el parrafo cuando hace falta — asi que sustituir
 * sobre el XML en crudo es seguro y no hay que reconstruir el arbol.
 *
 * Un token sin valor se vacia en vez de quedarse a la vista. La plantilla trae
 * una cantidad fija de slots por lamina y un portafolio real casi nunca los
 * llena: dejar `{{s11.monto14}}` impreso en el deck del cliente es peor que
 * dejar el espacio en blanco.
 */

const TOKEN = /\{\{([a-zA-Z0-9._]+)\}\}/g

export type Sustituciones = Readonly<Record<string, string>>

/** `&`, `<` y `>` rompen el XML si entran crudos desde el nombre de un producto. */
function escapar(valor: string): string {
  return valor.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export interface ResultadoRelleno {
  readonly xml: string
  /** Tokens que la lamina traia y se resolvieron con un valor. */
  readonly resueltos: readonly string[]
  /** Tokens que la lamina traia y quedaron vacios por falta de dato. */
  readonly vacios: readonly string[]
}

export function rellenarLamina(xml: string, valores: Sustituciones): ResultadoRelleno {
  const resueltos: string[] = []
  const vacios: string[] = []

  const rellenado = xml.replace(TOKEN, (_completo, token: string) => {
    const valor = valores[token]

    if (valor === undefined || valor === '') {
      vacios.push(token)
      return ''
    }

    resueltos.push(token)
    return escapar(valor)
  })

  return { xml: rellenado, resueltos, vacios }
}

/** Los tokens que una lamina declara, sin resolver nada. Sirve para auditar. */
export function tokensDe(xml: string): readonly string[] {
  return [...xml.matchAll(TOKEN)].map((m) => m[1] as string)
}
