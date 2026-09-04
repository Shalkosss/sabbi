import 'server-only'

import {
  ESCENARIOS,
  armar,
  correrEscenarios,
  curva,
  medir,
  mezclar,
  recortar,
  ventanaComun,
  PERFILES,
} from '@sabbi/core'
import type {
  ClaseAllocation,
  MetricasAllocation,
  Perfil,
  Reparto,
  ResultadoEscenario,
} from '@sabbi/core'

import { ASIGNACIONES, MONTO_CURVA } from './allocation-escala'
import type { DatosAllocation, Mezcla } from './datos/allocation'

/**
 * Los dos portafolios de la pantalla, listos para dibujar.
 *
 * El clásico del perfil y el mismo con un porcentaje de alternativos encima.
 * Salen del mismo motor con la misma serie y se miden con la misma función:
 * la única diferencia entre las dos filas de la tabla tiene que ser la
 * asignación, no el camino de cálculo.
 *
 * El estado vive en la URL —perfil, mezcla, asignación— por lo mismo que en el
 * benchmark: una corrida se pega en un mensaje y el otro ve exactamente la
 * misma.
 */

export { ASIGNACIONES, MONTO_CURVA } from './allocation-escala'

export interface Tajada {
  readonly clase: ClaseAllocation
  readonly peso: number
  readonly esPublica: boolean
}

export interface Lado {
  readonly nombre: string
  readonly tajadas: readonly Tajada[]
  readonly metricas: MetricasAllocation
  readonly curva: readonly { readonly mes: string; readonly valor: number }[]
  readonly escenarios: readonly ResultadoEscenario[]
  /** Clases con peso y sin serie. Mientras haya una, no hay cifras. */
  readonly faltan: readonly ClaseAllocation[]
}

export interface Vista {
  readonly perfil: Perfil
  readonly mezcla: string
  readonly asignacion: number
  readonly base: Lado
  readonly conAlternativos: Lado
  /** Las mezclas y perfiles que la mesa puede elegir. */
  readonly mezclas: readonly string[]
  /**
   * Por qué no hay retorno histórico, si no lo hay.
   *
   * Es texto y no un booleano porque lo que falta cambia qué hacer: una clase
   * sin índice se arregla desde la pantalla de referencias; una serie corta se
   * arregla cargando meses. Regla 7 — lo que los datos no sostienen se dice.
   */
  readonly problema: string | null
  /** El rango realmente medido, para titular la tabla sin mentir. */
  readonly desde: string | null
  readonly hasta: string | null
}

export function armarVista(
  datos: DatosAllocation,
  perfil: Perfil,
  nombreMezcla: string,
  asignacion: number,
): Vista {
  const publicas = datos.porPerfil.get(perfil) ?? new Map()
  const mezcla: Mezcla =
    datos.mezclas.find((m) => m.nombre === nombreMezcla) ??
    datos.mezclas[0] ?? { nombre: '—', pesos: new Map() }

  const repartoBase = mezclar(publicas, new Map(), 0)
  const repartoAlt = mezclar(publicas, mezcla.pesos, asignacion)

  // Los dos lados se miden sobre los mismos meses. El clásico casi siempre
  // tiene más historia —hoy el S&P arranca en 2008 y el índice de hedge funds
  // en 2021— y sin recortar, la fila de arriba y la de abajo hablarían de
  // épocas distintas: el delta dejaría de ser el efecto de los alternativos.
  const comun = ventanaComun(repartoAlt, datos.series)
  const series =
    comun === null ? datos.series : recortar(datos.series, comun.desde, comun.hasta)
  const enComun: DatosAllocation = { ...datos, series }

  const base = armarLado(`${perfil}`, repartoBase, enComun)
  const conAlternativos = armarLado(
    `${perfil} + ${Math.round(asignacion * 100)}% ${mezcla.nombre}`,
    repartoAlt,
    enComun,
  )

  return {
    perfil,
    mezcla: mezcla.nombre,
    asignacion,
    base,
    conAlternativos,
    mezclas: datos.mezclas.map((m) => m.nombre),
    problema: problemaDe(base, conAlternativos),
    // El rango que se publica es el del portafolio con alternativos: es el más
    // corto de los dos, y es contra el que hay que comparar al clásico. Poner
    // el del clásico titularía la tabla con una ventana que su vecino no vivió.
    desde: conAlternativos.metricas.desde ?? base.metricas.desde,
    hasta: conAlternativos.metricas.hasta ?? base.metricas.hasta,
  }
}

function armarLado(nombre: string, reparto: Reparto, datos: DatosAllocation): Lado {
  const portafolio = armar(nombre, reparto, datos.series)
  const publicas = new Set(datos.clases.filter((c) => c.esPublica).map((c) => c.nombre))
  const orden = new Map(datos.clases.map((c, i) => [c.nombre, i]))

  return {
    nombre,
    tajadas: [...reparto.entries()]
      .map(([clase, peso]) => ({ clase, peso, esPublica: publicas.has(clase) }))
      .sort((a, b) => (orden.get(a.clase) ?? 99) - (orden.get(b.clase) ?? 99)),
    metricas: medir(portafolio, datos.series),
    curva: curva(portafolio, datos.series, MONTO_CURVA),
    escenarios: correrEscenarios(portafolio, datos.series, ESCENARIOS),
    faltan: portafolio.faltan,
  }
}

function problemaDe(base: Lado, conAlternativos: Lado): string | null {
  const faltan = [...new Set([...base.faltan, ...conAlternativos.faltan])]

  if (faltan.length > 0) {
    return `Sin retorno histórico: ${faltan.join(', ')} ${
      faltan.length === 1 ? 'no tiene' : 'no tienen'
    } índice con serie cargada. Se elige en Referencias.`
  }

  if (conAlternativos.metricas.meses === 0) {
    return 'Las series de estas clases no tienen ningún mes en común, así que no forman un portafolio medible.'
  }

  return null
}

/** El perfil de la URL. Sin nada legible, el Moderado: es el del medio. */
export function perfilDeLaUrl(
  parametros: Record<string, string | string[] | undefined>,
): Perfil {
  const crudo = parametros['perfil']
  const valor = Array.isArray(crudo) ? crudo[0] : crudo

  return PERFILES.find((p) => p === valor) ?? 'Moderado'
}

/** La mezcla de la URL. Sin nada legible, la primera que la mesa tenga. */
export function mezclaDeLaUrl(
  parametros: Record<string, string | string[] | undefined>,
  datos: DatosAllocation,
): string {
  const crudo = parametros['mezcla']
  const valor = Array.isArray(crudo) ? crudo[0] : crudo
  const existe = datos.mezclas.some((m) => m.nombre === valor)

  return existe ? (valor as string) : (datos.mezclas[0]?.nombre ?? '—')
}

/**
 * La asignación de la URL, como fracción.
 *
 * Viaja en puntos enteros —`?alt=20`— porque es como se nombra y como se pega
 * en un mensaje. Se ajusta al paso más cercano del slider: un `?alt=23` a mano
 * no puede dejar la pantalla en una posición que el control no sabe dibujar.
 */
export function asignacionDeLaUrl(
  parametros: Record<string, string | string[] | undefined>,
): number {
  const crudo = parametros['alt']
  const valor = Number(Array.isArray(crudo) ? crudo[0] : crudo) / 100

  if (!Number.isFinite(valor)) return ASIGNACIONES[1] ?? 0.2

  return ASIGNACIONES.reduce(
    (cerca, paso) => (Math.abs(paso - valor) < Math.abs(cerca - valor) ? paso : cerca),
    ASIGNACIONES[0] ?? 0.1,
  )
}
