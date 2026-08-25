/**
 * Puente entre la ficha revisada y el motor.
 *
 * `generarPlan` recibe numeros ya masticados: un patrimonio, un benchmark y una
 * lista de pisos. Este modulo es el que los produce a partir de lo que el
 * asesor tiene delante — las posiciones de la ficha con su CTA, los toggles de
 * la propuesta y las restricciones — y el que corta el paso cuando el caso no
 * se puede calcular.
 *
 * Sigue los pasos 1 a 7 de la secuencia del §8.1: excluir el uso propio,
 * validar los gates, repartir lo conservado en pisos por clase, elegir el
 * benchmark segun el toggle inmobiliario y contar el dinero disponible.
 *
 * Sigue siendo una funcion pura: no lee configuracion ni toca la red. El
 * benchmark y los pesos de producto llegan resueltos por el llamador, que es
 * quien conoce `@sabbi/config`.
 */

import type { ReglasMotor } from './domain/reglas.js'
import type {
  AjusteClase,
  Benchmark,
  ClaseModelo,
  Cta,
  DestinoVenta,
  Perfil,
  Piso,
  Restriccion,
} from './domain/tipos.js'
import { CLASES } from './domain/tipos.js'
import type { EntradaPlan, PesosProductos } from './plan.js'
import type { EstadoInstitucional } from './rules/institucional.js'

const EPS = 1e-6
const TOL = 0.01

export const ETIQUETA_COLCHON = 'Colchón de liquidez'

/**
 * Una posicion tal como sale de la pantalla de revision.
 *
 * Es un subconjunto estructural de lo que produce el parser de la ficha: solo
 * los campos que cambian el calculo. El resto — moneda, plaza, notas, fee —
 * viaja a la propuesta, no al motor.
 */
export interface PosicionRevisada {
  readonly institucionProducto: string
  readonly origen: 'financiero' | 'inmueble'
  /** `null` mientras el asesor no la resuelva: bloquea el calculo. */
  readonly claseModelo: ClaseModelo | null
  readonly productoId: string | null
  readonly valorUsd: number
  /** Un inmueble de uso propio queda fuera de todo. */
  readonly esInvertible: boolean
  readonly cta: Cta
  readonly montoVentaParcial: number
  /** Reparto de una venta condicionada. Vacio en cualquier otra decision. */
  readonly destinos?: readonly DestinoVenta[]
}

export interface DecisionesPropuesta {
  readonly perfil: Perfil
  /** Pesos por clase del perfil, resueltos por el llamador. */
  readonly benchmark: Benchmark
  readonly pesos: PesosProductos
  readonly ticketMinimoUsd: number
  readonly fallbacks: { readonly fijo: string; readonly variable: string }
  readonly usPerson?: boolean
  readonly necesitaFlujos?: boolean
  readonly institucional?: EstadoInstitucional
  /**
   * Reclasifica los inmuebles en renta hacia el patrimonio financiero.
   *
   * Prendido — el default — el inmobiliario entra con su peso propio de
   * benchmark. Apagado, los inmuebles salen del calculo y el peso de la clase
   * se reparte entre las otras cuatro.
   */
  readonly incluirInmueblesDeRenta?: boolean
  /**
   * El cliente accede a Inmobiliario Directo.
   *
   * Es el Si/No de la hoja, y no es lo mismo que `incluirInmueblesDeRenta`:
   * ese dice si los inmuebles que el cliente ya tiene cuentan como patrimonio
   * financiero, este dice si el modelo le puede proponer inmobiliario nuevo.
   * En `false` —el defecto— la clase se disuelve salvo que el cliente conserve
   * un inmueble, que la clava por su cuenta.
   */
  readonly accedeInmobiliario?: boolean
  /** Efectivo que la propuesta reserva. Clava cash dentro del ticket. */
  readonly colchonLiquidezUsd?: number
  readonly restricciones?: readonly Restriccion[]
  /** Montos clavados por clase. La unica palanca que empuja hacia abajo. */
  readonly ajustes?: readonly AjusteClase[]
  /** La macro con la que se calcula. Sin ella, la v8. */
  readonly reglas?: ReglasMotor
}

export type CodigoBloqueo =
  | 'us_person'
  | 'sin_posiciones'
  | 'patrimonio_cero'
  | 'conservado_excede'
  | 'clase_sin_resolver'
  /**
   * Alguna posicion tiene campos sin llenar. Lo produce el armado de la
   * propuesta — no `evaluarRevision`, que solo ve el subconjunto del motor.
   */
  | 'datos_incompletos'
  /** El ticket minimo quedo en cero o negativo. */
  | 'ticket_invalido'
  /** Los montos fijados no dejan un portafolio posible. */
  | 'ajuste_invalido'
  /** Una venta condicionada cuyo reparto no suma 100%. */
  | 'destino_invalido'

export interface Bloqueo {
  readonly codigo: CodigoBloqueo
  readonly mensaje: string
}

export interface ResumenPatrimonio {
  readonly patrimonioFinancieroUsd: number
  readonly inmueblesRentaUsd: number
  readonly usoPropioUsd: number
  /** El ticket que entra al motor, ya con el toggle inmobiliario aplicado. */
  readonly patrimonioInvertibleUsd: number
  readonly conservadoUsd: number
  readonly restringidoUsd: number
  readonly dineroDisponibleUsd: number
  readonly sinMarcar: number
}

export type Derivacion =
  | {
      readonly ok: true
      readonly entrada: EntradaPlan
      readonly resumen: ResumenPatrimonio
      readonly avisos: readonly string[]
    }
  | {
      readonly ok: false
      readonly bloqueos: readonly Bloqueo[]
      readonly resumen: ResumenPatrimonio
    }

/**
 * Reparte el peso del inmobiliario entre las otras cuatro clases.
 *
 * Conserva las proporciones relativas: es el mismo benchmark visto sin la
 * clase, no un juego de pesos distinto.
 */
export function redistribuirInmobiliario(benchmark: Benchmark): Benchmark {
  if (benchmark.inm <= EPS) return benchmark

  const resto = CLASES.filter((clase) => clase !== 'inm').reduce(
    (acc, clase) => acc + benchmark[clase],
    0,
  )
  if (resto <= EPS) return benchmark

  const factor = (resto + benchmark.inm) / resto
  return Object.fromEntries(
    CLASES.map((clase) => [clase, clase === 'inm' ? 0 : benchmark[clase] * factor]),
  ) as Record<ClaseModelo, number>
}

/** Lo que el cliente conserva de una posicion: su valor menos lo que vende. */
function conservadoDe(posicion: PosicionRevisada): number {
  if (posicion.cta === 'venta_total') return 0
  // Una venta condicionada es una venta entera: lo que la distingue no es
  // cuanto se vende sino a donde va lo vendido.
  if (posicion.cta === 'venta_condicionada') return 0
  if (posicion.cta === 'venta_parcial') {
    return Math.max(0, posicion.valorUsd - posicion.montoVentaParcial)
  }
  // `sin_marcar` conserva: mientras el asesor no decida vender, el dinero sigue
  // donde esta. La pantalla lo cuenta aparte para no dejarlo pasar en silencio.
  return posicion.valorUsd
}

/** Lo que se libera de una posicion para comprar. */
function vendidoDe(posicion: PosicionRevisada): number {
  if (posicion.cta === 'venta_total' || posicion.cta === 'venta_condicionada') {
    return posicion.valorUsd
  }
  if (posicion.cta === 'venta_parcial') return Math.min(posicion.valorUsd, posicion.montoVentaParcial)
  return 0
}

/** Los destinos de una posicion, ya sin los que no aportan nada. */
const destinosDe = (posicion: PosicionRevisada): readonly DestinoVenta[] =>
  posicion.cta === 'venta_condicionada'
    ? (posicion.destinos ?? []).filter((destino) => destino.pct > EPS)
    : []

/**
 * Lo que una venta condicionada clava, destino por destino.
 *
 * El `pct` es una fraccion del valor de la posicion y no un monto porque asi
 * es como se decide — «la mitad al Fondo Estrategico» — y asi sobrevive a que
 * despues se corrija la valuacion del inmueble.
 */
function pisosDeDestinos(posicion: PosicionRevisada): Piso[] {
  return destinosDe(posicion).map((destino) => ({
    clase: destino.clase,
    montoUsd: posicion.valorUsd * destino.pct,
    origen: 'restriccion' as const,
    etiqueta: destino.nombre === '' ? posicion.institucionProducto : destino.nombre,
  }))
}

/**
 * Lo que la pantalla de revision necesita saber en cada tecleo.
 *
 * Es la mitad de `armarEntradaPlan` que no depende del benchmark ni de los
 * pesos de producto: las tres cifras de arriba y los gates. Vive aparte para
 * que la pantalla recalcule en vivo sin cargar la configuracion del negocio.
 */
export interface OpcionesRevision {
  readonly usPerson?: boolean
  readonly incluirInmueblesDeRenta?: boolean
  readonly colchonLiquidezUsd?: number
  readonly restricciones?: readonly Restriccion[]
  readonly ajustes?: readonly AjusteClase[]
  /**
   * Ticket minimo de la propuesta, solo para validarlo.
   *
   * Vaciar el campo en pantalla lo dejaba en cero y el gate no decia nada: el
   * boton seguia habilitado y `generarPlan` reventaba despues, del otro lado
   * del servidor, donde nadie ve el mensaje.
   */
  readonly ticketMinimoUsd?: number
}

export interface Revision {
  readonly resumen: ResumenPatrimonio
  readonly bloqueos: readonly Bloqueo[]
  /** Las posiciones que entran al calculo, ya con el toggle aplicado. */
  readonly cuentan: readonly PosicionRevisada[]
}

export function evaluarRevision(
  posiciones: readonly PosicionRevisada[],
  opciones: OpcionesRevision = {},
): Revision {
  const {
    usPerson = false,
    incluirInmueblesDeRenta = true,
    colchonLiquidezUsd = 0,
    restricciones = [],
    ajustes = [],
    ticketMinimoUsd,
  } = opciones

  const invertibles = posiciones.filter((posicion) => posicion.esInvertible)
  const inmueblesRenta = invertibles.filter((posicion) => posicion.origen === 'inmueble')
  const financieras = invertibles.filter((posicion) => posicion.origen === 'financiero')

  // El toggle apagado deja los inmuebles de renta fuera del calculo, igual que
  // el uso propio: siguen existiendo, pero en la seccion 2 de la propuesta.
  const cuentan = incluirInmueblesDeRenta ? invertibles : financieras

  const suma = (lista: readonly PosicionRevisada[], de: (p: PosicionRevisada) => number): number =>
    lista.reduce((total, posicion) => total + de(posicion), 0)

  const valor = (posicion: PosicionRevisada) => posicion.valorUsd
  const patrimonioInvertibleUsd = suma(cuentan, valor)
  const conservadoUsd = suma(cuentan, conservadoDe)
  const condicionadoUsd = suma(cuentan, (posicion) =>
    destinosDe(posicion).reduce((total, destino) => total + posicion.valorUsd * destino.pct, 0),
  )
  const restringidoUsd =
    restricciones.reduce((total, r) => total + r.montoUsd, 0) +
    Math.max(0, colchonLiquidezUsd) +
    condicionadoUsd

  const resumen: ResumenPatrimonio = {
    patrimonioFinancieroUsd: suma(financieras, valor),
    inmueblesRentaUsd: suma(inmueblesRenta, valor),
    usoPropioUsd: suma(
      posiciones.filter((posicion) => !posicion.esInvertible),
      valor,
    ),
    patrimonioInvertibleUsd,
    conservadoUsd,
    restringidoUsd,
    dineroDisponibleUsd: suma(cuentan, vendidoDe),
    sinMarcar: cuentan.filter((posicion) => posicion.cta === 'sin_marcar').length,
  }

  const bloqueos: Bloqueo[] = []

  if (usPerson) {
    bloqueos.push({
      codigo: 'us_person',
      mensaje:
        'El plan de acción automático no aplica para este perfil regulatorio. ' +
        'Arma la propuesta manualmente con el equipo de inversiones.',
    })
  }
  if (posiciones.length === 0) {
    bloqueos.push({ codigo: 'sin_posiciones', mensaje: 'La ficha no tiene posiciones cargadas.' })
  } else if (patrimonioInvertibleUsd <= EPS) {
    bloqueos.push({
      codigo: 'patrimonio_cero',
      mensaje:
        'El patrimonio invertible es cero. Revisa los valores de la ficha y el toggle de ' +
        'inmuebles de renta.',
    })
  }

  const sinClase = cuentan.filter((posicion) => posicion.claseModelo === null)
  if (sinClase.length > 0) {
    bloqueos.push({
      codigo: 'clase_sin_resolver',
      mensaje:
        `Faltan clasificar ${sinClase.length} posiciones: ` +
        `${sinClase.map((posicion) => posicion.institucionProducto).join(', ')}.`,
    })
  }

  // Un reparto que no suma 100% deja dinero sin dueño o clava mas de lo que la
  // posicion vale, y en los dos casos la cifra que sale no es la que el cliente
  // pidio. Se corta aca, con el nombre de la posicion, y no en el solver.
  for (const posicion of cuentan) {
    if (posicion.cta !== 'venta_condicionada') continue
    const destinos = posicion.destinos ?? []
    const total = destinos.reduce((acc, destino) => acc + destino.pct, 0)

    if (destinos.length === 0) {
      bloqueos.push({
        codigo: 'destino_invalido',
        mensaje:
          `«${posicion.institucionProducto}» está marcada como venta condicionada y no tiene ` +
          'ningún destino. Decí a dónde va el dinero o cambiá la decisión a venta total.',
      })
      continue
    }
    if (Math.abs(total - 1) > 1e-6) {
      bloqueos.push({
        codigo: 'destino_invalido',
        mensaje:
          `El reparto de «${posicion.institucionProducto}» suma ${(total * 100).toFixed(1)}% y ` +
          'tiene que sumar 100%.',
      })
    }
  }

  if (ticketMinimoUsd !== undefined && !(ticketMinimoUsd > 0)) {
    bloqueos.push({
      codigo: 'ticket_invalido',
      mensaje:
        'El ticket mínimo de ETF tiene que ser mayor que cero. Sin él, el motor no puede ' +
        'decidir qué línea es ejecutable.',
    })
  }

  // Fijar mas dinero del que hay no es un ajuste, es una cuenta imposible. Se
  // corta aca y no en el solver, que reventaria del otro lado del servidor.
  const fijadoUsd = ajustes.reduce(
    (total, ajuste) => (ajuste.modo === 'fijar' ? total + Math.max(0, ajuste.montoUsd) : total),
    0,
  )
  if (fijadoUsd > patrimonioInvertibleUsd + TOL) {
    bloqueos.push({
      codigo: 'ajuste_invalido',
      mensaje:
        `Los montos fijados suman ${fijadoUsd.toFixed(2)} y superan el patrimonio invertible ` +
        `de ${patrimonioInvertibleUsd.toFixed(2)}. Bajá alguno o sacale el ajuste.`,
    })
  }

  if (conservadoUsd + restringidoUsd > patrimonioInvertibleUsd + TOL) {
    bloqueos.push({
      codigo: 'conservado_excede',
      mensaje:
        `Lo conservado y lo restringido suman ${(conservadoUsd + restringidoUsd).toFixed(2)} y ` +
        `superan el patrimonio invertible de ${patrimonioInvertibleUsd.toFixed(2)}.`,
    })
  }

  return { resumen, bloqueos, cuentan }
}

export function armarEntradaPlan(
  posiciones: readonly PosicionRevisada[],
  decisiones: DecisionesPropuesta,
): Derivacion {
  const {
    perfil,
    benchmark,
    pesos,
    ticketMinimoUsd,
    fallbacks,
    usPerson = false,
    necesitaFlujos = false,
    institucional = 'auto',
    incluirInmueblesDeRenta = true,
    colchonLiquidezUsd = 0,
    restricciones = [],
    ajustes = [],
    reglas,
    accedeInmobiliario = false,
  } = decisiones

  const { resumen, bloqueos, cuentan } = evaluarRevision(posiciones, {
    usPerson,
    incluirInmueblesDeRenta,
    colchonLiquidezUsd,
    restricciones,
    ajustes,
    ticketMinimoUsd,
  })

  if (bloqueos.length > 0) return { ok: false, bloqueos, resumen }

  const pisos: Piso[] = []
  for (const posicion of cuentan) {
    const monto = conservadoDe(posicion)
    if (monto <= EPS || posicion.claseModelo === null) continue
    pisos.push({
      clase: posicion.claseModelo,
      montoUsd: monto,
      origen: 'conservado',
      etiqueta: posicion.institucionProducto,
    })
  }

  // Lo que el cliente ya decidio sobre el dinero de una venta condicionada
  // clava su parte, igual que una restriccion: se vendio entero, pero la mitad
  // ya tiene dueño y el benchmark no la puede repartir.
  for (const posicion of cuentan) pisos.push(...pisosDeDestinos(posicion))

  // Una restriccion no agranda el patrimonio: clava una parte del ticket. El
  // colchon de liquidez es una restriccion mas, sobre cash.
  for (const restriccion of restricciones) {
    if (restriccion.montoUsd <= EPS) continue
    pisos.push({
      clase: restriccion.clase,
      montoUsd: restriccion.montoUsd,
      origen: 'restriccion',
      etiqueta: restriccion.nombre,
    })
  }
  if (colchonLiquidezUsd > EPS) {
    pisos.push({
      clase: 'cash',
      montoUsd: colchonLiquidezUsd,
      origen: 'restriccion',
      etiqueta: ETIQUETA_COLCHON,
    })
  }

  const avisos: string[] = []
  if (resumen.sinMarcar > 0) {
    avisos.push(
      `${resumen.sinMarcar} posiciones quedaron sin marcar y se calcularon como conservadas.`,
    )
  }
  if (!incluirInmueblesDeRenta && resumen.inmueblesRentaUsd > EPS) {
    avisos.push(
      `Los inmuebles de renta (${resumen.inmueblesRentaUsd.toFixed(2)}) quedaron fuera del ` +
        'patrimonio financiero y el peso de la clase inmobiliaria se repartió entre las demás.',
    )
  }

  const benchmarkEfectivo = incluirInmueblesDeRenta
    ? benchmark
    : redistribuirInmobiliario(benchmark)

  // El solver reparte lo que sobra entre las clases que quedaron libres. Si no
  // queda ninguna con peso, ese dinero no tiene adonde ir y el motor tira. El
  // corte va aca, donde el mensaje llega a la pantalla.
  const sobrante = sobranteSinDestino(benchmarkEfectivo, resumen.patrimonioInvertibleUsd, pisos, ajustes)
  if (sobrante > TOL) {
    return {
      ok: false,
      resumen,
      bloqueos: [
        {
          codigo: 'ajuste_invalido',
          mensaje:
            `Fijaste todas las clases del modelo y quedan ${sobrante.toFixed(2)} sin ninguna ` +
            'donde prorratearlos. Sacale el ajuste a alguna clase o subí uno de los montos.',
        },
      ],
    }
  }

  const entrada: EntradaPlan = {
    perfil,
    patrimonioTotalUsd: resumen.patrimonioInvertibleUsd,
    benchmark: benchmarkEfectivo,
    pesos,
    pisos,
    ticketMinimoUsd,
    fallbacks,
    necesitaFlujos,
    institucional,
    ajustes,
    accedeInmobiliario,
    ...(reglas === undefined ? {} : { reglas }),
  }

  return { ok: true, entrada, resumen, avisos }
}

/**
 * Dinero que ninguna clase abierta podria recibir.
 *
 * Cada clase ajustada sale del reparto con su monto — nunca por debajo de su
 * piso — y el resto se prorratea entre las que conservan peso. Cuando no queda
 * ninguna, el resto no tiene destino: cero significa que el reparto cierra.
 */
function sobranteSinDestino(
  benchmark: Benchmark,
  patrimonioTotalUsd: number,
  pisos: readonly Piso[],
  ajustes: readonly AjusteClase[],
): number {
  const pisoDe = (clase: ClaseModelo) =>
    pisos.reduce((total, piso) => (piso.clase === clase ? total + piso.montoUsd : total), 0)

  const ultimo = new Map<ClaseModelo, AjusteClase>()
  for (const ajuste of ajustes) ultimo.set(ajuste.clase, ajuste)

  const libres = CLASES.filter((clase) => benchmark[clase] > EPS && !ultimo.has(clase))
  if (libres.length > 0) return 0

  const cerrado = CLASES.reduce((total, clase) => {
    const ajuste = ultimo.get(clase)
    const pedido = ajuste === undefined ? 0 : ajuste.modo === 'excluir' ? 0 : ajuste.montoUsd
    return total + Math.max(Math.max(0, pedido), pisoDe(clase))
  }, 0)

  return patrimonioTotalUsd - cerrado
}
