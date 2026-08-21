import { describe, expect, it } from 'vitest'

import type { Benchmark, DestinoVenta, Perfil } from '../domain/tipos.js'
import { armarEntradaPlan, evaluarRevision } from '../entrada.js'
import type { PosicionRevisada } from '../entrada.js'

/**
 * La venta condicionada: el dinero que ya tiene dueño antes de venderse.
 *
 * El caso es literal y viene de la mesa: el cliente vende un inmueble y ya
 * decidio que la mitad va al Fondo Estrategico. Tratar eso como una venta
 * total normal seria repartir esa mitad entre las siete clases del benchmark,
 * y la decision del cliente desapareceria dentro del prorrateo sin que nadie
 * lo note — que es la peor forma de perder una instruccion.
 *
 * Lo que se prueba aca no es que el motor acepte el campo, sino que el dinero
 * llegue efectivamente a donde el cliente dijo, y que un reparto que no cierra
 * no se calcule a medias.
 */

const PERFIL: Perfil = 'Moderado'

const BENCHMARK: Benchmark = {
  inm: 0,
  fijo: 0.3,
  variable: 0.3,
  privados: 0.2,
  club: 0.1,
  otros: 0.1,
  cash: 0,
}

const PESOS = {
  fijo: { 'iShares $ Corporate Bond': 0.6, 'iShares $ Treasury 1-3yr': 0.4 },
  variable: { 'iShares Core S&P 500': 0.6, EIMI: 0.4 },
  otros: { 'BTC (IBIT)': 0.8, Oro: 0.2 },
}

const destino = (parcial: Partial<DestinoVenta>): DestinoVenta => ({
  id: 'd1',
  pct: 0.5,
  clase: 'club',
  productoId: null,
  nombre: 'Sabbi Fondo Estratégico',
  ...parcial,
})

const inmueble = (destinos: readonly DestinoVenta[]): PosicionRevisada => ({
  institucionProducto: 'Departamento en Miraflores',
  origen: 'inmueble',
  claseModelo: 'inm',
  productoId: null,
  valorUsd: 400_000,
  esInvertible: true,
  cta: 'venta_condicionada',
  montoVentaParcial: 0,
  destinos,
})

const decisiones = {
  perfil: PERFIL,
  benchmark: BENCHMARK,
  pesos: PESOS,
  ticketMinimoUsd: 20_000,
  fallbacks: { fijo: 'Flip - Panda Zen', variable: 'Flip - Cobra achorada' },
}

/** El objetivo de una clase en el plan derivado. */
const objetivoDe = (posiciones: readonly PosicionRevisada[], clase: string): number => {
  const derivacion = armarEntradaPlan(posiciones, decisiones)
  if (!derivacion.ok) throw new Error(derivacion.bloqueos.map((b) => b.mensaje).join(' · '))
  return derivacion.entrada.pisos
    .filter((piso) => piso.clase === clase)
    .reduce((total, piso) => total + piso.montoUsd, 0)
}

describe('venta condicionada', () => {
  it('clava en su clase la parte que el cliente ya decidio', () => {
    // La mitad de 400,000 al Fondo Estrategico, que es Club Deals.
    const posiciones = [
      inmueble([
        destino({ id: 'a', pct: 0.5, clase: 'club' }),
        destino({ id: 'b', pct: 0.5, clase: 'variable', nombre: 'Renta Variable' }),
      ]),
    ]

    expect(objetivoDe(posiciones, 'club')).toBeCloseTo(200_000, 6)
    expect(objetivoDe(posiciones, 'variable')).toBeCloseTo(200_000, 6)
  })

  it('reparte entre varios destinos, no solo dos', () => {
    const posiciones = [
      inmueble([
        destino({ id: 'a', pct: 0.5, clase: 'club' }),
        destino({ id: 'b', pct: 0.3, clase: 'fijo', nombre: 'Renta Fija' }),
        destino({ id: 'c', pct: 0.2, clase: 'otros', nombre: 'BTC' }),
      ]),
    ]

    expect(objetivoDe(posiciones, 'club')).toBeCloseTo(200_000, 6)
    expect(objetivoDe(posiciones, 'fijo')).toBeCloseTo(120_000, 6)
    expect(objetivoDe(posiciones, 'otros')).toBeCloseTo(80_000, 6)
  })

  it('se vende entera: no conserva nada y libera todo el dinero', () => {
    const { resumen } = evaluarRevision([
      inmueble([
        destino({ id: 'a', pct: 0.5 }),
        destino({ id: 'b', pct: 0.5, clase: 'fijo' }),
      ]),
    ])

    expect(resumen.conservadoUsd).toBe(0)
    expect(resumen.dineroDisponibleUsd).toBe(400_000)
    // Y lo clavado se cuenta como restringido: es dinero que el benchmark ya
    // no puede repartir, igual que una restriccion escrita a mano.
    expect(resumen.restringidoUsd).toBeCloseTo(400_000, 6)
  })

  it('no se calcula si el reparto no suma 100%', () => {
    const { bloqueos } = evaluarRevision([
      inmueble([destino({ id: 'a', pct: 0.5 }), destino({ id: 'b', pct: 0.2, clase: 'fijo' })]),
    ])

    const destinoInvalido = bloqueos.find((b) => b.codigo === 'destino_invalido')
    expect(destinoInvalido).toBeDefined()
    expect(destinoInvalido?.mensaje).toContain('70.0%')
    // Y dice de que posicion habla: con quince filas, «un reparto» no alcanza.
    expect(destinoInvalido?.mensaje).toContain('Miraflores')
  })

  it('no se calcula si no tiene ningun destino', () => {
    const { bloqueos } = evaluarRevision([inmueble([])])

    expect(bloqueos.some((b) => b.codigo === 'destino_invalido')).toBe(true)
  })

  it('un destino en cero no clava nada ni rompe el reparto', () => {
    const posiciones = [
      inmueble([
        destino({ id: 'a', pct: 1, clase: 'club' }),
        destino({ id: 'b', pct: 0, clase: 'fijo', nombre: 'Renta Fija' }),
      ]),
    ]

    expect(objetivoDe(posiciones, 'club')).toBeCloseTo(400_000, 6)
    expect(objetivoDe(posiciones, 'fijo')).toBe(0)
  })

  it('no toca a las posiciones que se deciden de otra manera', () => {
    const conservada: PosicionRevisada = {
      institucionProducto: 'Depósito a plazo',
      origen: 'financiero',
      claseModelo: 'cash',
      productoId: null,
      valorUsd: 100_000,
      esInvertible: true,
      cta: 'conservar',
      montoVentaParcial: 0,
    }

    const { resumen } = evaluarRevision([
      conservada,
      inmueble([destino({ id: 'a', pct: 1, clase: 'club' })]),
    ])

    expect(resumen.conservadoUsd).toBe(100_000)
    expect(resumen.dineroDisponibleUsd).toBe(400_000)
  })
})
