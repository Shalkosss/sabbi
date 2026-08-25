import { REGLAS_V8 } from '@sabbi/core'
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
  it('es la v4 de pesos con la v8 de umbrales', () => {
    expect(MACRO_DE_FABRICA.pesos).toEqual(benchmarks)
    expect(MACRO_DE_FABRICA.reglas).toEqual(REGLAS_V8)
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
    if (salida.ok) expect(salida.macro.reglas.club.minUsd).toBe(10_000)
  })

  it('rechaza un perfil cuyas clases no suman 1', () => {
    const rota = valida() as { pesos: { clases: Record<string, { pesos: Record<string, number> }> } }
    rota.pesos.clases['cash']!.pesos['Moderado'] = 0.5

    const salida = validarMacro(rota)
    expect(salida.ok).toBe(false)
    if (!salida.ok) expect(salida.errores.join(' ')).toContain('Moderado')
  })

  it('rechaza un ticket minimo en cero', () => {
    const rota = valida() as { reglas: { ticketEtfUsd: number } }
    rota.reglas.ticketEtfUsd = 0

    const salida = validarMacro(rota)
    expect(salida.ok).toBe(false)
    if (!salida.ok) expect(salida.errores.join(' ')).toContain('ticket')
  })

  it('rechaza una fraccion escrita como porcentaje', () => {
    // El error que se comete de verdad: teclear 15 donde va 0.15.
    const rota = valida() as { reglas: { fijo: { separacion: number } } }
    rota.reglas.fijo.separacion = 15

    const salida = validarMacro(rota)
    expect(salida.ok).toBe(false)
    if (!salida.ok) expect(salida.errores.join(' ')).toContain('0 a 1')
  })

  it('rechaza un umbral negativo', () => {
    const rota = valida() as { reglas: { club: { minUsd: number } } }
    rota.reglas.club.minUsd = -1

    expect(validarMacro(rota).ok).toBe(false)
  })

  it('rechaza un destino del inmobiliario que el motor no conoce', () => {
    const rota = valida() as { reglas: { inmobiliario: { destino: string } } }
    rota.reglas.inmobiliario.destino = 'al mejor postor'

    expect(validarMacro(rota).ok).toBe(false)
  })

  it('acepta una macro guardada antes de las palancas nuevas', () => {
    // Es el caso que de verdad pasa: en la base hay payloads con la forma
    // vieja. Si el esquema los rechazara, el motor caeria en la de fabrica y la
    // mesa veria cambiar todas sus cifras sin haber tocado nada.
    const vieja = valida() as { reglas: Record<string, unknown> }
    delete vieja.reglas['ticketFijoUsd']
    delete vieja.reglas['ticketVariableUsd']
    delete vieja.reglas['residuos']
    delete (vieja.reglas['otros'] as Record<string, unknown>)['minLineaUsd']
    delete (vieja.reglas['variable'] as Record<string, unknown>)['nucleo']

    const salida = validarMacro(vieja)
    expect(salida.ok).toBe(true)
    // Y los defectos son los neutros: la macro vieja calcula igual que antes.
    if (salida.ok) expect(salida.macro.reglas).toEqual(REGLAS_V8)
  })

  it('rechaza un nucleo de Renta Variable vacio', () => {
    // Sin nucleo el bloque entero cae al instrumento de consolidacion, que no
    // es una calibracion sino un portafolio roto.
    const rota = valida() as { reglas: { variable: { nucleo: string } } }
    rota.reglas.variable.nucleo = '   '

    expect(validarMacro(rota).ok).toBe(false)
  })

  it('rechaza un destino de residuos que el motor no conoce', () => {
    const rota = valida() as { reglas: { residuos: { destino: string } } }
    rota.reglas.residuos.destino = 'inm'

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
