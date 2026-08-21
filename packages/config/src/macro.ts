import { REGLAS_V8 } from '@sabbi/core'
import type { ReglasMotor } from '@sabbi/core'
import { z } from 'zod'

import { benchmarksSchema } from './schema.js'
import type { Benchmarks } from './schema.js'


/**
 * La macro del portafolio, entera y en un solo objeto.
 *
 * Dos mitades. Los **pesos** dicen cuanto le toca a cada clase y a cada
 * instrumento en cada perfil; las **reglas** dicen los minimos y umbrales con
 * los que ese reparto se vuelve un portafolio ejecutable. Juntas son la
 * respuesta completa a «100 mil, moderado»: nada mas decide que sale.
 *
 * Vivia partida en dos sitios que no se hablaban — un JSON versionado para los
 * pesos y una constante de modulo por cada umbral —, y esa es exactamente la
 * forma que tiene una configuracion que nadie puede cambiar sin desplegar. Aca
 * es un valor: se lee de la base, se valida al entrar y viaja como argumento
 * al motor. Cambiarla en la pantalla de Macro cambia la propuesta, el
 * benchmark y los dos decks, porque los tres corren el mismo motor con este
 * mismo objeto.
 *
 * La validacion no es decorativa. Un benchmark cuyas clases no suman 1 reparte
 * mal el patrimonio y no lo dice; un ticket minimo en cero hace reventar al
 * motor del lado del servidor, donde nadie ve el mensaje. Lo que no pasa por
 * este esquema no llega al motor.
 */

const positivo = (etiqueta: string) =>
  z.number().finite(`${etiqueta} tiene que ser un numero`).positive(`${etiqueta} tiene que ser mayor que cero`)

const noNegativo = (etiqueta: string) =>
  z.number().finite(`${etiqueta} tiene que ser un numero`).min(0, `${etiqueta} no puede ser negativo`)

/** Una fraccion de 0 a 1. Nunca un porcentaje de 0 a 100. */
const fraccion = (etiqueta: string) =>
  z
    .number()
    .finite(`${etiqueta} tiene que ser un numero`)
    .min(0, `${etiqueta} no puede ser negativo`)
    .max(1, `${etiqueta} va de 0 a 1, no de 0 a 100`)

/**
 * Las palancas del motor.
 *
 * Las que llegaron despues de la v8 entran con `default`, y no por comodidad:
 * en la base hay macros guardadas con la forma vieja, y un campo nuevo sin
 * valor por defecto las volveria invalidas de golpe — el motor caeria en la de
 * fabrica y la mesa veria cambiar todas sus cifras sin haber tocado nada. El
 * defecto de cada uno es su valor neutro, el que reproduce lo que el motor ya
 * hacia.
 */
export const reglasSchema = z.object({
  ticketEtfUsd: positivo('El ticket minimo de ETF'),
  /** En cero manda el general. Por eso no negativo y no positivo. */
  ticketFijoUsd: noNegativo('El ticket de Renta Fija').default(0),
  ticketVariableUsd: noNegativo('El ticket de Renta Variable').default(0),
  inmobiliario: z.object({
    umbralUsd: noNegativo('El umbral del inmobiliario'),
    destino: z.enum(['prorratear', 'alternativos']),
  }),
  privados: z.object({
    minSubfondoUsd: noNegativo('El minimo por subfondo'),
    minDividendosGlobalUsd: noNegativo('El minimo de Vision Dividendos Global'),
  }),
  club: z.object({
    minUsd: noNegativo('El minimo de Club Deals'),
    umbralClaseAUsd: noNegativo('La frontera Edifica A / B'),
  }),
  otros: z.object({
    minUsd: noNegativo('El minimo de Otros'),
    minLineaUsd: noNegativo('El minimo de cada linea de Otros').default(0),
  }),
  fijo: z.object({
    factorDescarte: fraccion('La poda por costo'),
    maxSacrificio: fraccion('El sacrificio maximo'),
    separacion: fraccion('La separacion de la cadena'),
  }),
  variable: z.object({
    pisoRescateUsd: noNegativo('El piso de rescate'),
    bloqueRescateUsd: positivo('El bloque del rescate'),
    separacion: fraccion('La separacion de satelites'),
    nucleo: z
      .string()
      .trim()
      .min(1, 'El nucleo de Renta Variable no puede quedar vacio')
      .default('S&P 500'),
  }),
  residuos: z
    .object({
      destino: z.enum(['privados', 'cash', 'fijo', 'variable']),
    })
    .default({ destino: 'privados' }),
})

export const macroSchema = z.object({
  /** Sube de a uno con cada guardado. Es la version de negocio, no del codigo. */
  version: z.number().int().positive(),
  /** Por que se cambio. Lo escribe quien guarda. */
  nota: z.string().default(''),
  pesos: benchmarksSchema,
  reglas: reglasSchema,
})

export type Macro = z.infer<typeof macroSchema>

/**
 * La macro de fabrica: los pesos de la v4 y los umbrales de la v8.
 *
 * Es el punto de partida y la red de seguridad. Si la base no tiene ninguna
 * macro guardada —o la que tiene no valida— el motor corre con esta, que es la
 * que reproduce el caso Ana Tumi al centavo. Nunca se calcula con una macro a
 * medias: o la guardada entera, o esta entera.
 */
export function macroDeFabrica(pesos: Benchmarks): Macro {
  return {
    version: 1,
    nota: 'Macro de fábrica: pesos de la hoja Data v4 y umbrales de la Benchmark Sabbi v8.',
    pesos,
    reglas: REGLAS_V8,
  }
}

/**
 * Valida una macro que viene de afuera.
 *
 * Devuelve los mensajes en vez de tirar: quien la guarda tiene que poder
 * mostrarlos en el formulario, y quien la lee de la base tiene que poder caer
 * en la de fabrica sin tumbar la pagina.
 */
export type Validacion =
  | { readonly ok: true; readonly macro: Macro }
  | { readonly ok: false; readonly errores: readonly string[] }

export function validarMacro(crudo: unknown): Validacion {
  const resultado = macroSchema.safeParse(crudo)
  if (resultado.success) return { ok: true, macro: resultado.data }

  return {
    ok: false,
    errores: resultado.error.issues.map((issue) => {
      const donde = issue.path.join(' › ')
      return donde === '' ? issue.message : `${donde}: ${issue.message}`
    }),
  }
}

/** Las reglas del motor tal como las espera `generarPlan`. */
export const reglasDeMacro = (macro: Macro): ReglasMotor => macro.reglas
