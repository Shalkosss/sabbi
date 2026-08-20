/**
 * Lo minimo de XML que estos modulos necesitan.
 *
 * Escapar antes de escribir no es una precaucion teorica: un nombre con `&` —
 * «Ferreyros & Cia» — o una nota con un `<` rompen el documento entero, y
 * PowerPoint no abre la lamina rota sino que se niega a abrir el archivo.
 */
export const escapar = (texto: string): string =>
  texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
