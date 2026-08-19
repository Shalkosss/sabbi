import { describe, expect, it } from 'vitest'

import {
  indiceSubyacentes,
  claveVocabulario,
  limpiarTermino,
  resolverClase,
  resolverLiquidez,
  resolverMoneda,
  resolverRegion,
} from '../vocabulario.js'

/**
 * El vocabulario contra lo que la hoja escribe de verdad.
 *
 * Todos los alias de acá salieron de contar apariciones en la BD real. Si un
 * caso de estos deja de pasar, hay filas del catálogo cayéndose en silencio.
 */

describe('limpiarTermino', () => {
  it('borra los espacios de ancho cero del copiar y pegar', () => {
    expect(limpiarTermino('​​​Credicorp Crecimiento')).toBe('Credicorp Crecimiento')
  })

  it('saca la conjunción que quedó al partir por comas', () => {
    expect(limpiarTermino(' y Bonos Perú')).toBe('Bonos Perú')
    expect(limpiarTermino('y Hedge Funds')).toBe('Hedge Funds')
  })

  it('no se come una palabra que empieza con y', () => {
    expect(limpiarTermino('Yield Fund')).toBe('Yield Fund')
  })
})

describe('claveVocabulario', () => {
  it('hace equivalentes el guion largo y el corto', () => {
    expect(claveVocabulario('Mercados Públicos – Fijo')).toBe(
      claveVocabulario('Mercados Publicos - Fijo'),
    )
  })

  it('ignora paréntesis y barras', () => {
    expect(claveVocabulario('Hedge Funds / Otros')).toBe('hedge funds otros')
    expect(claveVocabulario('Investment Grade (AAA–BBB)')).toBe('investment grade aaa bbb')
  })
})

describe('resolverClase', () => {
  it('corrige el error de tipeo de la hoja de origen', () => {
    expect(resolverClase('Imobiliario Directo')).toBe('Inmobiliario Directo')
  })

  it('acepta el singular y el plural', () => {
    expect(resolverClase('Mercado publico variable')).toBe('Mercados Públicos - Variable')
    expect(resolverClase('Mercados publicos variable')).toBe('Mercados Públicos - Variable')
    expect(resolverClase('Club deal')).toBe('Club deals')
  })

  it('junta Efectivo y Otros en la clase que la mesa usa', () => {
    expect(resolverClase('Efectivo')).toBe('Cash y Otros')
    expect(resolverClase('Otros')).toBe('Cash y Otros')
  })

  it('devuelve null ante algo que no está en la lista', () => {
    expect(resolverClase('Criptomonedas')).toBeNull()
  })
})

describe('resolverRegion', () => {
  it('acepta USA y EEUU', () => {
    expect(resolverRegion('USA')).toBe('EEUU')
    expect(resolverRegion('EEUU')).toBe('EEUU')
  })

  it('completa el nombre de emergentes', () => {
    expect(resolverRegion('Emergentes')).toBe('Emergentes ex-Perú')
  })

  it('no depende de la tilde de Perú', () => {
    expect(resolverRegion('Peru')).toBe('Perú')
  })
})

describe('resolverMoneda', () => {
  it('unifica las seis formas de escribir dos monedas', () => {
    for (const bruto of ['dolares', 'dólares', 'Dólares', 'Dólar estadounidense', 'USD']) {
      expect(resolverMoneda(bruto)).toBe('USD')
    }
    for (const bruto of ['soles', 'Soles']) expect(resolverMoneda(bruto)).toBe('PEN')
  })
})

describe('resolverLiquidez', () => {
  it('normaliza el género y las mayúsculas', () => {
    expect(resolverLiquidez('Inmediato')).toBe('Inmediata')
    expect(resolverLiquidez('largo plazo')).toBe('Largo plazo')
  })

  it('traduce la escala Alta/Media/Baja que alguien mezcló en la columna', () => {
    expect(resolverLiquidez('Alta')).toBe('Inmediata')
    expect(resolverLiquidez('Media')).toBe('Mediano plazo')
    expect(resolverLiquidez('Baja')).toBe('Largo plazo')
  })
})

describe('indiceSubyacentes', () => {
  const canonicos = [
    'Bonos Corporativos Investment Grade (AAA–BBB)',
    'Bonos Latinoamérica',
    'Club Deals Real Estate Peru',
    'Hedge Funds',
    'Mercados Emergentes ex Perú',
    'Cash',
  ]
  const idx = indiceSubyacentes(canonicos)
  const resolver = (bruto: string) => idx.get(claveVocabulario(bruto)) ?? null

  it('acepta las abreviaturas que usa la mesa', () => {
    expect(resolver('Bonos Corp. Investment Grade')).toBe(
      'Bonos Corporativos Investment Grade (AAA–BBB)',
    )
    expect(resolver('Bonos Corporativos IG')).toBe('Bonos Corporativos Investment Grade (AAA–BBB)')
    expect(resolver('Bonos Latam')).toBe('Bonos Latinoamérica')
  })

  it('acepta el singular de club deal', () => {
    expect(resolver('Club Deal Real Estate Peru')).toBe('Club Deals Real Estate Peru')
  })

  it('no adivina un término que puede caer en dos lados', () => {
    // Private Debt podría ser Senior o Subordinated, y el score de performance
    // de esas dos no es el mismo. Lo decide una persona.
    expect(resolver('Private Debt')).toBeNull()
  })
})
