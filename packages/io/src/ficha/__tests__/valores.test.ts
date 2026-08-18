import { describe, expect, it } from 'vitest'

import { normalizar } from '../../texto.js'
import { capRate, leerMoneda, leerNumero, leerPorcentaje, leerRendimiento } from '../valores.js'

describe('normalizar', () => {
  it('quita tildes, mayusculas y dobles espacios', () => {
    expect(normalizar('  Horizonte  de   Inversión ')).toBe('horizonte de inversion')
    expect(normalizar('% de Pertenencía')).toBe('% de pertenencia')
    expect(normalizar('Dólares')).toBe('dolares')
  })
})

describe('leerRendimiento', () => {
  it('acepta el decimal que ya viene bien', () => {
    expect(leerRendimiento(0.049)).toEqual({ valor: 0.049 })
  })

  it('convierte el texto con signo de porcentaje', () => {
    expect(leerRendimiento('6.5%')).toEqual({ valor: 0.065 })
    expect(leerRendimiento('6,5 %')).toEqual({ valor: 0.065 })
  })

  it('avisa cuando el numero parece un porcentaje sin dividir', () => {
    // 6.5 en vez de 0.065: la ficha lo trae asi cuando el cliente escribe "6.5".
    const leido = leerRendimiento(6.5)

    expect(leido.valor).toBe(0.065)
    expect(leido.aviso).toMatch(/porcentaje/i)
  })

  it('deja en blanco lo que no es un numero', () => {
    expect(leerRendimiento(null)).toEqual({ valor: null })
    expect(leerRendimiento('')).toEqual({ valor: null })
    expect(leerRendimiento('no lo se')).toEqual({ valor: null })
  })

  it('trata el cero como cero, no como vacio', () => {
    expect(leerRendimiento(0)).toEqual({ valor: 0 })
  })
})

describe('leerMoneda', () => {
  it('mapea las dos monedas del desplegable', () => {
    expect(leerMoneda('Soles')).toEqual({ valor: 'PEN' })
    expect(leerMoneda('Dólares')).toEqual({ valor: 'USD' })
    expect(leerMoneda('dolares')).toEqual({ valor: 'USD' })
    expect(leerMoneda('USD')).toEqual({ valor: 'USD' })
  })

  it('cae en dolares y avisa cuando la moneda no se reconoce', () => {
    const leida = leerMoneda('euros')

    expect(leida.valor).toBe('USD')
    expect(leida.aviso).toMatch(/euros/i)
  })

  it('cae en dolares sin avisar cuando la celda esta vacia', () => {
    // El valor de la ficha ya viene convertido a dolares en su columna propia.
    expect(leerMoneda(null)).toEqual({ valor: 'USD' })
  })
})

describe('leerPorcentaje', () => {
  it('deja pasar la fraccion y traduce el texto', () => {
    expect(leerPorcentaje(1)).toBe(1)
    expect(leerPorcentaje(0.5)).toBe(0.5)
    expect(leerPorcentaje('50%')).toBe(0.5)
  })

  it('trata un entero mayor que uno como porcentaje', () => {
    expect(leerPorcentaje(50)).toBe(0.5)
  })

  it('asume pertenencia completa cuando no hay dato', () => {
    expect(leerPorcentaje(null)).toBe(1)
  })
})

describe('leerNumero', () => {
  it('lee numeros y montos escritos como texto', () => {
    expect(leerNumero(120000)).toBe(120000)
    expect(leerNumero('120,000.50')).toBe(120000.5)
    expect(leerNumero('$ 20 000')).toBe(20000)
    expect(leerNumero('texto')).toBeNull()
    expect(leerNumero(null)).toBeNull()
  })
})

describe('capRate', () => {
  it('anualiza el alquiler contra el valor del inmueble', () => {
    // Un inmueble en renta de la ficha de referencia: 900 x 12 / 120,000 = 9%.
    expect(capRate(900, 120_000)).toBeCloseTo(0.09, 10)
  })

  it('no divide por cero ni inventa rendimiento sin alquiler', () => {
    expect(capRate(900, 0)).toBeNull()
    expect(capRate(null, 120_000)).toBeNull()
  })
})
