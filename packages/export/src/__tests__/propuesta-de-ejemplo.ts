import {
  armarEntradaPlan,
  armarPropuesta,
  generarPlan,
} from '@sabbi/core'
import type { AjusteClase, Benchmark, PosicionPropuesta, Propuesta } from '@sabbi/core'

/**
 * Una propuesta de juguete, para los dos decks.
 *
 * Sale del motor de verdad y no de un objeto escrito a mano: un fixture
 * inventado deja de parecerse a lo que el motor produce en cuanto el motor
 * cambia, y los tests siguen pasando contra algo que ya no existe.
 *
 * No es un archivo `.test.ts`, asi que vitest no lo levanta como suite.
 */

const BENCHMARK: Benchmark = {
  inm: 0.2,
  fijo: 0.2,
  variable: 0.2,
  privados: 0.2,
  club: 0.1,
  otros: 0.05,
  cash: 0.05,
}

const PESOS = {
  fijo: { 'iShares Core Global Aggregate Bond': 1 },
  variable: { 'iShares Core S&P 500 UCITS ETF': 1 },
  otros: { 'IBIT (BTC)': 1 },
}

const POSICIONES: PosicionPropuesta[] = [
  {
    orden: 1,
    institucionProducto: 'Cuenta corriente BCP',
    origen: 'financiero',
    tipoFicha: null,
    assetClass: 'Money Market',
    claseModelo: 'cash',
    productoId: null,
    moneda: 'USD',
    plaza: 'Perú',
    rendimientoEst: 0.01,
    nota: '',
    pais: null,
    pctPertenencia: 1,
    valorDeclaradoUsd: 600_000,
    valorUsd: 600_000,
    uso: null,
    esInvertible: true,
    cta: 'venta_total',
    montoVentaParcial: 0,
  },
  {
    orden: 2,
    institucionProducto: 'Casa de playa',
    origen: 'inmueble',
    tipoFicha: null,
    assetClass: null,
    claseModelo: 'inm',
    productoId: null,
    moneda: 'USD',
    plaza: 'Perú',
    rendimientoEst: 0.04,
    nota: '',
    pais: 'Perú',
    pctPertenencia: 1,
    valorDeclaradoUsd: 200_000,
    valorUsd: 200_000,
    uso: 'Renta',
    esInvertible: true,
    cta: 'conservar',
    montoVentaParcial: 0,
  },
]

export function propuestaDeEjemplo(ajustes: readonly AjusteClase[] = []): Propuesta {
  const comunes = {
    perfil: 'Moderado' as const,
    benchmark: BENCHMARK,
    pesos: PESOS,
    ticketMinimoUsd: 20_000,
    fallbacks: { fijo: 'Flip - Panda Zen', variable: 'Flip - Cobra achorada' },
  }

  const derivacion = armarEntradaPlan(POSICIONES, { ...comunes, ajustes })
  if (!derivacion.ok) throw new Error(derivacion.bloqueos.map((b) => b.mensaje).join(' · '))

  const base = ajustes.length === 0 ? null : armarEntradaPlan(POSICIONES, comunes)

  return armarPropuesta({
    cliente: { nombre: 'Cliente de Prueba', perfil: 'Moderado', mandato: 'Discrecional' },
    posiciones: POSICIONES,
    plan: generarPlan(derivacion.entrada),
    planSistema: base !== null && base.ok ? generarPlan(base.entrada) : null,
    modeloPuro: generarPlan({ ...derivacion.entrada, pisos: [], ajustes: [] }),
    pisos: derivacion.entrada.pisos,
    benchmark: derivacion.entrada.benchmark,
    parametros: { ticketMinimoUsd: 20_000, colchonLiquidezUsd: 0, fxPenUsd: 3.75 },
  })
}
