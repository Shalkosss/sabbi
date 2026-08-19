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
  FONDO_OPORTUNIDAD,
  FONDO_RE_INFRA,
  FONDO_PRIVATE_CREDIT,
  FONDO_PE_VC,
  FONDO_DIVIDENDOS_GLOBAL,
  NOTA_INSTITUCIONAL,
  MIN_SUBFONDO,
} from './rules/privados.js'
export type { LineaPrivados, OpcionesPrivados } from './rules/privados.js'
export { repartirClub, etiquetaClubDeal, FONDO_ESTRATEGICO, MIN_CLUB } from './rules/club.js'
export type { LineaClub, OpcionesClub } from './rules/club.js'
export { repartirOtros, OTROS_BTC, OTROS_ORO, MIN_OTROS } from './rules/otros.js'
export type { LineaOtros } from './rules/otros.js'
export { generarPlan, INMOBILIARIO_TBD, LINEA_CASH } from './plan.js'
export {
  armarEntradaPlan,
  evaluarRevision,
  redistribuirInmobiliario,
  ETIQUETA_COLCHON,
} from './entrada.js'
export type {
  Bloqueo,
  CodigoBloqueo,
  DecisionesPropuesta,
  Derivacion,
  OpcionesRevision,
  PosicionRevisada,
  ResumenPatrimonio,
  Revision,
} from './entrada.js'
export type { EntradaPlan, PesosProductos, Plan } from './plan.js'
export { armarPropuesta, TOLERANCIA_CUADRE } from './propuesta/index.js'
export { SIN_CLASIFICAR, seConservaUsd, seVendeUsd } from './propuesta/foto.js'
export {
  camposFaltantes,
  posicionesIncompletas,
  ETIQUETA_CAMPO,
} from './propuesta/completitud.js'
export type { FaltanteDePosicion, PosicionCompletable } from './propuesta/completitud.js'
export { armarVistaHoy, armarComparativa, SUBCLASE_SIN_DATO } from './propuesta/vistas.js'
export type {
  FilaComparativa,
  FilaVistaClase,
  RentabilidadPonderada,
  SubfilaVista,
  VistaComparativa,
  VistaHoy,
} from './propuesta/vistas.js'
export type {
  CategoriaCta,
  DatosProducto,
  EntradaPropuesta,
  FilaActivo,
  FilaAssetClass,
  FilaComparativo,
  FilaExposicion,
  FilaResumenCta,
  FilaUsoPropio,
  GrupoObjetivo,
  LineaCompra,
  LineaObjetivo,
  LineaVenta,
  ParametrosPropuesta,
  ParametrosVisibles,
  PosicionPropuesta,
  Propuesta,
  Rango,
} from './propuesta/tipos.js'
