import { describe, expect, it } from 'vitest'

import {
  etiquetaClubDeal,
  FONDO_DIVIDENDOS_GLOBAL,
  FONDO_ESTRATEGICO,
  FONDO_OPORTUNIDAD,
  FONDO_PE_VC,
  FONDO_PRIVATE_CREDIT,
  FONDO_RE_INFRA,
  lineaClub,
  NOTA_INSTITUCIONAL,
  planificarPrivados,
  repartirFondo,
} from '../privados.js'
import type { UmbralesPrivados } from '../privados.js'

/**
 * La cascada de Mercados Privados.
 *
 * Tres tramos y una valvula. Lo que hay que cuidar en cada caso es que el
 * dinero cierre: club mas fondo mas lo que vuelve a publicos tiene que dar
 * siempre el monto libre, sin un centavo de mas ni de menos.
 */

const UMBRALES: UmbralesPrivados = {
  minFondoUsd: 25_000,
  minClubUsd: 5_000,
  minSubfondoUsd: 50_000,
  umbralClaseAUsd: 70_000,
}

const plan = (libreUsd: number, objetivoClubUsd: number) =>
  planificarPrivados({ libreUsd, objetivoClubUsd, umbrales: UMBRALES })

const cierra = (p: ReturnType<typeof plan>, libre: number) => {
  expect(p.clubUsd + p.fondoUsd + p.aPublicosUsd).toBeCloseTo(libre, 6)
}

describe('planificarPrivados', () => {
  it('sin dinero no hay nada que planificar', () => {
    expect(plan(0, 0)).toEqual({ clubUsd: 0, fondoUsd: 0, aPublicosUsd: 0 })
  })

  describe('el benchmark no contempla club deals', () => {
    it('todo al fondo cuando alcanza su minimo', () => {
      const p = plan(60_000, 0)
      expect(p.fondoUsd).toBe(60_000)
      expect(p.clubUsd).toBe(0)
      cierra(p, 60_000)
    })

    it('vuelve a publicos cuando no alcanza', () => {
      const p = plan(9_000, 0)
      expect(p.aPublicosUsd).toBe(9_000)
      cierra(p, 9_000)
    })
  })

  describe('tramo 1: por debajo del minimo del fondo', () => {
    it('todo al club deal', () => {
      const p = plan(20_000, 6_000)
      expect(p.clubUsd).toBe(20_000)
      expect(p.fondoUsd).toBe(0)
      cierra(p, 20_000)
    })

    it('si el club tampoco llega, el dinero vuelve a publicos', () => {
      const p = plan(4_000, 1_000)
      expect(p.aPublicosUsd).toBe(4_000)
      expect(p.clubUsd).toBe(0)
      expect(p.fondoUsd).toBe(0)
      cierra(p, 4_000)
    })
  })

  describe('tramo 2: alcanza para uno solo', () => {
    it('todo al fondo', () => {
      const p = plan(27_000, 8_000)
      expect(p.fondoUsd).toBe(27_000)
      expect(p.clubUsd).toBe(0)
      cierra(p, 27_000)
    })
  })

  describe('tramo 3: conviven los dos', () => {
    it('cada uno toma su minimo y el sobrante va por peso', () => {
      // 100,000 libres; el club pesaria 30,000 -> 30% del sobrante.
      const p = plan(100_000, 30_000)
      const sobrante = 100_000 - 30_000

      expect(p.clubUsd).toBeCloseTo(5_000 + sobrante * 0.3, 6)
      expect(p.fondoUsd).toBeCloseTo(25_000 + sobrante * 0.7, 6)
      cierra(p, 100_000)
    })

    it('justo en la frontera, cada uno abre exactamente en su minimo', () => {
      // 30,000 son 25,000 + 5,000: no sobra nada que repartir por peso.
      const p = plan(30_000, 9_000)
      expect(p.fondoUsd).toBeCloseTo(25_000, 6)
      expect(p.clubUsd).toBeCloseTo(5_000, 6)
      cierra(p, 30_000)
    })

    it('un dolar menos y el fondo se lo lleva todo', () => {
      const p = plan(29_999, 9_000)
      expect(p.fondoUsd).toBeCloseTo(29_999, 6)
      expect(p.clubUsd).toBe(0)
      cierra(p, 29_999)
    })

    it('ninguno queda por debajo de su minimo', () => {
      for (const objetivo of [1, 5_000, 50_000, 99_000]) {
        const p = plan(100_000, objetivo)
        expect(p.clubUsd, String(objetivo)).toBeGreaterThanOrEqual(5_000 - 1e-6)
        expect(p.fondoUsd, String(objetivo)).toBeGreaterThanOrEqual(25_000 - 1e-6)
        cierra(p, 100_000)
      }
    })

    it('un objetivo de club mayor que el monto libre se recorta', () => {
      const p = plan(100_000, 500_000)
      expect(p.clubUsd).toBeCloseTo(75_000, 6)
      cierra(p, 100_000)
    })
  })
})

describe('repartirFondo', () => {
  const opciones = { perfil: 'Moderado' as const, minSubfondoUsd: 50_000 }

  it('sin dinero no abre nada', () => {
    expect(repartirFondo(0, opciones)).toEqual([])
  })

  it('abre los subfondos que llegan a su minimo', () => {
    const lineas = repartirFondo(200_000, opciones)
    expect(lineas.map((l) => l.instrumento)).toEqual([FONDO_RE_INFRA, FONDO_PRIVATE_CREDIT])
    expect(lineas.every((l) => l.nota === NOTA_INSTITUCIONAL)).toBe(true)
  })

  it('el perfil Arriesgado abre PE VC en vez de RE Infra', () => {
    const lineas = repartirFondo(200_000, { ...opciones, perfil: 'Arriesgado' })
    expect(lineas.map((l) => l.instrumento)).toEqual([FONDO_PRIVATE_CREDIT, FONDO_PE_VC])
  })

  it('el que no llega le cede su monto al que si, a prorrata', () => {
    // Arriesgado con 100,000: PC llevaria 30,000 y no llega; PE VC lleva
    // 70,000 y si. La regla de la v4 abre PE VC con todo.
    const lineas = repartirFondo(100_000, { ...opciones, perfil: 'Arriesgado' })

    expect(lineas).toHaveLength(1)
    expect(lineas[0]?.instrumento).toBe(FONDO_PE_VC)
    expect(lineas[0]?.usd).toBeCloseTo(100_000, 6)
  })

  it('si ninguno llega, todo queda en el Fondo Oportunidad', () => {
    const lineas = repartirFondo(60_000, opciones)
    expect(lineas).toHaveLength(1)
    expect(lineas[0]?.instrumento).toBe(FONDO_OPORTUNIDAD)
    expect(lineas[0]?.usd).toBe(60_000)
  })

  it('lo que abre siempre suma el monto entero', () => {
    for (const monto of [60_000, 100_000, 200_000, 1_000_000]) {
      for (const perfil of ['Moderado', 'Arriesgado'] as const) {
        const suma = repartirFondo(monto, { ...opciones, perfil }).reduce(
          (acc, l) => acc + l.usd,
          0,
        )
        expect(suma, `${perfil} ${monto}`).toBeCloseTo(monto, 6)
      }
    }
  })

  it('con flujos activos los fondos mutuos no participan', () => {
    const lineas = repartirFondo(200_000, { ...opciones, necesitaFlujos: true })
    expect(lineas).toHaveLength(1)
    expect(lineas[0]?.instrumento).toBe(FONDO_DIVIDENDOS_GLOBAL)
  })

  it('forzar el check institucional a no cierra el split', () => {
    const lineas = repartirFondo(200_000, { ...opciones, institucional: 'no' })
    expect(lineas[0]?.instrumento).toBe(FONDO_OPORTUNIDAD)
  })

  it('forzarlo a si abre sin la nota', () => {
    const lineas = repartirFondo(200_000, { ...opciones, institucional: 'si' })
    expect(lineas).toHaveLength(2)
    expect(lineas.every((l) => l.nota === undefined)).toBe(true)
  })
})

describe('el club deal', () => {
  it('la etiqueta cambia en el umbral', () => {
    expect(etiquetaClubDeal(69_999.99, 70_000)).toContain('Clase B')
    expect(etiquetaClubDeal(70_000, 70_000)).toContain('Clase A')
  })

  it('sin monto no hay linea', () => {
    expect(lineaClub(0, { umbralClaseAUsd: 70_000 })).toBeNull()
  })

  it('con flujos el destino es el fondo que distribuye', () => {
    const linea = lineaClub(80_000, { necesitaFlujos: true, umbralClaseAUsd: 70_000 })
    expect(linea?.instrumento).toBe(FONDO_ESTRATEGICO)
    expect(linea?.usd).toBe(80_000)
  })
})
