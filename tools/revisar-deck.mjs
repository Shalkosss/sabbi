/**
 * Inventario del deck replica: que le falta a cada lamina para poder armarse.
 *
 *   npm run revisar-deck
 *
 * Cruza tres cosas: las laminas que trae la plantilla, los tokens que tiene
 * cada una, y lo que el mapa de `packages/export/src/pptx/replica/mapa.ts` dice
 * de ella. Mira ademas como esta construida — si sus filas son una tabla, si
 * sus barras son formas dibujadas — porque eso decide si la lamina se rellena
 * o se redibuja, y es lo que no se ve hasta abrir el XML.
 *
 * No imprime ningun valor del cliente de origen: solo nombres de token. Los
 * valores viven en `token-map.json`, que no se versiona.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { strFromU8, unzipSync } from 'fflate'

import { MAPA, laminasDe, tokensDe } from '@sabbi/export'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
const PLANTILLA = join(RAIZ, 'packages', 'export', 'pptx', 'replica', 'template.pptx')

const ETIQUETA = {
  listo: 'lista',
  parcial: 'parcial',
  decision: 'decision',
  geometria: 'geometria',
  filas: 'filas',
}

const bytes = new Uint8Array(readFileSync(PLANTILLA))
const partes = unzipSync(bytes)
const tokens = tokensDe(bytes)
const numeros = laminasDe(bytes)

const leer = (ruta) => strFromU8(partes[ruta] ?? new Uint8Array())

/** Como esta hecha una lamina. Decide si se rellena o se redibuja. */
function construccion(numero) {
  const xml = leer(`ppt/slides/slide${numero}.xml`)
  const rels = leer(`ppt/slides/_rels/slide${numero}.xml.rels`)

  const marcas = []
  if (xml.includes('<a:tbl>')) marcas.push('tabla')

  const formas = (xml.match(/<p:sp>/g) ?? []).length
  if (formas > 20) marcas.push(`${formas} formas`)

  const imagenes = (rels.match(/Target="\.\.\/media\//g) ?? []).length
  // El logo esta en casi todas; solo interesa cuando hay muchas.
  if (imagenes > 2) marcas.push(`${imagenes} imagenes`)

  return marcas.join(', ')
}

console.log(`\nDeck replica — ${numeros.length} laminas\n`)
console.log('  #   estado      tokens  construccion')
console.log('  ─────────────────────────────────────────────────────────────────')

for (const lamina of MAPA) {
  const propios = tokens.get(lamina.numero) ?? []
  const estado = (ETIQUETA[lamina.estado] ?? lamina.estado).padEnd(10)
  const cuenta = String(propios.length).padStart(4)
  console.log(
    `  ${String(lamina.numero).padStart(2)}  ${estado}  ${cuenta}    ${construccion(lamina.numero)}`,
  )
  console.log(`      ${lamina.titulo}`)
  if (lamina.falta !== '') {
    for (const linea of envolver(lamina.falta, 68)) console.log(`      · ${linea}`)
  }
  console.log()
}

const cuenta = {}
for (const lamina of MAPA) cuenta[lamina.estado] = (cuenta[lamina.estado] ?? 0) + 1

const orden = ['listo', 'parcial', 'decision', 'geometria', 'filas']
console.log('  ' + orden.map((e) => `${cuenta[e] ?? 0} ${ETIQUETA[e]}`).join(' · '))
console.log(
  `\n  De las ${numeros.length}, ${cuenta.listo ?? 0} se arman hoy. Las que dicen «decision» ` +
    'esperan a la mesa,\n  no a un programador.\n',
)

function envolver(texto, ancho) {
  const lineas = []
  let actual = ''
  for (const palabra of texto.split(' ')) {
    if (actual.length + palabra.length + 1 > ancho) {
      lineas.push(actual)
      actual = palabra
    } else {
      actual = actual === '' ? palabra : `${actual} ${palabra}`
    }
  }
  if (actual !== '') lineas.push(actual)
  return lineas
}
