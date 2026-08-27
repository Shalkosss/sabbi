/**
 * Lectura en seco del libro de retornos de la mesa.
 *
 * No toca la base. Lee el .xlsm, corre el motor sobre cada serie y contrasta
 * el resultado contra el bloque de metricas que la macro dejo escrito debajo
 * de cada columna.
 *
 *   node tools/revisar-retornos.mjs reference/Macro_Base_Retornos_Master_Funds.xlsm
 *
 * Es el paso previo a importar y el que decide si el motor puede reemplazar la
 * hoja. Un fondo que no reproduce sus propias metricas publicadas no se
 * importa a ciegas: o el motor esta mal, o la celda de la hoja arrastraba un
 * rango corto. Las dos cosas hay que verlas antes, no despues.
 */

import { readFileSync } from 'node:fs'

import { VENTANAS, calcularMetricas } from '@sabbi/core'
import { parsearRetornos } from '@sabbi/io'

const ruta = process.argv[2]
if (ruta === undefined) {
  console.error('Falta la ruta del .xlsm.\n\n  node tools/revisar-retornos.mjs <libro.xlsm>')
  process.exit(1)
}

/**
 * El Treasury 10Y que la hoja usa para el Sharpe, mes a mes.
 *
 * La hoja lo tiene en doce filas rotuladas solo por el nombre del mes —
 * «Treasury 10Y (enero)» — sin anio. Cada columna toma la del mes en que
 * termina su serie. Como las columnas cierran entre 2025-04 y 2026-07, la
 * misma fila «junio» le sirve a un fondo de junio de 2025 y a uno de junio de
 * 2026: la hoja reusa el valor de un anio en el otro sin decirlo.
 *
 * Aca se reproduce ese comportamiento, que es lo unico que permite contrastar.
 * El importador no lo reproduce: escribe filas fechadas y avisa cuales salieron
 * de un nombre de mes reusado.
 */
const riskFreePorMesDelLibro = (libro) => {
  const mapa = new Map()
  for (const fondo of libro.fondos) {
    for (const punto of fondo.serie) {
      const nombre = MESES_DEL_ANIO[Number(punto.mes.slice(5, 7)) - 1]
      const cierre = libro.treasuryPorMes[nombre]
      if (cierre !== undefined) mapa.set(punto.mes, cierre)
    }
  }
  return mapa
}

const MESES_DEL_ANIO = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
]

/** Respaldo, para el caso imposible de que a la hoja le falte un mes. */
const RISK_FREE_RESPALDO = 0.04475

/** Cuanto puede diferir una metrica antes de que valga la pena mirarla. */
const TOLERANCIA = 5e-6

const libro = parsearRetornos(new Uint8Array(readFileSync(ruta)))
const riskFreePorMes = riskFreePorMesDelLibro(libro)

console.log('=== Lo que trae el libro')
console.log(`  columnas leidas    ${libro.fondos.length}`)
console.log(`  fondos             ${libro.fondos.filter((f) => !f.esReferencia).length}`)
console.log(`  indices            ${libro.fondos.filter((f) => f.esReferencia).length}`)
console.log(`  observaciones      ${libro.fondos.reduce((n, f) => n + f.serie.length, 0)}`)
console.log(`  Treasury 10Y       ${Object.keys(libro.treasuryPorMes).length} meses (sin anio)`)

const porClase = new Map()
for (const fondo of libro.fondos) {
  const clase = fondo.assetClass ?? '(sin clase)'
  porClase.set(clase, (porClase.get(clase) ?? 0) + 1)
}
console.log('\n=== Por clase')
for (const [clase, n] of [...porClase].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${clase.padEnd(18)} ${n}`)
}

if (libro.avisos.length > 0) {
  console.log('\n=== Avisos')
  for (const aviso of libro.avisos) {
    console.log(`  [${aviso.motivo}] ${aviso.fondo ?? ''}`)
    console.log(`      ${aviso.detalle}`)
  }
}

// ── El contraste ────────────────────────────────────────────────────────────
// Cada fondo se calcula con su propio ultimo mes como corte, que es lo que
// hacia la hoja: la formula de cada columna anclaba a su ultima fila con dato,
// no a una fecha comun. Un fondo que reporta trimestral cierra en marzo y su
// «1 Y» son los doce meses hasta marzo.

const diferencias = []
const sinDeclarar = []

const anota = (fondo, metrica, mio, suyo) => {
  if (mio === null && suyo === null) return
  if (mio === null || suyo === null) {
    diferencias.push({ fondo, metrica, mio, suyo, delta: null })
    return
  }
  const delta = Math.abs(mio - suyo)
  if (delta > TOLERANCIA) diferencias.push({ fondo, metrica, mio, suyo, delta })
}

let contrastados = 0

for (const fondo of libro.fondos) {
  const declarada = libro.declaradas.get(fondo.nombre)
  if (declarada === undefined) {
    sinDeclarar.push(fondo.nombre)
    continue
  }

  const ultimo = fondo.serie.at(-1)?.mes ?? null
  if (ultimo === null) continue
  const anioTope = Number(ultimo.slice(0, 4))

  const metricas = calcularMetricas(
    {
      id: fondo.nombre,
      nombre: fondo.nombre,
      assetClass: fondo.assetClass ?? 'Sin clase',
      inception: fondo.inception,
      guidanceCortoPlazo: fondo.guidanceCortoPlazo,
      domicilio: fondo.domicilio,
    },
    fondo.serie.map((p) => ({ mes: p.mes, nav: null, retornoTotal: p.retornoTotal })),
    { riskFree: RISK_FREE_RESPALDO, riskFreePorMes, anioTope, aniosAtras: 8 },
  )

  contrastados += 1

  for (const ventana of VENTANAS) {
    const mia = metricas.ventanas.find((v) => v.ventana === ventana.clave)
    anota(fondo.nombre, `retorno ${ventana.etiqueta}`, mia?.retorno ?? null, declarada.retorno[ventana.clave] ?? null)
    anota(fondo.nombre, `desv ${ventana.etiqueta}`, mia?.desviacion ?? null, declarada.desviacion[ventana.clave] ?? null)
    anota(fondo.nombre, `sharpe ${ventana.etiqueta}`, mia?.sharpe ?? null, declarada.sharpe[ventana.clave] ?? null)
  }

  for (const [anio, suyo] of Object.entries(declarada.anios)) {
    const mio = metricas.anios.find((a) => a.anio === Number(anio))?.retorno ?? null
    anota(fondo.nombre, `anio ${anio}`, mio, suyo)
  }
}

console.log(`\n=== Contraste contra la macro  (Treasury del mes de corte, tolerancia ${TOLERANCIA})`)
console.log(`  columnas contrastadas   ${contrastados}`)
console.log(`  diferencias             ${diferencias.length}`)
if (sinDeclarar.length > 0) {
  console.log(`  sin bloque de metricas  ${sinDeclarar.length}: ${sinDeclarar.join(', ')}`)
}

// Se agrupan por metrica y no por fondo: una diferencia en «sharpe 5 Y» de
// veinte fondos es un desacuerdo de criterio, y veinte fondos con una
// diferencia distinta cada uno es otra cosa. Verlo por fondo esconde cual de
// las dos es.
const porMetrica = new Map()
for (const d of diferencias) porMetrica.set(d.metrica, [...(porMetrica.get(d.metrica) ?? []), d])

for (const [metrica, grupo] of [...porMetrica].sort((a, b) => b[1].length - a[1].length)) {
  // `delta === null` es «uno de los dos no tiene el numero»: no es una
  // diferencia de valor sino de si la metrica existe, y se cuenta aparte.
  const numericas = grupo.map((d) => d.delta).filter((d) => d !== null)
  const peor = numericas.length === 0 ? null : Math.max(...numericas)
  const resumen =
    peor === null
      ? 'solo presencia'
      : `peor ${peor.toExponential(2)}${numericas.length < grupo.length ? `, ${grupo.length - numericas.length} de presencia` : ''}`
  console.log(`\n  ${metrica}  (${grupo.length}, ${resumen})`)
  for (const d of grupo.slice(0, 8)) {
    const mio = d.mio === null ? 'n/d' : d.mio.toFixed(6)
    const suyo = d.suyo === null ? 'n/d' : d.suyo.toFixed(6)
    console.log(`      ${d.fondo.padEnd(46).slice(0, 46)}  motor ${mio.padStart(10)}   hoja ${suyo.padStart(10)}`)
  }
  if (grupo.length > 8) console.log(`      … y ${grupo.length - 8} mas`)
}

// ── El veredicto ────────────────────────────────────────────────────────────
// La cuenta que importa no es «cuantas celdas difieren» sino «cuantas difieren
// en el numero». Una celda que el motor calcula y la hoja dejo vacia no es un
// desacuerdo: es la macro que no arrastro la formula hasta la fila del fondo
// nuevo, que es la mitad de la razon por la que este modulo existe.
const deValor = diferencias.filter((d) => d.delta !== null)
const deMas = diferencias.filter((d) => d.delta === null && d.mio !== null)
const deMenos = diferencias.filter((d) => d.delta === null && d.mio === null)

console.log('\n=== Veredicto')
console.log(`  celdas donde el numero difiere   ${deValor.length}`)
console.log(`  celdas que el motor llena y la hoja dejo vacias  ${deMas.length}`)
console.log(`  celdas que la hoja tiene y el motor no  ${deMenos.length}`)

if (deValor.length === 0) {
  console.log('\n  El motor reproduce todos los numeros de la hoja.')
} else {
  console.log('\n  Las que difieren en el numero, una por una:')
  for (const d of deValor) {
    console.log(
      `    ${d.fondo.slice(0, 44).padEnd(44)} ${d.metrica.padEnd(22)} ` +
        `motor ${d.mio.toFixed(6).padStart(10)}   hoja ${d.suyo.toFixed(6).padStart(10)}`,
    )
  }
}
