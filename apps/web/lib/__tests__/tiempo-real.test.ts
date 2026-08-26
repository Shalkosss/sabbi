import { describe, expect, it } from 'vitest'

import { tonoDe } from '../tiempo-real'

/**
 * El color de cada asesor en la ficha compartida.
 *
 * Lo que hay que fijar no es qué color le toca a quién, sino que sea siempre
 * el mismo: «el cursor verde es Marco» solo sirve de algo si el verde es
 * Marco en las dos pantallas, hoy y la semana que viene. Por eso sale del id
 * y no de un contador ni del orden de llegada.
 */
describe('tonoDe', () => {
  const id = '9f2c1e40-1c2d-4f6a-9b77-1e2b3c4d5e6f'

  it('el mismo id da siempre el mismo tono', () => {
    expect(tonoDe(id)).toBe(tonoDe(id))
  })

  it('dos asesores distintos no comparten tono', () => {
    expect(tonoDe(id)).not.toBe(tonoDe('0a1b2c3d-4e5f-6a7b-8c9d-0e1f2a3b4c5d'))
  })

  it('siempre cae dentro de la rueda de color', () => {
    for (const candidato of [id, '', 'a', 'Marco', '0'.repeat(200)]) {
      const tono = tonoDe(candidato)
      expect(tono, candidato).toBeGreaterThanOrEqual(0)
      expect(tono, candidato).toBeLessThan(360)
      expect(Number.isInteger(tono), candidato).toBe(true)
    }
  })
})
