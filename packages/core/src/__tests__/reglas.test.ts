import { describe, expect, it } from 'vitest'

import {
  CAMPOS_DE_MACRO,
  REGLAS_V8,
  conValorDeMacro,
  valorDeMacro,
} from '../domain/reglas.js'
import type { Benchmark } from '../domain/tipos.js'
import { generarPlan } from '../plan.js'
import type { EntradaPlan } from '../plan.js'

/**
 * La macro tiene que llegar hasta el fondo del motor.
 *
 * No alcanza con que `generarPlan` acepte el objeto: cada umbral vive en una
 * regla distinta y el ensamblador tiene que repartirlos uno por uno. Un campo
 * que se acepta y no se usa es peor que no tenerlo — la pantalla de Macro lo
 * mostraria editable y cambiarlo no haria nada.
 *
 * Cada caso mueve un solo numero y comprueba que el portafolio cambia por esa
 * razon y no por otra.
 */

const BENCHMARK: Benchmark = {
  inm: 0,
  fijo: 0.3,
  variable: 0.3,
  privados: 0.2,
  club: 0.1,
  otros: 0.1,
  cash: 0,
}

const PESOS = {
  fijo: { 'iShares $ Corporate Bond': 0.6, 'iShares $ Treasury 1-3yr': 0.4 },
  // Tres, y no dos: con un solo satelite el motor de Variable no llega a
  // aplicar la separacion, y el caso que la prueba no probaria nada.
  variable: { 'iShares Core S&P 500': 0.5, EIMI: 0.28, EMUU: 0.22 },
  otros: { 'BTC (IBIT)': 0.8, Oro: 0.2 },
}

const base = (patrimonio: number): EntradaPlan => ({
  perfil: 'Moderado',
  patrimonioTotalUsd: patrimonio,
  benchmark: BENCHMARK,
  pesos: PESOS,
  pisos: [],
  ticketMinimoUsd: REGLAS_V8.ticketEtfUsd,
  fallbacks: { fijo: 'Flip - Panda Zen', variable: 'Flip - Cobra achorada' },
})

const instrumentos = (entrada: EntradaPlan): string[] =>
  generarPlan(entrada).lineas.map((l) => l.instrumento)

describe('la macro llega al motor', () => {
  it('sin macro corre la v8, que es la del golden test', () => {
    const conDefecto = generarPlan(base(400_000))
    const conExplicita = generarPlan({ ...base(400_000), reglas: REGLAS_V8 })

    expect(conDefecto.lineas).toEqual(conExplicita.lineas)
  })

  it('el minimo de Club Deals decide si la clase abre', () => {
    // 8,000 de club: no llega al minimo de 10,000 de la v8.
    const conV8 = generarPlan(base(80_000))
    expect(conV8.lineas.some((l) => l.clase === 'club')).toBe(false)
    expect(conV8.avisos.join(' ')).toContain('10,000')

    const conMinimoBajo = generarPlan({
      ...base(80_000),
      reglas: { ...REGLAS_V8, club: { ...REGLAS_V8.club, minUsd: 5_000 } },
    })
    expect(conMinimoBajo.lineas.some((l) => l.clase === 'club')).toBe(true)
  })

  it('la frontera Edifica A / B cambia el nombre del instrumento', () => {
    // 800,000 de ticket son 80,000 de club: por encima de los 70,000 de la v8.
    const conV8 = instrumentos(base(800_000))
    expect(conV8.some((n) => n.includes('Clase A'))).toBe(true)

    const conFronteraAlta = instrumentos({
      ...base(800_000),
      reglas: { ...REGLAS_V8, club: { ...REGLAS_V8.club, umbralClaseAUsd: 200_000 } },
    })
    expect(conFronteraAlta.some((n) => n.includes('Clase B'))).toBe(true)
  })

  it('el minimo de Otros decide si se abre BTC y Oro', () => {
    // 200,000 de ticket son 20,000 de Otros: el doble del minimo de la v8.
    const conV8 = generarPlan(base(200_000))
    expect(conV8.lineas.some((l) => l.clase === 'otros')).toBe(true)

    const conMinimoAlto = generarPlan({
      ...base(200_000),
      reglas: { ...REGLAS_V8, otros: { minUsd: 50_000 } },
    })
    expect(conMinimoAlto.lineas.some((l) => l.clase === 'otros')).toBe(false)
    expect(conMinimoAlto.avisos.join(' ')).toContain('50,000')
  })

  it('el minimo por subfondo decide si se abre el split institucional', () => {
    const conV8 = instrumentos(base(600_000))
    expect(conV8).toContain('FM RE Infra')

    const conMinimoAlto = instrumentos({
      ...base(600_000),
      reglas: {
        ...REGLAS_V8,
        privados: { ...REGLAS_V8.privados, minSubfondoUsd: 500_000 },
      },
    })
    expect(conMinimoAlto).not.toContain('FM RE Infra')
    expect(conMinimoAlto).toContain('Sabbi Fondo Oportunidad')
  })

  it('el ticket de Vision Dividendos Global manda cuando hay flujos', () => {
    const conFlujos = { ...base(600_000), necesitaFlujos: true }

    expect(instrumentos(conFlujos)).toContain('Fondo Visión Dividendos Global')

    const conTicketAlto = instrumentos({
      ...conFlujos,
      reglas: {
        ...REGLAS_V8,
        privados: { ...REGLAS_V8.privados, minDividendosGlobalUsd: 5_000_000 },
      },
    })
    expect(conTicketAlto).toContain('Sabbi Fondo Oportunidad')
  })

  it('el umbral del inmobiliario decide si la clase se disuelve', () => {
    const conInm: EntradaPlan = {
      ...base(300_000),
      benchmark: { ...BENCHMARK, inm: 0.2, fijo: 0.1 },
    }

    expect(generarPlan(conInm).lineas.some((l) => l.clase === 'inm')).toBe(false)

    const conUmbralBajo = generarPlan({
      ...conInm,
      reglas: {
        ...REGLAS_V8,
        inmobiliario: { ...REGLAS_V8.inmobiliario, umbralUsd: 100_000 },
      },
    })
    expect(conUmbralBajo.lineas.some((l) => l.clase === 'inm')).toBe(true)
  })

  it('el destino del inmobiliario disuelto cambia quien recibe', () => {
    const conInm: EntradaPlan = {
      ...base(300_000),
      benchmark: { ...BENCHMARK, inm: 0.2, fijo: 0.1 },
    }

    const prorrateado = generarPlan(conInm)
    const alBloque = generarPlan({
      ...conInm,
      reglas: {
        ...REGLAS_V8,
        inmobiliario: { ...REGLAS_V8.inmobiliario, destino: 'alternativos' },
      },
    })

    const fijoDe = (plan: ReturnType<typeof generarPlan>) =>
      plan.reparto.porClase.find((c) => c.clase === 'fijo')?.objetivoUsd ?? 0

    expect(fijoDe(prorrateado)).toBeGreaterThan(fijoDe(alBloque))
    expect(alBloque.avisos.join(' ')).toContain('Privados, Club y Otros')
  })

  it('la separacion de la cascada mueve las lineas de Renta Fija', () => {
    const conV8 = generarPlan(base(200_000)).lineas.filter((l) => l.clase === 'fijo')
    const conSeparacionGrande = generarPlan({
      ...base(200_000),
      reglas: { ...REGLAS_V8, fijo: { ...REGLAS_V8.fijo, separacion: 0.9 } },
    }).lineas.filter((l) => l.clase === 'fijo')

    expect(conSeparacionGrande.map((l) => l.usd)).not.toEqual(conV8.map((l) => l.usd))
  })

  it('la separacion de satelites mueve las lineas de Renta Variable', () => {
    // Con 800,000 sobreviven los dos satelites, que es cuando la separacion
    // tiene sobre que actuar.
    const conV8 = generarPlan(base(800_000)).lineas.filter((l) => l.clase === 'variable')
    const conSeparacionGrande = generarPlan({
      ...base(800_000),
      reglas: { ...REGLAS_V8, variable: { ...REGLAS_V8.variable, separacion: 0.8 } },
    }).lineas.filter((l) => l.clase === 'variable')

    expect(conSeparacionGrande.map((l) => l.usd)).not.toEqual(conV8.map((l) => l.usd))
  })
})

describe('leer y escribir un campo de la macro por su ruta', () => {
  it('lee un campo anidado', () => {
    expect(valorDeMacro(REGLAS_V8, 'club.minUsd')).toBe(10_000)
    expect(valorDeMacro(REGLAS_V8, 'ticketEtfUsd')).toBe(20_000)
  })

  it('devuelve NaN ante una ruta que no existe', () => {
    expect(valorDeMacro(REGLAS_V8, 'club.inventado')).toBeNaN()
    expect(valorDeMacro(REGLAS_V8, 'club.minUsd.masAdentro')).toBeNaN()
  })

  it('escribe sin mutar el original', () => {
    const cambiada = conValorDeMacro(REGLAS_V8, 'club.minUsd', 25_000)

    expect(cambiada.club.minUsd).toBe(25_000)
    expect(REGLAS_V8.club.minUsd).toBe(10_000)
    // El resto viaja intacto: cambiar un umbral no puede tocar los otros doce.
    expect(cambiada.club.umbralClaseAUsd).toBe(REGLAS_V8.club.umbralClaseAUsd)
    expect(cambiada.fijo).toEqual(REGLAS_V8.fijo)
  })

  it('cada campo declarado existe de verdad en la macro', () => {
    // La pantalla de Macro construye sus campos desde esta lista. Una ruta que
    // no resuelve saldria como un input vacio que no guarda nada.
    for (const campo of CAMPOS_DE_MACRO) {
      expect(valorDeMacro(REGLAS_V8, campo.ruta), campo.ruta).not.toBeNaN()
    }
  })
})
