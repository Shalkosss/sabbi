/**
 * Genera un deck de muestra, para mirarlo.
 *
 *   npm run deck-de-muestra
 *
 * No toca la base ni necesita claves: arma una propuesta de ejemplo a mano y
 * la pasa por el mismo generador que usa la web. Sirve para ver como esta
 * saliendo el PPT sin tener que cargar una ficha real de cliente.
 *
 * El archivo sale en la carpeta del proyecto, como `Deck de muestra.pptx`.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { armarDeck } from '../packages/export/dist/index.js'

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const PLANTILLA = path.join(RAIZ, 'packages', 'export', 'pptx', 'replica', 'template.pptx')
const SALIDA = path.join(RAIZ, 'Deck de muestra.pptx')

const linea = (instrumento, usd, share, retorno, nota = null) => ({
  instrumento,
  usd,
  share,
  conservada: false,
  retornoTotal: retorno,
  retornoDistributivo: null,
  distribucionAnualUsd: null,
  moneda: 'USD',
  nota,
})

/** Un patrimonio de ejemplo, con las clases que Sabbi usa de verdad. */
const propuesta = {
  cliente: { nombre: 'Cliente de Muestra', perfil: 'Moderado', mandato: 'Crecimiento' },
  seccion1: { filas: [], totalUsd: 1_800_000 },
  seccion2: { filas: [], totalUsd: 650_000 },
  seccion3: {
    filas: [
      { assetClass: 'Mercados Públicos Fijo', valorUsd: 720_000, share: 0.4, seConservaUsd: 720_000, seVendeUsd: 0 },
      { assetClass: 'Mercados Públicos Variable', valorUsd: 450_000, share: 0.25, seConservaUsd: 450_000, seVendeUsd: 0 },
      { assetClass: 'Mercados Privados', valorUsd: 360_000, share: 0.2, seConservaUsd: 360_000, seVendeUsd: 0 },
      { assetClass: 'Inmobiliario Directo', valorUsd: 180_000, share: 0.1, seConservaUsd: 180_000, seVendeUsd: 0 },
      { assetClass: 'Cash', valorUsd: 90_000, share: 0.05, seConservaUsd: 90_000, seVendeUsd: 0 },
    ],
    totalUsd: 1_800_000,
  },
  seccion4: { filas: [], totalUsd: 1_800_000 },
  seccion5: { porMoneda: [], porPlaza: [] },
  seccion6: {
    parametros: {
      ticketFinancieroTotalUsd: 1_800_000,
      montoAReinvertirUsd: 520_000,
      fxPenUsd: 3.75,
      colchonLiquidezUsd: 90_000,
      pctModeloInmobiliario: 0.1,
      baseRedistribucionUsd: 1_800_000,
    },
    grupos: [
      {
        clase: 'fijo',
        objetivoUsd: 700_000,
        share: 0.39,
        cerrada: false,
        lineas: [
          linea('iShares Core Global Aggregate Bond', 400_000, 0.22, { min: 0.042, max: 0.055 }, 'Deuda global grado de inversión'),
          linea('Vanguard Short-Term Treasury', 180_000, 0.1, { min: 0.038, max: 0.045 }, 'Tesoro americano corto plazo'),
          linea('Bono corporativo local PEN', 120_000, 0.07, { min: 0.055, max: 0.07 }, 'Renta fija local'),
        ],
      },
      {
        clase: 'variable',
        objetivoUsd: 560_000,
        share: 0.31,
        cerrada: false,
        lineas: [
          linea('Vanguard Total World Stock', 340_000, 0.19, { min: 0.07, max: 0.09 }, 'Acciones globales'),
          linea('iShares Core MSCI Emerging Markets', 220_000, 0.12, { min: 0.08, max: 0.11 }, 'Mercados emergentes'),
        ],
      },
      {
        clase: 'privados',
        objetivoUsd: 360_000,
        share: 0.2,
        cerrada: false,
        lineas: [
          linea('Fondo Oportunidad', 200_000, 0.11, { min: 0.1, max: 0.14 }, 'Producto Sabbi, mínimo USD 10k'),
          linea('Deuda privada LatAm', 160_000, 0.09, { min: 0.09, max: 0.12 }, null),
        ],
      },
      {
        clase: 'inm',
        objetivoUsd: 90_000,
        share: 0.05,
        cerrada: false,
        lineas: [linea('Renta inmobiliaria Lima', 90_000, 0.05, { min: 0.06, max: 0.08 }, null)],
      },
      {
        clase: 'cash',
        objetivoUsd: 90_000,
        share: 0.05,
        cerrada: false,
        lineas: [linea('Money market USD', 90_000, 0.05, { min: 0.04, max: 0.045 }, null)],
      },
    ],
    comparativo: [],
    totalUsd: 1_800_000,
    cuadreUsd: 0,
  },
  seccion7: {
    ventas: [
      { instrumento: 'Depósito a plazo BCP', accion: 'Venta total', usd: 260_000 },
      { instrumento: 'Fondo mutuo local Credicorp', accion: 'Venta parcial', usd: 160_000 },
      { instrumento: 'Acciones individuales BVL', accion: 'Venta total', usd: 100_000 },
    ],
    compras: [
      { instrumento: 'iShares Core Global Aggregate Bond', clase: 'fijo', usd: 240_000 },
      { instrumento: 'Vanguard Total World Stock', clase: 'variable', usd: 180_000 },
      { instrumento: 'Fondo Oportunidad', clase: 'privados', usd: 100_000 },
    ],
    totalVentasUsd: 520_000,
    totalComprasUsd: 520_000,
    cuadreUsd: 0,
  },
  avisos: [],
}

const { archivo, resueltos, vacios, eliminadas, excedente } = armarDeck(
  readFileSync(PLANTILLA),
  propuesta,
  { emitido: new Date() },
)

writeFileSync(SALIDA, archivo)

console.log(`\nListo: ${SALIDA}\n`)
console.log(`  huecos rellenados : ${resueltos.length}`)
console.log(`  huecos en blanco  : ${vacios.length}`)
console.log(`  laminas quitadas  : ${eliminadas.length === 0 ? 'ninguna' : eliminadas.join(', ')}`)
if (excedente > 0) console.log(`  ATENCION: ${excedente} instrumentos no entraron en el anexo`)
console.log('\nAbrilo con doble clic para ver como esta saliendo.\n')
