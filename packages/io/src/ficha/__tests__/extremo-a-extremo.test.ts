import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { armarEntradaPlan, generarPlan } from '@sabbi/core'
import type { PosicionRevisada } from '@sabbi/core'
import { benchmarkDe, pesosDeClase, pesosPrivadosDe } from '@sabbi/config'
import { describe, expect, it } from 'vitest'

import { parsearFicha } from '../parsear.js'

/**
 * La cadena entera sobre el caso de referencia: .xlsx → posiciones → entrada
 * del motor → plan.
 *
 * Los tres eslabones ya estan verificados por separado. Este test existe para
 * lo que ninguno de ellos ve: que el ticket que arma el parser, los pisos que
 * arma el puente y los objetivos que produce el motor sean el mismo numero que
 * la propuesta real, sin que nadie los escriba a mano en el medio.
 *
 * Se salta donde la ficha no esta, igual que el golden del parser.
 */
const REFERENCIA = fileURLToPath(new URL('../../../../../reference/', import.meta.url))

const RUTA = existsSync(REFERENCIA)
  ? readdirSync(REFERENCIA)
      .filter((archivo) => /^Ficha.*\.xlsx$/i.test(archivo) && !archivo.startsWith('~$'))
      .map((archivo) => join(REFERENCIA, archivo))[0]
  : undefined

/**
 * Decisiones del asesor en la propuesta real: se conservan los inmuebles de
 * renta, el deposito a plazo grande y el seguro con devolucion; el resto se
 * vende y financia las compras. Se identifican por monto para no escribir el
 * nombre de los productos del cliente en el repositorio.
 */
const CONSERVADAS_USD = [214_492.7536231884, 16_000]

const decidir = (posicion: {
  origen: 'financiero' | 'inmueble'
  valorUsd: number
}): PosicionRevisada['cta'] => {
  if (posicion.origen === 'inmueble') return 'conservar'
  return CONSERVADAS_USD.some((monto) => Math.abs(monto - posicion.valorUsd) < 0.01)
    ? 'conservar'
    : 'venta_total'
}

describe.skipIf(RUTA === undefined)('de la ficha al plan', () => {
  const plan = () => {
    const ficha = parsearFicha(new Uint8Array(readFileSync(RUTA ?? '')))

    const revisadas: PosicionRevisada[] = ficha.posiciones.map((posicion) => ({
      institucionProducto: posicion.institucionProducto,
      origen: posicion.origen,
      claseModelo: posicion.claseModelo,
      productoId: posicion.productoId,
      valorUsd: posicion.valorUsd,
      esInvertible: posicion.esInvertible,
      cta: posicion.esInvertible ? decidir(posicion) : 'sin_marcar',
      montoVentaParcial: 0,
    }))

    const derivacion = armarEntradaPlan(revisadas, {
      perfil: 'Moderado',
      benchmark: benchmarkDe('Moderado'),
      pesos: {
        fijo: pesosDeClase('fijo', 'Moderado'),
        variable: pesosDeClase('variable', 'Moderado'),
        privados: pesosPrivadosDe('Moderado'),
      },
      ticketMinimoUsd: ficha.modelo?.montoMinimoEtfUsd ?? 20_000,
      fallbacks: { fijo: 'Flip Panda', variable: 'Flip Cobra' },
    })

    if (!derivacion.ok) {
      throw new Error(`No debería bloquearse: ${derivacion.bloqueos.map((b) => b.codigo).join()}`)
    }
    return { ficha, derivacion, plan: generarPlan(derivacion.entrada) }
  }

  it('arma el ticket y el dinero disponible de la propuesta real', () => {
    const { derivacion } = plan()

    expect(derivacion.entrada.patrimonioTotalUsd).toBeCloseTo(1_264_392.9889173061, 6)
    // Compras de la propuesta: 478,900.24.
    expect(derivacion.resumen.dineroDisponibleUsd).toBeCloseTo(478_900.2352941177, 6)
    expect(derivacion.resumen.conservadoUsd).toBeCloseTo(785_492.7536231884, 6)
  })

  it('toma el ticket mínimo de ETF de la propia ficha', () => {
    const { derivacion } = plan()

    expect(derivacion.entrada.ticketMinimoUsd).toBe(20_000)
  })

  it('arma un piso por posición conservada y ninguno por las vendidas', () => {
    const { derivacion } = plan()
    const pisos = derivacion.entrada.pisos

    expect(pisos.every((piso) => piso.origen === 'conservado')).toBe(true)
    const porClase = (clase: string) =>
      pisos.filter((p) => p.clase === clase).reduce((total, p) => total + p.montoUsd, 0)

    expect(porClase('inm')).toBe(555_000)
    expect(porClase('cash')).toBeCloseTo(214_492.75, 2)
    expect(porClase('fijo')).toBe(16_000)
    expect(porClase('variable')).toBe(0)
    expect(porClase('privados')).toBe(0)
  })

  it('reproduce la base de redistribución y los objetivos por clase', () => {
    const { plan: resultado } = plan()
    const objetivo = (clase: string) =>
      resultado.reparto.porClase.find((c) => c.clase === clase)?.objetivoUsd ?? 0

    // Las cifras de la propuesta son estas mismas redondeadas al centavo: el
    // Excel parte de un patrimonio de 1,264,392.99 y un efectivo conservado de
    // 214,492.75, y la ficha los trae con todos sus decimales. Ese redondeo de
    // entrada mueve la base menos de un centavo, que es la tolerancia de aca.
    expect(resultado.reparto.baseRedistribucion).toBeCloseTo(744_255.9831, 1)
    expect(objetivo('inm')).toBeCloseTo(555_000, 2)
    expect(objetivo('cash')).toBeCloseTo(214_492.75, 1)
    expect(objetivo('fijo')).toBeCloseTo(141_318.96, 1)
    expect(objetivo('variable')).toBeCloseTo(122_258.03, 1)
    expect(objetivo('privados')).toBeCloseTo(231_323.25, 1)
  })

  it('cuadra el total del plan contra el patrimonio y las compras contra el dinero disponible', () => {
    const { derivacion, plan: resultado } = plan()

    expect(resultado.totalObjetivoUsd).toBeCloseTo(1_264_392.9889173061, 4)
    expect(resultado.dineroNuevoUsd).toBeCloseTo(derivacion.resumen.dineroDisponibleUsd, 4)
  })
})
