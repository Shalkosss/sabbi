import { describe, expect, it } from 'vitest'

import {
  CAMPOS_DE_MACRO,
  REGLAS_V4,
  REGLAS_V8,
  conTextoDeMacro,
  conValorDeMacro,
  textoDeMacro,
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
      reglas: { ...REGLAS_V8, otros: { ...REGLAS_V8.otros, minUsd: 50_000 } },
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

  it('el ticket propio de Renta Fija manda sobre el general', () => {
    // 200,000 de ticket son 60,000 de Fijo: alcanza para los dos ETFs con el
    // ticket general de 20,000 y para uno solo con uno de 45,000.
    const conGeneral = generarPlan(base(200_000)).lineas.filter((l) => l.clase === 'fijo')
    expect(conGeneral.length).toBe(2)

    const conPropio = generarPlan({
      ...base(200_000),
      reglas: { ...REGLAS_V8, ticketFijoUsd: 45_000 },
    }).lineas.filter((l) => l.clase === 'fijo')

    expect(conPropio.length).toBe(1)
    // Y solo movio a Fijo: Variable siguio midiendose contra el general.
    expect(generarPlan({ ...base(200_000), reglas: { ...REGLAS_V8, ticketFijoUsd: 45_000 } })
      .lineas.filter((l) => l.clase === 'variable')
      .map((l) => l.usd))
      .toEqual(generarPlan(base(200_000)).lineas.filter((l) => l.clase === 'variable').map((l) => l.usd))
  })

  it('el ticket propio de Renta Variable manda sobre el general', () => {
    const conGeneral = generarPlan(base(200_000)).lineas.filter((l) => l.clase === 'variable')
    const conPropio = generarPlan({
      ...base(200_000),
      reglas: { ...REGLAS_V8, ticketVariableUsd: 45_000 },
    }).lineas.filter((l) => l.clase === 'variable')

    expect(conPropio.length).toBeLessThan(conGeneral.length)
  })

  it('un ticket por clase en cero deja mandar al general', () => {
    // Es la garantia que permite agregar la palanca sin mover una cifra: la
    // macro de fabrica los trae en cero y tiene que dar lo mismo que no tenerlos.
    const conCeros = generarPlan({
      ...base(400_000),
      reglas: { ...REGLAS_V8, ticketFijoUsd: 0, ticketVariableUsd: 0 },
    })
    expect(conCeros.lineas).toEqual(generarPlan(base(400_000)).lineas)
  })

  it('el minimo por linea de Otros decide si se imprime el oro', () => {
    // 600,000 de ticket son 60,000 de Otros: BTC se lleva 48,000 y el oro
    // 12,000, que pasa el minimo de linea de la v8.
    const conV8 = instrumentos(base(600_000))
    expect(conV8).toContain('Oro')

    const conMinimoDeLinea = instrumentos({
      ...base(600_000),
      reglas: { ...REGLAS_V8, otros: { ...REGLAS_V8.otros, minLineaUsd: 20_000 } },
    })
    // La clase sigue abierta —su minimo no cambio— pero el oro se pliega sobre BTC.
    expect(conMinimoDeLinea).toContain('BTC (IBIT)')
    expect(conMinimoDeLinea).not.toContain('Oro')
  })

  it('el nucleo de Renta Variable se reconoce por el texto de la macro', () => {
    // Con un nucleo que ningun instrumento contiene, el bloque no se sostiene
    // desglosado y cae entero al instrumento de consolidacion.
    const conNucleoAjeno = instrumentos({
      ...base(400_000),
      reglas: {
        ...REGLAS_V8,
        variable: { ...REGLAS_V8.variable, nucleo: 'MSCI World' },
      },
    })
    expect(conNucleoAjeno).toContain('Flip - Cobra achorada')

    // Y el de fabrica reconoce al S&P 500 escrito de las dos formas.
    const conSinSimbolos = instrumentos({
      ...base(400_000),
      reglas: { ...REGLAS_V8, variable: { ...REGLAS_V8.variable, nucleo: 'sp500' } },
    })
    expect(conSinSimbolos).toContain('iShares Core S&P 500')
  })

  it('el destino de residuos decide donde cae lo que no abrio linea', () => {
    // 80,000 de ticket son 8,000 de club: no llega a los 10,000 de la v8.
    const aPrivados = generarPlan(base(80_000))
    expect(aPrivados.avisos.join(' ')).toContain('Sabbi Fondo Oportunidad')

    const aCash = generarPlan({
      ...base(80_000),
      reglas: { ...REGLAS_V8, residuos: { destino: 'cash' } },
    })

    expect(aCash.avisos.join(' ')).toContain('Cash')
    const cashDe = (plan: ReturnType<typeof generarPlan>) =>
      plan.reparto.porClase.find((c) => c.clase === 'cash')?.objetivoUsd ?? 0
    expect(cashDe(aCash)).toBeGreaterThan(cashDe(aPrivados))
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

  it('lee un campo que no es un numero', () => {
    expect(textoDeMacro(REGLAS_V8, 'variable.nucleo')).toBe('S&P 500')
    expect(textoDeMacro(REGLAS_V8, 'inmobiliario.destino')).toBe('prorratear')
    expect(textoDeMacro(REGLAS_V8, 'residuos.destino')).toBe('privados')
  })

  it('escribe un campo de texto sin mutar el original', () => {
    const cambiada = conTextoDeMacro(REGLAS_V8, 'variable.nucleo', 'MSCI World')

    expect(cambiada.variable.nucleo).toBe('MSCI World')
    expect(REGLAS_V8.variable.nucleo).toBe('S&P 500')
    expect(cambiada.variable.separacion).toBe(REGLAS_V8.variable.separacion)
  })

  it('cada campo declarado existe de verdad en las dos macros', () => {
    // La pantalla de Macro construye sus campos desde esta lista. Una ruta que
    // no resuelve saldria como un input vacio que no guarda nada.
    for (const reglas of [REGLAS_V8, REGLAS_V4]) {
      for (const campo of CAMPOS_DE_MACRO) {
        if (campo.unidad === 'usd' || campo.unidad === 'pct') {
          expect(valorDeMacro(reglas, campo.ruta), campo.ruta).not.toBeNaN()
        } else {
          expect(textoDeMacro(reglas, campo.ruta), campo.ruta).not.toBe('')
        }
      }
    }
  })

  it('cada opcion declarada es una que el motor acepta', () => {
    // Un valor de mas en el desplegable seria una eleccion que el esquema
    // rechaza al guardar, y el mensaje llegaria despues de teclear la nota. Y
    // uno de menos dejaria a la v4 con un valor que la pantalla no sabe
    // mostrar: los dos sentidos importan.
    for (const reglas of [REGLAS_V8, REGLAS_V4]) {
      for (const campo of CAMPOS_DE_MACRO) {
        if (campo.unidad !== 'opcion') continue
        expect(campo.opciones, campo.ruta).toBeDefined()
        expect(
          campo.opciones?.map((o) => o.valor),
          campo.ruta,
        ).toContain(textoDeMacro(reglas, campo.ruta))
      }
    }
  })

  it('la v4 no trae ninguna palanca que la pantalla no pueda editar', () => {
    // Es la promesa entera de la pantalla de Macro: lo que decide el
    // portafolio se puede cambiar sin desplegar. Un campo de `ReglasMotor` que
    // no este en la lista es un numero que solo se toca en el codigo.
    const rutas = new Set(CAMPOS_DE_MACRO.map((c) => c.ruta))

    const recorrer = (nodo: unknown, prefijo: string): string[] => {
      if (typeof nodo !== 'object' || nodo === null) return [prefijo]
      return Object.entries(nodo).flatMap(([clave, valor]) =>
        recorrer(valor, prefijo === '' ? clave : `${prefijo}.${clave}`),
      )
    }

    for (const ruta of recorrer(REGLAS_V4, '')) {
      expect(rutas.has(ruta), ruta).toBe(true)
    }
  })
})
