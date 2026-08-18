export { parsearFicha, parsearHoja } from './ficha/parsear.js'
export type { OpcionesFicha } from './ficha/parsear.js'
export { SEED_TAXONOMIA, clasificar } from './ficha/taxonomia.js'
export type { Clasificacion, EntradaClasificacion, ReglaTaxonomia } from './ficha/taxonomia.js'
export { capRate, leerMoneda, leerNumero, leerPorcentaje, leerRendimiento } from './ficha/valores.js'
export type { Leido, Moneda } from './ficha/valores.js'
export type {
  Aviso,
  CodigoAviso,
  DatosCliente,
  DeudaFicha,
  EntradaModelo,
  FichaParseada,
  FilaIgnorada,
  MotivoIgnorada,
  OrigenFicha,
  PortafolioModelo,
  PosicionFicha,
  TotalesFicha,
} from './ficha/tipos.js'
export { celda, leerLibro, refA1 } from './xlsx/leer.js'
export type { Celda, Hoja, Libro } from './xlsx/leer.js'
export { contiene, equivale, normalizar } from './texto.js'
