import { describe, expect, it } from 'vitest'

import type { Benchmark, Restriccion } from '../domain/tipos.js'
import { armarEntradaPlan, evaluarRevision, redistribuirInmobiliario } from '../entrada.js'
import type { DecisionesPropuesta, PosicionRevisada } from '../entrada.js'

const BENCHMARK: Benchmark = {
  inm: 0.24,
  fijo: 0.19,
  variable: 0.16,
  privados: 0.21,
  club: 0.09,
  otros: 0.01,
  cash: 0.1,
}

const DECISIONES: DecisionesPropuesta = {
  perfil: 'Moderado',
  benchmark: BENCHMARK,
  pesos: {
    fijo: { IBTA: 0.5, IBTM: 0.5 },
    variable: { 'iShares Core S&P 500': 1 },
    otros: { 'BTC (IBIT)': 0.85, Oro: 0.15 },
  },
  ticketMinimoUsd: 20_000,
  fallbacks: { fijo: 'Flip Panda', variable: 'Flip Cobra' },
}

const posicion = (parcial: Partial<PosicionRevisada> = {}): PosicionRevisada => ({
  institucionProducto: 'Posicion',
  origen: 'financiero',
  claseModelo: 'cash',
  productoId: null,
  valorUsd: 100_000,
  esInvertible: true,
  cta: 'conservar',
  montoVentaParcial: 0,
  ...parcial,
})

/** Atajo: falla el test si la derivacion vino bloqueada. */
const derivar = (
  posiciones: readonly PosicionRevisada[],
  decisiones: DecisionesPropuesta = DECISIONES,
) => {
  const derivacion = armarEntradaPlan(posiciones, decisiones)
  if (!derivacion.ok) throw new Error(`Bloqueada: ${derivacion.bloqueos.map((b) => b.codigo).join()}`)
  return derivacion
}

describe('armarEntradaPlan', () => {
  it('convierte cada posicion conservada en un piso de su clase', () => {
    const { entrada } = derivar([
      posicion({ institucionProducto: 'DPF', claseModelo: 'cash', valorUsd: 214_492.75 }),
      posicion({ institucionProducto: 'Seguro', claseModelo: 'fijo', valorUsd: 16_000 }),
      posicion({ institucionProducto: 'Fondos', claseModelo: 'variable', cta: 'venta_total' }),
    ])

    expect(entrada.pisos).toEqual([
      { clase: 'cash', montoUsd: 214_492.75, origen: 'conservado', etiqueta: 'DPF' },
      { clase: 'fijo', montoUsd: 16_000, origen: 'conservado', etiqueta: 'Seguro' },
    ])
  })

  it('el remanente de una venta parcial sigue siendo piso', () => {
    const { entrada, resumen } = derivar([
      posicion({ claseModelo: 'fijo', valorUsd: 50_000, cta: 'venta_parcial', montoVentaParcial: 30_000 }),
      posicion({ claseModelo: 'variable', valorUsd: 60_000, cta: 'venta_total' }),
    ])

    expect(entrada.pisos).toEqual([
      expect.objectContaining({ clase: 'fijo', montoUsd: 20_000 }),
    ])
    expect(resumen.dineroDisponibleUsd).toBe(90_000)
    expect(resumen.conservadoUsd).toBe(20_000)
  })

  it('trata lo que quedo sin marcar como conservado y lo reporta', () => {
    const { entrada, resumen, avisos } = derivar([
      posicion({ claseModelo: 'privados', valorUsd: 80_000, cta: 'sin_marcar' }),
      posicion({ claseModelo: 'cash', valorUsd: 20_000, cta: 'venta_total' }),
    ])

    expect(entrada.pisos).toHaveLength(1)
    expect(resumen.sinMarcar).toBe(1)
    expect(avisos.some((a) => /sin marcar/i.test(a))).toBe(true)
  })

  it('deja el uso propio fuera del patrimonio y de los pisos', () => {
    const { entrada, resumen } = derivar([
      posicion({ claseModelo: 'cash', valorUsd: 100_000 }),
      posicion({ origen: 'inmueble', claseModelo: 'inm', valorUsd: 200_000, esInvertible: false }),
    ])

    expect(entrada.patrimonioTotalUsd).toBe(100_000)
    expect(entrada.pisos).toHaveLength(1)
    expect(resumen.usoPropioUsd).toBe(200_000)
  })

  it('suma los inmuebles de renta al patrimonio con el toggle prendido', () => {
    const { entrada, resumen } = derivar([
      posicion({ claseModelo: 'cash', valorUsd: 709_392.99, cta: 'venta_total' }),
      posicion({ origen: 'inmueble', claseModelo: 'inm', valorUsd: 555_000 }),
    ])

    expect(entrada.patrimonioTotalUsd).toBeCloseTo(1_264_392.99, 6)
    expect(resumen.inmueblesRentaUsd).toBe(555_000)
    expect(entrada.benchmark.inm).toBe(0.24)
  })

  it('saca los inmuebles de renta y redistribuye su peso con el toggle apagado', () => {
    const { entrada, resumen } = derivar(
      [
        posicion({ claseModelo: 'cash', valorUsd: 709_392.99, cta: 'venta_total' }),
        posicion({ origen: 'inmueble', claseModelo: 'inm', valorUsd: 555_000 }),
      ],
      { ...DECISIONES, incluirInmueblesDeRenta: false },
    )

    expect(entrada.patrimonioTotalUsd).toBeCloseTo(709_392.99, 6)
    expect(entrada.benchmark.inm).toBe(0)
    expect(entrada.pisos).toHaveLength(0)
    expect(resumen.inmueblesRentaUsd).toBe(555_000)
  })

  it('convierte el colchon de liquidez en un piso de cash', () => {
    const { entrada } = derivar(
      [posicion({ claseModelo: 'fijo', valorUsd: 500_000, cta: 'venta_total' })],
      { ...DECISIONES, colchonLiquidezUsd: 50_000 },
    )

    expect(entrada.pisos).toEqual([
      { clase: 'cash', montoUsd: 50_000, origen: 'restriccion', etiqueta: 'Colchón de liquidez' },
    ])
  })

  it('suma las restricciones del asesor como pisos, sin agrandar el patrimonio', () => {
    const restricciones: readonly Restriccion[] = [
      { id: 'r1', nombre: 'Acciones MSFT', montoUsd: 30_000, clase: 'variable', productoId: null },
      { id: 'r2', nombre: 'Edifica Clase B', montoUsd: 60_000, clase: 'privados', productoId: 'EDIFICA_B' },
    ]
    const { entrada, resumen } = derivar(
      [posicion({ claseModelo: 'cash', valorUsd: 500_000, cta: 'venta_total' })],
      { ...DECISIONES, restricciones },
    )

    expect(entrada.patrimonioTotalUsd).toBe(500_000)
    expect(entrada.pisos).toEqual([
      { clase: 'variable', montoUsd: 30_000, origen: 'restriccion', etiqueta: 'Acciones MSFT' },
      { clase: 'privados', montoUsd: 60_000, origen: 'restriccion', etiqueta: 'Edifica Clase B' },
    ])
    expect(resumen.restringidoUsd).toBe(90_000)
  })

  it('una restriccion sobre el inmobiliario llega como piso de la clase', () => {
    const { entrada } = derivar(
      [posicion({ claseModelo: 'cash', valorUsd: 300_000, cta: 'venta_total' })],
      {
        ...DECISIONES,
        restricciones: [
          { id: 'r1', nombre: 'Depto en construccion', montoUsd: 90_000, clase: 'inm', productoId: null },
        ],
      },
    )

    // El piso es lo que salva a la clase del umbral del inmobiliario, y el
    // motor lo mira por su cuenta: aca solo tiene que viajar.
    expect(entrada.pisos).toContainEqual({
      clase: 'inm',
      montoUsd: 90_000,
      origen: 'restriccion',
      etiqueta: 'Depto en construccion',
    })
  })

  it('el acceso al inmobiliario viaja al motor tal como se decidio', () => {
    const sinAcceso = derivar([posicion({ claseModelo: 'cash', cta: 'venta_total' })], DECISIONES)
    expect(sinAcceso.entrada.accedeInmobiliario).toBe(false)

    const conAcceso = derivar([posicion({ claseModelo: 'cash', cta: 'venta_total' })], {
      ...DECISIONES,
      accedeInmobiliario: true,
    })
    expect(conAcceso.entrada.accedeInmobiliario).toBe(true)
  })

  it('traslada los toggles de propuesta al motor', () => {
    const { entrada } = derivar([posicion({ claseModelo: 'cash', cta: 'venta_total' })], {
      ...DECISIONES,
      necesitaFlujos: true,
      institucional: 'si',
    })

    expect(entrada).toMatchObject({
      necesitaFlujos: true,
      institucional: 'si',
      perfil: 'Moderado',
      ticketMinimoUsd: 20_000,
    })
  })

  it('el dinero disponible cuadra contra el patrimonio menos lo conservado', () => {
    const { entrada, resumen } = derivar([
      posicion({ claseModelo: 'cash', valorUsd: 214_492.75 }),
      posicion({ claseModelo: 'fijo', valorUsd: 100_000, cta: 'venta_total' }),
      posicion({ claseModelo: 'variable', valorUsd: 60_000, cta: 'venta_parcial', montoVentaParcial: 25_000 }),
    ])

    expect(resumen.dineroDisponibleUsd).toBe(125_000)
    expect(entrada.patrimonioTotalUsd - resumen.conservadoUsd).toBeCloseTo(125_000, 6)
  })
})

describe('armarEntradaPlan: gates', () => {
  const bloqueos = (
    posiciones: readonly PosicionRevisada[],
    decisiones: DecisionesPropuesta = DECISIONES,
  ) => {
    const derivacion = armarEntradaPlan(posiciones, decisiones)
    return derivacion.ok ? [] : derivacion.bloqueos.map((b) => b.codigo)
  }

  it('bloquea a un US person con el mensaje del equipo de inversiones', () => {
    const derivacion = armarEntradaPlan([posicion()], { ...DECISIONES, usPerson: true })

    expect(derivacion.ok).toBe(false)
    if (derivacion.ok) return
    expect(derivacion.bloqueos[0]?.codigo).toBe('us_person')
    expect(derivacion.bloqueos[0]?.mensaje).toMatch(/manualmente con el equipo de inversiones/i)
  })

  it('bloquea sin posiciones y con patrimonio cero', () => {
    expect(bloqueos([])).toContain('sin_posiciones')
    expect(bloqueos([posicion({ esInvertible: false, origen: 'inmueble', claseModelo: 'inm' })])).toContain(
      'patrimonio_cero',
    )
  })

  it('bloquea cuando lo conservado supera el patrimonio invertible', () => {
    const codigos = bloqueos([posicion({ claseModelo: 'cash', valorUsd: 100_000 })], {
      ...DECISIONES,
      colchonLiquidezUsd: 500_000,
    })

    expect(codigos).toContain('conservado_excede')
  })

  it('bloquea mientras haya una posicion sin clase', () => {
    const derivacion = armarEntradaPlan([posicion({ claseModelo: null })], DECISIONES)

    expect(derivacion.ok).toBe(false)
    if (derivacion.ok) return
    expect(derivacion.bloqueos[0]?.codigo).toBe('clase_sin_resolver')
    expect(derivacion.bloqueos[0]?.mensaje).toContain('Posicion')
  })

  it('devuelve el resumen aunque este bloqueada, para que la pantalla lo muestre', () => {
    const derivacion = armarEntradaPlan([posicion({ claseModelo: 'cash', valorUsd: 80_000 })], {
      ...DECISIONES,
      usPerson: true,
    })

    expect(derivacion.ok).toBe(false)
    if (derivacion.ok) return
    expect(derivacion.resumen.patrimonioInvertibleUsd).toBe(80_000)
  })
})

describe('gate del ticket minimo', () => {
  it('bloquea cuando el campo queda vacio o en cero', () => {
    // Vaciar el campo en pantalla lo dejaba en cero, el boton seguia
    // habilitado y `generarPlan` reventaba del otro lado del servidor.
    const r = evaluarRevision([posicion({ cta: 'venta_total' })], { ticketMinimoUsd: 0 })

    expect(r.bloqueos.map((b) => b.codigo)).toContain('ticket_invalido')
  })

  it('no dice nada con un ticket valido, ni cuando no se lo pasan', () => {
    const conTicket = evaluarRevision([posicion({ cta: 'venta_total' })], {
      ticketMinimoUsd: 20_000,
    })
    const sinTicket = evaluarRevision([posicion({ cta: 'venta_total' })])

    expect(conTicket.bloqueos).toStrictEqual([])
    expect(sinTicket.bloqueos).toStrictEqual([])
  })

  it('armarEntradaPlan devuelve el bloqueo en vez de reventar despues', () => {
    const d = armarEntradaPlan([posicion({ cta: 'venta_total' })], {
      ...DECISIONES,
      ticketMinimoUsd: 0,
    })

    expect(d.ok).toBe(false)
    if (d.ok) return
    expect(d.bloqueos.map((b) => b.codigo)).toContain('ticket_invalido')
  })
})

describe('redistribuirInmobiliario', () => {
  it('reparte el peso del inmobiliario entre las demas clases en proporcion', () => {
    const sinInm = redistribuirInmobiliario(BENCHMARK)

    expect(sinInm.inm).toBe(0)
    expect(
      sinInm.fijo + sinInm.variable + sinInm.privados + sinInm.club + sinInm.otros + sinInm.cash,
    ).toBeCloseTo(1, 10)
    // Las proporciones relativas entre las demas no cambian.
    expect(sinInm.fijo / sinInm.variable).toBeCloseTo(BENCHMARK.fijo / BENCHMARK.variable, 10)
    expect(sinInm.club / sinInm.otros).toBeCloseTo(BENCHMARK.club / BENCHMARK.otros, 10)
  })

  it('devuelve el benchmark intacto si el inmobiliario ya pesaba cero', () => {
    const sinInm = { ...BENCHMARK, inm: 0 }

    expect(redistribuirInmobiliario(sinInm)).toEqual(sinInm)
  })
})

describe('evaluarRevision', () => {
  it('da resumen y gates sin necesitar benchmark ni pesos de producto', () => {
    // Es lo que la pantalla recalcula en cada tecleo: no carga configuracion.
    const { resumen, bloqueos } = evaluarRevision([
      posicion({ claseModelo: 'cash', valorUsd: 100_000, cta: 'venta_total' }),
      posicion({ claseModelo: 'fijo', valorUsd: 50_000 }),
    ])

    expect(bloqueos).toEqual([])
    expect(resumen.patrimonioInvertibleUsd).toBe(150_000)
    expect(resumen.dineroDisponibleUsd).toBe(100_000)
    expect(resumen.conservadoUsd).toBe(50_000)
  })

  it('devuelve las posiciones que entran al calculo segun el toggle', () => {
    const posiciones = [
      posicion({ claseModelo: 'cash', valorUsd: 100_000 }),
      posicion({ origen: 'inmueble', claseModelo: 'inm', valorUsd: 200_000 }),
    ]

    expect(evaluarRevision(posiciones).cuentan).toHaveLength(2)
    expect(evaluarRevision(posiciones, { incluirInmueblesDeRenta: false }).cuentan).toHaveLength(1)
  })

  it('sin opciones asume el caso feliz: no US person y con inmuebles adentro', () => {
    const { resumen } = evaluarRevision([posicion({ origen: 'inmueble', claseModelo: 'inm' })])

    expect(resumen.patrimonioInvertibleUsd).toBe(100_000)
  })
})
