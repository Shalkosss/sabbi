/**
 * Saca la matriz del benchmark a un CSV, para analizarla fuera de la web.
 *
 *   npm run exportar-benchmark
 *
 * Son los mismos veinte portafolios que muestra la pantalla de Benchmark, y
 * salen del mismo motor: no hay una segunda implementacion de ninguna cuenta.
 * La pantalla es para mirarlos; este CSV es para graficarlos, cruzarlos o
 * llevarlos a un Excel.
 *
 * Una fila por instrumento, no por clase. La clase se reconstruye sumando —al
 * reves no: agregando de entrada se pierde que ETF entro y cual no, que es
 * justamente lo que hay que mirar cuando el ticket es chico.
 *
 * No toca la base ni necesita claves.
 */
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { benchmarkDe, pesosDeClase } from '../packages/config/dist/src/index.js'
import { generarPlan, NOMBRE_CLASE, PERFILES } from '../packages/core/dist/index.js'

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const SALIDA = path.join(RAIZ, 'benchmark.csv')

/** Los mismos que la pantalla. Cambiarlos aca no cambia la web. */
const TICKETS = [25_000, 50_000, 75_000, 100_000]
const TICKET_ETF = 20_000
const FALLBACKS = { fijo: 'Flip - Panda Zen', variable: 'Flip - Cobra achorada' }

/** Una celda de CSV que sobrevive a una coma o una comilla en el nombre. */
function celda(valor) {
  const texto = String(valor)
  return /[",\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto
}

const filas = [
  [
    'ticket_usd',
    'perfil',
    'clase',
    'clase_nombre',
    'instrumento',
    'usd',
    'share_total',
    'share_clase',
  ],
]

for (const ticket of TICKETS) {
  for (const perfil of PERFILES) {
    const plan = generarPlan({
      perfil,
      patrimonioTotalUsd: ticket,
      benchmark: benchmarkDe(perfil),
      pesos: {
        fijo: pesosDeClase('fijo', perfil),
        variable: pesosDeClase('variable', perfil),
        otros: pesosDeClase('otros', perfil),
      },
      // Sin pisos: el modelo en vacio, que es lo que esta matriz mira.
      pisos: [],
      ticketMinimoUsd: TICKET_ETF,
      fallbacks: FALLBACKS,
    })

    const totalDe = (clase) =>
      plan.lineas.reduce((acc, l) => (l.clase === clase ? acc + l.usd : acc), 0)

    for (const linea of plan.lineas) {
      const enSuClase = totalDe(linea.clase)
      filas.push([
        ticket,
        perfil,
        linea.clase,
        NOMBRE_CLASE[linea.clase],
        linea.instrumento,
        linea.usd.toFixed(2),
        (linea.usd / plan.totalObjetivoUsd).toFixed(6),
        enSuClase > 0 ? (linea.usd / enSuClase).toFixed(6) : '0',
      ])
    }
  }
}

writeFileSync(SALIDA, filas.map((f) => f.map(celda).join(',')).join('\n') + '\n', 'utf8')

const corridas = TICKETS.length * PERFILES.length
console.log(`\n${SALIDA}`)
console.log(`  ${corridas} portafolios · ${filas.length - 1} lineas de instrumento`)
console.log(`  tickets: ${TICKETS.map((t) => `${t / 1000}k`).join(', ')}`)
console.log(`  perfiles: ${PERFILES.join(', ')}`)
console.log(`\n  python tools/benchmark-grafico.py\n`)
