import { describe, expect, it } from 'vitest'

import type { ClaseModelo } from '../../domain/tipos.js'
import {
  aperturaFm,
  evaluarSenalInstitucional,
  FX_INSTITUCIONAL,
  INST_INVERTIBLE_USD,
  INST_TOTAL_USD,
} from '../institucional.js'

const pos = (clase: ClaseModelo, valorUsd: number, esInvertible = true) => ({
  claseModelo: clase,
  valorUsd,
  esInvertible,
})

describe('umbrales', () => {
  it('convierte los dos umbrales de soles al tipo de cambio institucional', () => {
    expect(FX_INSTITUCIONAL).toBe(3.4)
    expect(INST_INVERTIBLE_USD).toBeCloseTo(2_500_000 / 3.4, 6)
    expect(INST_TOTAL_USD).toBeCloseTo(4_600_000 / 3.4, 6)
  })
})

describe('evaluarSenalInstitucional', () => {
  it('cumple cuando el invertible y el total pasan sus umbrales', () => {
    const senal = evaluarSenalInstitucional([pos('fijo', 800_000), pos('inm', 600_000)])

    expect(senal.invertibleUsd).toBe(800_000)
    expect(senal.totalUsd).toBe(1_400_000)
    expect(senal.cumple).toBe(true)
  })

  it('no cumple si el invertible se queda corto, aunque el total sobre', () => {
    const senal = evaluarSenalInstitucional([pos('fijo', 700_000), pos('inm', 900_000)])

    expect(senal.totalUsd).toBeGreaterThan(INST_TOTAL_USD)
    expect(senal.cumple).toBe(false)
  })

  it('no cumple si el total se queda corto, aunque el invertible pase', () => {
    const senal = evaluarSenalInstitucional([pos('privados', 900_000)])

    expect(senal.invertibleUsd).toBeGreaterThan(INST_INVERTIBLE_USD)
    expect(senal.cumple).toBe(false)
  })

  it('deja el inmobiliario fuera del invertible pero lo cuenta en el total', () => {
    const senal = evaluarSenalInstitucional([pos('inm', 555_000), pos('cash', 214_492.75)])

    expect(senal.invertibleUsd).toBe(214_492.75)
    expect(senal.totalUsd).toBe(769_492.75)
  })

  it('ignora por completo lo que no es invertible: el inmueble de uso propio', () => {
    const senal = evaluarSenalInstitucional([
      pos('fijo', 800_000),
      pos('inm', 2_000_000, false),
    ])

    expect(senal.totalUsd).toBe(800_000)
    expect(senal.cumple).toBe(false)
  })

  it('cumple justo en el umbral: la comparacion no es estricta', () => {
    const senal = evaluarSenalInstitucional([
      pos('fijo', INST_INVERTIBLE_USD),
      pos('inm', INST_TOTAL_USD - INST_INVERTIBLE_USD),
    ])

    expect(senal.cumple).toBe(true)
  })

  it('no cumple sin posiciones', () => {
    expect(evaluarSenalInstitucional([])).toEqual({
      invertibleUsd: 0,
      totalUsd: 0,
      cumple: false,
    })
  })

  it('caso Ana Tumi: no alcanza ninguno de los dos umbrales', () => {
    const senal = evaluarSenalInstitucional([
      pos('inm', 555_000),
      pos('cash', 214_492.75),
      pos('fijo', 16_000),
      pos('variable', 478_900.24),
    ])

    expect(senal.totalUsd).toBeCloseTo(1_264_392.99, 2)
    expect(senal.invertibleUsd).toBeCloseTo(709_392.99, 2)
    expect(senal.cumple).toBe(false)
  })
})

describe('aperturaFm', () => {
  it('en automatico abre el split con la nota: es lo que hace el motor v8', () => {
    expect(aperturaFm('auto')).toBe('con-nota')
  })

  it('forzado a si abre el split sin nota: el asesor ya confirmo al cliente', () => {
    expect(aperturaFm('si')).toBe('sin-nota')
  })

  it('forzado a no cierra el split: todo se queda en Fondo Oportunidad', () => {
    expect(aperturaFm('no')).toBe('cerrada')
  })
})
