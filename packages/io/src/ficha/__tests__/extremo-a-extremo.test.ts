import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { armarEntradaPlan, armarPropuesta, generarPlan, TOLERANCIA_CUADRE } from '@sabbi/core'
import type { PosicionPropuesta, PosicionRevisada } from '@sabbi/core'
import { benchmarkDe, pesosDeClase } from '@sabbi/config'
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
        otros: pesosDeClase('otros', 'Moderado'),
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

  it('respeta lo conservado y reparte el resto entre las clases del modelo', () => {
    const { plan: resultado } = plan()
    const objetivo = (clase: string) =>
      resultado.reparto.porClase.find((c) => c.clase === clase)?.objetivoUsd ?? 0

    // Las clases con posiciones conservadas quedan clavadas en lo que el
    // cliente ya tiene: el inmueble y el money market no se venden.
    expect(objetivo('inm')).toBeCloseTo(555_000, 2)
    expect(objetivo('cash')).toBeCloseTo(214_492.75, 1)

    // El resto del patrimonio se reparte entre las clases que compran. No se
    // fijan los montos: los decide la macro activa, y fijarlos aca seria
    // congelar el modelo en un test de parseo de fichas.
    const reparte = ['fijo', 'variable', 'privados', 'club', 'otros'] as const
    const nuevo = reparte.reduce((total, clase) => total + objetivo(clase), 0)
    expect(nuevo).toBeCloseTo(1_264_392.99 - 555_000 - 214_492.75, 1)

    for (const clase of resultado.reparto.porClase) {
      const suma = resultado.lineas
        .filter((l) => l.clase === clase.clase)
        .reduce((acc, l) => acc + l.usd, 0)
      expect(suma, clase.clase).toBeCloseTo(clase.objetivoUsd, 2)
    }
  })

  it('cuadra el total del plan contra el patrimonio y las compras contra el dinero disponible', () => {
    const { derivacion, plan: resultado } = plan()

    expect(resultado.totalObjetivoUsd).toBeCloseTo(1_264_392.9889173061, 4)
    expect(resultado.dineroNuevoUsd).toBeCloseTo(derivacion.resumen.dineroDisponibleUsd, 4)
  })
})

/**
 * La propuesta sobre el mismo caso.
 *
 * El plan ya esta verificado arriba; lo que agrega este bloque es que las
 * siete secciones cuadren contra el, sin que nadie escriba una cifra a mano.
 * Los dos controles que deciden si una propuesta se puede publicar — el
 * objetivo contra el patrimonio y las compras contra las ventas — son los
 * mismos que corre la vista web.
 */
describe.skipIf(RUTA === undefined)('de la ficha a la propuesta', () => {
  const armar = () => {
    const ficha = parsearFicha(new Uint8Array(readFileSync(RUTA ?? '')))

    const posiciones: PosicionPropuesta[] = ficha.posiciones.map((posicion) => ({
      orden: posicion.orden,
      institucionProducto: posicion.institucionProducto,
      origen: posicion.origen,
      tipoFicha: posicion.tipoFicha,
      assetClass: posicion.assetClass,
      claseModelo: posicion.claseModelo,
      productoId: posicion.productoId,
      moneda: posicion.moneda,
      plaza: posicion.plaza,
      valorUsd: posicion.valorUsd,
      valorDeclaradoUsd: posicion.valorDeclaradoUsd,
      pctPertenencia: posicion.pctPertenencia,
      pais: posicion.pais,
      uso: posicion.uso,
      rendimientoEst: posicion.rendimientoEst,
      nota: '',
      esInvertible: posicion.esInvertible,
      cta: posicion.esInvertible ? decidir(posicion) : 'sin_marcar',
      montoVentaParcial: 0,
    }))

    const opciones = {
      perfil: 'Moderado' as const,
      benchmark: benchmarkDe('Moderado'),
      pesos: {
        fijo: pesosDeClase('fijo', 'Moderado'),
        variable: pesosDeClase('variable', 'Moderado'),
        otros: pesosDeClase('otros', 'Moderado'),
      },
      ticketMinimoUsd: ficha.modelo?.montoMinimoEtfUsd ?? 20_000,
      fallbacks: { fijo: 'Flip Panda', variable: 'Flip Cobra' },
    }

    const derivacion = armarEntradaPlan(posiciones, opciones)
    if (!derivacion.ok) throw new Error('No debería bloquearse')

    return armarPropuesta({
      cliente: { nombre: 'Caso de referencia', perfil: 'Moderado', mandato: null },
      posiciones,
      plan: generarPlan(derivacion.entrada),
      modeloPuro: generarPlan({ ...derivacion.entrada, pisos: [] }),
      pisos: derivacion.entrada.pisos,
      benchmark: opciones.benchmark,
      parametros: { ticketMinimoUsd: opciones.ticketMinimoUsd, colchonLiquidezUsd: 0, fxPenUsd: 3.4 },
    })
  }

  it('cuadra las siete secciones contra el patrimonio financiero', () => {
    const propuesta = armar()
    const patrimonio = 1_264_392.9889173061

    expect(propuesta.seccion1.totalUsd).toBeCloseTo(patrimonio, 4)
    expect(propuesta.seccion3.totalUsd).toBeCloseTo(patrimonio, 4)
    expect(propuesta.seccion4.totalUsd).toBeCloseTo(patrimonio, 4)
    expect(propuesta.seccion6.totalUsd).toBeCloseTo(patrimonio, 4)
    expect(Math.abs(propuesta.seccion6.cuadreUsd)).toBeLessThan(TOLERANCIA_CUADRE)
  })

  it('deja el uso propio fuera del patrimonio financiero', () => {
    const propuesta = armar()

    expect(propuesta.seccion2.totalUsd).toBeCloseTo(200_000, 2)
    expect(propuesta.seccion1.filas.some((fila) => fila.esInmuebleDeRenta)).toBe(true)
  })

  it('cierra el blotter en el dinero disponible de la propuesta real', () => {
    const propuesta = armar()

    expect(propuesta.seccion7.totalVentasUsd).toBeCloseTo(478_900.2352941177, 4)
    expect(propuesta.seccion7.totalComprasUsd).toBeCloseTo(478_900.2352941177, 4)
    expect(Math.abs(propuesta.seccion7.cuadreUsd)).toBeLessThan(TOLERANCIA_CUADRE)
  })

  it('no cuenta como compra lo que el cliente conserva', () => {
    const propuesta = armar()
    const conservadas = propuesta.seccion6.grupos
      .flatMap((grupo) => grupo.lineas)
      .filter((linea) => linea.conservada)

    expect(conservadas.length).toBeGreaterThan(0)
    for (const linea of conservadas) {
      expect(propuesta.seccion7.compras.map((c) => c.instrumento)).not.toContain(linea.instrumento)
    }
  })
})
