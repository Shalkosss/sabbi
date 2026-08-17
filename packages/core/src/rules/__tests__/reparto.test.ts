import { describe, expect, it } from 'vitest'

import type { Benchmark, Piso } from '../../domain/tipos.js'
import { repartirPorClase } from '../reparto.js'

/**
 * Benchmark del perfil Moderado a precision completa.
 *
 * Sale de la hoja `Data` del archivo Portfolio Modificado, columna E. No del
 * JSON de configuracion, que trae estos mismos pesos redondeados a cuatro
 * decimales: ese redondeo desplaza la base de redistribucion en 6,502.88 USD.
 */
const MODERADO: Benchmark = {
  inm: 0.24030062266972713,
  fijo: 0.18987950950338972,
  variable: 0.1642687853554088,
  privados: 0.31081141150218566,
  cash: 0.09473967096928874,
}

describe('repartirPorClase', () => {
  describe('caso Ana Tumi', () => {
    // Perfil Moderado, segmento gte500. Conserva los cuatro inmuebles de renta,
    // el deposito a plazo de Caja Huancayo y el seguro con devolucion.
    const PATRIMONIO = 1_264_392.99
    const PISOS: Piso[] = [
      { clase: 'inm', montoUsd: 555_000, origen: 'conservado', etiqueta: 'Inmuebles de renta' },
      { clase: 'cash', montoUsd: 214_492.75, origen: 'conservado', etiqueta: 'DPF Caja Huancayo 2' },
      { clase: 'fijo', montoUsd: 16_000, origen: 'conservado', etiqueta: 'Seguro con devolución' },
    ]

    const resultado = repartirPorClase(MODERADO, PATRIMONIO, PISOS)
    const clase = (c: string) => resultado.porClase.find((r) => r.clase === c)!

    it('reproduce la base de redistribucion del Excel (celda E69)', () => {
      expect(resultado.baseRedistribucion).toBeCloseTo(744_255.9831307061, 4)
    })

    it('cierra inmobiliario y cash, porque lo conservado supera su objetivo', () => {
      expect(clase('inm').cerrada).toBe(true)
      expect(clase('inm').objetivoUsd).toBeCloseTo(555_000, 2)
      expect(clase('cash').cerrada).toBe(true)
      expect(clase('cash').objetivoUsd).toBeCloseTo(214_492.75, 2)
    })

    it('deja abiertas fijo, variable y privados', () => {
      expect(clase('fijo').cerrada).toBe(false)
      expect(clase('variable').cerrada).toBe(false)
      expect(clase('privados').cerrada).toBe(false)
    })

    it('calcula los objetivos por clase al centavo', () => {
      expect(clase('fijo').objetivoUsd).toBeCloseTo(141_318.9610218216, 2)
      expect(clase('variable').objetivoUsd).toBeCloseTo(122_258.0263423767, 2)
      expect(clase('privados').objetivoUsd).toBeCloseTo(231_323.25263580168, 2)
    })

    it('descuenta del dinero nuevo lo que la clase ya tiene cubierto', () => {
      // Fijo trae 16,000 del seguro conservado, asi que solo compra la diferencia.
      expect(clase('fijo').dineroNuevoUsd).toBeCloseTo(125_318.9610218216, 2)
      expect(clase('variable').dineroNuevoUsd).toBeCloseTo(122_258.0263423767, 2)
      expect(clase('privados').dineroNuevoUsd).toBeCloseTo(231_323.25263580168, 2)
      // Las clases cerradas no piden dinero nuevo. Fue el bug v37.25.
      expect(clase('inm').dineroNuevoUsd).toBe(0)
      expect(clase('cash').dineroNuevoUsd).toBe(0)
    })

    it('cuadra el dinero nuevo contra el disponible, sin paso de escalado', () => {
      const nuevo = resultado.porClase.reduce((acc, r) => acc + r.dineroNuevoUsd, 0)
      expect(nuevo).toBeCloseTo(478_900.24, 2)
    })

    it('reparte exactamente el patrimonio', () => {
      const total = resultado.porClase.reduce((acc, r) => acc + r.objetivoUsd, 0)
      expect(total).toBeCloseTo(PATRIMONIO, 2)
    })
  })

  describe('restricciones del asesor', () => {
    it('trata una restriccion igual que una posicion conservada', () => {
      const conservado = repartirPorClase(MODERADO, 1_000_000, [
        { clase: 'inm', montoUsd: 600_000, origen: 'conservado', etiqueta: 'Casa en renta' },
      ])
      const restringido = repartirPorClase(MODERADO, 1_000_000, [
        { clase: 'inm', montoUsd: 600_000, origen: 'restriccion', etiqueta: 'Casa en renta' },
      ])
      expect(restringido.porClase).toStrictEqual(conservado.porClase)
    })

    it('conserva la clase por encima del objetivo cuando el asesor la clava', () => {
      // El cliente quiere quedarse con la casa aunque el modelo pida menos.
      const r = repartirPorClase(MODERADO, 1_000_000, [
        { clase: 'inm', montoUsd: 600_000, origen: 'restriccion', etiqueta: 'Casa en renta' },
      ])
      const inm = r.porClase.find((x) => x.clase === 'inm')!
      expect(inm.objetivoUsd).toBe(600_000)
      // 600k es el 60% cuando el benchmark pedia 24%: se pasa a proposito.
      expect(inm.objetivoUsd / 1_000_000).toBeGreaterThan(MODERADO.inm)
      expect(inm.dineroNuevoUsd).toBe(0)
    })

    it('acumula varias restricciones sobre la misma clase', () => {
      const r = repartirPorClase(MODERADO, 1_000_000, [
        { clase: 'variable', montoUsd: 30_000, origen: 'restriccion', etiqueta: 'Acciones MSFT' },
        { clase: 'variable', montoUsd: 20_000, origen: 'restriccion', etiqueta: 'Acciones AAPL' },
      ])
      expect(r.porClase.find((x) => x.clase === 'variable')!.pisoUsd).toBe(50_000)
    })

    it('rechaza restricciones que superan el patrimonio', () => {
      expect(() =>
        repartirPorClase(MODERADO, 100_000, [
          { clase: 'variable', montoUsd: 150_000, origen: 'restriccion', etiqueta: 'Bono Verition' },
        ]),
      ).toThrow(/superan el patrimonio/)
    })
  })

  describe('invariantes', () => {
    it('sin pisos, reparte segun el benchmark puro', () => {
      const r = repartirPorClase(MODERADO, 1_000_000, [])
      for (const fila of r.porClase) {
        expect(fila.objetivoUsd).toBeCloseTo(MODERADO[fila.clase] * 1_000_000, 6)
        expect(fila.cerrada).toBe(false)
      }
    })

    it('es puro: la misma entrada da la misma salida', () => {
      const pisos: Piso[] = [
        { clase: 'cash', montoUsd: 200_000, origen: 'conservado', etiqueta: 'Depósito' },
      ]
      const a = repartirPorClase(MODERADO, 900_000, pisos)
      const b = repartirPorClase(MODERADO, 900_000, pisos)
      expect(a).toStrictEqual(b)
    })

    it('siempre reparte el total, con o sin clases cerradas', () => {
      for (const piso of [0, 100_000, 400_000, 700_000]) {
        const r = repartirPorClase(MODERADO, 1_000_000, [
          { clase: 'cash', montoUsd: piso, origen: 'conservado', etiqueta: 'Depósito' },
        ])
        const total = r.porClase.reduce((acc, x) => acc + x.objetivoUsd, 0)
        expect(total).toBeCloseTo(1_000_000, 2)
      }
    })

    it('rechaza un patrimonio no positivo', () => {
      expect(() => repartirPorClase(MODERADO, 0, [])).toThrow(/positivo/)
    })

    it('rechaza un piso negativo', () => {
      expect(() =>
        repartirPorClase(MODERADO, 500_000, [
          { clase: 'cash', montoUsd: -1, origen: 'conservado', etiqueta: 'Saldo raro' },
        ]),
      ).toThrow(/monto negativo/)
    })
  })

  describe('clase con peso cero', () => {
    /** El benchmark de Arriesgado no asigna nada a renta fija. */
    const ARRIESGADO: Benchmark = {
      inm: 0.18861099499614553,
      fijo: 0,
      variable: 0.27488416305431934,
      privados: 0.4773035990406503,
      cash: 0.0592012429088848,
    }

    it('no le asigna nada si el cliente tampoco trae posiciones', () => {
      const r = repartirPorClase(ARRIESGADO, 1_000_000, [])
      const fijo = r.porClase.find((x) => x.clase === 'fijo')!
      expect(fijo.objetivoUsd).toBe(0)
      expect(fijo.dineroNuevoUsd).toBe(0)
    })

    it('conserva lo que el cliente ya tiene ahí, sin comprar más', () => {
      // Un Arriesgado con bonos en cartera: el modelo no los pide, pero
      // tampoco puede hacerlos desaparecer del patrimonio.
      const r = repartirPorClase(ARRIESGADO, 1_000_000, [
        { clase: 'fijo', montoUsd: 80_000, origen: 'conservado', etiqueta: 'Bonos heredados' },
      ])
      const fijo = r.porClase.find((x) => x.clase === 'fijo')!
      expect(fijo.objetivoUsd).toBe(80_000)
      expect(fijo.cerrada).toBe(true)
      expect(fijo.dineroNuevoUsd).toBe(0)
      // Y el resto sigue cuadrando contra el patrimonio.
      const total = r.porClase.reduce((acc, x) => acc + x.objetivoUsd, 0)
      expect(total).toBeCloseTo(1_000_000, 2)
    })

    it('reparte todo por pisos cuando cubren el patrimonio entero', () => {
      const r = repartirPorClase(MODERADO, 1_000_000, [
        { clase: 'inm', montoUsd: 500_000, origen: 'restriccion', etiqueta: 'Casa' },
        { clase: 'cash', montoUsd: 500_000, origen: 'conservado', etiqueta: 'Depósito' },
      ])
      const total = r.porClase.reduce((acc, x) => acc + x.objetivoUsd, 0)
      expect(total).toBeCloseTo(1_000_000, 2)
      expect(r.porClase.every((x) => x.dineroNuevoUsd === 0)).toBe(true)
    })
  })
})
