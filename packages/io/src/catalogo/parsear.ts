/**
 * Lectura de la BD de productos.
 *
 * El libro de origen tiene once hojas y solo cinco tienen dato: la Base, que
 * es lo unico que alguien llena, y cuatro listas que existen para validarla.
 * Las otras seis son matrices de correlacion, borradores y tablas pegadas al
 * costado de la Base — incluida una segunda columna de comisiones que obliga a
 * escribir dos veces lo mismo. Nada de eso se lee.
 *
 * Se localiza por anclas de texto, no por coordenadas: la hoja se sigue
 * editando y mover un bloque no deberia romper la importacion.
 */

import { normalizar } from '../texto.js'
import { celda, leerLibro } from '../xlsx/leer.js'
import type { Celda, Hoja, Libro } from '../xlsx/leer.js'
import { consolidar, leerComposicion, sumaCien } from './composicion.js'
import {
  CLASES_ACTIVO,
  REGIONES,
  claveVocabulario,
  indiceSubyacentes,
  limpiarTermino,
  resolverClase,
  resolverLiquidez,
  resolverMoneda,
  resolverRegion,
} from './vocabulario.js'
import { esAmbiguo, leerBandera, leerRango, leerTexto, leerValor } from './valores.js'
import type {
  ActorCatalogo,
  AvisoCatalogo,
  CatalogoParseado,
  Componente,
  ProductoCatalogo,
  RegionCatalogo,
  SubyacenteCatalogo,
} from './tipos.js'

const HOJA_BASE = 'Base'
const HOJA_SUBYACENTES = 'Subyacentes (performance)'
const HOJA_REGIONES = 'Benchmark Geografico'
const HOJA_RANKING = 'Ranking Gestor y Administrador'

/** Columnas de la Base, en indices 0-based. */
const COL = {
  nombre: 1,
  focoGeografico: 2,
  claseActivo: 3,
  subyacentes: 4,
  comision: 5,
  moneda: 6,
  administrador: 7,
  gestor: 8,
  liquidez: 9,
  rentabilidad: 10,
  subidoACircle: 11,
  productoSabbi: 13,
} as const

const hojaDe = (libro: Libro, nombre: string): Hoja | undefined =>
  libro.hojas.find((hoja) => normalizar(hoja.nombre) === normalizar(nombre))

/** Primera fila cuya celda de la columna dada equivale al ancla. */
function anclar(hoja: Hoja, columna: number, ancla: string): number {
  const buscado = normalizar(ancla)
  for (let fila = 0; fila < hoja.filas.length; fila += 1) {
    const valor = celda(hoja, fila, columna)
    if (valor !== null && normalizar(String(valor)) === buscado) return fila
  }
  return -1
}

const texto = (valor: Celda): string => (valor === null ? '' : String(valor))

// --- Listas de validacion ---

function leerSubyacentes(libro: Libro, avisos: AvisoCatalogo[]): readonly SubyacenteCatalogo[] {
  const hoja = hojaDe(libro, HOJA_SUBYACENTES)
  if (hoja === undefined) return []

  const cabecera = anclar(hoja, 1, 'Activo Canónico (usar este nombre)')
  if (cabecera < 0) return []

  const salida: SubyacenteCatalogo[] = []
  for (let fila = cabecera + 1; fila < hoja.filas.length; fila += 1) {
    const nombre = limpiarTermino(texto(celda(hoja, fila, 1)))
    const claseBruta = texto(celda(hoja, fila, 2))
    // La lista termina donde deja de haber clase: lo que sigue son notas.
    if (nombre === '' || claseBruta === '') continue

    const clase = resolverClase(claseBruta)
    if (clase === null) {
      avisos.push({
        motivo: 'termino_desconocido',
        producto: null,
        campo: 'subyacentes.clase',
        detalle: `«${claseBruta}» no es una clase de activo conocida (subyacente «${nombre}»).`,
      })
      continue
    }

    salida.push({ nombre, claseActivo: clase, scorePerformance: leerNumeroSimple(celda(hoja, fila, 3)) })
  }
  return salida
}

/** Un score suelto. No es fraccion ni porcentaje: es un puntaje de 0 a 10. */
function leerNumeroSimple(valor: Celda): number | null {
  if (valor === null) return null
  const numero = typeof valor === 'number' ? valor : Number.parseFloat(String(valor).replace(',', '.'))
  return Number.isFinite(numero) ? numero : null
}

function leerRegiones(libro: Libro): readonly RegionCatalogo[] {
  const hoja = hojaDe(libro, HOJA_REGIONES)
  if (hoja === undefined) return REGIONES.map((nombre) => ({ nombre, benchmarkPct: null }))

  const cabecera = anclar(hoja, 1, 'Región')
  const salida: RegionCatalogo[] = []
  for (let fila = cabecera + 1; cabecera >= 0 && fila < hoja.filas.length; fila += 1) {
    const bruto = texto(celda(hoja, fila, 1))
    if (bruto === '') break
    const nombre = resolverRegion(bruto)
    if (nombre === null) continue
    salida.push({ nombre, benchmarkPct: leerNumeroSimple(celda(hoja, fila, 2)) })
  }
  return salida.length > 0 ? salida : REGIONES.map((nombre) => ({ nombre, benchmarkPct: null }))
}

/**
 * Gestores y administradores, de la columna que la propia hoja marca como
 * buena.
 *
 * La hoja trae dos copias de cada lista, una al lado de la otra, con scores
 * que no siempre coinciden. La de la izquierda esta rotulada «SCORE AJUSTADO
 * KERU - USAR ESTE»; la de la derecha es una version anterior que quedo. Se
 * lee solo la izquierda.
 */
function leerActores(
  libro: Libro,
  avisos: AvisoCatalogo[],
): { gestores: readonly ActorCatalogo[]; administradores: readonly ActorCatalogo[] } {
  const hoja = hojaDe(libro, HOJA_RANKING)
  if (hoja === undefined) return { gestores: [], administradores: [] }

  const inicioGestores = anclar(hoja, 1, 'RIESGO GESTOR')
  const inicioAdmins = anclar(hoja, 1, 'RIESGO ADMINISTRADOR')
  if (inicioGestores < 0) return { gestores: [], administradores: [] }

  const recoger = (desde: number, hasta: number, rol: string): ActorCatalogo[] => {
    const vistos = new Map<string, ActorCatalogo>()
    for (let fila = desde; fila < Math.min(hasta, hoja.filas.length); fila += 1) {
      const nombre = limpiarTermino(texto(celda(hoja, fila, 1)))
      if (nombre === '') continue

      const bruto = celda(hoja, fila, 2)
      const score = leerNumeroSimple(bruto)
      if (score === null && texto(bruto) !== '') {
        avisos.push({
          motivo: 'valor_ambiguo',
          producto: null,
          campo: `${rol}.score`,
          detalle: `«${nombre}» tiene un score que no es un número: «${texto(bruto)}».`,
        })
      }

      const clave = normalizar(nombre)
      if (vistos.has(clave)) {
        avisos.push({
          motivo: 'duplicado',
          producto: null,
          campo: rol,
          detalle: `«${nombre}» aparece más de una vez; se conserva la primera aparición.`,
        })
        continue
      }
      vistos.set(clave, { nombre, score })
    }
    return [...vistos.values()]
  }

  const corte = inicioAdmins > inicioGestores ? inicioAdmins : hoja.filas.length
  return {
    gestores: recoger(inicioGestores + 1, corte, 'gestor'),
    administradores:
      inicioAdmins < 0 ? [] : recoger(inicioAdmins + 1, hoja.filas.length, 'administrador'),
  }
}

// --- La Base ---

interface ContextoComposicion {
  readonly campo: string
  readonly resolver: (bruto: string) => string | null
}

function componentes(
  bruto: string,
  producto: string,
  ctx: ContextoComposicion,
  avisos: AvisoCatalogo[],
): readonly Componente[] {
  const partes = leerComposicion(bruto)

  // Un solo termino sin porcentaje es el 100%. «Bonos Peru», a secas, no es
  // una composicion incompleta: es un producto que solo tiene eso.
  if (partes.length === 0) {
    const solo = ctx.resolver(bruto)
    if (solo !== null) return [{ nombre: solo, pct: 1 }]

    if (bruto.trim() !== '') {
      avisos.push({
        motivo: 'sin_composicion',
        producto,
        campo: ctx.campo,
        detalle: `«${bruto.trim()}» no trae porcentajes y no se pudo repartir.`,
      })
    }
    return []
  }

  const resueltos: Componente[] = []
  for (const parte of partes) {
    const nombre = ctx.resolver(parte.nombre)
    if (nombre === null) {
      avisos.push({
        motivo: 'termino_desconocido',
        producto,
        campo: ctx.campo,
        detalle: `«${parte.nombre.trim()}» no está en la lista; ese ${Math.round(parte.pct * 100)}% quedó fuera.`,
      })
      continue
    }
    resueltos.push({ nombre, pct: parte.pct })
  }

  const consolidados = consolidar(resueltos)
  if (consolidados.length > 0 && !sumaCien(consolidados)) {
    const total = Math.round(consolidados.reduce((acc, c) => acc + c.pct, 0) * 1000) / 10
    avisos.push({
      motivo: 'suma_distinta_de_cien',
      producto,
      campo: ctx.campo,
      detalle: `la composición suma ${total}%.`,
    })
  }
  return consolidados
}

function leerProductos(
  libro: Libro,
  subyacentes: readonly SubyacenteCatalogo[],
  avisos: AvisoCatalogo[],
): readonly ProductoCatalogo[] {
  const hoja = hojaDe(libro, HOJA_BASE)
  if (hoja === undefined) return []

  const cabecera = anclar(hoja, COL.nombre, 'Nombre de Producto')
  if (cabecera < 0) return []

  const idxSubyacentes = indiceSubyacentes(subyacentes.map((s) => s.nombre))
  const resolverSuby = (bruto: string): string | null =>
    idxSubyacentes.get(claveVocabulario(bruto)) ?? null

  const vistos = new Map<string, ProductoCatalogo>()

  for (let fila = cabecera + 1; fila < hoja.filas.length; fila += 1) {
    const nombre = limpiarTermino(texto(celda(hoja, fila, COL.nombre)))
    if (nombre === '') continue

    const clave = normalizar(nombre)
    if (vistos.has(clave)) {
      avisos.push({
        motivo: 'duplicado',
        producto: nombre,
        campo: null,
        detalle: 'aparece más de una vez en la Base; se conserva la primera aparición.',
      })
      continue
    }

    const comisionCelda = celda(hoja, fila, COL.comision)
    if (esAmbiguo(comisionCelda)) {
      avisos.push({
        motivo: 'valor_ambiguo',
        producto: nombre,
        campo: 'comision',
        detalle: `«${texto(comisionCelda)}» trae más de una comisión; se tomó la menor.`,
      })
    }

    const monedaBruta = texto(celda(hoja, fila, COL.moneda))
    const moneda = resolverMoneda(monedaBruta)
    if (moneda === null && monedaBruta !== '') {
      avisos.push({
        motivo: 'termino_desconocido',
        producto: nombre,
        campo: 'moneda',
        detalle: `«${monedaBruta}» no es una moneda conocida.`,
      })
    }

    const liquidezBruta = texto(celda(hoja, fila, COL.liquidez))
    const liquidez = resolverLiquidez(liquidezBruta)
    if (liquidez === null && liquidezBruta !== '') {
      avisos.push({
        motivo: 'termino_desconocido',
        producto: nombre,
        campo: 'liquidez',
        detalle: `«${liquidezBruta}» no es una liquidez conocida.`,
      })
    }

    const rentabilidad = leerRango(celda(hoja, fila, COL.rentabilidad))

    vistos.set(clave, {
      nombre,
      moneda,
      liquidez,
      comisionPct: leerValor(comisionCelda),
      rentabilidadMin: rentabilidad?.min ?? null,
      rentabilidadMax: rentabilidad?.max ?? null,
      administrador: leerTexto(celda(hoja, fila, COL.administrador)),
      gestor: leerTexto(celda(hoja, fila, COL.gestor)),
      esProductoSabbi: leerBandera(celda(hoja, fila, COL.productoSabbi)),
      subidoACircle: leerBandera(celda(hoja, fila, COL.subidoACircle)),
      focoGeografico: componentes(
        texto(celda(hoja, fila, COL.focoGeografico)),
        nombre,
        { campo: 'foco geográfico', resolver: resolverRegion },
        avisos,
      ),
      claseActivo: componentes(
        texto(celda(hoja, fila, COL.claseActivo)),
        nombre,
        { campo: 'clase de activo', resolver: resolverClase },
        avisos,
      ),
      subyacentes: componentes(
        texto(celda(hoja, fila, COL.subyacentes)),
        nombre,
        { campo: 'subyacentes', resolver: resolverSuby },
        avisos,
      ),
    })
  }

  return [...vistos.values()]
}

export function parsearCatalogo(datos: Uint8Array): CatalogoParseado {
  const libro = leerLibro(datos)
  const avisos: AvisoCatalogo[] = []

  const subyacentes = leerSubyacentes(libro, avisos)
  const { gestores, administradores } = leerActores(libro, avisos)

  return {
    productos: leerProductos(libro, subyacentes, avisos),
    clasesActivo: [...CLASES_ACTIVO],
    subyacentes,
    regiones: leerRegiones(libro),
    gestores,
    administradores,
    avisos,
  }
}
