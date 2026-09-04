export * from './domain/tipos.js'
export {
  CAMPOS_DE_MACRO,
  REGLAS_V4,
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
export { fijarLineas } from './rules/lineas.js'
export type { ResultadoAjustesDeLinea } from './rules/lineas.js'
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
/*
 * Retornos de fondos.
 *
 * Dominio aparte: mide productos del menu, no portafolios de clientes, y no
 * comparte un solo tipo con el motor. Vive en el mismo paquete porque obedece
 * la misma regla — funcion pura, sin red, sin DOM, sin reloj — y porque asi la
 * app lo consume por el mismo camino que todo lo demas.
 */
export { abrirRetornos, calcularMetricas, ventanaDe } from './retornos/metricas.js'
export { crecimiento, matrizMensual, maximaCaida, mediana, resumirSerie } from './retornos/serie.js'
export type { Caida, FilaMatriz, PuntoCrecimiento, ResumenSerie } from './retornos/serie.js'
export {
  dispersionRiesgoRetorno,
  extremosPorClase,
  rankear,
  resumenPorClase,
} from './retornos/insights.js'
export {
  FACTOR_ANUALIZACION,
  MESES_DEL_ANIO,
  MESES_SIN_ANUALIZAR,
  VENTANAS,
  VENTANAS_CON_RIESGO,
  armarMes,
  partirMes,
  rangoDeMeses,
} from './retornos/ventanas.js'
export type {
  AperturaMensual,
  FichaFondo,
  MetricaAnual,
  MetricaVentana,
  MetricasFondo,
  Mes,
  ObservacionMensual,
  ParametrosMetricas,
  Ventana,
} from './retornos/tipos.js'
/*
 * Allocation: cuanto cambia un portafolio clasico al meterle alternativos.
 *
 * Tercer dominio del paquete. No reparte patrimonio de nadie —eso es el
 * motor— ni mide fondos del menu —eso es `retornos`—: mide dos portafolios
 * teoricos para poder compararlos. Toma prestada la serie mensual de
 * `retornos` porque es la que la mesa ya carga.
 */
export {
  ESCENARIOS,
  armar,
  correrEscenarios,
  curva,
  medir,
  mezclar,
  recortar,
  serieDelPortafolio,
  ventanaComun,
} from './allocation/portafolio.js'
export type {
  ClaseAllocation,
  Escenario,
  Metricas as MetricasAllocation,
  Portafolio as PortafolioAllocation,
  Reparto,
  ResultadoEscenario,
  SeriesPorClase,
} from './allocation/tipos.js'
export type {
  Criterio,
  ExtremosClase,
  PuntoDispersion,
  Puesto,
  Ranking,
  ResumenClase,
} from './retornos/insights.js'
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
