export * from './domain/tipos.js'
export { repartirPorClase } from './rules/reparto.js'
export { repartirEtfs } from './rules/cascada.js'
export type { AsignacionEtf, OpcionesCascada } from './rules/cascada.js'
export {
  repartirPrivados,
  etiquetaClubDeal,
  FONDO_OPORTUNIDAD,
  FONDO_RE_INFRA,
  FONDO_PRIVATE_CREDIT,
  FONDO_PE_VC,
  OTROS_IBIT,
  NOTA_INSTITUCIONAL,
} from './rules/privados.js'
export type { LineaPrivados, OpcionesPrivados, PesosPrivados } from './rules/privados.js'
