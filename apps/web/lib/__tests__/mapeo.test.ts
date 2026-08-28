import type { DeudaFicha, PosicionFicha } from '@sabbi/io'
import { describe, expect, it } from 'vitest'

import { COLUMNA_DE_CAMPO, filaDeDeuda, filaDePosicion, posicionDeFila } from '../datos/mapeo'
import type { FilaPosicion } from '../datos/mapeo'
import { EDITABLES } from '../estado'

const posicion: PosicionFicha = {
  orden: 3,
  origen: 'inmueble',
  fila: 41,
  institucionProducto: 'Departamento Miraflores',
  tipoFicha: null,
  assetClass: 'Inmobiliario directo',
  claseModelo: 'inm',
  requiereConfirmacion: false,
  productoId: null,
  moneda: 'USD',
  plaza: 'Perú',
  pertenencia: 'Conyugal',
  pctPertenencia: 0.5,
  valorUsd: 275_000,
  valorDeclaradoUsd: 550_000,
  rendimientoEst: 0.0432,
  feePct: null,
  pais: 'Perú',
  alquilerMensualUsd: 1_100,
  uso: 'Renta mensual',
  esInvertible: true,
  cta: 'conservar',
  montoVentaParcial: 0,
  editadoManualmente: false,
}

const deuda: DeudaFicha = {
  orden: 1,
  fila: 60,
  nombre: 'Hipoteca BCP',
  pertenencia: 'Conyugal',
  valorUsd: 80_000,
  plazoAnios: 12,
  interesAnual: 0.089,
}

describe('filas para el insert', () => {
  it('posiciones y deudas comparten exactamente las mismas columnas', () => {
    // PostgREST toma las columnas de la primera fila del lote: una segunda con
    // otras claves rebota el insert entero.
    expect(Object.keys(filaDeDeuda(deuda, 'f1', 16)).sort()).toEqual(
      Object.keys(filaDePosicion(posicion, 'f1')).sort(),
    )
  })

  it('la deuda queda fuera del calculo y detras de las posiciones', () => {
    const fila = filaDeDeuda(deuda, 'f1', 16)

    expect(fila.origen).toBe('deuda')
    expect(fila.es_invertible).toBe(false)
    expect(fila.orden).toBe(17)
  })

  it('normaliza el uso del inmueble a lo que acepta la columna', () => {
    expect(filaDePosicion(posicion, 'f1').uso).toBe('Renta')
    expect(filaDePosicion({ ...posicion, uso: 'Uso propio de la familia' }, 'f1').uso).toBe(
      'Uso propio',
    )
    expect(filaDePosicion({ ...posicion, uso: 'Alquiler eventual' }, 'f1').uso).toBeNull()
  })
})

describe('vuelta desde la base', () => {
  const fila: FilaPosicion = {
    ...filaDePosicion(posicion, 'f1'),
    id: 'uuid-1',
    nota: 'confirmar cap rate',
    editado_manualmente: true,
    campos_editados: ['valorUsd'],
    oculta: false,
  }

  it('devuelve la posicion tal como se guardo', () => {
    const vuelta = posicionDeFila(fila)

    expect(vuelta.id).toBe('uuid-1')
    expect(vuelta.institucionProducto).toBe('Departamento Miraflores')
    expect(vuelta.valorUsd).toBe(275_000)
    expect(vuelta.valorDeclaradoUsd).toBe(550_000)
    expect(vuelta.uso).toBe('Renta')
    expect(vuelta.nota).toBe('confirmar cap rate')
    expect(vuelta.camposEditados).toEqual(['valorUsd'])
  })

  it('lo que vuelve sin clase es lo que hay que confirmar', () => {
    expect(posicionDeFila({ ...fila, clase_modelo: null }).requiereConfirmacion).toBe(true)
    expect(posicionDeFila(fila).requiereConfirmacion).toBe(false)
  })

  it('una ficha vieja sin campos marcados no rompe la tabla', () => {
    expect(posicionDeFila({ ...fila, campos_editados: null }).camposEditados).toEqual([])
  })
})

describe('columnas del autoguardado', () => {
  it('cada campo editable tiene su columna', () => {
    for (const campo of EDITABLES) expect(COLUMNA_DE_CAMPO[campo]).toBeDefined()
  })

  it('las marcas de edicion tambien se guardan', () => {
    expect(COLUMNA_DE_CAMPO['camposEditados']).toBe('campos_editados')
  })
})
