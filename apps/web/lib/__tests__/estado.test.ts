import { describe, expect, it } from 'vitest'

import { aRevisadas, camposTrasEditar, cambiosDeCta, reducir, ventaParcialInvalida } from '../estado'
import type { EstadoRevision, PosicionEditada } from '../estado'

const posicion = (parche: Partial<PosicionEditada> = {}): PosicionEditada => ({
  id: 'p1',
  orden: 1,
  origen: 'financiero',
  fila: 12,
  institucionProducto: 'DPF Caja Huancayo',
  tipoFicha: 'Depósito a plazo',
  assetClass: 'Renta fija',
  claseModelo: 'fijo',
  requiereConfirmacion: false,
  productoId: null,
  moneda: 'USD',
  plaza: 'Perú',
  pertenencia: null,
  pctPertenencia: 1,
  valorUsd: 100_000,
  valorDeclaradoUsd: 100_000,
  rendimientoEst: 0.06,
  feePct: null,
  pais: null,
  alquilerMensualUsd: null,
  uso: null,
  esInvertible: true,
  cta: 'sin_marcar',
  montoVentaParcial: 0,
  editadoManualmente: false,
  nota: '',
  camposEditados: [],
  ...parche,
})

const revision = (posiciones: readonly PosicionEditada[]): EstadoRevision => ({
  fichaId: 'f1',
  propuestaId: 'pr1',
  clienteId: 'c1',
  archivo: 'ficha.xlsx',
  hoja: 'Ficha',
  cliente: { nombre: 'Ana', horizonte: null, flujoActual: null, flujoRetiro: null, observaciones: [] },
  avisos: [],
  ignoradas: [],
  modelo: null,
  posiciones,
  agregados: [],
  ajustes: [],
  parametros: {
    perfil: 'Moderado',
    necesitaFlujos: false,
    usPerson: false,
    institucional: 'auto',
    incluirInmueblesDeRenta: true,
  accedeInmobiliario: false,
    colchonLiquidezUsd: 0,
    ticketMinimoUsd: 20_000,
    fxPenUsd: 3.4,
  },
})

describe('camposTrasEditar', () => {
  it('anota el campo que cambio de valor', () => {
    expect(camposTrasEditar(posicion(), { valorUsd: 120_000 })).toEqual(['valorUsd'])
  })

  it('ignora un cambio que deja el mismo valor', () => {
    const previa = posicion({ camposEditados: ['nota'] })
    expect(camposTrasEditar(previa, { valorUsd: 100_000 })).toBe(previa.camposEditados)
  })

  it('anota sacar la posicion del calculo, que ahora es una decision del asesor', () => {
    expect(camposTrasEditar(posicion(), { esInvertible: false })).toEqual(['esInvertible'])
  })

  it('no marca campos que el asesor no edita', () => {
    expect(camposTrasEditar(posicion(), { fila: 99 })).toEqual([])
  })

  it('acumula sin repetir', () => {
    const previa = posicion({ camposEditados: ['valorUsd'] })
    expect(camposTrasEditar(previa, { valorUsd: 1, nota: 'x' })).toEqual(['valorUsd', 'nota'])
  })
})

describe('reducir', () => {
  it('aplica el cambio a la posicion indicada y deja el resto intacto', () => {
    const antes = revision([posicion(), posicion({ id: 'p2' })])
    const despues = reducir(antes, { tipo: 'editar', id: 'p2', cambios: { nota: 'llamar' } })

    expect(despues.posiciones[0]).toBe(antes.posiciones[0])
    expect(despues.posiciones[1]?.nota).toBe('llamar')
    expect(despues.posiciones[1]?.editadoManualmente).toBe(true)
  })

  it('no crea un estado nuevo de posiciones cuando nada cambio', () => {
    const antes = revision([posicion()])
    const despues = reducir(antes, { tipo: 'editar', id: 'p1', cambios: { valorUsd: 100_000 } })

    expect(despues.posiciones[0]).toBe(antes.posiciones[0])
  })

  it('marcar conservar limpia el monto a vender', () => {
    const antes = revision([posicion({ cta: 'venta_parcial', montoVentaParcial: 30_000 })])
    const despues = reducir(antes, { tipo: 'cta', id: 'p1', cta: 'conservar' })

    expect(despues.posiciones[0]?.montoVentaParcial).toBe(0)
  })

  it('marcar venta parcial conserva el monto ya escrito', () => {
    const antes = revision([posicion({ cta: 'sin_marcar', montoVentaParcial: 30_000 })])
    expect(cambiosDeCta(antes.posiciones[0]!, 'venta_parcial')).toEqual({
      cta: 'venta_parcial',
      montoVentaParcial: 30_000,
      destinos: [],
    })
  })

  it('cambiar de decision limpia el reparto de la venta condicionada', () => {
    // Un «conservar» con un reparto colgado es la misma clase de dato sucio
    // que un «conservar» con monto a vender: no se ve, y descuadra despues.
    const destinos = [
      { id: 'a', pct: 1, clase: 'club' as const, productoId: null, nombre: 'Fondo Estratégico' },
    ]
    const antes = revision([posicion({ cta: 'venta_condicionada', destinos })])

    expect(cambiosDeCta(antes.posiciones[0]!, 'conservar').destinos).toEqual([])
  })

  it('volver a marcar venta condicionada no borra lo que costo teclear', () => {
    const destinos = [
      { id: 'a', pct: 1, clase: 'club' as const, productoId: null, nombre: 'Fondo Estratégico' },
    ]
    const antes = revision([posicion({ cta: 'venta_condicionada', destinos })])

    expect(cambiosDeCta(antes.posiciones[0]!, 'venta_condicionada').destinos).toEqual(destinos)
  })

  it('los parametros se funden, no se reemplazan', () => {
    const antes = revision([posicion()])
    const despues = reducir(antes, { tipo: 'parametros', cambios: { perfil: 'Arriesgado' } })

    expect(despues.parametros.perfil).toBe('Arriesgado')
    expect(despues.parametros.ticketMinimoUsd).toBe(20_000)
  })
})

describe('proyeccion al motor', () => {
  it('manda solo lo que el motor entiende', () => {
    expect(aRevisadas([posicion()])).toEqual([
      {
        institucionProducto: 'DPF Caja Huancayo',
        origen: 'financiero',
        claseModelo: 'fijo',
        productoId: null,
        valorUsd: 100_000,
        esInvertible: true,
        cta: 'sin_marcar',
        montoVentaParcial: 0,
        destinos: [],
      },
    ])
  })

  it('lleva el reparto de una venta condicionada', () => {
    // Es lo unico que distingue a una venta condicionada de una venta total:
    // si el reparto no viaja, el motor la trata como dinero libre y la
    // instruccion del cliente se disuelve en el prorrateo del benchmark.
    const destinos = [
      { id: 'a', pct: 0.5, clase: 'club' as const, productoId: null, nombre: 'Fondo Estratégico' },
      { id: 'b', pct: 0.5, clase: 'variable' as const, productoId: null, nombre: 'Renta Variable' },
    ]

    const proyectada = aRevisadas([posicion({ cta: 'venta_condicionada', destinos })])

    expect(proyectada[0]?.destinos).toEqual(destinos)
  })
})

describe('ventaParcialInvalida', () => {
  it('detecta el monto que supera la posicion', () => {
    expect(ventaParcialInvalida(posicion({ cta: 'venta_parcial', montoVentaParcial: 100_001 }))).toBe(true)
  })

  it('no molesta cuando la decision es otra', () => {
    expect(ventaParcialInvalida(posicion({ cta: 'conservar', montoVentaParcial: 999_999 }))).toBe(false)
  })
})
