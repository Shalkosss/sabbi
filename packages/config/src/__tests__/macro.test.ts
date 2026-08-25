import { REGLAS_V4 } from '@sabbi/core'
import { describe, expect, it } from 'vitest'

import { MACRO_DE_FABRICA, benchmarks } from '../index.js'
import { macroDeFabrica, validarMacro } from '../macro.js'

/**
 * La puerta por la que entra la macro.
 *
 * Todo lo que se guarda pasa por aqui y todo lo que se lee vuelve a pasar. Una
 * macro invalida que colara reventaria el motor del lado del servidor, donde
 * el mensaje no llega a nadie; una valida que se rechazara dejaria a la mesa
 * sin poder calibrar el modelo. Las dos direcciones importan.
 */

const valida = () => JSON.parse(JSON.stringify(MACRO_DE_FABRICA)) as Record<string, unknown>

describe('la macro de fabrica', () => {
  it('es la hoja Data de pesos con los umbrales de la v4', () => {
    expect(MACRO_DE_FABRICA.pesos).toEqual(benchmarks)
    expect(MACRO_DE_FABRICA.reglas).toEqual(REGLAS_V4)
  })

  it('valida contra su propio esquema', () => {
    expect(validarMacro(MACRO_DE_FABRICA).ok).toBe(true)
  })

  it('se arma con cualquier juego de pesos que ya este validado', () => {
    expect(macroDeFabrica(benchmarks).version).toBe(1)
  })
})

describe('validarMacro', () => {
  it('acepta una macro completa', () => {
    const salida = validarMacro(valida())
    expect(salida.ok).toBe(true)
    if (salida.ok) expect(salida.macro.reglas.privados.minClubUsd).toBe(5_000)
  })

  it('rechaza un perfil cuyas clases no suman 1', () => {
    const rota = valida() as { pesos: { clases: Record<string, { pesos: Record<string, number> }> } }
    rota.pesos.clases['cash']!.pesos['Moderado'] = 0.5

    const salida = validarMacro(rota)
    expect(salida.ok).toBe(false)
    if (!salida.ok) expect(salida.errores.join(' ')).toContain('Moderado')
  })

  it('rechaza un ticket minimo en cero', () => {
    const rota = valida() as { reglas: { ticketMinimoUsd: number } }
    rota.reglas.ticketMinimoUsd = 0

    const salida = validarMacro(rota)
    expect(salida.ok).toBe(false)
    if (!salida.ok) expect(salida.errores.join(' ')).toContain('ticket')
  })

  it('rechaza una fraccion escrita como porcentaje', () => {
    // El error que se comete de verdad: teclear 15 donde va 0.15.
    const rota = valida() as { reglas: { cash: { recorteConservadorPp: number } } }
    rota.reglas.cash.recorteConservadorPp = 15

    const salida = validarMacro(rota)
    expect(salida.ok).toBe(false)
    if (!salida.ok) expect(salida.errores.join(' ')).toContain('0 a 1')
  })

  it('rechaza un umbral negativo', () => {
    const rota = valida() as { reglas: { privados: { minClubUsd: number } } }
    rota.reglas.privados.minClubUsd = -1

    expect(validarMacro(rota).ok).toBe(false)
  })

  it('rechaza una parte al club deal fuera de rango', () => {
    const rota = valida() as { reglas: { inmobiliario: { parteClub: number } } }
    rota.reglas.inmobiliario.parteClub = 3

    expect(validarMacro(rota).ok).toBe(false)
  })

  it('rechaza lo que no es una macro', () => {
    expect(validarMacro(null).ok).toBe(false)
    expect(validarMacro({}).ok).toBe(false)
    expect(validarMacro({ version: 1 }).ok).toBe(false)
  })

  it('senala donde esta el problema, no solo que lo hay', () => {
    const rota = valida() as { reglas: { privados: { minSubfondoUsd: unknown } } }
    rota.reglas.privados.minSubfondoUsd = 'cincuenta mil'

    const salida = validarMacro(rota)
    expect(salida.ok).toBe(false)
    if (!salida.ok) expect(salida.errores[0]).toContain('reglas › privados › minSubfondoUsd')
  })
})
