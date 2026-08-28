import { describe, expect, it } from 'vitest'

import { diagnosticar } from '../retornos'
import type { FondoConSerie } from '../retornos'

/**
 * Por qué la matriz de retornos está vacía.
 *
 * El bug que esto cierra: `const { data } = await supabase.from('fondos')…`
 * descartaba el `error`, y una consulta que falla y una tabla vacía devuelven
 * las dos `data: null`. La pantalla decía «todavía no hay fondos cargados» en
 * los dos casos — cierto en uno, y en el otro mandaba a cargar a mano cuatro
 * mil observaciones que la base sí tenía pero no había podido leer.
 */

const fondo = (observaciones: number): FondoConSerie => ({
  ficha: {
    id: '1',
    nombre: 'Blue Owl OWLCX',
    assetClass: 'Private Debt',
    inception: '2023-01',
    guidanceCortoPlazo: null,
    domicilio: null,
    esReferencia: false,
  },
  activo: true,
  observaciones: Array.from({ length: observaciones }, (_, i) => ({
    mes: `2025-${String(i + 1).padStart(2, '0')}`,
    nav: null,
    retornoTotal: 0.01,
  })),
})

describe('diagnosticar', () => {
  it('un error de la base gana sobre todo lo demás', () => {
    // Aunque no haya fondos: el motivo por el que no hay es que no se pudieron
    // leer, y mandar a importar el libro no arregla una tabla que no existe.
    expect(diagnosticar('relation "fondos" does not exist', [])).toStrictEqual({
      motivo: 'consulta',
      detalle: 'relation "fondos" does not exist',
    })
  })

  it('sin fondos, la carga inicial todavía no corrió', () => {
    expect(diagnosticar(null, [])).toStrictEqual({ motivo: 'sin-fondos' })
  })

  it('con fondos y sin una sola observación, falta la serie', () => {
    expect(diagnosticar(null, [fondo(0), fondo(0)])).toStrictEqual({
      motivo: 'sin-observaciones',
    })
  })

  it('un solo fondo con serie ya es una matriz que se puede mostrar', () => {
    // No hace falta que todos tengan serie: un fondo dado de alta el mes
    // pasado y todavía sin cargar no vacía la pantalla de los otros cincuenta.
    expect(diagnosticar(null, [fondo(0), fondo(12)])).toBeNull()
  })
})
