import { describe, expect, it } from 'vitest'

import type { Benchmark, LineaPlan, Piso } from '../domain/tipos.js'
import { generarPlan, INMOBILIARIO_TBD } from '../plan.js'
import type { EntradaPlan } from '../plan.js'
import {
  FONDO_DIVIDENDOS_GLOBAL,
  FONDO_ESTRATEGICO,
  FONDO_OPORTUNIDAD,
  FONDO_RE_INFRA,
  NOTA_INSTITUCIONAL,
} from '../rules/privados.js'

/**
 * El caso Ana Tumi bajo la macro v4.
 *
 * La ficha es la real —el mismo patrimonio, las mismas posiciones conservadas,
 * los mismos pesos de la hoja Data— pero las cifras ya no son las de
 * `Propuesta Ana Tumi.xlsx`: ese archivo salio de la macro v8 y la v4 cambia
 * la cascada de ETFs, los minimos de privados y el umbral del inmobiliario.
 * Comparar contra el no diria que el motor esta mal, diria que el modelo
 * cambio — que es justamente lo que paso.
 *
 * Asi que lo que se fija aca son dos cosas distintas, y conviene no
 * confundirlas:
 *
 *  - Los INVARIANTES. El total cierra contra el patrimonio, cada clase vale lo
 *    que suman sus lineas, ninguna linea plena queda bajo el ticket, el motor
 *    es puro. Esos no dependen de que macro corra y valen siempre.
 *  - Las REGLAS de la v4, cada una probada por su efecto: el recorte de Cash,
 *    el umbral del inmobiliario, los tramos de privados, la clase Otros.
 *
 * Los montos concretos viven en un bloque aparte, marcado como lo que es: una
 * baseline derivada del propio motor, util para detectar un cambio no querido
 * y sin autoridad sobre lo que el modelo deberia dar.
 */

/**
 * Pesos exactos de Data!E, perfil Moderado, con la clase Mercados Privados de
 * la hoja abierta en privados + club + otros como manda Allocation detallado.
 */
const BENCHMARK: Benchmark = {
  inm: 0.24030062266972713,
  fijo: 0.18987950950338972,
  variable: 0.1642687853554088,
  privados: 0.21397086081763286,
  club: 0.09133824666838504,
  otros: 0.005502304016167772,
  cash: 0.09473967096928874,
}

const PESOS_FIJO = {
  LQDA: 0.05819683667896101,
  IBTA: 0.0429078372124543,
  IBTM: 0.06312877199073737,
  IHYA: 0.017754967122394882,
  JPEA: 0.007891096498842171,
}

const PESOS_VARIABLE = {
  'iShares Core S&P 500': 0.11538880532282371,
  EIMI: 0.018964363837778896,
  EMUU: 0.011752563505102417,
  IJPA: 0.010149941208952086,
  ISFD: 0.008013111480751647,
}

/** Particion de Otros del perfil Moderado, hoja Allocation detallado. */
const PESOS_OTROS = {
  'BTC (IBIT)': 0.0046 / 0.005525,
  Oro: 0.000925 / 0.005525,
}

const PATRIMONIO = 1_264_392.99

const PISOS: readonly Piso[] = [
  { clase: 'inm', montoUsd: 555_000, origen: 'conservado', etiqueta: 'Inmuebles de renta' },
  { clase: 'cash', montoUsd: 214_492.75, origen: 'conservado', etiqueta: 'Money Market' },
  { clase: 'fijo', montoUsd: 16_000, origen: 'conservado', etiqueta: 'DPF Caja Huancayo 2' },
]

const ENTRADA: EntradaPlan = {
  perfil: 'Moderado',
  patrimonioTotalUsd: PATRIMONIO,
  benchmark: BENCHMARK,
  pesos: { fijo: PESOS_FIJO, variable: PESOS_VARIABLE, otros: PESOS_OTROS },
  pisos: PISOS,
  ticketMinimoUsd: 20_000,
  fallbacks: { fijo: 'Flip Panda', variable: 'Flip Cobra' },
}

const objetivo = (plan: ReturnType<typeof generarPlan>, clase: string) =>
  plan.reparto.porClase.find((c) => c.clase === clase)?.objetivoUsd ?? 0

const monto = (lineas: readonly LineaPlan[], instrumento: string) =>
  lineas.find((l) => l.instrumento === instrumento)?.usd ?? 0

const sumaClase = (lineas: readonly LineaPlan[], clase: string) =>
  lineas.filter((l) => l.clase === clase).reduce((acc, l) => acc + l.usd, 0)

/** Lo que tiene que valer siempre, corra la macro que corra. */
function invariantes(plan: ReturnType<typeof generarPlan>, patrimonio: number, contexto = '') {
  expect(plan.totalObjetivoUsd, `${contexto} total`).toBeCloseTo(patrimonio, 2)

  for (const clase of plan.reparto.porClase) {
    expect(sumaClase(plan.lineas, clase.clase), `${contexto} ${clase.clase}`).toBeCloseTo(
      clase.objetivoUsd,
      2,
    )
  }

  for (const linea of plan.lineas) {
    // Las exentas y las de reserva resuelven sus propios minimos. Los "Flip"
    // tampoco cuentan: son justamente la linea en la que una clase se
    // consolida cuando NO llega al ticket, asi que estar por debajo es su
    // razon de existir.
    const esConsolidacion = linea.instrumento.startsWith('Flip')
    if (linea.residuales === undefined && !esConsolidacion) {
      expect(linea.usd, `${contexto} ${linea.instrumento}`).toBeGreaterThanOrEqual(20_000 - 0.01)
    }
  }
}

describe('generarPlan — invariantes', () => {
  const plan = generarPlan(ENTRADA)

  it('las lineas suman el patrimonio y cada clase cierra contra las suyas', () => {
    invariantes(plan, PATRIMONIO)
  })

  it('conserva lo mantenido como linea propia, al centavo', () => {
    expect(monto(plan.lineas, 'DPF Caja Huancayo 2')).toBe(16_000)
    expect(monto(plan.lineas, 'Money Market')).toBe(214_492.75)
    expect(monto(plan.lineas, 'Inmuebles de renta')).toBe(555_000)
  })

  it('no propone inmobiliario nuevo: la clase esta cerrada en su piso', () => {
    expect(monto(plan.lineas, INMOBILIARIO_TBD)).toBe(0)
  })

  it('ordena por bloque y, dentro del bloque, de mayor a menor', () => {
    const orden = ['inm', 'fijo', 'variable', 'privados', 'club', 'otros', 'cash']
    let anterior = -1
    for (const l of plan.lineas) {
      const bloque = orden.indexOf(l.clase)
      expect(bloque).toBeGreaterThanOrEqual(anterior)
      anterior = bloque
    }
    const fijo = plan.lineas.filter((l) => l.clase === 'fijo').map((l) => l.usd)
    expect(fijo).toStrictEqual([...fijo].sort((a, b) => b - a))
  })

  it('es puro', () => {
    expect(generarPlan(ENTRADA)).toStrictEqual(generarPlan(ENTRADA))
  })

  it('rechaza un ticket minimo invalido', () => {
    expect(() => generarPlan({ ...ENTRADA, ticketMinimoUsd: 0 })).toThrow(/ticket minimo/i)
  })

  it('cierra en todo el rango de tickets, no solo en este', () => {
    for (const ticket of [50_000, 120_000, 300_000, 750_000, 2_000_000]) {
      invariantes(
        generarPlan({ ...ENTRADA, patrimonioTotalUsd: ticket, pisos: [] }),
        ticket,
        `ticket ${ticket}`,
      )
    }
  })

  it('cierra tambien con cada perfil', () => {
    for (const perfil of [
      'Conservador',
      'Conservador & Moderado',
      'Moderado',
      'Moderado & Arriesgado',
      'Arriesgado',
    ] as const) {
      invariantes(generarPlan({ ...ENTRADA, perfil }), PATRIMONIO, perfil)
    }
  })
})

describe('generarPlan — las reglas de la v4', () => {
  it('recorta la liquidez del Conservador y lo dice', () => {
    const conservador = generarPlan({ ...ENTRADA, perfil: 'Conservador', pisos: [] })
    const moderado = generarPlan({ ...ENTRADA, perfil: 'Moderado', pisos: [] })

    expect(objetivo(conservador, 'cash')).toBeLessThan(objetivo(moderado, 'cash'))
    expect(conservador.avisos.some((a) => a.includes('Conservador'))).toBe(true)
    invariantes(conservador, PATRIMONIO, 'conservador')
  })

  it('con ticket chico el inmobiliario va a Mercados Publicos', () => {
    const plan = generarPlan({ ...ENTRADA, patrimonioTotalUsd: 80_000, pisos: [] })

    expect(objetivo(plan, 'inm')).toBe(0)
    expect(plan.avisos.some((a) => a.includes('Renta Fija y Renta Variable'))).toBe(true)
    invariantes(plan, 80_000, 'ticket chico')
  })

  it('con ticket grande el inmobiliario va a Mercados Privados', () => {
    const plan = generarPlan({ ...ENTRADA, patrimonioTotalUsd: 600_000, pisos: [] })

    expect(objetivo(plan, 'inm')).toBe(0)
    expect(plan.avisos.some((a) => a.includes('pasó a Mercados Privados'))).toBe(true)
    invariantes(plan, 600_000, 'ticket grande')
  })

  it('un inmueble conservado salva la clase del umbral', () => {
    const plan = generarPlan({
      ...ENTRADA,
      patrimonioTotalUsd: 80_000,
      pisos: [{ clase: 'inm', montoUsd: 30_000, origen: 'conservado', etiqueta: 'Casa' }],
    })

    expect(objetivo(plan, 'inm')).toBeGreaterThan(0)
    expect(plan.avisos.some((a) => a.includes('Inmobiliario Directo'))).toBe(false)
  })

  it('si el cliente accede pero el TBD no llega al ticket, ese dinero pasa a Cash', () => {
    // Con 80k y el peso de la clase, el TBD queda muy por debajo del ticket
    // de 100k que se pide para una nueva inversion inmobiliaria: la linea no
    // se crea y su monto se lleva a Cash. `totalObjetivoUsd` se conserva.
    const plan = generarPlan({
      ...ENTRADA,
      patrimonioTotalUsd: 80_000,
      pisos: [],
      accedeInmobiliario: true,
    })

    expect(objetivo(plan, 'inm')).toBe(0)
    expect(plan.avisos.some((a) => a.includes('ticket de 100000'))).toBe(true)
    invariantes(plan, 80_000, 'accede pero no llega')
  })

  it('si accede y el TBD llega al ticket, la clase se queda abierta', () => {
    // Con patrimonio grande el TBD supera 100k y la linea se emite.
    const plan = generarPlan({
      ...ENTRADA,
      patrimonioTotalUsd: 2_000_000,
      pisos: [],
      accedeInmobiliario: true,
    })

    expect(objetivo(plan, 'inm')).toBeGreaterThan(100_000)
    invariantes(plan, 2_000_000, 'accede y llega')
  })

  it('Otros se pliega a Privados cuando no llega al ticket', () => {
    // Con este benchmark, Otros pesa medio punto: nunca llega solo.
    const plan = generarPlan({ ...ENTRADA, patrimonioTotalUsd: 400_000, pisos: [] })

    expect(objetivo(plan, 'otros')).toBe(0)
    expect(plan.avisos.some((a) => a.includes('Otros'))).toBe(true)
  })

  it('plegar Otros equivale a que el benchmark nunca le hubiera dado nada', () => {
    // La propiedad, sin reimplementar la cuenta: si el peso se perdiera o se
    // contara dos veces, estas dos corridas no coincidirian.
    const plan = generarPlan({ ...ENTRADA, patrimonioTotalUsd: 400_000, pisos: [] })
    const sinOtros = generarPlan({
      ...ENTRADA,
      patrimonioTotalUsd: 400_000,
      pisos: [],
      benchmark: { ...BENCHMARK, privados: BENCHMARK.privados + BENCHMARK.otros, otros: 0 },
    })

    expect(objetivo(plan, 'privados')).toBeCloseTo(objetivo(sinOtros, 'privados'), 2)
    expect(objetivo(plan, 'club')).toBeCloseTo(objetivo(sinOtros, 'club'), 2)
  })

  it('con la clase entera bajo el minimo de los FM, todo cae al Fondo Oportunidad', () => {
    const plan = generarPlan({ ...ENTRADA, patrimonioTotalUsd: 150_000, pisos: [] })

    expect(monto(plan.lineas, FONDO_OPORTUNIDAD)).toBeGreaterThan(0)
    expect(monto(plan.lineas, FONDO_RE_INFRA)).toBe(0)
    invariantes(plan, 150_000, 'sin FM')
  })

  it('un bloque privado que no alcanza para nada vuelve a Mercados Publicos', () => {
    // La valvula de la regla: ni fondo ni club deal posibles.
    const plan = generarPlan({
      ...ENTRADA,
      patrimonioTotalUsd: 60_000,
      pisos: [],
      benchmark: { ...BENCHMARK, privados: 0.02, club: 0.02, fijo: 0.4, inm: 0, variable: 0.4 },
      accedeInmobiliario: true,
    })

    expect(objetivo(plan, 'privados')).toBe(0)
    expect(objetivo(plan, 'club')).toBe(0)
    expect(plan.avisos.some((a) => a.includes('volvió a Mercados Públicos'))).toBe(true)
    invariantes(plan, 60_000, 'valvula')
  })

  it('Cash va blindado: una posicion conservada en otra clase no le quita liquidez', () => {
    const sinPisos = generarPlan({ ...ENTRADA, pisos: [] })
    const conPiso = generarPlan({
      ...ENTRADA,
      pisos: [
        { clase: 'variable', montoUsd: 400_000, origen: 'conservado', etiqueta: 'Acciones' },
      ],
    })

    expect(objetivo(conPiso, 'cash')).toBeCloseTo(objetivo(sinPisos, 'cash'), 2)
  })
})

describe('generarPlan — los toggles', () => {
  it('con flujos activos el destino cambia de vehiculo', () => {
    const plan = generarPlan({ ...ENTRADA, necesitaFlujos: true })

    expect(monto(plan.lineas, FONDO_RE_INFRA)).toBe(0)
    expect(monto(plan.lineas, FONDO_ESTRATEGICO)).toBeGreaterThan(0)
    expect(monto(plan.lineas, FONDO_DIVIDENDOS_GLOBAL)).toBeGreaterThan(0)
    invariantes(plan, PATRIMONIO, 'flujos')
  })

  it('en automatico abre los fondos mutuos con la nota', () => {
    const plan = generarPlan(ENTRADA)

    expect(monto(plan.lineas, FONDO_RE_INFRA)).toBeGreaterThan(0)
    expect(plan.lineas.find((l) => l.instrumento === FONDO_RE_INFRA)?.nota).toBe(
      NOTA_INSTITUCIONAL,
    )
  })

  it('con el check forzado a no cierra los fondos mutuos', () => {
    const plan = generarPlan({ ...ENTRADA, institucional: 'no' })

    expect(monto(plan.lineas, FONDO_RE_INFRA)).toBe(0)
    expect(monto(plan.lineas, FONDO_OPORTUNIDAD)).toBeGreaterThan(0)
    invariantes(plan, PATRIMONIO, 'institucional no')
  })

  it('con el check forzado a si abre sin la nota', () => {
    const plan = generarPlan({ ...ENTRADA, institucional: 'si' })

    expect(monto(plan.lineas, FONDO_RE_INFRA)).toBeGreaterThan(0)
    expect(plan.lineas.every((l) => l.nota !== NOTA_INSTITUCIONAL)).toBe(true)
  })
})

describe('generarPlan — el reparto sigue a las lineas', () => {
  /**
   * El barrido de residuales cruza clases: una linea de Fijo que no llega al
   * ticket desaparece y su monto engorda a las de Variable. Eso esta bien; lo
   * que no puede quedar es un reparto que diga que Fijo tiene un objetivo que
   * sus propias lineas ya no suman.
   *
   * No es cosmetico. La seccion 6 imprimiria una clase cuyo total no es la
   * suma de sus filas, y el blotter calcularia las compras sobre las lineas
   * que le quedan: la que se queda sin ninguna aporta cero, las compras no
   * cuadran contra las ventas y la propuesta se marca como no publicable sin
   * que nadie haya hecho nada mal.
   */
  const conResiduoQueCruza: EntradaPlan = {
    ...ENTRADA,
    pisos: [
      { clase: 'inm', montoUsd: 555_000, origen: 'conservado', etiqueta: 'Inmuebles' },
      { clase: 'fijo', montoUsd: 226_000, origen: 'conservado', etiqueta: 'DPF' },
    ],
  }

  it('cada clase vale exactamente lo que suman sus lineas', () => {
    invariantes(generarPlan(conResiduoQueCruza), PATRIMONIO, 'residuo que cruza')
  })

  it('una clase fijada no cede ni recibe en el barrido', () => {
    const fijada = generarPlan({
      ...conResiduoQueCruza,
      ajustes: [{ clase: 'variable', modo: 'fijar', montoUsd: 150_000 }],
    })

    expect(objetivo(fijada, 'variable')).toBeCloseTo(150_000, 2)
    expect(sumaClase(fijada.lineas, 'variable')).toBeCloseTo(150_000, 2)
    invariantes(fijada, PATRIMONIO, 'fijada')
  })

  it('una clase con piso conserva su linea aunque su dinero nuevo se pliegue', () => {
    const plan = generarPlan({
      ...ENTRADA,
      patrimonioTotalUsd: 400_000,
      pisos: [{ clase: 'otros', montoUsd: 25_000, origen: 'conservado', etiqueta: 'BTC' }],
    })

    expect(monto(plan.lineas, 'BTC')).toBe(25_000)
    invariantes(plan, 400_000, 'piso en otros')
  })
})

describe('generarPlan — los montos clavados por linea', () => {
  /**
   * La tercera palanca, probada donde importa: contra el motor entero.
   *
   * `fijarLineas` tiene sus propios tests unitarios; lo que se fija aca es que
   * el paso convive con los que vienen despues. El barrido de residuales corre
   * a continuacion y podria deshacer lo clavado, y `realinearConLasLineas`
   * podria dejar el reparto diciendo un objetivo que sus lineas ya no suman.
   */
  const conLineas = (instrumento: string, montoUsd: number) =>
    generarPlan({
      ...ENTRADA,
      ajustesDeLinea: [{ clase: 'fijo', instrumento, montoUsd }],
    })

  const sinAjustar = generarPlan(ENTRADA)
  const lineasDeFijo = sinAjustar.lineas.filter((l) => l.clase === 'fijo' && l.piso === undefined)

  it('el motor imprime mas de una linea libre en Fijo, que es lo que esto supone', () => {
    expect(lineasDeFijo.length).toBeGreaterThan(1)
  })

  it('la linea sale con el monto que el asesor escribio', () => {
    const objetivoFijo = objetivo(sinAjustar, 'fijo')
    const cual = lineasDeFijo[0]?.instrumento ?? ''
    // Un monto que cabe en la clase pero no es el que el modelo le dio.
    const pedido = Math.round(objetivoFijo * 0.4)

    const plan = conLineas(cual, pedido)
    expect(monto(plan.lineas, cual)).toBeCloseTo(pedido, 2)
  })

  it('el total de la clase y el del portafolio no se mueven', () => {
    const cual = lineasDeFijo[0]?.instrumento ?? ''
    const antes = objetivo(sinAjustar, 'fijo')
    const plan = conLineas(cual, Math.round(antes * 0.4))

    expect(objetivo(plan, 'fijo')).toBeCloseTo(antes, 2)
    expect(plan.totalObjetivoUsd).toBeCloseTo(PATRIMONIO, 2)
    invariantes(plan, PATRIMONIO, 'linea clavada')
  })

  /**
   * Sin la exencion, una linea clavada por debajo del ticket la barreria el
   * paso siguiente y el numero que el asesor escribio no saldria impreso —
   * silenciosamente, que es la peor forma de no salir.
   */
  it('lo clavado sobrevive al barrido aunque no llegue al ticket minimo', () => {
    const cual = lineasDeFijo[0]?.instrumento ?? ''
    const plan = conLineas(cual, 5_000)

    expect(monto(plan.lineas, cual)).toBeCloseTo(5_000, 2)
    expect(objetivo(plan, 'fijo')).toBeCloseTo(objetivo(sinAjustar, 'fijo'), 2)
    expect(plan.totalObjetivoUsd).toBeCloseTo(PATRIMONIO, 2)
  })

  it('lo conservado no se toca desde el objetivo: el ajuste se ignora', () => {
    const plan = generarPlan({
      ...ENTRADA,
      ajustesDeLinea: [
        { clase: 'fijo', instrumento: 'DPF Caja Huancayo 2', montoUsd: 1_000 },
      ],
    })

    expect(monto(plan.lineas, 'DPF Caja Huancayo 2')).toBe(16_000)
    invariantes(plan, PATRIMONIO, 'piso intocable')
  })

  it('pedir mas de lo que la clase tiene se recorta y queda escrito en los avisos', () => {
    const cual = lineasDeFijo[0]?.instrumento ?? ''
    const plan = conLineas(cual, 10_000_000)

    expect(objetivo(plan, 'fijo')).toBeCloseTo(objetivo(sinAjustar, 'fijo'), 2)
    expect(plan.avisos.some((a) => a.includes('fija el monto de la clase'))).toBe(true)
    invariantes(plan, PATRIMONIO, 'pedido excesivo')
  })

  it('sigue siendo puro: la misma entrada da el mismo plan', () => {
    const cual = lineasDeFijo[0]?.instrumento ?? ''
    const entrada: EntradaPlan = {
      ...ENTRADA,
      ajustesDeLinea: [{ clase: 'fijo', instrumento: cual, montoUsd: 30_000 }],
    }
    expect(generarPlan(entrada)).toStrictEqual(generarPlan(entrada))
  })
})
