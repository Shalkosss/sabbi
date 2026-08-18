export * from './domain/tipos.js'
export { repartirPorClase } from './rules/reparto.js'
export { repartirEtfs } from './rules/cascada.js'
export type { AsignacionEtf, OpcionesCascada } from './rules/cascada.js'
export { repartirVariable } from './rules/variable.js'
export { prorratearInmobiliario, UMBRAL_INMOBILIARIO } from './rules/inmobiliario.js'
export type { OpcionesInmobiliario } from './rules/inmobiliario.js'
export { prorratearResiduales } from './rules/residuales.js'
export {
  aperturaFm,
  evaluarSenalInstitucional,
  FX_INSTITUCIONAL,
  INST_INVERTIBLE_USD,
  INST_TOTAL_USD,
} from './rules/institucional.js'
export type {
  AperturaFm,
  EstadoInstitucional,
  PosicionValorizada,
  SenalInstitucional,
} from './rules/institucional.js'
export {
  repartirPrivados,
  etiquetaClubDeal,
  FONDO_OPORTUNIDAD,
  FONDO_RE_INFRA,
  FONDO_PRIVATE_CREDIT,
  FONDO_PE_VC,
  FONDO_ESTRATEGICO,
  FONDO_DIVIDENDOS_GLOBAL,
  OTROS_IBIT,
  NOTA_INSTITUCIONAL,
} from './rules/privados.js'
export type { LineaPrivados, OpcionesPrivados, PesosPrivados } from './rules/privados.js'
export { generarPlan, INMOBILIARIO_TBD, LINEA_CASH } from './plan.js'
export type { EntradaPlan, PesosProductos, Plan } from './plan.js'
