import { describe, expect, it } from 'vitest'

import type { Benchmark, ClaseModelo, Piso } from '../../domain/tipos.js'
import { ETIQUETA_COLCHON } from '../../entrada.js'
import { generarPlan } from '../../plan.js'
import type { EntradaPlan, Plan } from '../../plan.js'
import { armarPropuesta, TOLERANCIA_CUADRE } from '../index.js'
import type { DatosProducto, PosicionPropuesta } from '../tipos.js'

/**
 * La propuesta se prueba por invariantes, no por cifras memorizadas.
 *
 * Las cifras del caso real ya las cubre el golden de extremo a extremo. Lo que
 * aca importa es que las particiones sigan siendo particiones cuando alguien
 * agregue una categoria: que las secciones 3 y 4 sumen el patrimonio, que el
 * objetivo cuadre y que las compras cuadren contra las ventas.
 */

const BENCHMARK: Benchmark = {
  fijo: 0.3,
  variable: 0.25,
  privados: 0.1,
  club: 0.1,
  otros: 0.05,
  inm: 0.1,
  cash: 0.1,
}

const PESOS = {
  fijo: { 'ETF Fijo A': 0.6, 'ETF Fijo B': 0.4 },
  variable: { 'ETF Variable A': 0.7, 'ETF Variable B': 0.3 },
  otros: { 'BTC (IBIT)': 0.85, Oro: 0.15 },
}

function posicion(parcial: Partial<PosicionPropuesta> & { valorUsd: number }): PosicionPropuesta {
  return {
    orden: 1,
    institucionProducto: 'Posición',
    origen: 'financiero',
    tipoFicha: 'Depósito a plazo',
    assetClass: 'Money Market',
    claseModelo: 'cash',
    productoId: null,
    moneda: 'USD',
    plaza: 'Perú',
    rendimientoEst: null,
    nota: '',
    pais: null,
    pctPertenencia: 1,
    valorDeclaradoUsd: parcial.valorUsd,
    uso: null,
    esInvertible: true,
    cta: 'venta_total',
    montoVentaParcial: 0,
    ...parcial,
  }
}

/** Un patrimonio chico con las cuatro decisiones posibles y un uso propio. */
const POSICIONES: readonly PosicionPropuesta[] = [
  posicion({
    orden: 1,
    institucionProducto: 'Banco A plazo fijo',
    valorUsd: 300_000,
    cta: 'conservar',
    claseModelo: 'cash',
    assetClass: 'Money Market',
  }),
  posicion({
    orden: 2,
    institucionProducto: 'Banco B cuenta',
    valorUsd: 200_000,
    cta: 'venta_total',
    claseModelo: 'cash',
    assetClass: 'Money Market',
    moneda: 'PEN',
  }),
  posicion({
    orden: 3,
    institucionProducto: 'Fondo mixto',
    valorUsd: 400_000,
    cta: 'venta_parcial',
    montoVentaParcial: 250_000,
    claseModelo: 'fijo',
    assetClass: 'Bonos Públicos',
    plaza: 'Offshore',
  }),
  posicion({
    orden: 4,
    institucionProducto: 'Acciones sueltas',
    valorUsd: 100_000,
    cta: 'sin_marcar',
    claseModelo: 'variable',
    assetClass: 'Acciones Públicas',
  }),
  posicion({
    orden: 5,
    institucionProducto: 'Casa de playa',
    origen: 'inmueble',
    valorUsd: 150_000,
    valorDeclaradoUsd: 300_000,
    pctPertenencia: 0.5,
    pais: 'Perú',
    uso: 'Uso propio',
    esInvertible: false,
    cta: 'sin_marcar',
    claseModelo: 'inm',
    assetClass: null,
    tipoFicha: null,
  }),
]

const PATRIMONIO = 1_000_000

/** Los pisos que armaria el puente: lo conservado y la parte no vendida. */
const PISOS: readonly Piso[] = [
  { clase: 'cash', montoUsd: 300_000, origen: 'conservado', etiqueta: 'Banco A plazo fijo' },
  { clase: 'fijo', montoUsd: 150_000, origen: 'conservado', etiqueta: 'Fondo mixto' },
  { clase: 'variable', montoUsd: 100_000, origen: 'conservado', etiqueta: 'Acciones sueltas' },
]

function entradaPlan(pisos: readonly Piso[]): EntradaPlan {
  return {
    perfil: 'Moderado',
    patrimonioTotalUsd: PATRIMONIO,
    benchmark: BENCHMARK,
    pesos: PESOS,
    pisos,
    ticketMinimoUsd: 20_000,
    fallbacks: { fijo: 'ETF Fijo A', variable: 'ETF Variable A' },
  }
}

const CATALOGO: ReadonlyMap<string, DatosProducto> = new Map([
  [
    'ETF Fijo A',
    { retMin: 0.04, retMax: 0.06, distMin: 0.02, distMax: 0.03, distFrecuencia: 'Trimestral', moneda: 'USD' },
  ],
])

function propuesta(posiciones: readonly PosicionPropuesta[] = POSICIONES) {
  const plan: Plan = generarPlan(entradaPlan(PISOS))
  const modeloPuro: Plan = generarPlan(entradaPlan([]))

  return armarPropuesta({
    cliente: { nombre: 'Cliente de prueba', perfil: 'Moderado', mandato: null },
    posiciones,
    plan,
    modeloPuro,
    pisos: PISOS,
    benchmark: BENCHMARK,
    parametros: { ticketMinimoUsd: 20_000, colchonLiquidezUsd: 0, fxPenUsd: 3.4 },
    catalogo: CATALOGO,
  })
}

describe('el colchón de liquidez cuadra el blotter', () => {
  /**
   * Las ventas financian las compras MÁS lo que queda clavado por restricción.
   * Sin contar el colchón como destino, `dineroNuevo = ventas − colchón` y
   * toda propuesta con colchón salía marcada como imposible de publicar.
   */
  const conColchon = (colchonLiquidezUsd: number) => {
    const pisos: Piso[] = [
      ...PISOS,
      ...(colchonLiquidezUsd > 0
        ? [
            {
              clase: 'cash' as const,
              montoUsd: colchonLiquidezUsd,
              origen: 'restriccion' as const,
              etiqueta: ETIQUETA_COLCHON,
            },
          ]
        : []),
    ]

    return armarPropuesta({
      cliente: { nombre: 'Cliente de prueba', perfil: 'Moderado', mandato: null },
      posiciones: POSICIONES,
      plan: generarPlan(entradaPlan(pisos)),
      modeloPuro: generarPlan(entradaPlan([])),
      pisos,
      benchmark: BENCHMARK,
      parametros: { ticketMinimoUsd: 20_000, colchonLiquidezUsd, fxPenUsd: 3.4 },
      catalogo: CATALOGO,
    })
  }

  it('cierra en cero y no avisa nada', () => {
    const p = conColchon(50_000)

    expect(Math.abs(p.seccion7.cuadreUsd)).toBeLessThan(TOLERANCIA_CUADRE)
    expect(p.avisos.some((aviso) => aviso.includes('no cuadran'))).toBe(false)
  })

  it('muestra el colchón como destino del dinero, no lo esconde', () => {
    const p = conColchon(50_000)
    const linea = p.seccion7.compras.find((c) => c.instrumento === ETIQUETA_COLCHON)

    expect(linea?.usd).toBe(50_000)
    expect(linea?.clase).toBe('cash')
  })

  it('sin colchón el blotter no cambia', () => {
    expect(conColchon(0).seccion7.compras).toStrictEqual(propuesta().seccion7.compras)
  })
})

describe('sección 1, foto actual', () => {
  it('deja fuera el uso propio y suma el patrimonio financiero', () => {
    const { seccion1 } = propuesta()

    expect(seccion1.filas).toHaveLength(4)
    expect(seccion1.filas.map((fila) => fila.orden)).toEqual([1, 2, 3, 4])
    expect(seccion1.totalUsd).toBe(PATRIMONIO)
  })

  it('muestra el monto a vender solo en la venta parcial', () => {
    const { seccion1 } = propuesta()

    expect(seccion1.filas.map((fila) => fila.montoVentaParcialUsd)).toEqual([0, 0, 250_000, 0])
  })
})

describe('sección 2, uso propio', () => {
  it('separa el valor total del inmueble del que le toca al cliente', () => {
    const { seccion2 } = propuesta()

    expect(seccion2.filas).toHaveLength(1)
    expect(seccion2.filas[0]?.valorTotalUsd).toBe(300_000)
    expect(seccion2.filas[0]?.valorTuyoUsd).toBe(150_000)
    expect(seccion2.totalUsd).toBe(150_000)
  })
})

describe('sección 3, distribución por asset class', () => {
  it('cuadra contra el patrimonio financiero', () => {
    const { seccion3 } = propuesta()
    const suma = seccion3.filas.reduce((acc, fila) => acc + fila.valorUsd, 0)

    expect(suma).toBeCloseTo(PATRIMONIO, 6)
    expect(seccion3.totalUsd).toBe(PATRIMONIO)
    expect(seccion3.filas.reduce((acc, fila) => acc + fila.share, 0)).toBeCloseTo(1, 6)
  })

  it('parte cada clase entre lo que se queda y lo que se va', () => {
    const { seccion3 } = propuesta()

    for (const fila of seccion3.filas) {
      expect(fila.seConservaUsd + fila.seVendeUsd).toBeCloseTo(fila.valorUsd, 6)
    }

    const bonos = seccion3.filas.find((fila) => fila.assetClass === 'Bonos Públicos')
    expect(bonos?.seVendeUsd).toBe(250_000)
    expect(bonos?.seConservaUsd).toBe(150_000)
  })

  it('sale de las clases presentes, no de una lista fija', () => {
    const { seccion3 } = propuesta()

    expect(seccion3.filas.map((fila) => fila.assetClass)).toEqual([
      'Money Market',
      'Bonos Públicos',
      'Acciones Públicas',
    ])
  })

  it('agrega en cero las clases del catálogo que nadie tiene', () => {
    const plan = generarPlan(entradaPlan(PISOS))
    const resultado = armarPropuesta({
      cliente: { nombre: 'Cliente de prueba', perfil: 'Moderado', mandato: null },
      posiciones: POSICIONES,
      plan,
      modeloPuro: generarPlan(entradaPlan([])),
      pisos: PISOS,
      benchmark: BENCHMARK,
      parametros: { ticketMinimoUsd: 20_000, colchonLiquidezUsd: 0, fxPenUsd: 3.4 },
      assetClassCatalogo: ['Money Market', 'Notas estructuradas'],
    })

    const notas = resultado.seccion3.filas.find((fila) => fila.assetClass === 'Notas estructuradas')
    expect(notas?.valorUsd).toBe(0)
    expect(resultado.seccion3.totalUsd).toBe(PATRIMONIO)
  })

  it('no esconde una posición sin clase', () => {
    const sinClase = POSICIONES.map((p) =>
      p.orden === 4 ? { ...p, assetClass: null } : p,
    )
    const { seccion3 } = propuesta(sinClase)

    expect(seccion3.filas.find((fila) => fila.assetClass === 'Sin clasificar')?.valorUsd).toBe(
      100_000,
    )
  })
})

describe('sección 4, resumen de decisiones', () => {
  it('es una partición: las cinco categorías dan el patrimonio y el 100%', () => {
    const { seccion4 } = propuesta()

    expect(seccion4.filas.reduce((acc, fila) => acc + fila.valorUsd, 0)).toBeCloseTo(PATRIMONIO, 6)
    expect(seccion4.filas.reduce((acc, fila) => acc + fila.share, 0)).toBeCloseTo(1, 6)
  })

  it('parte la venta parcial en las dos mitades', () => {
    const { seccion4 } = propuesta()
    const de = (categoria: string) =>
      seccion4.filas.find((fila) => fila.categoria === categoria)?.valorUsd

    expect(de('conservar')).toBe(300_000)
    expect(de('venta_total')).toBe(200_000)
    expect(de('parcial_vende')).toBe(250_000)
    expect(de('parcial_conserva')).toBe(150_000)
    expect(de('sin_marcar')).toBe(100_000)
  })

  it('no deja que una venta parcial imposible saque más de lo que hay', () => {
    const excedida = POSICIONES.map((p) =>
      p.orden === 3 ? { ...p, montoVentaParcial: 900_000 } : p,
    )
    const { seccion4 } = propuesta(excedida)

    expect(seccion4.filas.find((f) => f.categoria === 'parcial_vende')?.valorUsd).toBe(400_000)
    expect(seccion4.filas.find((f) => f.categoria === 'parcial_conserva')?.valorUsd).toBe(0)
    expect(seccion4.filas.reduce((acc, fila) => acc + fila.valorUsd, 0)).toBeCloseTo(PATRIMONIO, 6)
  })
})

describe('sección 5, exposición', () => {
  it('reparte el patrimonio por moneda y por plaza', () => {
    const { seccion5 } = propuesta()

    expect(seccion5.porMoneda).toEqual([
      { etiqueta: 'PEN', valorUsd: 200_000, share: 0.2 },
      { etiqueta: 'USD', valorUsd: 800_000, share: 0.8 },
    ])
    expect(seccion5.porPlaza).toEqual([
      { etiqueta: 'Perú', valorUsd: 600_000, share: 0.6 },
      { etiqueta: 'Offshore', valorUsd: 400_000, share: 0.4 },
    ])
  })
})

describe('sección 6, portafolio objetivo', () => {
  it('cuadra el objetivo contra el patrimonio financiero', () => {
    const { seccion6 } = propuesta()

    expect(seccion6.totalUsd).toBeCloseTo(PATRIMONIO, 4)
    expect(Math.abs(seccion6.cuadreUsd)).toBeLessThan(TOLERANCIA_CUADRE)
  })

  it('marca como conservada la línea que vino de un piso', () => {
    const { seccion6 } = propuesta()
    const lineas = seccion6.grupos.flatMap((grupo) => grupo.lineas)

    expect(lineas.find((linea) => linea.instrumento === 'Banco A plazo fijo')?.conservada).toBe(true)
    expect(lineas.find((linea) => linea.instrumento === 'ETF Fijo A')?.conservada).toBe(false)
  })

  it('trae el retorno del catálogo y deja en null lo que no está', () => {
    const { seccion6 } = propuesta()
    const lineas = seccion6.grupos.flatMap((grupo) => grupo.lineas)

    const conCatalogo = lineas.find((linea) => linea.instrumento === 'ETF Fijo A')
    expect(conCatalogo?.retornoTotal).toEqual({ min: 0.04, max: 0.06 })
    expect(conCatalogo?.distribucionAnualUsd?.min).toBeCloseTo((conCatalogo?.usd ?? 0) * 0.02, 6)

    const sinCatalogo = lineas.find((linea) => linea.instrumento === 'ETF Variable A')
    expect(sinCatalogo?.retornoTotal).toBeNull()
    expect(sinCatalogo?.distribucionAnualUsd).toBeNull()
    expect(sinCatalogo?.moneda).toBeNull()
  })

  it('compara contra el modelo puro y explica el desvío en puntos', () => {
    const { seccion6 } = propuesta()
    const clases = seccion6.comparativo.filter((fila) => fila.nivel === 'clase')

    // Cash arrastra un piso de 300k contra un modelo de 100k: queda muy por
    // encima, y esa es exactamente la fila que el asesor tiene que poder
    // señalar para explicar el desvío.
    const cash = clases.find((fila) => fila.clase === 'cash')
    expect(cash?.modeloUsd).toBeCloseTo(100_000, 2)
    expect(cash?.recomendadoUsd).toBeCloseTo(300_000, 2)
    expect(cash?.difPp).toBeCloseTo(20, 1)
  })

  it('reparte el desvío: lo que sube una clase lo baja el resto', () => {
    const { seccion6 } = propuesta()
    const clases = seccion6.comparativo.filter((fila) => fila.nivel === 'clase')

    expect(clases.reduce((acc, fila) => acc + fila.difPp, 0)).toBeCloseTo(0, 6)
  })
})

describe('sección 7, blotter', () => {
  it('cuadra las compras contra las ventas', () => {
    const { seccion7 } = propuesta()

    expect(Math.abs(seccion7.cuadreUsd)).toBeLessThan(TOLERANCIA_CUADRE)
    expect(seccion7.totalVentasUsd).toBeCloseTo(450_000, 4)
    expect(seccion7.totalComprasUsd).toBeCloseTo(450_000, 4)
  })

  it('lista la venta total entera y la parcial por su monto', () => {
    const { seccion7 } = propuesta()

    expect(seccion7.ventas).toEqual([
      { instrumento: 'Fondo mixto', accion: 'Venta parcial', usd: 250_000 },
      { instrumento: 'Banco B cuenta', accion: 'Venta total', usd: 200_000 },
    ])
  })

  it('no compra lo que ya está conservado', () => {
    const { seccion7 } = propuesta()

    expect(seccion7.compras.map((compra) => compra.instrumento)).not.toContain('Banco A plazo fijo')
  })

  it('avisa cuando el blotter no cuadra', () => {
    // Un plan cuyo dinero nuevo no coincide con lo que sale del patrimonio.
    const soloConservar = POSICIONES.map((p) =>
      p.esInvertible ? { ...p, cta: 'conservar' as const, montoVentaParcial: 0 } : p,
    )
    const { seccion7, avisos } = propuesta(soloConservar)

    expect(seccion7.totalVentasUsd).toBe(0)
    expect(avisos.some((aviso) => aviso.includes('no cuadran'))).toBe(true)
  })
})

describe('avisos', () => {
  it('arrastra los del motor', () => {
    const { avisos } = propuesta()
    const plan = generarPlan(entradaPlan(PISOS))

    for (const aviso of plan.avisos) expect(avisos).toContain(aviso)
  })
})

describe('clases del reparto', () => {
  it('agrupa las líneas en el orden de la hoja Data', () => {
    const { seccion6 } = propuesta()
    const orden: readonly ClaseModelo[] = [
      'inm',
      'fijo',
      'variable',
      'privados',
      'club',
      'otros',
      'cash',
    ]
    const presentes = seccion6.grupos.map((grupo) => grupo.clase)

    expect(presentes).toEqual(orden.filter((clase) => presentes.includes(clase)))
  })
})
