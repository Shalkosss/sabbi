/**
 * Ensamblado del plan.
 *
 * Es el equivalente de `Calcular_Portafolio_Completo` de la macro
 * `Benchmark Sabbi - Macros v4`: la rutina que llama a las demas en orden y
 * produce la propuesta.
 *
 * El orden no es arbitrario — cada paso trabaja sobre el benchmark que dejo el
 * anterior, y cambiarlo da otras cifras:
 *
 *  1. Recorte de Cash. En el perfil Conservador el peso de Cash baja cinco
 *     puntos porcentuales y se reparte pro-rata entre las otras cinco clases.
 *     Va primero para que todo lo demas trabaje sobre el benchmark corregido.
 *  2. Clase Otros. Si su benchmark no llega al ticket minimo, deja de existir
 *     y su peso se suma a Mercados Privados. Antes de comparar contra las
 *     posiciones conservadas: al reves se contaba su peso dos veces.
 *  3. Inmobiliario Directo. Si el cliente no accede, su peso se reparte — a
 *     Mercados Publicos con ticket chico, a Mercados Privados con ticket
 *     grande. Un inmueble conservado la salva.
 *  4. Solver de pisos. Reparte el patrimonio entre clases y cierra las que ya
 *     estan cubiertas por lo conservado o por un ajuste. Cash va blindado.
 *  5. Segunda vuelta de Otros: pudo pasar el ticket con su benchmark y quedar
 *     por debajo despues del reparto.
 *  6. Cascada de privados, sobre el dinero de privados y club juntos. Puede
 *     devolver monto a Mercados Publicos, asi que va ANTES de repartir ETFs.
 *  7. Reparto por clase, sobre el dinero nuevo: la misma cascada de ETFs en
 *     Fijo y en Variable, los subfondos en Privados, la etiqueta en Club, los
 *     dos instrumentos en Otros.
 *  8. Prorrateo de residuales. Barre las lineas inejecutables al final, cuando
 *     ya se sabe cuanto le toco a cada una.
 *
 * La funcion es pura: no lee configuracion, no toca la red y no mira el reloj.
 * Los pesos, los pisos y los toggles llegan como argumento.
 */

import { REGLAS_V4 } from './domain/reglas.js'
import type { ReglasMotor } from './domain/reglas.js'
import type {
  AjusteAplicado,
  AjusteClase,
  Benchmark,
  ClaseModelo,
  LineaPlan,
  Perfil,
  Piso,
  RepartoClase,
  ResultadoReparto,
} from './domain/tipos.js'
import { CLASES, NOMBRE_CLASE } from './domain/tipos.js'
import { repartirEtfs } from './rules/cascada.js'
import { recortarCash } from './rules/cash.js'
import { resolverInmobiliario } from './rules/inmobiliario.js'
import type { EstadoInstitucional } from './rules/institucional.js'
import { otrosAbre, repartirOtros } from './rules/otros.js'
import { lineaClub, planificarPrivados, repartirFondo } from './rules/privados.js'
import type { PlanPrivados } from './rules/privados.js'
import { repartirPorClase } from './rules/reparto.js'
import { prorratearResiduales } from './rules/residuales.js'

const EPS = 1e-6

/** Un centavo. Por debajo, una diferencia es ruido de coma flotante. */
const TOL = 0.01

/** Orden de bloques de la propuesta. Es el de la hoja Allocation detallado. */
const ORDEN_CLASES: readonly ClaseModelo[] = [
  'inm',
  'fijo',
  'variable',
  'privados',
  'club',
  'otros',
  'cash',
]

/** Linea unica de la clase inmobiliaria cuando queda objetivo sin cubrir. */
export const INMOBILIARIO_TBD = 'Inmobiliario Directo — nueva inversión (TBD)'

export const LINEA_CASH = 'Cash'

export interface PesosProductos {
  /** Pesos de los ETFs de Fijo, renormalizados dentro de la clase. */
  readonly fijo: Readonly<Record<string, number>>
  /** Pesos de los ETFs de Variable, renormalizados dentro de la clase. */
  readonly variable: Readonly<Record<string, number>>
  /** Pesos de BTC y Oro, renormalizados dentro de la clase Otros. */
  readonly otros: Readonly<Record<string, number>>
}

export interface EntradaPlan {
  readonly perfil: Perfil
  /** Ticket de la propuesta: el patrimonio invertible total. */
  readonly patrimonioTotalUsd: number
  readonly benchmark: Benchmark
  readonly pesos: PesosProductos
  /** Pisos por clase: posiciones conservadas y restricciones del asesor. */
  readonly pisos: readonly Piso[]
  /** Instrumento de consolidacion cuando una clase no llega a un ticket. */
  readonly fallbacks: { readonly fijo: string; readonly variable: string }
  /** Toggle de flujos. Cambia el destino de privados y del club deal. */
  readonly necesitaFlujos?: boolean
  /**
   * Check institucional. `auto` abre el split con la nota al pie; solo un
   * forzado del asesor cambia el reparto.
   */
  readonly institucional?: EstadoInstitucional
  /**
   * El cliente accede a Inmobiliario Directo.
   *
   * Es el Si/No de la hoja. En `true` la clase se conserva sin importar el
   * ticket. Una restriccion sobre la clase tiene el mismo efecto.
   */
  readonly accedeInmobiliario?: boolean
  /**
   * Montos que el asesor clavo por clase, en las dos direcciones.
   *
   * Un piso solo empuja hacia arriba; un ajuste tambien hacia abajo. La clase
   * ajustada sale del reparto y lo que sobra se prorratea entre las demas.
   */
  readonly ajustes?: readonly AjusteClase[]
  /**
   * La macro: los umbrales y minimos con los que se calcula.
   *
   * Es lo que la mesa edita en la pantalla de Macro y lo que hace que dos
   * corridas del mismo cliente den portafolios distintos. Sin ella, la v4.
   */
  readonly reglas?: ReglasMotor
  /**
   * Ticket minimo de esta propuesta.
   *
   * Gana sobre el de la macro: es el unico numero que el asesor mueve
   * propuesta por propuesta.
   */
  readonly ticketMinimoUsd?: number
}

export interface Plan {
  /** Reparto por clase, con el inmobiliario y los residuos aplicados. */
  readonly reparto: ResultadoReparto
  readonly lineas: readonly LineaPlan[]
  /** Suma de todas las lineas. Debe igualar el patrimonio invertible. */
  readonly totalObjetivoUsd: number
  /** Compras: lo que hay que ejecutar. Objetivo menos lo ya conservado. */
  readonly dineroNuevoUsd: number
  /** Decisiones del motor que el asesor tiene que poder leer. */
  readonly avisos: readonly string[]
}

export function generarPlan(entrada: EntradaPlan): Plan {
  const {
    perfil,
    patrimonioTotalUsd,
    benchmark,
    pesos,
    pisos,
    fallbacks,
    necesitaFlujos = false,
    institucional = 'auto',
    accedeInmobiliario = false,
    ajustes = [],
    reglas = REGLAS_V4,
  } = entrada

  const ticketMinimoUsd = entrada.ticketMinimoUsd ?? reglas.ticketMinimoUsd
  if (ticketMinimoUsd <= 0) {
    throw new Error(`El ticket minimo debe ser mayor que cero, se recibio ${ticketMinimoUsd}.`)
  }

  const avisos: string[] = []
  const redondo = (monto: number): string =>
    monto.toLocaleString('en-US', { maximumFractionDigits: 0 })

  // ── 1. Recorte de Cash del Conservador ────────────────────────────────
  const conCash = recortarCash(benchmark, perfil, reglas.cash.recorteConservadorPp)
  if (conCash !== benchmark) {
    avisos.push(
      `Perfil Conservador: se le recortaron ${(reglas.cash.recorteConservadorPp * 100).toFixed(1)} ` +
        'puntos de Cash y se repartieron entre las demás clases.',
    )
  }

  const escala = CLASES.reduce((acc, c) => acc + conCash[c], 0)
  const enDinero = (peso: number) => (escala > 0 ? (patrimonioTotalUsd * peso) / escala : 0)

  // ── 2. La clase Otros existe o se pliega ──────────────────────────────
  const otrosEnDinero = enDinero(conCash.otros)
  const otrosVive = otrosAbre(otrosEnDinero, ticketMinimoUsd)
  const conOtros: Benchmark = otrosVive
    ? conCash
    : { ...conCash, otros: 0, privados: conCash.privados + conCash.otros }

  if (!otrosVive && conCash.otros > EPS) {
    avisos.push(
      `Otros: su parte del modelo (${redondo(otrosEnDinero)}) no llega al ticket mínimo de ` +
        `${redondo(ticketMinimoUsd)} y su peso pasó a Mercados Privados.`,
    )
  }

  // ── 3. Inmobiliario Directo ───────────────────────────────────────────
  const pisoInm = pisos.reduce((acc, p) => (p.clase === 'inm' ? acc + p.montoUsd : acc), 0)
  const fijoInm = ajustes.some((a) => a.clase === 'inm' && a.modo === 'fijar' && a.montoUsd > EPS)

  const inm = resolverInmobiliario(conOtros, {
    patrimonioTotalUsd,
    accede: accedeInmobiliario,
    tienePiso: pisoInm > EPS || fijoInm,
    umbralUsd: reglas.inmobiliario.umbralUsd,
  })

  if (inm.disuelta) {
    avisos.push(
      inm.destino === 'publicos'
        ? 'Inmobiliario Directo: el cliente no accede y el ticket no llega a ' +
            `${redondo(reglas.inmobiliario.umbralUsd)}; su parte se repartió entre Renta Fija y ` +
            'Renta Variable.'
        : 'Inmobiliario Directo: el cliente no accede; su parte pasó a Mercados Privados, con ' +
            `${(reglas.inmobiliario.parteClub * 100).toFixed(0)}% destinado al club deal.`,
    )
  }

  // Lo que el inmobiliario aporto a privados y club, para el objetivo del club.
  const inmAPrivados = inm.destino === 'privados' ? enDinero(inm.pesoMovido) : 0

  // ── 4. Solver de pisos, con Cash blindado ─────────────────────────────
  const inicial = repartirPorClase(inm.benchmark, patrimonioTotalUsd, pisos, ajustes)
  avisos.push(...avisosDeAjustes(inicial.ajustes, redondo))

  // ── 5. Otros pudo caer por debajo del ticket en el reparto ────────────
  const trasOtros = replegarOtros(inicial, ticketMinimoUsd, otrosVive, avisos, redondo)

  // ── 6. Cascada de privados: club, fondo y lo que vuelve a publicos ────
  const librePrivados = claseDe(trasOtros, 'privados').dineroNuevoUsd
  const libreClub = claseDe(trasOtros, 'club').dineroNuevoUsd

  const plan = planificarPrivados({
    libreUsd: librePrivados + libreClub,
    // Lo que le tocaria al club sin minimos: su peso mas la parte del
    // inmobiliario que se derivo aca.
    objetivoClubUsd: libreClub + inmAPrivados * reglas.inmobiliario.parteClub,
    umbrales: reglas.privados,
  })

  if (plan.aPublicosUsd > EPS) {
    avisos.push(
      `Mercados Privados: el dinero nuevo (${redondo(plan.aPublicosUsd)}) no alcanza ni para el ` +
        `Fondo Oportunidad (${redondo(reglas.privados.minFondoUsd)}) ni para un club deal ` +
        `(${redondo(reglas.privados.minClubUsd)}), y volvió a Mercados Públicos.`,
    )
  } else if (libreClub > EPS && plan.clubUsd <= EPS) {
    avisos.push(
      `Club Deals: no llega a su mínimo de ${redondo(reglas.privados.minClubUsd)}; su dinero ` +
        'quedó en el Fondo Oportunidad.',
    )
  }

  const reparto = asentarPrivados(trasOtros, plan)

  // ── 7. Las lineas de cada clase ───────────────────────────────────────
  const lineas = ORDEN_CLASES.flatMap((clase) =>
    lineasDeClase(clase, reparto, {
      pisos,
      pesos,
      perfil,
      ticketMinimoUsd,
      fallbacks,
      necesitaFlujos,
      institucional,
      reglas,
      fijadas: new Set(reparto.porClase.filter((c) => c.fijada).map((c) => c.clase)),
    }),
  )

  const finales = ordenar(prorratearResiduales(lineas, ticketMinimoUsd))

  return {
    reparto: realinearConLasLineas(reparto, finales),
    lineas: finales,
    totalObjetivoUsd: finales.reduce((acc, l) => acc + l.usd, 0),
    dineroNuevoUsd: reparto.porClase.reduce((acc, c) => acc + c.dineroNuevoUsd, 0),
    avisos,
  }
}

/**
 * Segunda vuelta de la clase Otros.
 *
 * Pudo pasar el ticket con su benchmark original y quedar por debajo despues
 * del reparto: si el asesor clavo otra clase, el prorrateo recorta a las
 * libres. Su dinero nuevo se pliega a Mercados Privados, que es la misma
 * decision del paso 2 tomada sobre el monto ya repartido.
 */
function replegarOtros(
  reparto: ResultadoReparto,
  ticketMinimoUsd: number,
  otrosVive: boolean,
  avisos: string[],
  redondo: (monto: number) => string,
): ResultadoReparto {
  if (!otrosVive) return reparto

  const otros = claseDe(reparto, 'otros')
  if (otros.dineroNuevoUsd <= EPS) return reparto
  if (otrosAbre(otros.dineroNuevoUsd, ticketMinimoUsd)) return reparto

  const mover = otros.dineroNuevoUsd
  avisos.push(
    `Otros: después del reparto le quedaron ${redondo(mover)}, por debajo del ticket mínimo de ` +
      `${redondo(ticketMinimoUsd)}. Su dinero nuevo pasó a Mercados Privados.`,
  )

  return {
    ...reparto,
    porClase: reparto.porClase.map((c) => {
      if (c.clase === 'otros') {
        return { ...c, objetivoUsd: c.pisoUsd, dineroNuevoUsd: 0, cerrada: true }
      }
      if (c.clase === 'privados') {
        return {
          ...c,
          objetivoUsd: c.objetivoUsd + mover,
          dineroNuevoUsd: c.dineroNuevoUsd + mover,
          cerrada: false,
        }
      }
      return c
    }),
  }
}

/**
 * Deja el reparto diciendo lo que el plan de privados decidio.
 *
 * El club y el fondo se reparten el dinero de las dos clases juntas, asi que el
 * objetivo de cada una cambia; lo que vuelve a Mercados Publicos se prorratea
 * entre Fijo y Variable a proporcion de lo que ya tenian. Cash nunca recibe.
 * El total no se mueve: es el mismo dinero contado en otra clase.
 */
function asentarPrivados(
  reparto: ResultadoReparto,
  plan: PlanPrivados,
): ResultadoReparto {
  const conNuevo = (actual: RepartoClase, dineroNuevo: number): RepartoClase => ({
    ...actual,
    objetivoUsd: actual.pisoUsd + dineroNuevo,
    dineroNuevoUsd: dineroNuevo,
    cerrada: dineroNuevo <= TOL,
  })

  const conPrivados: RepartoClase[] = reparto.porClase.map((c) => {
    if (c.clase === 'privados') return conNuevo(c, plan.fondoUsd)
    if (c.clase === 'club') return conNuevo(c, plan.clubUsd)
    return c
  })

  if (plan.aPublicosUsd <= EPS) return { ...reparto, porClase: conPrivados }

  const de = (clase: ClaseModelo) =>
    conPrivados.find((c) => c.clase === clase)?.dineroNuevoUsd ?? 0
  const base = de('fijo') + de('variable')

  return {
    ...reparto,
    porClase: conPrivados.map((c) => {
      if (c.clase !== 'fijo' && c.clase !== 'variable') return c
      // Sin base, todo a Renta Fija: es el destino mas conservador de los dos.
      const parte =
        base > EPS
          ? plan.aPublicosUsd * (c.dineroNuevoUsd / base)
          : c.clase === 'fijo'
            ? plan.aPublicosUsd
            : 0
      return {
        ...c,
        objetivoUsd: c.objetivoUsd + parte,
        dineroNuevoUsd: c.dineroNuevoUsd + parte,
        cerrada: c.dineroNuevoUsd + parte <= TOL,
      }
    }),
  }
}

/**
 * Devuelve el reparto a lo que dicen las lineas.
 *
 * El prorrateo de residuales barre entre clases: una linea de Fijo que no llega
 * al ticket desaparece y su monto engorda a las de Variable, que si lo superan.
 * Lo que no puede quedar es el reparto diciendo que Fijo tiene 228,123 cuando
 * sus lineas suman 214,492 — la seccion 6 imprimiria una clase cuyo total no es
 * la suma de sus filas, y el blotter no cuadraria.
 *
 * El total no se mueve —el barrido conserva el dinero— solo la reparticion.
 */
function realinearConLasLineas(
  reparto: ResultadoReparto,
  lineas: readonly LineaPlan[],
): ResultadoReparto {
  const porClase: RepartoClase[] = reparto.porClase.map((clase) => {
    const suma = lineas.reduce((acc, l) => (l.clase === clase.clase ? acc + l.usd : acc), 0)
    if (Math.abs(suma - clase.objetivoUsd) <= TOL) return clase

    return {
      ...clase,
      objetivoUsd: suma,
      dineroNuevoUsd: Math.max(0, suma - clase.pisoUsd),
      cerrada: suma <= clase.pisoUsd + TOL,
    }
  })

  return { ...reparto, porClase }
}

/**
 * Los ajustes que el piso no dejo cumplir.
 *
 * Fijar una clase por debajo de lo que el cliente ya tiene ahi pediria vender,
 * y vender se marca en la ficha, no en el panel de ajustes. El motor clava en
 * el piso y lo escribe: un ajuste aplicado a medias en silencio es una cifra
 * que despues nadie puede explicar.
 */
function avisosDeAjustes(
  ajustes: readonly AjusteAplicado[],
  redondo: (monto: number) => string,
): string[] {
  return ajustes
    .filter((ajuste) => ajuste.aplicadoUsd > ajuste.pedidoUsd + TOL)
    .map((ajuste) => {
      const pedido =
        ajuste.modo === 'excluir'
          ? 'pediste sacarla del cálculo'
          : `pediste fijarla en ${redondo(ajuste.pedidoUsd)}`
      return (
        `${NOMBRE_CLASE[ajuste.clase]}: ${pedido}, pero el cliente conserva ` +
        `${redondo(ajuste.pisoUsd)} ahí. Quedó en ${redondo(ajuste.aplicadoUsd)}; para bajarla, ` +
        'marcá la venta en la ficha.'
      )
    })
}

interface ContextoClase {
  readonly pisos: readonly Piso[]
  readonly pesos: PesosProductos
  readonly perfil: Perfil
  readonly ticketMinimoUsd: number
  readonly fallbacks: { readonly fijo: string; readonly variable: string }
  readonly necesitaFlujos: boolean
  readonly institucional: EstadoInstitucional
  readonly reglas: ReglasMotor
  /**
   * Clases que el asesor clavo.
   *
   * Sus lineas quedan fuera del barrido de residuales en las dos direcciones:
   * una clase fijada que cede o recibe deja de estar fijada, y el monto que el
   * asesor escribio dejaria de ser el que sale impreso.
   */
  readonly fijadas: ReadonlySet<ClaseModelo>
}

function lineasDeClase(
  clase: ClaseModelo,
  reparto: ResultadoReparto,
  ctx: ContextoClase,
): LineaPlan[] {
  const { objetivoUsd, dineroNuevoUsd } = claseDe(reparto, clase)
  if (objetivoUsd <= EPS) return []

  const conservadas: LineaPlan[] = ctx.pisos
    .filter((p) => p.clase === clase && p.montoUsd > EPS)
    .map((p) => ({ instrumento: p.etiqueta, clase, usd: p.montoUsd, residuales: 'exenta' }))

  if (dineroNuevoUsd <= EPS) return conservadas

  // Privados, Club y Otros resuelven sus minimos propios: sus lineas nuevas no
  // ceden en el prorrateo de residuales y solo reciben en ultima instancia.
  if (clase === 'privados') {
    const nuevas = repartirFondo(dineroNuevoUsd, {
      perfil: ctx.perfil,
      necesitaFlujos: ctx.necesitaFlujos,
      institucional: ctx.institucional,
      minSubfondoUsd: ctx.reglas.privados.minSubfondoUsd,
    }).map(
      (l): LineaPlan => ({
        instrumento: l.instrumento,
        clase,
        usd: l.usd,
        residuales: 'reserva',
        ...(l.nota === undefined ? {} : { nota: l.nota }),
      }),
    )
    return [...conservadas, ...nuevas]
  }

  if (clase === 'club') {
    const linea = lineaClub(dineroNuevoUsd, {
      necesitaFlujos: ctx.necesitaFlujos,
      umbralClaseAUsd: ctx.reglas.privados.umbralClaseAUsd,
    })
    const nuevas: LineaPlan[] =
      linea === null
        ? []
        : [{ instrumento: linea.instrumento, clase, usd: linea.usd, residuales: 'reserva' }]
    return [...conservadas, ...nuevas]
  }

  if (clase === 'otros') {
    const nuevas: LineaPlan[] = repartirOtros(dineroNuevoUsd, ctx.pesos.otros).map((l) => ({
      instrumento: l.instrumento,
      clase,
      usd: l.usd,
      residuales: 'reserva' as const,
    }))
    return [...conservadas, ...nuevas]
  }

  if (clase === 'fijo' || clase === 'variable') {
    const exenta = ctx.fijadas.has(clase)
    // Los dos bloques pasan por la misma cascada: es la regla de la v4.
    const nuevas = repartirEtfs(ctx.pesos[clase], dineroNuevoUsd, {
      ticketMinimo: ctx.ticketMinimoUsd,
      fallback: ctx.fallbacks[clase],
    }).map(
      (a): LineaPlan => ({
        instrumento: a.nombre,
        clase,
        usd: a.usd,
        ...(exenta ? { residuales: 'exenta' as const } : {}),
      }),
    )
    return [...conservadas, ...nuevas]
  }

  // Cash e inmobiliario quedan fuera del prorrateo de residuales: el cash por
  // la regla de aislamiento, el inmobiliario por ser linea de seccion.
  const instrumento = clase === 'inm' ? INMOBILIARIO_TBD : LINEA_CASH
  return [
    ...conservadas,
    { instrumento, clase, usd: dineroNuevoUsd, residuales: 'exenta' as const },
  ]
}

function claseDe(reparto: ResultadoReparto, clase: ClaseModelo) {
  const encontrada = reparto.porClase.find((c) => c.clase === clase)
  if (!encontrada) {
    throw new Error(`El reparto no trae la clase "${clase}".`)
  }
  return encontrada
}

/** Bloques en el orden de la hoja; dentro de cada uno, de mayor a menor. */
function ordenar(lineas: readonly LineaPlan[]): LineaPlan[] {
  return [...lineas].sort((a, b) => {
    const bloque = ORDEN_CLASES.indexOf(a.clase) - ORDEN_CLASES.indexOf(b.clase)
    return bloque !== 0 ? bloque : b.usd - a.usd
  })
}
