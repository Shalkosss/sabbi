import { describe, expect, it } from 'vitest'

import { desdeInput, desdeMonto, montoEditable } from '../formato'

/**
 * Leer y escribir dinero en un campo.
 *
 * El campo muestra `20,000` y el motor recibe `20000`. Entre esas dos formas
 * hay un parseo, y es de donde salen los errores de mil veces mas: `desdeInput`
 * convertia la primera coma en punto, asi que un monto con separador de miles
 * volvia dividido por mil sin que nada avisara.
 */

describe('montoEditable', () => {
  it('pone separador de miles y no pone simbolo', () => {
    expect(montoEditable(20_000)).toBe('20,000')
    expect(montoEditable(1_234_567.5)).toBe('1,234,567.5')
  })

  it('un campo vacio es vacio, no cero', () => {
    expect(montoEditable(null)).toBe('')
  })

  it('cero es un monto y se escribe', () => {
    expect(montoEditable(0)).toBe('0')
  })
})

describe('desdeMonto', () => {
  it('lee lo que el campo muestra', () => {
    expect(desdeMonto('20,000')).toBe(20_000)
    expect(desdeMonto('1,234,567.50')).toBe(1_234_567.5)
  })

  it('lee tambien lo que se teclea sin separadores', () => {
    expect(desdeMonto('20000')).toBe(20_000)
    expect(desdeMonto('123250')).toBe(123_250)
  })

  it('aguanta el simbolo y los espacios pegados', () => {
    expect(desdeMonto('USD 20,000')).toBe(20_000)
    expect(desdeMonto('$ 1,500.25')).toBe(1_500.25)
  })

  it('un campo vacio es null y no cero', () => {
    // Son cosas distintas: cero es un monto que el asesor eligio, vacio es uno
    // que todavia no escribio.
    expect(desdeMonto('')).toBeNull()
    expect(desdeMonto('   ')).toBeNull()
  })

  it('lo que no es un numero es null', () => {
    expect(desdeMonto('abc')).toBeNull()
  })

  it('sobrevive el punto a medio teclear', () => {
    // `1000.` tiene que volver como 1000 y no como null: el asesor esta en
    // mitad de escribir los centavos.
    expect(desdeMonto('1,000.')).toBe(1_000)
  })

  it('es lo que `desdeInput` no podia hacer', () => {
    // La razon de existir de esta funcion, escrita como test para que no se
    // vuelva a usar la otra en un campo de dinero.
    expect(desdeInput('20,000')).toBe(20)
    expect(desdeMonto('20,000')).toBe(20_000)
  })

  it('ida y vuelta: lo que se muestra vuelve igual', () => {
    for (const monto of [0, 1, 999, 20_000, 123_250, 646_500, 1_234_567.89]) {
      expect(desdeMonto(montoEditable(monto)), String(monto)).toBe(monto)
    }
  })
})
