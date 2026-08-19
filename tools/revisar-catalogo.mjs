/**
 * Lectura en seco de la BD de productos.
 *
 * No toca la base: lee el .xlsx, lo normaliza y dice qué entró y qué quedó
 * fuera. Es el paso previo a importar, y el que hay que volver a correr cada
 * vez que alguien agregue un término nuevo a mano en la hoja.
 *
 *   node tools/revisar-catalogo.mjs "reference/BD_Productos (1).xlsx" [salida.json]
 */

import { readFileSync, writeFileSync } from 'node:fs'

import { parsearCatalogo } from '@sabbi/io'

const ruta = process.argv[2]
if (ruta === undefined) {
  console.error('Falta la ruta del .xlsx.')
  process.exit(1)
}

const catalogo = parsearCatalogo(new Uint8Array(readFileSync(ruta)))

const porMotivo = new Map()
for (const aviso of catalogo.avisos) {
  porMotivo.set(aviso.motivo, [...(porMotivo.get(aviso.motivo) ?? []), aviso])
}

const faltan = (predicado) => catalogo.productos.filter(predicado).length

console.log('=== Lo que entró')
console.log(`  productos          ${catalogo.productos.length}`)
console.log(`  clases de activo   ${catalogo.clasesActivo.length}`)
console.log(`  subyacentes        ${catalogo.subyacentes.length}`)
console.log(`  regiones           ${catalogo.regiones.length}`)
console.log(`  gestores           ${catalogo.gestores.length}`)
console.log(`  administradores    ${catalogo.administradores.length}`)

console.log('\n=== Productos con campos vacíos')
for (const [etiqueta, predicado] of [
  ['sin foco geográfico', (p) => p.focoGeografico.length === 0],
  ['sin clase de activo', (p) => p.claseActivo.length === 0],
  ['sin subyacentes', (p) => p.subyacentes.length === 0],
  ['sin moneda', (p) => p.moneda === null],
  ['sin liquidez', (p) => p.liquidez === null],
  ['sin rentabilidad', (p) => p.rentabilidadMin === null],
  ['sin comisión', (p) => p.comisionPct === null],
  ['sin gestor', (p) => p.gestor === null],
  ['sin administrador', (p) => p.administrador === null],
]) {
  console.log(`  ${etiqueta.padEnd(22)} ${faltan(predicado)}`)
}

console.log('\n=== Avisos')
for (const [motivo, avisos] of [...porMotivo.entries()].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`\n  ${motivo} (${avisos.length})`)
  // Los términos desconocidos se repiten producto a producto: se agrupan.
  const vistos = new Map()
  for (const aviso of avisos) {
    const clave = `${aviso.campo ?? ''}|${aviso.detalle}`
    vistos.set(clave, [...(vistos.get(clave) ?? []), aviso.producto])
  }
  for (const [clave, productos] of [...vistos.entries()].slice(0, 30)) {
    const [campo, detalle] = clave.split('|')
    const donde = productos.length > 3 ? `${productos.length} productos` : productos.join(', ')
    console.log(`    ${campo === '' ? '' : `[${campo}] `}${detalle}  → ${donde}`)
  }
  if (vistos.size > 30) console.log(`    … y ${vistos.size - 30} más`)
}

const salida = process.argv[3]
if (salida !== undefined) {
  writeFileSync(salida, JSON.stringify(catalogo, null, 1), 'utf8')
  console.log(`\nCatálogo completo en ${salida}`)
}
