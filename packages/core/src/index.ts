export * from './domain/tipos.js'
export {
  CAMPOS_DE_MACRO,
  REGLAS_V4,
  VERSION_MOTOR,
  conValorDeMacro,
  valorDeMacro,
} from './domain/reglas.js'
export type {
  CampoDeMacro,
  DestinoInmobiliario,
  ReglasCash,
  ReglasInmobiliario,
  ReglasMotor,
  ReglasPrivados,
} from './domain/reglas.js'
export { repartirPorClase } from './rules/reparto.js'
export { repartirEtfs } from './rules/cascada.js'
export type { AsignacionEtf, OpcionesCascada } from './rules/cascada.js'
export { resolverInmobiliario } from './rules/inmobiliario.js'
export type { OpcionesInmobiliario, ResultadoInmobiliario } from './rules/inmobiliario.js'
export { recortarCash, PERFIL_DEL_RECORTE } from './rules/cash.js'
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
  planificarPrivados,
  repartirFondo,
  lineaClub,
  etiquetaClubDeal,
  FONDO_OPORTUNIDAD,
  FONDO_RE_INFRA,
  FONDO_PRIVATE_CREDIT,
  FONDO_PE_VC,
  FONDO_DIVIDENDOS_GLOBAL,
  FONDO_ESTRATEGICO,
  NOTA_INSTITUCIONAL,
} from './rules/privados.js'
export type {
  LineaPrivados,
  OpcionesFondo,
  OpcionesPlan,
  PlanPrivados,
  UmbralesPrivados,
} from './rules/privados.js'
export { repartirOtros, otrosAbre, OTROS_BTC, OTROS_ORO } from './rules/otros.js'
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
export { reparosParaPublicar, sePuedePublicar } from './propuesta/publicacion.js'
export type { CodigoReparo, ReparoPublicacion } from './propuesta/publicacion.js'
export {
  congelarPropuesta,
  leerSnapshot,
  FORMATO_SNAPSHOT,
} from './propuesta/snapshot.js'
export type {
  LecturaSnapshot,
  MacroDelSnapshot,
  MetaSnapshot,
  SnapshotPropuesta,
} from './propuesta/snapshot.js'
export { SIN_CLASIFICAR, seConservaUsd, seVendeUsd } from './propuesta/foto.js'
export {
  camposFaltantes,
  posicionesIncompletas,
  ETIQUETA_CAMPO,
} from './propuesta/completitud.js'
export type { FaltanteDePosicion, PosicionCompletable } from './propuesta/completitud.js'
export { decisionInicial } from './decision.js'
export type { PosicionDecidible } from './decision.js'
export {
  armarVistaHoy,
  armarAntesYDespues,
  armarComparativa,
  cuentanEnElCalculo,
  SUBCLASE_SIN_DATO,
} from './propuesta/vistas.js'
export type {
  ClaseAntesDespues,
  FilaAntesDespues,
  FilaComparativa,
  FilaVistaClase,
  RentabilidadPonderada,
  SubfilaVista,
  VistaComparativa,
  VistaHoy,
} from './propuesta/vistas.js'
export type {
  AnotacionLinea,
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
