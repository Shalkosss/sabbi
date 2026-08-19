import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { parsearCatalogo } from '../parsear.js'

/**
 * La BD de productos real.
 *
 * No se afirman cifras de un producto en particular — la hoja se sigue
 * editando y eso haría un test que rompe cada semana. Lo que se fija es la
 * salud del parseo: que no se caiga la mitad del catálogo si alguien cambia un
 * guion, que las listas de validación entren completas, y que lo que no se
 * pudo interpretar se cuente en vez de desaparecer.
 *
 * Se salta donde el archivo no está, igual que el golden de la ficha.
 */
const REFERENCIA = fileURLToPath(new URL('../../../../../reference/', import.meta.url))

const RUTA = existsSync(REFERENCIA)
  ? readdirSync(REFERENCIA)
      .filter((archivo) => /^BD_Productos.*\.xlsx$/i.test(archivo) && !archivo.startsWith('~$'))
      .map((archivo) => join(REFERENCIA, archivo))[0]
  : undefined

describe.skipIf(RUTA === undefined)('BD de productos', () => {
  const catalogo = () => parsearCatalogo(new Uint8Array(readFileSync(RUTA ?? '')))

  it('carga las cuatro listas de validación completas', () => {
    const { clasesActivo, subyacentes, regiones, gestores, administradores } = catalogo()

    expect(clasesActivo).toHaveLength(6)
    expect(subyacentes).toHaveLength(32)
    expect(regiones).toHaveLength(5)
    expect(gestores.length).toBeGreaterThan(80)
    expect(administradores.length).toBeGreaterThan(70)
  })

  it('cuelga cada subyacente de una clase de activo conocida', () => {
    const { clasesActivo, subyacentes } = catalogo()

    for (const subyacente of subyacentes) {
      expect(clasesActivo).toContain(subyacente.claseActivo)
    }
  })

  it('carga el catálogo entero sin duplicados', () => {
    const { productos } = catalogo()

    expect(productos.length).toBeGreaterThan(290)
    expect(new Set(productos.map((p) => p.nombre.toLowerCase())).size).toBe(productos.length)
  })

  it('resuelve la composición de casi todos los productos', () => {
    const { productos } = catalogo()
    const sinNada = (campo: 'focoGeografico' | 'claseActivo' | 'subyacentes') =>
      productos.filter((p) => p[campo].length === 0).length

    // El umbral es holgado a propósito: sirve para detectar que se rompió el
    // vocabulario, no para congelar la calidad del dato de origen.
    expect(sinNada('focoGeografico')).toBeLessThan(5)
    expect(sinNada('claseActivo')).toBeLessThan(5)
    expect(sinNada('subyacentes')).toBeLessThan(10)
  })

  it('deja los porcentajes como fracciones que suman uno', () => {
    const { productos } = catalogo()
    const conFoco = productos.filter((p) => p.focoGeografico.length > 0)

    const cuadran = conFoco.filter(
      (p) => Math.abs(p.focoGeografico.reduce((acc, c) => acc + c.pct, 0) - 1) <= 0.015,
    )
    expect(cuadran.length / conFoco.length).toBeGreaterThan(0.98)
  })

  it('no descarta nada en silencio', () => {
    const { avisos } = catalogo()

    // Cada aviso dice qué pasó y dónde. Que haya pocos es señal de que el
    // vocabulario cubre la hoja; que existan es señal de que la hoja tiene
    // datos que una persona tiene que arreglar.
    expect(avisos.length).toBeLessThan(30)
    for (const aviso of avisos) {
      expect(aviso.detalle).not.toBe('')
      expect(aviso.motivo).toBeTruthy()
    }
  })
})
