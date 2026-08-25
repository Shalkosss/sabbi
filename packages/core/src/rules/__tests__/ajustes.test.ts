import { describe, expect, it } from 'vitest'

import type { AjusteClase, Benchmark, ClaseModelo, Piso } from '../../domain/tipos.js'
import { repartirPorClase } from '../reparto.js'

/**
 * Los ajustes del asesor sobre el reparto.
 *
 * Un piso solo empuja hacia arriba. Un ajuste manda en las dos direcciones, y
 * lo que la clase ajustada deja de recibir se prorratea entre las demas por el
 * mismo camino que el solver ya usaba para el dinero de una clase cerrada.
 */

/** Pesos redondos: el prorrateo se lee a ojo y una regresion salta sola. */
const PAREJO: Benchmark = {
  inm: 0.2,
  fijo: 0.2,
  variable: 0.2,
  privados: 0.2,
  club: 0.1,
  otros: 0.05,
  cash: 0.05,
}

const PATRIMONIO = 350_000

const objetivo = (
  benchmark: Benchmark,
  ajustes: readonly AjusteClase[],
  pisos: readonly Piso[] = [],
) => {
  // Sin blindaje: estos casos son sobre la mecanica del ajuste, y con Cash
  // fuera del prorrateo las cuentas dejan de leerse a ojo. El blindaje tiene
  // su propio bloque mas abajo.
  const resultado = repartirPorClase(benchmark, PATRIMONIO, pisos, ajustes, new Set())
  return {
    resultado,
    de: (clase: ClaseModelo) =>
      resultado.porClase.find((c) => c.clase === clase)?.objetivoUsd ?? 0,
    total: resultado.porClase.reduce((acc, c) => acc + c.objetivoUsd, 0),
  }
}

describe('ajustes por clase', () => {
  describe('fijar por debajo de lo que el benchmark daria', () => {
    // El caso que pidio la mesa: Inmobiliario Directo tocaba 70,000 y se clava
    // en 60,000. Los 10,000 que sobran se reparten entre las otras seis.
    const sinAjuste = objetivo(PAREJO, [])
    const conAjuste = objetivo(PAREJO, [{ clase: 'inm', modo: 'fijar', montoUsd: 60_000 }])

    it('el modelo solo le daba 70,000', () => {
      expect(sinAjuste.de('inm')).toBeCloseTo(70_000, 2)
    })

    it('la clase queda exactamente en lo pedido', () => {
      expect(conAjuste.de('inm')).toBeCloseTo(60_000, 2)
    })

    it('el resto se prorratea entre las demas, en proporcion a su peso', () => {
      // 290,000 repartidos sobre 0.8 de peso: la base sube de 350,000 a 362,500.
      expect(conAjuste.resultado.baseRedistribucion).toBeCloseTo(362_500, 4)
      expect(conAjuste.de('fijo')).toBeCloseTo(72_500, 2)
      expect(conAjuste.de('variable')).toBeCloseTo(72_500, 2)
      expect(conAjuste.de('club')).toBeCloseTo(36_250, 2)
    })

    it('el patrimonio sigue cuadrando', () => {
      expect(conAjuste.total).toBeCloseTo(PATRIMONIO, 2)
    })

    it('marca la clase como fijada, no como cerrada por piso', () => {
      const inm = conAjuste.resultado.porClase.find((c) => c.clase === 'inm')!
      expect(inm.fijada).toBe(true)
      expect(inm.pisoUsd).toBe(0)
    })
  })

  describe('fijar por encima de lo que el benchmark daria', () => {
    const r = objetivo(PAREJO, [{ clase: 'cash', modo: 'fijar', montoUsd: 100_000 }])

    it('la clase sube hasta lo pedido', () => {
      expect(r.de('cash')).toBeCloseTo(100_000, 2)
    })

    it('las demas se achican para pagarlo', () => {
      expect(r.de('fijo')).toBeCloseTo(52_631.578947, 4)
      expect(r.total).toBeCloseTo(PATRIMONIO, 2)
    })
  })

  describe('excluir una clase', () => {
    const r = objetivo(PAREJO, [{ clase: 'inm', modo: 'excluir', montoUsd: 0 }])

    it('la deja en cero', () => {
      expect(r.de('inm')).toBe(0)
    })

    it('reparte su peso entre las demas sin perder un dolar', () => {
      expect(r.de('fijo')).toBeCloseTo(87_500, 2)
      expect(r.total).toBeCloseTo(PATRIMONIO, 2)
    })
  })

  describe('el piso manda sobre el ajuste', () => {
    // Fijar por debajo de lo que el cliente conserva pediria vender, y vender
    // se marca en la ficha. El motor clava en el piso y lo deja escrito.
    const PISOS: Piso[] = [
      { clase: 'inm', montoUsd: 80_000, origen: 'conservado', etiqueta: 'Casa de playa' },
    ]
    const r = objetivo(PAREJO, [{ clase: 'inm', modo: 'fijar', montoUsd: 60_000 }], PISOS)

    it('no baja del piso', () => {
      expect(r.de('inm')).toBeCloseTo(80_000, 2)
    })

    it('devuelve lo pedido y lo aplicado, para poder decirlo', () => {
      expect(r.resultado.ajustes).toEqual([
        { clase: 'inm', modo: 'fijar', pedidoUsd: 60_000, aplicadoUsd: 80_000, pisoUsd: 80_000 },
      ])
    })

    it('excluir una clase con posiciones conservadas tampoco la vacia', () => {
      const excluida = objetivo(PAREJO, [{ clase: 'inm', modo: 'excluir', montoUsd: 0 }], PISOS)
      expect(excluida.de('inm')).toBeCloseTo(80_000, 2)
      expect(excluida.total).toBeCloseTo(PATRIMONIO, 2)
    })
  })

  describe('cuentas imposibles', () => {
    it('rechaza fijar mas dinero del que hay', () => {
      expect(() =>
        repartirPorClase(PAREJO, PATRIMONIO, [], [
          { clase: 'inm', modo: 'fijar', montoUsd: 400_000 },
        ]),
      ).toThrow(/superan el patrimonio/)
    })

    it('rechaza dejar dinero sin ninguna clase abierta donde ponerlo', () => {
      const todas: AjusteClase[] = (
        ['inm', 'fijo', 'variable', 'privados', 'club', 'otros', 'cash'] as const
      ).map((clase) => ({ clase, modo: 'fijar', montoUsd: 10_000 }))

      expect(() => repartirPorClase(PAREJO, PATRIMONIO, [], todas)).toThrow(
        /sin ninguna clase abierta/,
      )
    })

    it('dos ajustes sobre la misma clase: manda el ultimo', () => {
      const r = objetivo(PAREJO, [
        { clase: 'cash', modo: 'fijar', montoUsd: 10_000 },
        { clase: 'cash', modo: 'fijar', montoUsd: 20_000 },
      ])
      expect(r.de('cash')).toBeCloseTo(20_000, 2)
    })
  })

  describe('sin ajustes', () => {
    it('no cambia nada de lo que el motor ya hacia', () => {
      const con = repartirPorClase(PAREJO, PATRIMONIO, [], [])
      const sin = repartirPorClase(PAREJO, PATRIMONIO, [])
      expect(con.porClase).toStrictEqual(sin.porClase)
      expect(con.ajustes).toEqual([])
      expect(con.porClase.every((c) => !c.fijada)).toBe(true)
    })
  })
})

/**
 * Cash blindado.
 *
 * Es la unica excepcion al reparto proporcional y viene de la macro v4:
 * conserva su peso de benchmark y no entra en la base del prorrateo, asi que
 * una posicion conservada en otra clase no le puede quitar liquidez al
 * cliente. Sin esto, un cliente con mucho inmobiliario conservado terminaba
 * con la mitad del cash que su perfil pide.
 */
describe('Cash blindado', () => {
  const conBlindaje = (pisos: readonly Piso[] = [], ajustes: readonly AjusteClase[] = []) =>
    repartirPorClase(PAREJO, PATRIMONIO, pisos, ajustes)

  const de = (r: ReturnType<typeof conBlindaje>, clase: ClaseModelo) =>
    r.porClase.find((c) => c.clase === clase)?.objetivoUsd ?? 0

  const total = (r: ReturnType<typeof conBlindaje>) =>
    r.porClase.reduce((acc, c) => acc + c.objetivoUsd, 0)

  it('recibe su peso de benchmark, ni mas ni menos', () => {
    expect(de(conBlindaje(), 'cash')).toBeCloseTo(17_500, 2)
  })

  it('no cede cuando otra clase trae una posicion conservada grande', () => {
    const conPiso = conBlindaje([
      { clase: 'inm', montoUsd: 200_000, origen: 'conservado', etiqueta: 'Casa' },
    ])

    expect(de(conPiso, 'cash')).toBeCloseTo(17_500, 2)
    expect(total(conPiso)).toBeCloseTo(PATRIMONIO, 2)
  })

  it('sin blindaje si cederia: es la diferencia que la regla evita', () => {
    const pisos: Piso[] = [
      { clase: 'inm', montoUsd: 200_000, origen: 'conservado', etiqueta: 'Casa' },
    ]
    const sinBlindaje = repartirPorClase(PAREJO, PATRIMONIO, pisos, [], new Set())

    expect(sinBlindaje.porClase.find((c) => c.clase === 'cash')?.objetivoUsd).toBeLessThan(17_500)
  })

  it('un piso propio mayor que su peso si lo sube', () => {
    const conPiso = conBlindaje([
      { clase: 'cash', montoUsd: 50_000, origen: 'conservado', etiqueta: 'Money Market' },
    ])

    expect(de(conPiso, 'cash')).toBeCloseTo(50_000, 2)
    expect(total(conPiso)).toBeCloseTo(PATRIMONIO, 2)
  })

  it('un ajuste del asesor le gana al blindaje', () => {
    const fijado = conBlindaje([], [{ clase: 'cash', modo: 'fijar', montoUsd: 100_000 }])

    expect(de(fijado, 'cash')).toBeCloseTo(100_000, 2)
    expect(total(fijado)).toBeCloseTo(PATRIMONIO, 2)
  })

  it('sacar Cash del calculo lo deja en cero', () => {
    const excluido = conBlindaje([], [{ clase: 'cash', modo: 'excluir', montoUsd: 0 }])

    expect(de(excluido, 'cash')).toBe(0)
    expect(total(excluido)).toBeCloseTo(PATRIMONIO, 2)
  })

  it('recibir dinero no lo marca como cerrado', () => {
    // Blindado quiere decir que no cede, no que no compra: la clase abre su
    // linea igual y la propuesta la tiene que mostrar.
    const cash = conBlindaje().porClase.find((c) => c.clase === 'cash')!
    expect(cash.dineroNuevoUsd).toBeCloseTo(17_500, 2)
    expect(cash.cerrada).toBe(false)
  })
})
