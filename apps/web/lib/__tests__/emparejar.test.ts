import { describe, expect, it } from 'vitest'

import { emparejarCatalogo, normalizarNombre } from '../datos/emparejar'
import type { ProductoCatalogo } from '../datos/emparejar'

/**
 * El emparejamiento contra el catálogo.
 *
 * Los casos de acá son reales: salen de comparar los nombres que imprime el
 * motor contra los de la tabla `products`. La prueba que más importa es la
 * última: ante la duda, el emparejador no elige.
 */

const producto = (nombre: string, retMin = 0.05): ProductoCatalogo => ({
  nombre,
  retMin,
  retMax: retMin + 0.01,
  distMin: null,
  distMax: null,
  distFrecuencia: null,
  moneda: 'USD',
})

const CATALOGO: readonly ProductoCatalogo[] = [
  producto('iShares $ Corporate Bond UCITS ETF', 0.045),
  producto('iShares Core S&P 500 UCITS ETF', 0.08),
  producto('iShares $ High Yield Corp Bond UCITS ETF', 0.06),
  producto('Inmobiliario Directo — nueva inversión (TBD)', 0.05),
]

describe('normalizarNombre', () => {
  it('borra tildes, mayúsculas y puntuación', () => {
    expect(normalizarNombre('Inmobiliario Directo — nueva inversión (TBD)')).toBe(
      'inmobiliario directo nueva inversion tbd',
    )
  })

  it('colapsa la puntuación a un solo espacio', () => {
    expect(normalizarNombre('iShares $  Corporate/Bond — UCITS ETF')).toBe(
      'ishares corporate bond ucits etf',
    )
  })
})

describe('emparejarCatalogo', () => {
  it('empareja por nombre exacto', () => {
    const indice = emparejarCatalogo(['iShares Core S&P 500 UCITS ETF'], CATALOGO)

    expect(indice.get('iShares Core S&P 500 UCITS ETF')?.retMin).toBe(0.08)
  })

  it('tolera el sufijo Acc que agrega la hoja Data', () => {
    const indice = emparejarCatalogo(['iShares $ Corporate Bond UCITS ETF Acc'], CATALOGO)

    expect(indice.get('iShares $ Corporate Bond UCITS ETF Acc')?.retMin).toBe(0.045)
  })

  it('empareja cuando el nombre del motor es más corto que el del catálogo', () => {
    const indice = emparejarCatalogo(['iShares Core S&P 500'], CATALOGO)

    expect(indice.get('iShares Core S&P 500')?.retMin).toBe(0.08)
  })

  it('resuelve por alias lo que ninguna regla de texto alcanza', () => {
    // «Corporate» contra «Corp»: ninguno contiene al otro. Adivinar sería
    // ponerle a un ETF el retorno de otro, así que la equivalencia está
    // declarada a mano en la tabla de alias, producto por producto.
    const indice = emparejarCatalogo(['iShares $ High Yield Corporate Bond UCITS ETF Acc'], CATALOGO)

    expect(indice.get('iShares $ High Yield Corporate Bond UCITS ETF Acc')?.retMin).toBe(0.06)
  })

  it('no empareja un nombre parecido que nadie declaró equivalente', () => {
    const indice = emparejarCatalogo(['iShares $ Corporativo Bono UCITS'], CATALOGO)

    expect(indice.size).toBe(0)
  })

  it('se abstiene cuando hay más de un candidato', () => {
    const ambiguo = [producto('Fondo Alfa'), producto('Fondo Alfa II')]
    const indice = emparejarCatalogo(['Fondo Alfa II Serie B'], ambiguo)

    expect(indice.size).toBe(0)
  })

  it('se abstiene cuando el catálogo trae el mismo nombre con dos retornos', () => {
    // Pasa de verdad: «iShares Core MSCI EM IMI UCITS ETF» está dos veces, al
    // 7% y al 6.5%. Elegir una es inventar la cifra que el cliente firma.
    const duplicado = [producto('Fondo Beta', 0.07), producto('Fondo Beta', 0.065)]
    const indice = emparejarCatalogo(['Fondo Beta'], duplicado)

    expect(indice.size).toBe(0)
  })

  it('una fila duplicada sin retorno no tapa a la que sí lo tiene', () => {
    const sinDato: ProductoCatalogo = { ...producto('Fondo Gamma'), retMin: null, retMax: null }
    const indice = emparejarCatalogo(['Fondo Gamma'], [sinDato, producto('Fondo Gamma', 0.09)])

    expect(indice.get('Fondo Gamma')?.retMin).toBe(0.09)
  })

  it('deja fuera lo que no está en el catálogo', () => {
    const indice = emparejarCatalogo(['Instrumento que nadie cargó'], CATALOGO)

    expect(indice.size).toBe(0)
  })
})
