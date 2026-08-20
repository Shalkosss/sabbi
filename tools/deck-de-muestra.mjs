/**
 * Genera los dos decks de muestra, para mirarlos.
 *
 *   npm run deck-de-muestra
 *
 * No toca la base ni necesita claves: arma una propuesta de ejemplo con el
 * mismo motor que corre la web y la pasa por los mismos generadores. Sirve para
 * ver como esta saliendo el PPT sin cargar una ficha real de cliente.
 *
 * La propuesta sale del motor y no de un objeto escrito a mano a proposito: un
 * ejemplo inventado deja de parecerse a lo que el motor produce en cuanto el
 * motor cambia, y uno se queda mirando un deck que ya no existe.
 *
 * Salen dos archivos en la raiz del proyecto: `Deck de muestra.pptx` con el
 * redisenado y `Deck de muestra - replica.pptx` con el de plantilla.
 */
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { armarEntradaPlan, armarPropuesta, generarPlan } from '../packages/core/dist/index.js'
import {
  armarDeckReplica,
  armarDeckRediseno,
  leerPlantillaReplica,
} from '../packages/export/dist/index.js'

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

const BENCHMARK = {
  inm: 0.2403,
  fijo: 0.1899,
  variable: 0.1643,
  privados: 0.214,
  club: 0.0913,
  otros: 0.0055,
  cash: 0.0947,
}

const PESOS = {
  fijo: {
    'iShares Core Global Aggregate Bond UCITS ETF': 0.45,
    'iShares $ Treasury Bond 1-3yr UCITS ETF': 0.55,
  },
  variable: {
    'iShares Core S&P 500 UCITS ETF': 0.6,
    'iShares Core MSCI EM IMI UCITS ETF': 0.4,
  },
  otros: { 'IBIT (BTC)': 1 },
}

/** Una posicion de ejemplo con todo lo que la propuesta necesita. */
const posicion = (parcial) => ({
  orden: 1,
  tipoFicha: null,
  assetClass: 'Money Market',
  productoId: null,
  moneda: 'USD',
  plaza: 'Perú',
  rendimientoEst: 0.03,
  nota: '',
  pais: null,
  pctPertenencia: 1,
  uso: null,
  esInvertible: true,
  cta: 'venta_total',
  montoVentaParcial: 0,
  origen: 'financiero',
  claseModelo: 'cash',
  valorDeclaradoUsd: parcial.valorUsd,
  ...parcial,
})

const POSICIONES = [
  posicion({
    orden: 1,
    institucionProducto: 'DPF Caja Huancayo',
    assetClass: 'Depósito a plazo',
    claseModelo: 'fijo',
    valorUsd: 214_492,
    cta: 'conservar',
    rendimientoEst: 0.055,
  }),
  posicion({ orden: 2, institucionProducto: 'Cuenta corriente BCP', valorUsd: 486_000, rendimientoEst: 0.005 }),
  posicion({
    orden: 3,
    institucionProducto: 'Fondo mutuo Interbank dólares',
    assetClass: 'Fondo mutuo',
    claseModelo: 'privados',
    valorUsd: 120_000,
    rendimientoEst: 0.04,
  }),
  posicion({
    orden: 4,
    institucionProducto: 'Departamento en Miraflores',
    origen: 'inmueble',
    claseModelo: 'inm',
    assetClass: null,
    valorUsd: 380_000,
    uso: 'Renta',
    pais: 'Perú',
    cta: 'conservar',
    rendimientoEst: 0.042,
  }),
  posicion({
    orden: 5,
    institucionProducto: 'ETFs Inteligo SAB',
    assetClass: 'ETF acciones',
    claseModelo: 'variable',
    valorUsd: 92_000,
    rendimientoEst: 0.08,
  }),
  posicion({
    orden: 6,
    institucionProducto: 'Casa de playa en Asia',
    origen: 'inmueble',
    claseModelo: 'inm',
    assetClass: null,
    valorUsd: 260_000,
    uso: 'Uso propio',
    pais: 'Perú',
    esInvertible: false,
    cta: 'sin_marcar',
    rendimientoEst: null,
  }),
]

const catalogo = (retMin, retMax, liquidez) => ({
  retMin,
  retMax,
  distMin: null,
  distMax: null,
  distFrecuencia: null,
  moneda: 'USD',
  liquidez,
})

const CATALOGO = new Map([
  ['iShares Core S&P 500 UCITS ETF', catalogo(0.08, 0.1, 'Flexible')],
  ['iShares Core MSCI EM IMI UCITS ETF', catalogo(0.07, 0.09, 'Flexible')],
  ['iShares Core Global Aggregate Bond UCITS ETF', catalogo(0.04, 0.055, 'Flexible')],
  ['iShares $ Treasury Bond 1-3yr UCITS ETF', catalogo(0.038, 0.045, 'Flexible')],
  ['FM RE Infra', catalogo(0.09, 0.11, '5 años')],
  ['FM PC', catalogo(0.08, 0.1, '4 años')],
  ['Fondo Edifica Diversificado Clase A', catalogo(0.11, 0.13, '3 años')],
  ['Cash', catalogo(0.04, 0.045, 'Flexible')],
])

const anotacion = (descripcion, proposito) => ({ descripcion, proposito })

const ANOTACIONES = new Map([
  ['iShares Core S&P 500 UCITS ETF', anotacion('S&P 500', 'Núcleo de renta variable')],
  ['iShares Core MSCI EM IMI UCITS ETF', anotacion('Mercados emergentes', 'Crecimiento')],
  ['iShares Core Global Aggregate Bond UCITS ETF', anotacion('Agregado global', 'Base de renta fija')],
  ['iShares $ Treasury Bond 1-3yr UCITS ETF', anotacion('Tesoro americano corto', 'Liquidez con retorno')],
  ['FM RE Infra', anotacion('Real estate e infraestructura', 'Ingresos estables')],
  ['FM PC', anotacion('Deuda privada', 'Carry sobre el mercado público')],
  ['Fondo Edifica Diversificado Clase A', anotacion('Club deal inmobiliario', 'Retorno alto, plazo largo')],
  ['Departamento en Miraflores', anotacion('Inmueble en renta', 'Se conserva')],
  ['DPF Caja Huancayo', anotacion('Depósito a plazo', 'Se conserva hasta vencimiento')],
])

const comunes = {
  perfil: 'Moderado',
  benchmark: BENCHMARK,
  pesos: PESOS,
  ticketMinimoUsd: 20_000,
  fallbacks: { fijo: 'Flip - Panda Zen', variable: 'Flip - Cobra achorada' },
}

// Un ajuste, para que salga tambien la lamina de los dos portafolios.
const ajustes = [{ clase: 'cash', modo: 'fijar', montoUsd: 120_000 }]

const derivacion = armarEntradaPlan(POSICIONES, { ...comunes, ajustes })
if (!derivacion.ok) {
  console.error('La propuesta de muestra no se puede calcular:')
  for (const bloqueo of derivacion.bloqueos) console.error(`  · ${bloqueo.mensaje}`)
  process.exit(1)
}
const base = armarEntradaPlan(POSICIONES, comunes)

const propuesta = armarPropuesta({
  cliente: { nombre: 'Cliente de Muestra', perfil: 'Moderado', mandato: 'Crecimiento' },
  posiciones: POSICIONES,
  plan: generarPlan(derivacion.entrada),
  planSistema: base.ok ? generarPlan(base.entrada) : null,
  modeloPuro: generarPlan({ ...derivacion.entrada, pisos: [], ajustes: [], inmFijado: false }),
  pisos: derivacion.entrada.pisos,
  benchmark: derivacion.entrada.benchmark,
  parametros: { ticketMinimoUsd: 20_000, colchonLiquidezUsd: 0, fxPenUsd: 3.75 },
  catalogo: CATALOGO,
  anotaciones: ANOTACIONES,
})

const emitido = new Date()

const rediseno = await armarDeckRediseno(propuesta, { fecha: emitido, asesor: 'Asesor de Muestra' })
const salidaRediseno = path.join(RAIZ, 'Deck de muestra.pptx')
writeFileSync(salidaRediseno, rediseno)

const replica = armarDeckReplica(leerPlantillaReplica(), propuesta, { fecha: emitido })
const salidaReplica = path.join(RAIZ, 'Deck de muestra - replica.pptx')
writeFileSync(salidaReplica, replica.bytes)

console.log(`\nRediseñado  ${salidaRediseno}`)
console.log(`            ${(rediseno.byteLength / 1024).toFixed(0)} KB`)
console.log(`\nRéplica     ${salidaReplica}`)
console.log(`            ${replica.laminas.length} láminas · ${replica.sinFuente.length} celdas en blanco`)
console.log('\n`npm run revisar-deck` dice qué le falta a cada lámina.\n')
