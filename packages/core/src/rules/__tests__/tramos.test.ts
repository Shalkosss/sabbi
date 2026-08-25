import { describe, expect, it } from 'vitest'

import { repartirPorTramos } from '../tramos.js'

/**
 * La cascada por tramos de Privados y Club Deals.
 *
 * Es la diferencia mas grande entre la v8 y la v4, y la que mas facil se
 * equivoca al leerla: los dos minimos no son compuertas independientes, son
 * las fronteras de tres tramos con comportamientos distintos. Cada caso fija
 * uno de los tres, mas los dos bordes exactos.
 */

const OPC = { minOportunidadUsd: 25_000, minClubUsd: 5_000 }

/** El monto siempre se conserva: lo que entra sale, en un lado o en otro. */
const total = (r: ReturnType<typeof repartirPorTramos>) =>
  r.clubUsd + r.privadosUsd + r.aPublicosUsd

describe('repartirPorTramos', () => {
  it('sin monto no decide nada', () => {
    expect(repartirPorTramos(0, 0, OPC)).toStrictEqual({
      clubUsd: 0,
      privadosUsd: 0,
      aPublicosUsd: 0,
      tramo: 'sin_monto',
    })
  })

  it('tramo 1: debajo del minimo del fondo, todo al club', () => {
    // 20,000 no dan para el Fondo Oportunidad pero si para el club.
    const r = repartirPorTramos(16_000, 4_000, OPC)

    expect(r.tramo).toBe('solo_club')
    expect(r.clubUsd).toBe(20_000)
    expect(r.privadosUsd).toBe(0)
    expect(total(r)).toBe(20_000)
  })

  it('tramo 1: si tampoco alcanza para el club, vuelve a publicos', () => {
    const r = repartirPorTramos(3_000, 1_000, OPC)

    expect(r.tramo).toBe('sin_club')
    expect(r.aPublicosUsd).toBe(4_000)
    expect(r.clubUsd).toBe(0)
    expect(r.privadosUsd).toBe(0)
  })

  it('tramo 2: alcanza para el fondo pero no para los dos, todo al fondo', () => {
    // 28,000 estan entre 25,000 y 30,000: partirlo dejaria al club sin ticket.
    const r = repartirPorTramos(24_000, 4_000, OPC)

    expect(r.tramo).toBe('solo_fondo')
    expect(r.privadosUsd).toBe(28_000)
    expect(r.clubUsd).toBe(0)
  })

  it('tramo 3: conviven, cada uno con su minimo y el sobrante por peso', () => {
    // 100,000, de los que el club traia 20,000 de benchmark: peso 0.2.
    // Sobrante = 100,000 - 30,000 = 70,000.
    //   club  = 5,000  + 70,000 * 0.2 = 19,000
    //   fondo = 25,000 + 70,000 * 0.8 = 81,000
    const r = repartirPorTramos(80_000, 20_000, OPC)

    expect(r.tramo).toBe('ambos')
    expect(r.clubUsd).toBeCloseTo(19_000, 6)
    expect(r.privadosUsd).toBeCloseTo(81_000, 6)
    expect(total(r)).toBeCloseTo(100_000, 6)
  })

  it('los dos minimos se respetan aunque el peso del club sea minusculo', () => {
    const r = repartirPorTramos(199_000, 1_000, OPC)

    expect(r.clubUsd).toBeGreaterThanOrEqual(5_000)
    expect(r.privadosUsd).toBeGreaterThanOrEqual(25_000)
    expect(total(r)).toBeCloseTo(200_000, 6)
  })

  it('sin club en el benchmark, el fondo se lo lleva todo', () => {
    const r = repartirPorTramos(60_000, 0, OPC)

    expect(r.tramo).toBe('solo_fondo')
    expect(r.privadosUsd).toBe(60_000)
    expect(r.clubUsd).toBe(0)
  })

  it('sin club en el benchmark y sin llegar al fondo, vuelve a publicos', () => {
    // Sin club no hay a donde mandarlo: el club no es un destino de este
    // perfil, y el fondo no existe con este monto.
    const r = repartirPorTramos(10_000, 0, OPC)

    expect(r.tramo).toBe('sin_club')
    expect(r.aPublicosUsd).toBe(10_000)
  })

  it('el borde de los 30,000 entra al tramo de los dos', () => {
    const r = repartirPorTramos(27_000, 3_000, OPC)

    expect(r.tramo).toBe('ambos')
    expect(r.clubUsd).toBeCloseTo(5_000, 6)
    expect(r.privadosUsd).toBeCloseTo(25_000, 6)
  })

  it('el borde de los 25,000 entra al tramo del fondo solo', () => {
    const r = repartirPorTramos(23_000, 2_000, OPC)

    expect(r.tramo).toBe('solo_fondo')
    expect(r.privadosUsd).toBe(25_000)
  })

  it('con los minimos en cero se reparte solo por peso', () => {
    const r = repartirPorTramos(70_000, 30_000, { minOportunidadUsd: 0, minClubUsd: 0 })

    expect(r.tramo).toBe('ambos')
    expect(r.clubUsd).toBeCloseTo(30_000, 6)
    expect(r.privadosUsd).toBeCloseTo(70_000, 6)
  })
})
