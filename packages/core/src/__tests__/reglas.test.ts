import { describe, expect, it } from 'vitest'

import { CAMPOS_DE_MACRO, conValorDeMacro, REGLAS_V4, valorDeMacro } from '../domain/reglas.js'
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
  variable: { 'iShares Core S&P 500': 0.5, EIMI: 0.28, EMUU: 0.22 },
  otros: { 'BTC (IBIT)': 0.8, Oro: 0.2 },
}

const base = (patrimonio: number): EntradaPlan => ({
  perfil: 'Moderado',
  patrimonioTotalUsd: patrimonio,
  benchmark: BENCHMARK,
  pesos: PESOS,
  pisos: [],
  ticketMinimoUsd: REGLAS_V4.ticketMinimoUsd,
  fallbacks: { fijo: 'Flip Panda', variable: 'Flip Cobra' },
})

const instrumentos = (entrada: EntradaPlan): string[] =>
  generarPlan(entrada).lineas.map((l) => l.instrumento)

const objetivo = (plan: ReturnType<typeof generarPlan>, clase: string) =>
  plan.reparto.porClase.find((c) => c.clase === clase)?.objetivoUsd ?? 0

describe('la macro llega al motor', () => {
  it('sin macro corre la v4', () => {
    expect(generarPlan(base(400_000)).lineas).toEqual(
      generarPlan({ ...base(400_000), reglas: REGLAS_V4 }).lineas,
    )
  })

  it('el ticket minimo decide si la clase Otros existe', () => {
    // 200,000 de ticket son 20,000 de Otros: justo el minimo de la v4.
    expect(objetivo(generarPlan(base(200_000)), 'otros')).toBeGreaterThan(0)

    const conTicketAlto = generarPlan({ ...base(200_000), ticketMinimoUsd: 50_000 })
    expect(objetivo(conTicketAlto, 'otros')).toBe(0)
    expect(conTicketAlto.avisos.join(' ')).toContain('Otros')
  })

  it('el minimo del club deal decide si la clase abre', () => {
    // Con 40,000 de privados + club el tramo 3 abre los dos.
    expect(objetivo(generarPlan(base(400_000)), 'club')).toBeGreaterThan(0)

    const conMinimoAlto = generarPlan({
      ...base(400_000),
      reglas: {
        ...REGLAS_V4,
        privados: { ...REGLAS_V4.privados, minClubUsd: 200_000 },
      },
    })
    expect(objetivo(conMinimoAlto, 'club')).toBe(0)
  })

  it('el minimo del Fondo Oportunidad decide el tramo', () => {
    const conMinimoAlto = generarPlan({
      ...base(400_000),
      reglas: {
        ...REGLAS_V4,
        privados: { ...REGLAS_V4.privados, minFondoUsd: 500_000 },
      },
    })
    // Sin fondo posible, todo el bloque se juega al club deal.
    expect(objetivo(conMinimoAlto, 'privados')).toBe(0)
    expect(objetivo(conMinimoAlto, 'club')).toBeGreaterThan(0)
  })

  it('la frontera de etiqueta cambia el nombre del club deal', () => {
    expect(instrumentos(base(800_000)).some((n) => n.includes('Clase A'))).toBe(true)

    const conFronteraAlta = instrumentos({
      ...base(800_000),
      reglas: {
        ...REGLAS_V4,
        privados: { ...REGLAS_V4.privados, umbralClaseAUsd: 500_000 },
      },
    })
    expect(conFronteraAlta.some((n) => n.includes('Clase B'))).toBe(true)
  })

  it('el minimo por subfondo decide si se abre el split institucional', () => {
    expect(instrumentos(base(1_000_000))).toContain('FM RE Infra')

    const conMinimoAlto = instrumentos({
      ...base(1_000_000),
      reglas: {
        ...REGLAS_V4,
        privados: { ...REGLAS_V4.privados, minSubfondoUsd: 5_000_000 },
      },
    })
    expect(conMinimoAlto).not.toContain('FM RE Infra')
    expect(conMinimoAlto).toContain('Sabbi Fondo Oportunidad')
  })

  it('el umbral del inmobiliario decide a donde va su peso', () => {
    const conInm: EntradaPlan = {
      ...base(300_000),
      benchmark: { ...BENCHMARK, inm: 0.2, fijo: 0.1 },
    }

    // Por encima del umbral de la v4, el peso va al bloque privado.
    const grande = generarPlan(conInm)
    expect(grande.avisos.join(' ')).toContain('Mercados Privados')

    const conUmbralAlto = generarPlan({
      ...conInm,
      reglas: {
        ...REGLAS_V4,
        inmobiliario: { ...REGLAS_V4.inmobiliario, umbralUsd: 1_000_000 },
      },
    })
    expect(conUmbralAlto.avisos.join(' ')).toContain('Renta Fija y Renta Variable')
  })

  it('la parte al club deal mueve el reparto dentro de privados', () => {
    const conInm: EntradaPlan = {
      ...base(600_000),
      benchmark: { ...BENCHMARK, inm: 0.2, fijo: 0.1 },
    }

    const unTercio = objetivo(generarPlan(conInm), 'club')
    const casiTodo = objetivo(
      generarPlan({
        ...conInm,
        reglas: {
          ...REGLAS_V4,
          inmobiliario: { ...REGLAS_V4.inmobiliario, parteClub: 0.9 },
        },
      }),
      'club',
    )

    expect(casiTodo).toBeGreaterThan(unTercio)
  })

  it('el recorte de Cash solo mueve al Conservador', () => {
    const conCash: EntradaPlan = {
      ...base(400_000),
      benchmark: { ...BENCHMARK, cash: 0.2, fijo: 0.1 },
    }

    const moderado = generarPlan(conCash)
    const conservador = generarPlan({ ...conCash, perfil: 'Conservador' })

    expect(objetivo(conservador, 'cash')).toBeLessThan(objetivo(moderado, 'cash'))
    expect(conservador.avisos.join(' ')).toContain('Conservador')

    const sinRecorte = generarPlan({
      ...conCash,
      perfil: 'Conservador',
      reglas: { ...REGLAS_V4, cash: { recorteConservadorPp: 0 } },
    })
    expect(objetivo(sinRecorte, 'cash')).toBeCloseTo(objetivo(moderado, 'cash'), 6)
  })
})

describe('leer y escribir un campo de la macro por su ruta', () => {
  it('lee un campo anidado', () => {
    expect(valorDeMacro(REGLAS_V4, 'privados.minClubUsd')).toBe(5_000)
    expect(valorDeMacro(REGLAS_V4, 'ticketMinimoUsd')).toBe(20_000)
  })

  it('devuelve NaN ante una ruta que no existe', () => {
    expect(valorDeMacro(REGLAS_V4, 'privados.inventado')).toBeNaN()
    expect(valorDeMacro(REGLAS_V4, 'privados.minClubUsd.masAdentro')).toBeNaN()
  })

  it('escribe sin mutar el original', () => {
    const cambiada = conValorDeMacro(REGLAS_V4, 'privados.minClubUsd', 25_000)

    expect(cambiada.privados.minClubUsd).toBe(25_000)
    expect(REGLAS_V4.privados.minClubUsd).toBe(5_000)
    // El resto viaja intacto: cambiar un umbral no puede tocar los otros.
    expect(cambiada.privados.minFondoUsd).toBe(REGLAS_V4.privados.minFondoUsd)
    expect(cambiada.cash).toEqual(REGLAS_V4.cash)
  })

  it('cada campo declarado existe de verdad en la macro', () => {
    // La pantalla de Macro construye sus campos desde esta lista. Una ruta que
    // no resuelve saldria como un input vacio que no guarda nada.
    for (const campo of CAMPOS_DE_MACRO) {
      expect(valorDeMacro(REGLAS_V4, campo.ruta), campo.ruta).not.toBeNaN()
    }
  })
})
