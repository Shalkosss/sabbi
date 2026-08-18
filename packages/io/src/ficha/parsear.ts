/**
 * Parser de la ficha patrimonial.
 *
 * Las fichas las llena el cliente en Excel y se editan a mano: se insertan
 * filas, se corren columnas y se pega un portafolio modelo a la derecha. Por
 * eso nada se lee por coordenada. Cada bloque se localiza por su ancla de
 * texto normalizado, y sus columnas por el texto de los encabezados de esa
 * misma fila. Mover un bloque no rompe el parser; renombrar un encabezado si,
 * y entonces falla ruidosamente en vez de leer la columna equivocada.
 *
 * El corte de cada tabla mira solo las columnas del propio bloque. La ficha de
 * referencia tiene el "Total" del portafolio modelo a la altura de la mitad de
 * la tabla de activos: cortar por cualquier celda de la fila se comeria medio
 * patrimonio.
 */

import type { Celda, Hoja } from '../xlsx/leer.js'
import { celda, leerLibro } from '../xlsx/leer.js'
import { contiene, equivale, normalizar } from '../texto.js'
import { clasificar } from './taxonomia.js'
import type { ReglaTaxonomia } from './taxonomia.js'
import type {
  Aviso,
  DeudaFicha,
  EntradaModelo,
  FilaIgnorada,
  FichaParseada,
  PortafolioModelo,
  PosicionFicha,
} from './tipos.js'
import { capRate, leerMoneda, leerNumero, leerPorcentaje, leerRendimiento } from './valores.js'

const ANCLA_ACTIVOS = 'cuenta bancaria y nombre exacto'
const ANCLA_INMUEBLES = 'inmuebles'
const ANCLA_DEUDAS = 'deudas'
const ANCLA_OBSERVACIONES = 'algo adicional que quieras agregar'
const ANCLA_MODELO = 'clase de activo'
const ANCLA_MIN_ETF = 'monto minimo etf'
const ANCLA_NOMBRE = 'nombres y apellidos'
const ANCLA_HORIZONTE = 'horizonte de inversion'
const ANCLA_FLUJO_ACTUAL = 'flujo actual'
const ANCLA_FLUJO_RETIRO = 'flujo al retiro'

/** Dos filas vacias seguidas cierran un bloque, igual que la fila "Total". */
const VACIAS_PARA_CERRAR = 2

const ASSET_CLASS_INMUEBLE = 'Inmobiliario Directo'

export interface OpcionesFicha {
  /** Hoja a leer. Por defecto, la primera que tenga la tabla de activos. */
  readonly hoja?: string
  /** Reglas de `asset_class_map`. Por defecto, el seed del paquete. */
  readonly taxonomia?: readonly ReglaTaxonomia[]
}

interface Punto {
  readonly fila: number
  readonly col: number
}

const texto = (valor: Celda): string | null => {
  if (typeof valor === 'string') {
    const limpio = valor.trim()
    return limpio === '' ? null : limpio
  }
  return typeof valor === 'number' ? String(valor) : null
}

/** Primera celda cuyo texto contiene la frase. Recorre de arriba a abajo. */
function buscarAncla(hoja: Hoja, frase: string): Punto | null {
  for (const [fila, celdas] of hoja.filas.entries()) {
    for (const [col, valor] of celdas.entries()) {
      if (typeof valor === 'string' && contiene(valor, frase)) return { fila, col }
    }
  }
  return null
}

/** Valor de la celda contigua a la derecha, saltando las vacias intermedias. */
function valorDerecha(hoja: Hoja, punto: Punto, salto = 4): Celda {
  for (let col = punto.col + 1; col <= punto.col + salto; col += 1) {
    const valor = celda(hoja, punto.fila, col)
    if (valor !== null) return valor
  }
  return null
}

/**
 * Columnas de un bloque, por el texto de sus encabezados.
 *
 * Busca cada campo en toda la fila del ancla: entre el nombre del bloque y su
 * primer encabezado la ficha real deja seis columnas vacias, asi que barrer
 * hacia la derecha hasta el primer hueco no sirve. Los encabezados son frases
 * propias del bloque y no colisionan con lo que haya pegado al costado.
 */
function mapaColumnas<C extends string>(
  hoja: Hoja,
  filaEncabezado: number,
  campos: readonly (readonly [C, readonly string[]])[],
): Map<C, number> {
  const columnas = new Map<C, number>()
  const tomadas = new Set<number>()
  const celdas = hoja.filas[filaEncabezado] ?? []

  for (const [campo, frases] of campos) {
    for (const [col, valor] of celdas.entries()) {
      if (tomadas.has(col) || typeof valor !== 'string') continue
      if (frases.some((frase) => contiene(valor, frase))) {
        columnas.set(campo, col)
        tomadas.add(col)
        break
      }
    }
  }
  return columnas
}

/**
 * Encabezado de otro bloque.
 *
 * Cierra el bloque en curso aunque no haya fila "Total" ni dos filas vacias:
 * basta una linea en blanco mal puesta para que las preguntas del final de la
 * ficha entren como si fueran deudas sin monto.
 */
function esInicioDeOtroBloque(valor: Celda): boolean {
  if (typeof valor !== 'string') return false
  const normal = normalizar(valor)
  return (
    normal.startsWith(ANCLA_DEUDAS) ||
    normal === ANCLA_INMUEBLES ||
    contiene(normal, ANCLA_ACTIVOS) ||
    contiene(normal, ANCLA_OBSERVACIONES) ||
    contiene(normal, 'algo que te gustaria lograr')
  )
}

/** Filas de datos de un bloque: desde el encabezado hasta "Total" o dos vacias. */
function filasDelBloque(hoja: Hoja, filaEncabezado: number, desde: number, hasta: number): number[] {
  const filas: number[] = []
  let vacias = 0

  for (let fila = filaEncabezado + 1; fila < hoja.filas.length; fila += 1) {
    const celdas = (hoja.filas[fila] ?? []).slice(desde, hasta + 1)
    if (celdas.some((valor) => typeof valor === 'string' && equivale(valor, 'total'))) break
    if (esInicioDeOtroBloque(celda(hoja, fila, desde))) break

    if (celdas.every((valor) => valor === null || valor === '')) {
      vacias += 1
      if (vacias >= VACIAS_PARA_CERRAR) break
      continue
    }

    vacias = 0
    filas.push(fila)
  }
  return filas
}

/** Lector de columnas de una fila, ya resueltas a indices. */
const lector =
  <C extends string>(hoja: Hoja, columnas: ReadonlyMap<C, number>, fila: number) =>
  (campo: C): Celda => {
    const col = columnas.get(campo)
    return col === undefined ? null : celda(hoja, fila, col)
  }

type CampoActivo = 'tipo' | 'moneda' | 'pertenencia' | 'valor' | 'rendimiento' | 'fee'

const CAMPOS_ACTIVOS: readonly (readonly [CampoActivo, readonly string[]])[] = [
  ['tipo', ['tipo de activo']],
  ['moneda', ['moneda']],
  ['pertenencia', ['pertenencia']],
  ['valor', ['valor estimado']],
  ['rendimiento', ['rendimiento']],
  ['fee', ['fee']],
]

type CampoInmueble = 'pais' | 'pertenencia' | 'pct' | 'valor' | 'alquiler' | 'uso'

const CAMPOS_INMUEBLES: readonly (readonly [CampoInmueble, readonly string[]])[] = [
  ['pais', ['pais']],
  ['pct', ['% de pertenencia', 'porcentaje de pertenencia']],
  ['pertenencia', ['pertenencia']],
  ['valor', ['valor estimado']],
  ['alquiler', ['monto de alquiler', 'alquiler mensual']],
  ['uso', ['uso de la propiedad']],
]

type CampoDeuda = 'pertenencia' | 'valor' | 'plazo' | 'interes'

const CAMPOS_DEUDAS: readonly (readonly [CampoDeuda, readonly string[]])[] = [
  ['pertenencia', ['pertenencia']],
  ['valor', ['valor estimado']],
  ['plazo', ['plazo']],
  ['interes', ['interes']],
]

const derecha = (columnas: ReadonlyMap<string, number>, ancla: number): number =>
  Math.max(ancla, ...columnas.values())

export function parsearHoja(hoja: Hoja, opciones: OpcionesFicha = {}): FichaParseada {
  const avisos: Aviso[] = []
  const ignoradas: FilaIgnorada[] = []
  const posiciones: PosicionFicha[] = []

  const anclaActivos = buscarAncla(hoja, ANCLA_ACTIVOS)
  if (anclaActivos === null) {
    throw new Error(
      `La hoja "${hoja.nombre}" no parece una ficha patrimonial: no encontré la tabla de activos ("${ANCLA_ACTIVOS}...").`,
    )
  }

  // ── Activos financieros ───────────────────────────────────────────────────
  const colsActivos = mapaColumnas(hoja, anclaActivos.fila, CAMPOS_ACTIVOS)
  if (colsActivos.size === 0) {
    avisos.push({
      codigo: 'bloque_ausente',
      mensaje: 'La tabla de activos no tiene encabezados reconocibles.',
      fila: anclaActivos.fila + 1,
    })
  }

  for (const fila of filasDelBloque(
    hoja,
    anclaActivos.fila,
    anclaActivos.col,
    derecha(colsActivos, anclaActivos.col),
  )) {
    const leer = lector(hoja, colsActivos, fila)
    const nombre = texto(celda(hoja, fila, anclaActivos.col))
    const valorDeclarado = leerNumero(leer('valor'))

    if (nombre === null) {
      if (valorDeclarado !== null) {
        ignoradas.push({ fila: fila + 1, origen: 'financiero', institucionProducto: '', motivo: 'sin_nombre' })
      }
      continue
    }
    if (valorDeclarado === null || valorDeclarado <= 0) {
      ignoradas.push({ fila: fila + 1, origen: 'financiero', institucionProducto: nombre, motivo: 'sin_valor' })
      continue
    }

    const tipoFicha = texto(leer('tipo'))
    const clase = clasificar({ tipoFicha, nombre }, opciones.taxonomia)
    const moneda = leerMoneda(leer('moneda'))
    const rendimiento = leerRendimiento(leer('rendimiento'))

    if (moneda.aviso !== undefined) {
      avisos.push({ codigo: 'moneda_desconocida', mensaje: moneda.aviso, fila: fila + 1 })
    }
    if (rendimiento.aviso !== undefined) {
      avisos.push({ codigo: 'rendimiento_dudoso', mensaje: rendimiento.aviso, fila: fila + 1 })
    }
    if (clase.regla === null) {
      avisos.push({
        codigo: 'clase_sin_resolver',
        mensaje: `No pude clasificar "${nombre}" (${tipoFicha ?? 'sin tipo'}). Asígnale una clase antes de calcular.`,
        fila: fila + 1,
      })
    }

    posiciones.push({
      orden: posiciones.length + 1,
      origen: 'financiero',
      fila: fila + 1,
      institucionProducto: nombre,
      tipoFicha,
      assetClass: clase.assetClass,
      claseModelo: clase.claseModelo,
      requiereConfirmacion: clase.requiereConfirmacion,
      productoId: null,
      moneda: moneda.valor,
      plaza: 'Perú',
      pertenencia: texto(leer('pertenencia')),
      pctPertenencia: 1,
      valorUsd: valorDeclarado,
      valorDeclaradoUsd: valorDeclarado,
      rendimientoEst: rendimiento.valor,
      feePct: leerNumero(leer('fee')),
      pais: null,
      alquilerMensualUsd: null,
      uso: null,
      esInvertible: true,
      cta: 'sin_marcar',
      montoVentaParcial: 0,
      editadoManualmente: false,
    })
  }

  // ── Inmuebles ─────────────────────────────────────────────────────────────
  const anclaInmuebles = buscarAncla(hoja, ANCLA_INMUEBLES)
  if (anclaInmuebles !== null) {
    const colsInmuebles = mapaColumnas(hoja, anclaInmuebles.fila, CAMPOS_INMUEBLES)

    for (const fila of filasDelBloque(
      hoja,
      anclaInmuebles.fila,
      anclaInmuebles.col,
      derecha(colsInmuebles, anclaInmuebles.col),
    )) {
      const leer = lector(hoja, colsInmuebles, fila)
      const nombre = texto(celda(hoja, fila, anclaInmuebles.col))
      const valorDeclarado = leerNumero(leer('valor'))

      if (nombre === null) continue
      if (valorDeclarado === null || valorDeclarado <= 0) {
        ignoradas.push({ fila: fila + 1, origen: 'inmueble', institucionProducto: nombre, motivo: 'sin_valor' })
        continue
      }

      const uso = texto(leer('uso'))
      const esUsoPropio = uso !== null && contiene(uso, 'uso propio')
      const pct = leerPorcentaje(leer('pct'))
      const alquiler = leerNumero(leer('alquiler'))

      posiciones.push({
        orden: posiciones.length + 1,
        origen: 'inmueble',
        fila: fila + 1,
        institucionProducto: nombre,
        tipoFicha: null,
        assetClass: ASSET_CLASS_INMUEBLE,
        claseModelo: 'inm',
        requiereConfirmacion: false,
        productoId: null,
        moneda: 'USD',
        plaza: 'Perú',
        pertenencia: texto(leer('pertenencia')),
        pctPertenencia: pct,
        valorUsd: valorDeclarado * pct,
        valorDeclaradoUsd: valorDeclarado,
        // El uso propio no rinde nada porque no participa de ningun calculo.
        rendimientoEst: esUsoPropio ? null : capRate(alquiler, valorDeclarado),
        feePct: null,
        pais: texto(leer('pais')),
        alquilerMensualUsd: esUsoPropio ? null : alquiler,
        uso,
        esInvertible: !esUsoPropio,
        cta: 'sin_marcar',
        montoVentaParcial: 0,
        editadoManualmente: false,
      })
    }
  }

  // ── Deudas ────────────────────────────────────────────────────────────────
  const deudas: DeudaFicha[] = []
  const anclaDeudas = buscarAncla(hoja, ANCLA_DEUDAS)
  if (anclaDeudas !== null) {
    const colsDeudas = mapaColumnas(hoja, anclaDeudas.fila, CAMPOS_DEUDAS)

    for (const fila of filasDelBloque(
      hoja,
      anclaDeudas.fila,
      anclaDeudas.col,
      derecha(colsDeudas, anclaDeudas.col),
    )) {
      const leer = lector(hoja, colsDeudas, fila)
      const nombre = texto(celda(hoja, fila, anclaDeudas.col))
      const valor = leerNumero(leer('valor'))
      if (nombre === null) continue
      if (valor === null || valor <= 0) {
        ignoradas.push({ fila: fila + 1, origen: 'deuda', institucionProducto: nombre, motivo: 'sin_valor' })
        continue
      }

      deudas.push({
        orden: deudas.length + 1,
        fila: fila + 1,
        nombre,
        pertenencia: texto(leer('pertenencia')),
        valorUsd: valor,
        plazoAnios: leerNumero(leer('plazo')),
        interesAnual: leerNumero(leer('interes')),
      })
    }
  }

  // ── Datos del cliente ─────────────────────────────────────────────────────
  const desdeAncla = (frase: string): string | null => {
    const punto = buscarAncla(hoja, frase)
    return punto === null ? null : texto(valorDerecha(hoja, punto))
  }

  const observaciones: string[] = []
  const anclaNotas = buscarAncla(hoja, ANCLA_OBSERVACIONES)
  if (anclaNotas !== null) {
    let vacias = 0
    for (let fila = anclaNotas.fila + 1; fila < hoja.filas.length; fila += 1) {
      const linea = texto(celda(hoja, fila, anclaNotas.col))
      if (linea === null) {
        vacias += 1
        if (vacias >= VACIAS_PARA_CERRAR) break
        continue
      }
      vacias = 0
      observaciones.push(linea)
    }
  }

  // ── Portafolio modelo pegado a la derecha ─────────────────────────────────
  const modelo = leerModelo(hoja)

  const invertibles = posiciones.filter((posicion) => posicion.esInvertible)
  const suma = (origen: PosicionFicha['origen']): number =>
    invertibles
      .filter((posicion) => posicion.origen === origen)
      .reduce((total, posicion) => total + posicion.valorUsd, 0)

  const financieroUsd = suma('financiero')
  const inmueblesRentaUsd = suma('inmueble')
  const usoPropioUsd = posiciones
    .filter((posicion) => !posicion.esInvertible)
    .reduce((total, posicion) => total + posicion.valorUsd, 0)

  return {
    hoja: hoja.nombre,
    cliente: {
      nombre: desdeAncla(ANCLA_NOMBRE),
      horizonte: desdeAncla(ANCLA_HORIZONTE),
      flujoActual: desdeAncla(ANCLA_FLUJO_ACTUAL),
      flujoRetiro: desdeAncla(ANCLA_FLUJO_RETIRO),
      observaciones,
    },
    posiciones,
    deudas,
    ignoradas,
    avisos,
    totales: {
      financieroUsd,
      inmueblesRentaUsd,
      usoPropioUsd,
      invertibleUsd: financieroUsd + inmueblesRentaUsd,
    },
    modelo,
  }
}

/**
 * Bloque de portafolio modelo, cuando la ficha lo trae.
 *
 * Se lee entero como referencia y no entra en ningun calculo. Su fila "Total"
 * cierra el bloque; el monto minimo de ETF, cuando esta, es el unico parametro
 * de motor que la ficha alcanza a traer.
 */
function leerModelo(hoja: Hoja): PortafolioModelo | null {
  const ancla = buscarAncla(hoja, ANCLA_MODELO)
  if (ancla === null) return null

  const entradas: EntradaModelo[] = []
  for (let fila = ancla.fila + 1; fila < hoja.filas.length; fila += 1) {
    const etiqueta = texto(celda(hoja, fila, ancla.col))
    if (etiqueta === null || equivale(etiqueta, 'total')) break
    entradas.push({
      etiqueta,
      usd: leerNumero(celda(hoja, fila, ancla.col + 1)),
      pct: leerNumero(celda(hoja, fila, ancla.col + 2)),
    })
  }

  const anclaMinimo = buscarAncla(hoja, ANCLA_MIN_ETF)
  const perfil = texto(valorDerecha(hoja, ancla))

  return {
    perfil: perfil !== null && normalizar(perfil) !== '%' ? perfil : null,
    montoMinimoEtfUsd: anclaMinimo === null ? null : leerNumero(valorDerecha(hoja, anclaMinimo)),
    entradas,
  }
}

/** Parsea una ficha .xlsx completa. */
export function parsearFicha(datos: Uint8Array, opciones: OpcionesFicha = {}): FichaParseada {
  const libro = leerLibro(datos)

  if (opciones.hoja !== undefined) {
    const pedida = libro.hojas.find((hoja) => equivale(hoja.nombre, opciones.hoja ?? ''))
    if (pedida === undefined) {
      throw new Error(`El archivo no tiene una hoja llamada "${opciones.hoja}".`)
    }
    return parsearHoja(pedida, opciones)
  }

  const conTabla = libro.hojas.find((hoja) => buscarAncla(hoja, ANCLA_ACTIVOS) !== null)
  if (conTabla === undefined) {
    throw new Error(
      `El archivo no parece una ficha patrimonial: ninguna hoja tiene la tabla de activos ("${ANCLA_ACTIVOS}...").`,
    )
  }
  return parsearHoja(conTabla, opciones)
}
