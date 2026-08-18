import { describe, expect, it } from 'vitest'

import type { LineaPlan } from '../../domain/tipos.js'
import { prorratearResiduales } from '../residuales.js'

const linea = (
  instrumento: string,
  usd: number,
  residuales?: 'exenta' | 'reserva',
): LineaPlan => ({
  instrumento,
  clase: 'fijo',
  usd,
  ...(residuales === undefined ? {} : { residuales }),
})

const monto = (lineas: readonly LineaPlan[], instrumento: string) =>
  lineas.find((l) => l.instrumento === instrumento)?.usd ?? 0

describe('prorratearResiduales', () => {
  it('elimina la linea bajo el ticket y la reparte a prorrata', () => {
    const r = prorratearResiduales(
      [linea('grande', 60_000), linea('mediana', 30_000), linea('chica', 9_000)],
      20_000,
    )

    expect(r).toHaveLength(2)
    // 9,000 sobre una base de 90,000: cada una crece un 10%.
    expect(monto(r, 'grande')).toBeCloseTo(66_000, 6)
    expect(monto(r, 'mediana')).toBeCloseTo(33_000, 6)
  })

  it('conserva el total', () => {
    const lineas = [linea('a', 55_000), linea('b', 21_000), linea('c', 3_100), linea('d', 900)]
    const r = prorratearResiduales(lineas, 20_000)
    expect(r.reduce((acc, l) => acc + l.usd, 0)).toBeCloseTo(80_000, 6)
  })

  it('no toca nada si todas llegan al ticket', () => {
    const lineas = [linea('a', 55_000), linea('b', 21_000)]
    expect(prorratearResiduales(lineas, 20_000)).toStrictEqual(lineas)
  })

  it('deja pasar la linea que esta justo en el ticket', () => {
    const r = prorratearResiduales([linea('a', 55_000), linea('b', 20_000)], 20_000)
    expect(r).toHaveLength(2)
  })

  describe('exenciones', () => {
    it('no poda una linea exenta aunque no llegue al ticket', () => {
      const r = prorratearResiduales(
        [linea('grande', 60_000), linea('cash', 9_000, 'exenta')],
        20_000,
      )
      expect(monto(r, 'cash')).toBe(9_000)
      expect(monto(r, 'grande')).toBe(60_000)
    })

    it('el cash no engorda con los restos de los fondos', () => {
      const r = prorratearResiduales(
        [linea('grande', 60_000), linea('cash', 40_000, 'exenta'), linea('chica', 6_000)],
        20_000,
      )
      expect(monto(r, 'cash')).toBe(40_000)
      expect(monto(r, 'grande')).toBeCloseTo(66_000, 6)
    })
  })

  describe('privados', () => {
    it('no ceden su monto aunque no lleguen al ticket', () => {
      const r = prorratearResiduales(
        [linea('grande', 60_000), linea('club', 9_000, 'reserva')],
        20_000,
      )
      expect(monto(r, 'club')).toBe(9_000)
    })

    it('no reciben mientras haya otra linea que pueda', () => {
      const r = prorratearResiduales(
        [linea('grande', 60_000), linea('privado', 40_000, 'reserva'), linea('chica', 6_000)],
        20_000,
      )
      expect(monto(r, 'privado')).toBe(40_000)
      expect(monto(r, 'grande')).toBeCloseTo(66_000, 6)
    })

    it('reciben cuando no queda nadie mas: es el segundo intento de la macro', () => {
      const r = prorratearResiduales(
        [linea('privado', 40_000, 'reserva'), linea('chica', 6_000)],
        20_000,
      )
      expect(monto(r, 'privado')).toBeCloseTo(46_000, 6)
      expect(r).toHaveLength(1)
    })
  })

  describe('bordes', () => {
    it('no poda si no queda quien reciba: el dinero no puede desaparecer', () => {
      const lineas = [linea('chica', 6_000), linea('mas chica', 4_000)]
      const r = prorratearResiduales(lineas, 20_000)
      expect(r).toStrictEqual(lineas)
      expect(r.reduce((acc, l) => acc + l.usd, 0)).toBe(10_000)
    })

    it('ignora las lineas en cero', () => {
      const r = prorratearResiduales([linea('a', 60_000), linea('vacia', 0)], 20_000)
      expect(monto(r, 'a')).toBe(60_000)
      expect(r).toHaveLength(2)
    })

    it('rechaza un ticket minimo invalido', () => {
      expect(() => prorratearResiduales([linea('a', 1)], 0)).toThrow(/ticket minimo/i)
    })

    it('es puro', () => {
      const lineas = [linea('a', 60_000), linea('b', 5_000)]
      expect(prorratearResiduales(lineas, 20_000)).toStrictEqual(
        prorratearResiduales(lineas, 20_000),
      )
      expect(lineas[1]?.usd).toBe(5_000)
    })
  })
})
