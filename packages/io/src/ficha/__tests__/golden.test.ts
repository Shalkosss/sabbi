import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { parsearFicha } from '../parsear.js'

/**
 * Golden del caso de referencia sobre la ficha real.
 *
 * La ficha vive en `reference/`, que esta en .gitignore: trae el nombre, los
 * bancos y los inmuebles de una persona, y la ley 29733 no admite eso en un
 * repositorio. Por eso el bloque se salta donde el archivo no esta, y por eso
 * las aserciones son estructurales y agregadas — cantidades, clases y totales —
 * en vez de nombres de productos o de propiedades.
 *
 * El invariante que importa: el patrimonio invertible que sale de aca es el
 * ticket que entra al motor, y da 1,264,392.99 al centavo, que es el total de
 * la propuesta real y el mismo numero que usa el golden de `@sabbi/core`.
 */
const REFERENCIA = fileURLToPath(new URL('../../../../../reference/', import.meta.url))

/** La ficha se busca por patron: su nombre trae el del cliente y no se escribe. */
const RUTA = existsSync(REFERENCIA)
  ? readdirSync(REFERENCIA)
      .filter((archivo) => /^Ficha.*\.xlsx$/i.test(archivo) && !archivo.startsWith('~$'))
      .map((archivo) => join(REFERENCIA, archivo))[0]
  : undefined

const hay = RUTA !== undefined
const ficha = () => parsearFicha(new Uint8Array(readFileSync(RUTA ?? '')))

describe.skipIf(!hay)('ficha de referencia', () => {
  it('lee los datos del cliente por sus anclas', () => {
    const { cliente } = ficha()

    expect(cliente.nombre).toBeTruthy()
    expect(cliente.horizonte).toBeTruthy()
    expect(cliente.flujoActual).toBeTruthy()
    expect(cliente.flujoRetiro).toBeTruthy()
    expect(cliente.observaciones).toHaveLength(4)
  })

  it('parsea las 16 filas sin avisos ni descartes', () => {
    const parseada = ficha()

    expect(parseada.posiciones).toHaveLength(16)
    expect(parseada.posiciones.filter((p) => p.origen === 'financiero')).toHaveLength(11)
    expect(parseada.posiciones.filter((p) => p.origen === 'inmueble')).toHaveLength(5)
    expect(parseada.avisos).toEqual([])
    expect(parseada.ignoradas).toEqual([])
    expect(parseada.deudas).toEqual([])
  })

  it('reproduce el ticket del motor al centavo', () => {
    const { totales } = ficha()

    expect(totales.financieroUsd).toBeCloseTo(709_392.9889173061, 6)
    expect(totales.inmueblesRentaUsd).toBe(555_000)
    expect(totales.usoPropioUsd).toBe(200_000)
    expect(totales.invertibleUsd).toBeCloseTo(1_264_392.9889173061, 6)
  })

  it('clasifica cada posicion en una clase del motor', () => {
    const { posiciones } = ficha()

    expect(posiciones.every((p) => p.claseModelo !== null)).toBe(true)

    /** Solo lo invertible: el inmueble de uso propio tambien es `inm`. */
    const porClase = (clase: string) =>
      posiciones
        .filter((p) => p.claseModelo === clase && p.esInvertible)
        .reduce((total, p) => total + p.valorUsd, 0)

    expect(porClase('inm')).toBe(555_000)
    expect(porClase('cash') + porClase('fijo') + porClase('privados')).toBeCloseTo(
      709_392.9889173061,
      6,
    )
    // El piso de Fijo del golden del motor sale de una sola posicion de 16,000.
    expect(posiciones.filter((p) => p.claseModelo === 'fijo' && p.valorUsd === 16_000)).toHaveLength(
      1,
    )
  })

  it('marca para confirmacion los fondos mutuos, que el desplegable no desambigua', () => {
    const mutuos = ficha().posiciones.filter((p) => p.tipoFicha === 'Fondos mutuos')

    expect(mutuos).toHaveLength(4)
    expect(mutuos.every((p) => p.requiereConfirmacion)).toBe(true)
  })

  it('convierte el rendimiento escrito como texto con signo de porcentaje', () => {
    // Una sola fila de la ficha trae el rendimiento como "6.5%".
    const rendimientos = ficha()
      .posiciones.filter((p) => p.origen === 'financiero')
      .map((p) => p.rendimientoEst)

    expect(rendimientos).toContainEqual(0.065)
    expect(rendimientos.every((r) => r === null || (r >= 0 && r < 1))).toBe(true)
  })

  it('calcula el cap rate de cada inmueble en renta y excluye el de uso propio', () => {
    const inmuebles = ficha().posiciones.filter((p) => p.origen === 'inmueble')
    const enRenta = inmuebles.filter((p) => p.esInvertible)
    const usoPropio = inmuebles.filter((p) => !p.esInvertible)

    expect(enRenta).toHaveLength(4)
    expect(usoPropio).toHaveLength(1)
    expect(usoPropio[0]?.rendimientoEst).toBeNull()

    for (const inmueble of enRenta) {
      const esperado = ((inmueble.alquilerMensualUsd ?? 0) * 12) / inmueble.valorDeclaradoUsd
      expect(inmueble.rendimientoEst).toBeCloseTo(esperado, 10)
    }
    // El primero de la lista renta a 9% anual.
    expect(enRenta[0]?.rendimientoEst).toBeCloseTo(0.09, 10)
  })

  it('guarda el portafolio modelo pegado a la derecha sin mezclarlo con la ficha', () => {
    const { modelo } = ficha()

    expect(modelo?.perfil).toBe('Moderado')
    expect(modelo?.montoMinimoEtfUsd).toBe(20_000)
    expect(modelo?.entradas.length).toBeGreaterThan(10)
  })
})
