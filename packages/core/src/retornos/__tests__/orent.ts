import type { FichaFondo, ObservacionMensual, ParametrosMetricas } from '../tipos.js'

/**
 * Blue Owl ORENT, tal como esta en la hoja `Distributivos`.
 *
 * Es el caso de regresion permanente del modulo de retornos, el equivalente de
 * Ana Tumi para el motor. Sale del libro `Macro_Base_Retornos_Master_Funds`:
 * la serie son las filas 75 a 119 — NAV en la columna J, retorno total en la R
 * — y los valores esperados son las celdas R122 a R141, que la mesa ya
 * publico.
 *
 * Son NAV de un fondo, no datos de un cliente: no cae bajo la Ley 29733 y por
 * eso puede vivir en el repositorio. Ninguna otra serie del libro entra acá.
 *
 * El fondo sirve porque tiene las dos cosas que hacen dificil el calculo: 45
 * meses — mas de tres anios, menos de cuatro, asi que 4Y y 5Y tienen que dar
 * `null` — y NAV casi plano con retorno alto, que es lo que rompe cualquier
 * intento de derivar el retorno del NAV.
 */

export const ORENT: FichaFondo = {
  id: 'orent',
  nombre: 'Blue Owl ORENT',
  assetClass: 'Real Estate',
  // El manager fecha la inception un mes antes del primer retorno publicado.
  inception: '2022-09',
  guidanceCortoPlazo: null,
  domicilio: null,
}

export const SERIE_ORENT: readonly ObservacionMensual[] = [
  { mes: '2022-10', nav: 10.27, retornoTotal: 0.0054 },
  { mes: '2022-11', nav: 10.27, retornoTotal: 0.0055 },
  { mes: '2022-12', nav: 10.28, retornoTotal: 0.007 },
  { mes: '2023-01', nav: 10.18, retornoTotal: -0.0037 },
  { mes: '2023-02', nav: 10.36, retornoTotal: 0.0228 },
  { mes: '2023-03', nav: 10.19, retornoTotal: -0.0106 },
  { mes: '2023-04', nav: 10.19, retornoTotal: 0.0057 },
  { mes: '2023-05', nav: 10.21, retornoTotal: 0.0075 },
  { mes: '2023-06', nav: 10.32, retornoTotal: 0.017 },
  { mes: '2023-07', nav: 10.32, retornoTotal: 0.0059 },
  { mes: '2023-08', nav: 10.34, retornoTotal: 0.007 },
  { mes: '2023-09', nav: 10.36, retornoTotal: 0.0077 },
  { mes: '2023-10', nav: 10.36, retornoTotal: 0.006 },
  { mes: '2023-11', nav: 10.34, retornoTotal: 0.0035 },
  { mes: '2023-12', nav: 10.15, retornoTotal: -0.0131 },
  { mes: '2024-01', nav: 10.13, retornoTotal: 0.0039 },
  { mes: '2024-02', nav: 10.17, retornoTotal: 0.0099 },
  { mes: '2024-03', nav: 10.16, retornoTotal: 0.0045 },
  { mes: '2024-04', nav: 10.18, retornoTotal: 0.0081 },
  { mes: '2024-05', nav: 10.16, retornoTotal: 0.004 },
  { mes: '2024-06', nav: 10.17, retornoTotal: 0.0059 },
  { mes: '2024-07', nav: 10.12, retornoTotal: 0.0014 },
  { mes: '2024-08', nav: 10.13, retornoTotal: 0.0064 },
  { mes: '2024-09', nav: 10.12, retornoTotal: 0.0054 },
  { mes: '2024-10', nav: 10.16, retornoTotal: 0.0093 },
  { mes: '2024-11', nav: 10.19, retornoTotal: 0.0086 },
  { mes: '2024-12', nav: 10.2, retornoTotal: 0.0066 },
  { mes: '2025-01', nav: 10.19, retornoTotal: 0.0052 },
  { mes: '2025-02', nav: 10.2, retornoTotal: 0.0064 },
  { mes: '2025-03', nav: 10.2, retornoTotal: 0.0055 },
  { mes: '2025-04', nav: 10.23, retornoTotal: 0.0086 },
  { mes: '2025-05', nav: 10.25, retornoTotal: 0.0076 },
  { mes: '2025-06', nav: 10.25, retornoTotal: 0.0056 },
  { mes: '2025-07', nav: 10.33, retornoTotal: 0.013999999999999999 },
  { mes: '2025-08', nav: 10.39, retornoTotal: 0.011 },
  { mes: '2025-09', nav: 10.46, retornoTotal: 0.0124 },
  { mes: '2025-10', nav: 10.48, retornoTotal: 0.0078 },
  { mes: '2025-11', nav: 10.49, retornoTotal: 0.0068 },
  { mes: '2025-12', nav: 10.57, retornoTotal: 0.013 },
  { mes: '2026-01', nav: 10.61, retornoTotal: 0.0093 },
  { mes: '2026-02', nav: 10.61, retornoTotal: 0.0059 },
  { mes: '2026-03', nav: 10.64, retornoTotal: 0.0094 },
  { mes: '2026-04', nav: 10.66, retornoTotal: 0.0076 },
  { mes: '2026-05', nav: 10.7, retornoTotal: 0.0092 },
  { mes: '2026-06', nav: 10.7, retornoTotal: 0.0059 },
]

/**
 * Los parametros con los que la hoja calculo los valores esperados.
 *
 * `riskFree` es el escalar que vivia clavado en `$R$141`. La ultima
 * observacion de la serie es junio de 2026, asi que ese es el anio de corte.
 */
export const PARAMETROS_ORENT: ParametrosMetricas = {
  riskFree: 0.04475,
  anioTope: 2026,
  aniosAtras: 8,
}

/**
 * Lo que la hoja publica para ORENT, celda por celda.
 *
 * Se comparan con `toBeCloseTo` a doce decimales: el orden de las operaciones
 * de coma flotante no tiene por que coincidir con el de Excel, pero cualquier
 * diferencia de convencion aparece muchisimo antes del duodecimo decimal.
 */
export const ESPERADO_ORENT = {
  /** R123 — `=PRODUCT(1+R117:R119)-1` */
  retorno3m: 0.02286945252800021,
  /** R124 — `=PRODUCT(1+R114:R119)-1` */
  retorno6m: 0.048234841067987144,
  /** R125 — `=PRODUCT(1+R108:R119)-1` */
  retorno1y: 0.11821894009756861,
  /** R126 — `=PRODUCT(1+R96:R119)^(0.5)-1` */
  retorno2y: 0.09859808261916125,
  /** R127 — `=PRODUCT(1+R84:R119)^(1/3)-1` */
  retorno3y: 0.08367122138851846,
  /** R128 — `=PRODUCT(1+R75:R119)^(12/COUNT(R75:R119))-1` */
  retornoSi: 0.08245055995009554,
  /** R129 — `=STDEV.P(R75:R119)*(12^0.5)` */
  desviacionSi: 0.01954132714701503,
  /** R130 — `=(R128-$R$141)/R129` */
  sharpeSi: 1.9292732610463645,
  /** R139 — `=STDEV.P(R108:R119)*(12^0.5)` */
  desviacion1y: 0.009097756133611554,
  /** R140 — `=(R125-$R$141)/R139` */
  sharpe1y: 8.075501147600393,
  /** R131 — `=FVSCHEDULE(1,R114:R119)-1`, seis meses de 2026 */
  anio2026: 0.048234841067987144,
  /** R132 — `=FVSCHEDULE(1,R102:R113)-1` */
  anio2025: 0.10893431772770046,
  /** R133 — `=PRODUCT(1+R90:R101)-1` */
  anio2024: 0.07652510552052849,
  /** R134 — `=PRODUCT(1+R78:R89)-1` */
  anio2023: 0.05655292663074274,
} as const
