import { describe, expect, it } from 'vitest'

import { REGLAS_V4, REGLAS_V8 } from '../domain/reglas.js'
import type { Benchmark, ClaseModelo } from '../domain/tipos.js'
import { generarPlan } from '../plan.js'
import type { EntradaPlan } from '../plan.js'

/**
 * La macro v4, de punta a punta.
 *
 * `reglas.test.ts` prueba que cada palanca llegue al fondo del motor moviendo
 * una sola por vez. Esto es lo otro: que las seis decisiones de la v4 juntas
 * produzcan el portafolio que la mesa escribio, y que cada una de las seis se
 * pueda apagar por separado volviendo a lo que hacia la v8.
 *
 * Cada caso compara la v4 contra la v8 sobre la misma entrada y nombra la
 * diferencia. Un test que solo dijera «cambia» no serviria de nada: lo que hay
 * que fijar es en que direccion y por que razon.
 */

const BENCHMARK: Benchmark = {
  inm: 0.1,
  fijo: 0.3,
  variable: 0.2,
  privados: 0.15,
  club: 0.05,
  otros: 0.0353,
  cash: 0.1647,
}

const PESOS = {
  fijo: { 'iShares $ Corporate Bond': 0.6, 'iShares $ Treasury 1-3yr': 0.4 },
  variable: { 'iShares Core S&P 500': 0.5, EIMI: 0.28, EMUU: 0.22 },
  otros: { 'BTC (IBIT)': 0.8, Oro: 0.2 },
}

const base = (
  patrimonio: number,
  perfil: EntradaPlan['perfil'] = 'Moderado',
): EntradaPlan => ({
  perfil,
  patrimonioTotalUsd: patrimonio,
  benchmark: BENCHMARK,
  pesos: PESOS,
  pisos: [],
  ticketMinimoUsd: 20_000,
  fallbacks: { fijo: 'Flip Panda', variable: 'Flip Cobra' },
})

/** Lo que le toco a una clase, sumando sus lineas. */
const enClase = (entrada: EntradaPlan, clase: ClaseModelo): number =>
  generarPlan(entrada)
    .lineas.filter((l) => l.clase === clase)
    .reduce((acc, l) => acc + l.usd, 0)

const instrumentos = (entrada: EntradaPlan, clase?: ClaseModelo): string[] =>
  generarPlan(entrada)
    .lineas.filter((l) => clase === undefined || l.clase === clase)
    .map((l) => l.instrumento)

describe('la macro v4 contra la v8', () => {
  it('las dos reparten el patrimonio entero', () => {
    for (const reglas of [REGLAS_V4, REGLAS_V8]) {
      for (const monto of [80_000, 300_000, 1_000_000]) {
        expect(generarPlan({ ...base(monto), reglas }).totalObjetivoUsd).toBeCloseTo(monto, 2)
      }
    }
  })

  it('el conservador cede cinco puntos de cash a las demas clases', () => {
    const entrada = base(1_000_000, 'Conservador')

    const conV8 = enClase({ ...entrada, reglas: REGLAS_V8 }, 'cash')
    const conV4 = enClase({ ...entrada, reglas: REGLAS_V4 }, 'cash')

    expect(conV8).toBeCloseTo(164_700, 2)
    expect(conV4).toBeCloseTo(114_700, 2)
    expect(conV8 - conV4).toBeCloseTo(1_000_000 * REGLAS_V4.cash.recorteConservador, 2)
  })

  it('el recorte de cash no toca a los otros cuatro perfiles', () => {
    for (const perfil of ['Conservador & Moderado', 'Moderado', 'Arriesgado'] as const) {
      const entrada = base(1_000_000, perfil)

      expect(enClase({ ...entrada, reglas: REGLAS_V4 }, 'cash')).toBeCloseTo(
        enClase({ ...entrada, reglas: { ...REGLAS_V4, cash: { recorteConservador: 0 } } }, 'cash'),
        6,
      )
    }
  })

  it('el inmobiliario se ejecuta desde 100,000 y no desde 500,000', () => {
    const entrada = base(300_000)

    expect(enClase({ ...entrada, reglas: REGLAS_V8 }, 'inm')).toBe(0)
    expect(enClase({ ...entrada, reglas: REGLAS_V4 }, 'inm')).toBeGreaterThan(0)
  })

  it('cuando no se puede ejecutar, su capital va a mercados publicos', () => {
    // 80,000 no llegan ni al umbral de la v4. Con `publicos` el capital va a
    // Renta Fija y Renta Variable; con `prorratear` tambien engorda a Privados.
    const entrada = { ...base(80_000), reglas: REGLAS_V4 }
    const prorrateando = {
      ...entrada,
      reglas: { ...REGLAS_V4, inmobiliario: { ...REGLAS_V4.inmobiliario, destino: 'prorratear' as const } },
    }

    expect(generarPlan(entrada).avisos.join(' ')).toContain('Renta Fija y Renta Variable')
    expect(enClase(entrada, 'fijo') + enClase(entrada, 'variable')).toBeGreaterThan(
      enClase(prorrateando, 'fijo') + enClase(prorrateando, 'variable'),
    )
  })

  it('bajo el minimo del fondo, privados y club van enteros al club deal', () => {
    const entrada = { ...base(80_000), reglas: REGLAS_V4 }

    expect(generarPlan(entrada).avisos.join(' ')).toContain('va entero al club deal')
    expect(enClase(entrada, 'club')).toBeGreaterThan(REGLAS_V4.club.minUsd)
    // Con la v8 el club no llega a sus 10,000 y desaparece.
    expect(enClase({ ...base(80_000), reglas: REGLAS_V8 }, 'club')).toBe(0)
  })

  it('por encima de los dos minimos conviven, cada uno con el suyo', () => {
    const entrada = { ...base(1_000_000), reglas: REGLAS_V4 }

    expect(enClase(entrada, 'club')).toBeGreaterThanOrEqual(REGLAS_V4.club.minUsd)
    expect(enClase(entrada, 'privados')).toBeGreaterThanOrEqual(
      REGLAS_V4.privados.minOportunidadUsd,
    )
  })

  it('la cascada por tramos no corre si el asesor fijo alguna de las dos clases', () => {
    const entrada = {
      ...base(1_000_000),
      reglas: REGLAS_V4,
      ajustes: [{ clase: 'club' as const, modo: 'fijar' as const, montoUsd: 200_000 }],
    }
    const plan = generarPlan(entrada)

    expect(plan.avisos.join(' ')).toContain('la cascada por tramos no corre')
    expect(enClase(entrada, 'club')).toBeCloseTo(200_000, 2)
  })

  it('los subfondos se miden uno por uno: el que califica se abre', () => {
    // Arriesgado parte el fondo 30/70. Con 100,000 en privados, PC se queda en
    // 30,000 y no llega a los 50,000; PE VC se lleva 70,000 y si.
    const entrada = base(1_000_000, 'Arriesgado')
    const conPrivados = {
      ...entrada,
      benchmark: { ...BENCHMARK, privados: 0.1, club: 0, otros: 0, inm: 0, cash: 0, fijo: 0.5, variable: 0.4 },
    }

    const v8 = instrumentos({ ...conPrivados, reglas: REGLAS_V8 }, 'privados')
    const v4 = instrumentos({ ...conPrivados, reglas: REGLAS_V4 }, 'privados')

    expect(v8).toStrictEqual(['Sabbi Fondo Oportunidad'])
    expect(v4).toStrictEqual(['FM PE VC'])
  })

  it('el subfondo que abre se lleva tambien lo del que no llego', () => {
    const entrada = base(1_000_000, 'Arriesgado')
    const conPrivados = {
      ...entrada,
      reglas: REGLAS_V4,
      benchmark: { ...BENCHMARK, privados: 0.1, club: 0, otros: 0, inm: 0, cash: 0, fijo: 0.5, variable: 0.4 },
    }

    expect(enClase(conPrivados, 'privados')).toBeCloseTo(100_000, 2)
  })

  it('renta variable usa el mismo motor simple que renta fija', () => {
    // 85,000 en Renta Variable es donde los dos motores se separan: a EMUU le
    // tocarian 18,700 y el de nucleo y satelites le compra el salto hasta el
    // ticket, financiado por el nucleo. La poda de la v4 no rescata a nadie:
    // lo saca y reparte su monto entre los dos que quedan.
    const entrada = {
      ...base(425_000),
      benchmark: {
        inm: 0,
        fijo: 0.4,
        variable: 0.2,
        privados: 0.2,
        club: 0.1,
        otros: 0.1,
        cash: 0,
      },
    }

    expect(instrumentos({ ...entrada, reglas: REGLAS_V8 }, 'variable')).toContain('EMUU')
    expect(instrumentos({ ...entrada, reglas: REGLAS_V4 }, 'variable')).not.toContain('EMUU')
    // Y no es que se haya perdido: la clase sigue valiendo lo mismo.
    expect(enClase({ ...entrada, reglas: REGLAS_V4 }, 'variable')).toBeCloseTo(85_000, 2)
  })

  it('lo que ningun vehiculo privado puede tomar vuelve a mercados publicos', () => {
    // 10,000 en privados, sin club en el benchmark: no llegan a los 25,000 del
    // fondo y no hay club al que mandarlos. El dinero no puede desaparecer.
    const entrada = {
      ...base(100_000),
      reglas: REGLAS_V4,
      benchmark: {
        inm: 0,
        fijo: 0.5,
        variable: 0.4,
        privados: 0.1,
        club: 0,
        otros: 0,
        cash: 0,
      },
    }
    const plan = generarPlan(entrada)

    expect(plan.avisos.join(' ')).toContain('vuelven a mercados públicos')
    expect(enClase(entrada, 'privados')).toBe(0)
    expect(enClase(entrada, 'fijo') + enClase(entrada, 'variable')).toBeCloseTo(100_000, 2)
    expect(plan.totalObjetivoUsd).toBeCloseTo(100_000, 2)
  })

  it('sin mercados publicos libres, ese dinero se queda y se dice', () => {
    // El caso degenerado: no hay a donde devolverlo. Antes que perderlo, se
    // queda en el Fondo Oportunidad por debajo de su minimo, y el aviso lo
    // nombra para que nadie tenga que descubrirlo mirando las cifras.
    const entrada = {
      ...base(100_000),
      reglas: REGLAS_V4,
      benchmark: {
        inm: 0,
        fijo: 0,
        variable: 0,
        privados: 0.1,
        club: 0,
        otros: 0,
        cash: 0.9,
      },
    }
    const plan = generarPlan(entrada)

    expect(plan.avisos.join(' ')).toContain('No hay mercados públicos libres')
    expect(enClase(entrada, 'privados')).toBeCloseTo(10_000, 2)
    expect(plan.totalObjetivoUsd).toBeCloseTo(100_000, 2)
  })

  it('Otros abre desde el ticket y no desde los 10,000 de la v8', () => {
    // 15,000 en Otros: le alcanza al minimo de la v8 y no al de la v4.
    const entrada = {
      ...base(300_000),
      benchmark: { ...BENCHMARK, otros: 0.05, cash: 0.1497 },
    }

    expect(enClase({ ...entrada, reglas: REGLAS_V8 }, 'otros')).toBeGreaterThan(0)
    expect(enClase({ ...entrada, reglas: REGLAS_V4 }, 'otros')).toBe(0)
  })

  it('cada decision de la v4 se puede apagar por separado', () => {
    // Es la promesa de la pantalla de Macro: ninguna de las seis viene atada a
    // las otras. Volver las seis a lo de la v8, campo por campo, tiene que dar
    // exactamente el portafolio de la v8.
    const comoV8 = {
      ...REGLAS_V4,
      cash: REGLAS_V8.cash,
      inmobiliario: REGLAS_V8.inmobiliario,
      privados: REGLAS_V8.privados,
      club: REGLAS_V8.club,
      otros: REGLAS_V8.otros,
      fijo: REGLAS_V8.fijo,
      variable: REGLAS_V8.variable,
    }

    for (const monto of [80_000, 300_000, 1_000_000]) {
      expect(generarPlan({ ...base(monto, 'Conservador'), reglas: comoV8 }).lineas).toEqual(
        generarPlan({ ...base(monto, 'Conservador'), reglas: REGLAS_V8 }).lineas,
      )
    }
  })
})
