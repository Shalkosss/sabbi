/**
 * Entrega de la propuesta en los formatos que el cliente recibe.
 *
 * Hoy: el deck .pptx replica del que Sabbi venia armando a mano. La plantilla
 * vive en `pptx/replica/template.pptx` y la produce `tokenizar.py`; quien la
 * consume decide como leerla del disco.
 */
export { armarDeck } from './pptx/deck.js'
export type { ResultadoDeck } from './pptx/deck.js'
export type { ContextoDeck } from './pptx/mapa.js'
export { tokensDePropuesta } from './pptx/mapa.js'
export { tokensDe } from './pptx/rellenar.js'
