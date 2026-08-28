import 'server-only'

import { benchmarkDe, MACRO_DE_FABRICA, pesosDeClase } from '@sabbi/config'
import type { Macro } from '@sabbi/config'
import {
  armarEntradaPlan,
  armarPropuesta,
  ETIQUETA_CAMPO,
  generarPlan,
  posicionesIncompletas,
} from '@sabbi/core'
import type { AnotacionLinea, Bloqueo, PosicionPropuesta, Propuesta } from '@sabbi/core'

import { FALLBACKS } from './catalogo'
import { emparejarCatalogo } from './datos/emparejar'
import type { ProductoCatalogo } from './datos/emparejar'
import type { EstadoRevision } from './estado'

/**
 * De la revisión guardada a la propuesta.
 *
 * Corre solo en el servidor, por la misma razón que el cálculo del plan: los
 * pesos de benchmark son el modelo Sabbi y no viajan al navegador. Lo que baja
 * a la página son las siete secciones ya resueltas.
 *
 * El modelo puro es el mismo motor corrido sin pisos: el benchmark aplicado al
 * patrimonio entero ignorando lo que el cliente ya tiene. Sin esa segunda
 * corrida no hay forma de explicar por qué el plan se desvía del modelo.
 *
 * La macro entra por argumento y no se lee acá: esta función es la que corren
 * la pantalla y las dos descargas, y todas tienen que estar mirando la misma.
 * Quien la llama la trae de `macroActiva()`.
 */

export type ResultadoPropuesta =
  | { readonly ok: true; readonly propuesta: Propuesta }
  | { readonly ok: false; readonly bloqueos: readonly Bloqueo[] }

interface Opciones {
  readonly mandato: string | null
  readonly catalogo: readonly ProductoCatalogo[]
  readonly assetClassCatalogo: readonly string[]
  /** Lo que el asesor escribió de cada línea del objetivo, por instrumento. */
  readonly anotaciones?: ReadonlyMap<string, AnotacionLinea>
  /**
   * La macro con la que se calcula: pesos de benchmark y umbrales del motor.
   *
   * Sin ella, la de fábrica. No se cae a valores sueltos: o la macro entera
   * que la mesa guardó, o la entera de fábrica.
   */
  readonly macro?: Macro
}

/** La revisión trae más campos de los que el motor mira; acá se completan. */
const aPropuesta = (posicion: EstadoRevision['posiciones'][number]): PosicionPropuesta => ({
  orden: posicion.orden,
  institucionProducto: posicion.institucionProducto,
  origen: posicion.origen,
  tipoFicha: posicion.tipoFicha,
  assetClass: posicion.assetClass,
  claseModelo: posicion.claseModelo,
  productoId: posicion.productoId,
  moneda: posicion.moneda,
  plaza: posicion.plaza,
  valorUsd: posicion.valorUsd,
  valorDeclaradoUsd: posicion.valorDeclaradoUsd,
  pctPertenencia: posicion.pctPertenencia,
  pais: posicion.pais,
  uso: posicion.uso,
  rendimientoEst: posicion.rendimientoEst,
  nota: posicion.nota,
  esInvertible: posicion.esInvertible,
  cta: posicion.cta,
  montoVentaParcial: posicion.montoVentaParcial,
  destinos: posicion.destinos ?? [],
})

export function construirPropuesta(
  revision: EstadoRevision,
  opciones: Opciones,
): ResultadoPropuesta {
  const { parametros } = revision
  const macro = opciones.macro ?? MACRO_DE_FABRICA
  const posiciones = revision.posiciones.map(aPropuesta)
  const benchmark = benchmarkDe(parametros.perfil, macro.pesos)

  // Ningun dato vacio pasa en silencio: la propuesta no se arma hasta que la
  // revision este completa. La pantalla de revision marca estos mismos campos.
  const incompletas = posicionesIncompletas(posiciones)
  if (incompletas.length > 0) {
    const detalle = incompletas
      .slice(0, 8)
      .map(
        (f) =>
          `${f.institucionProducto}: falta ${f.campos.map((c) => ETIQUETA_CAMPO[c] ?? c).join(', ')}`,
      )
      .join(' · ')
    const resto = incompletas.length > 8 ? ` · y ${incompletas.length - 8} posiciones más` : ''
    return {
      ok: false,
      bloqueos: [
        {
          codigo: 'datos_incompletos',
          mensaje: `Faltan datos en ${incompletas.length} ${incompletas.length === 1 ? 'posición' : 'posiciones'} — ${detalle}${resto}. Completalos en la revisión.`,
        },
      ],
    }
  }

  const comunes = {
    perfil: parametros.perfil,
    benchmark,
    pesos: {
      fijo: pesosDeClase('fijo', parametros.perfil, macro.pesos),
      variable: pesosDeClase('variable', parametros.perfil, macro.pesos),
      otros: pesosDeClase('otros', parametros.perfil, macro.pesos),
    },
    reglas: macro.reglas,
    // El ticket mínimo es el único número de la macro que el asesor mueve
    // propuesta por propuesta. Vacío en la ficha, manda el de la macro.
    ticketMinimoUsd:
      parametros.ticketMinimoUsd > 0 ? parametros.ticketMinimoUsd : macro.reglas.ticketMinimoUsd,
    fallbacks: FALLBACKS,
    usPerson: parametros.usPerson,
    necesitaFlujos: parametros.necesitaFlujos,
    institucional: parametros.institucional,
    incluirInmueblesDeRenta: parametros.incluirInmueblesDeRenta,
    accedeInmobiliario: parametros.accedeInmobiliario,
    colchonLiquidezUsd: parametros.colchonLiquidezUsd,
  }

  const derivacion = armarEntradaPlan(posiciones, {
    ...comunes,
    restricciones: revision.agregados,
    ajustes: revision.ajustes,
  })

  if (!derivacion.ok) return { ok: false, bloqueos: derivacion.bloqueos }

  // Los ajustes de línea no pasan por `armarEntradaPlan`: no derivan pisos ni
  // bloqueos, solo reparten dentro de una clase que el solver ya resolvió. Pero
  // sí tienen que entrar acá — esta es la propuesta que ve el cliente, y si no
  // los aplicara diría otra cosa que el panel donde el asesor los escribió.
  const plan = generarPlan({
    ...derivacion.entrada,
    ajustesDeLinea: revision.ajustesLinea,
  })

  // El catalogo se empareja contra los nombres que el motor acaba de imprimir,
  // no contra los del benchmark: son dos espacios de nombres distintos. Los dos
  // portafolios se leen en la misma tabla, así que entran los nombres de ambos.
  const catalogo = emparejarCatalogo(
    plan.lineas.map((linea) => linea.instrumento),
    opciones.catalogo,
  )

  const propuesta = armarPropuesta({
    cliente: {
      nombre: revision.cliente.nombre ?? 'Cliente sin nombre en la ficha',
      perfil: parametros.perfil,
      mandato: opciones.mandato,
    },
    posiciones,
    plan,
    // El modelo puro ignora tanto lo que el cliente ya tiene como lo que el
    // asesor clavó: es el benchmark aplicado al patrimonio entero, y con eso se
    // explica por qué el plan se desvía.
    modeloPuro: generarPlan({
      ...derivacion.entrada,
      pisos: [],
      ajustes: [],
      ajustesDeLinea: [],
    }),
    pisos: derivacion.entrada.pisos,
    benchmark: derivacion.entrada.benchmark,
    parametros: {
      ticketMinimoUsd: derivacion.entrada.ticketMinimoUsd ?? macro.reglas.ticketMinimoUsd,
      colchonLiquidezUsd: parametros.colchonLiquidezUsd,
      fxPenUsd: parametros.fxPenUsd,
    },
    incluirInmueblesDeRenta: parametros.incluirInmueblesDeRenta,
    catalogo,
    assetClassCatalogo: opciones.assetClassCatalogo,
    anotaciones: opciones.anotaciones ?? new Map(),
  })

  return {
    ok: true,
    propuesta: { ...propuesta, avisos: [...derivacion.avisos, ...propuesta.avisos] },
  }
}
