export { armarDeckRediseno } from './pptx/rediseno/deck.js'
export type { OpcionesDeck } from './pptx/rediseno/deck.js'
export { armarXlsxPropuesta } from './xlsx/propuesta.js'
export type { OpcionesXlsx } from './xlsx/propuesta.js'
export { escribirLibro, nombreDeHoja } from './xlsx/libro.js'
export type { Celda, Entrada, Formato, Hoja, Valor } from './xlsx/libro.js'
export { COLOR, COLOR_CLASE, TIPOGRAFIA, TIPOGRAFIA_MARCA } from './pptx/rediseno/marca.js'
export {
  laminasDe,
  renderizarReplica,
  tokensDe,
} from './pptx/replica/plantilla.js'
export { armarDeckReplica, avanceReplica } from './pptx/replica/deck.js'
export { CABECERA, MODELO, filasDelAnexo, sinEscribir } from './pptx/replica/anexo.js'
export { leerPlantillaReplica, rutaDePlantilla } from './pptx/replica/desde-disco.js'
export type { OpcionesDeckReplica } from './pptx/replica/deck.js'
export {
  LAMINAS_INCOMPLETAS,
  LAMINAS_LISTAS,
  LAMINAS_TODAS,
  MAPA,
  valoresDe,
} from './pptx/replica/mapa.js'
export {
  ajustarMarco,
  altoDelMarco,
  altosDe,
  filasDe,
  paginarFilas,
  rehacerTabla,
} from './pptx/replica/tabla.js'
export type { FilaNueva, OpcionesPaginado, ResultadoTabla } from './pptx/replica/tabla.js'
export type { EstadoLamina, Lamina } from './pptx/replica/mapa.js'
export type { OpcionesReplica, ResultadoReplica } from './pptx/replica/plantilla.js'
