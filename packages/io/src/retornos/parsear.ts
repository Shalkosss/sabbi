/**
 * Lectura de la hoja `Retornos` del libro de la mesa.
 *
 * La hoja esta armada en tres bloques apilados en la misma columna:
 *
 *   fila 2      la clase, escrita una sola vez sobre el primer fondo del grupo
 *   fila 3      el nombre del fondo
 *   filas 4..N  la serie: fecha en la columna A, retorno total en la del fondo
 *   fila N+k    «Asset Class», «Inception Date», «Guidance…», «Domicilio»
 *   luego       las metricas que la macro escribio, y el Treasury 10Y
 *
 * Nada de eso se localiza por numero de fila. Todo se busca por la etiqueta de
 * la columna A, y el bloque de serie es simplemente «lo que hay entre la fila
 * 4 y la etiqueta `Asset Class`». La hoja se edita cada mes: la fila 229 de
 * hoy es la 230 en cuanto alguien agregue un mes, y un parser anclado a
 * numeros se rompe justo el dia que se lo necesita.
 */

import { celda, leerLibro, refA1 } from '../xlsx/leer.js'
import type { Celda, Hoja } from '../xlsx/leer.js'
import { normalizar } from '../texto.js'
import type {
  AvisoRetornos,
  FondoDelLibro,
  MetricasDelLibro,
  PuntoSerie,
  RetornosParseados,
} from './tipos.js'

/** Los codigos de la fila «Asset Class» y a que clase corresponden. */
const CLASES: Readonly<Record<string, string>> = {
  pd: 'Private Debt',
  pe: 'Private Equity',
  vc: 'Venture Capital',
  i: 'Infrastructure',
  infra: 'Infrastructure',
  re: 'Real Estate',
  hf: 'Hedge Funds',
}

/** Las mismas, buscadas en el encabezado de grupo de la fila 2. */
const CLASES_POR_NOMBRE: readonly string[] = [
  'Private Debt',
  'Private Equity',
  'Venture Capital',
  'Infrastructure',
  'Real Estate',
  'Hedge Funds',
]

/**
 * Que columnas son un indice y no un fondo.
 *
 * La hoja no lo dice en ningun campo: un benchmark ocupa una columna igual que
 * un fondo, con su serie y su bloque de metricas. La diferencia la sabe quien
 * la lee, y por eso vive aca — una lista corta, visible, con nombre — y no
 * repartida en un `if` de cada pantalla.
 *
 * Importa porque el ranking los ordena junto a todo lo demas. «El fondo con
 * mejor Sharpe de Private Equity: S&P 500 IVV» es una respuesta falsa a una
 * pregunta razonable, y nadie compra el indice.
 */
const ES_REFERENCIA: readonly RegExp[] = [
  /\bivv\b/,
  /\bhyg\b/,
  /\biyr\b/,
  /\bs&p bdc index\b/,
  /\bbarclay hedge fund index\b/,
]

const ETIQUETA_CLASE = 'asset class'
const ETIQUETA_INCEPTION = 'inception date'
const ETIQUETA_GUIDANCE = 'guidance total return corto plazo'
const ETIQUETA_DOMICILIO = 'domicilio'

/** Fila del bloque de metricas → clave de ventana de `VENTANAS`. */
const RETORNO_POR_ETIQUETA: Readonly<Record<string, string>> = {
  '3m': '3m',
  '6m': '6m',
  '1 y': '1y',
  '2 y': '2y',
  '3 y': '3y',
  '4y': '4y',
  '5y': '5y',
  'retorno total since inception anualizado': 'si',
}

const DESVIACION_POR_ETIQUETA: Readonly<Record<string, string>> = {
  'desviacion estandar 1y': '1y',
  'desviacion estandar 2y': '2y',
  'desviacion estandar 3y': '3y',
  'desviacion estandar 4y': '4y',
  'desviacion estandar 5y': '5y',
  'desviacion estandar since inception': 'si',
}

const SHARPE_POR_ETIQUETA: Readonly<Record<string, string>> = {
  'ratio de sharpe 1y': '1y',
  'ratio de sharpe 2y': '2y',
  'ratio de sharpe 3y': '3y',
  'ratio de sharpe 4y': '4y',
  'ratio de sharpe 5y': '5y',
  'ratio de sharpe since inception': 'si',
}

const MESES_DEL_ANIO: readonly string[] = [
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

/** Primera fila de datos de la hoja, 0-based: debajo de clase y nombre. */
const FILA_PRIMER_MES = 3

const texto = (valor: Celda): string | null => {
  if (typeof valor !== 'string') return null
  const limpio = valor.replace(/\s+/g, ' ').trim()
  return limpio === '' ? null : limpio
}

const numero = (valor: Celda): number | null =>
  typeof valor === 'number' && Number.isFinite(valor) ? valor : null

/**
 * Serial de Excel → `AAAA-MM`.
 *
 * El origen es el 30 de diciembre de 1899 y no el 1 de enero de 1900: Excel
 * arrastra un 1900 bisiesto que nunca existio, y correr el origen dos dias
 * atras lo cancela para toda fecha posterior a marzo de 1900. La serie mas
 * vieja del libro arranca en 2008.
 */
const ORIGEN_EXCEL = Date.UTC(1899, 11, 30)

function mesDeSerial(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 1) return null
  const fecha = new Date(ORIGEN_EXCEL + Math.floor(serial) * 86_400_000)
  const anio = fecha.getUTCFullYear()
  if (anio < 1900 || anio > 2200) return null
  return `${String(anio).padStart(4, '0')}-${String(fecha.getUTCMonth() + 1).padStart(2, '0')}`
}

/**
 * `Jan-25` → `2025-01`. La hoja tiene dos columnas fechadas asi a mano.
 *
 * El siglo se completa con 2000 sin preguntar: un fondo con inception en 1925
 * no existe y uno con inception en 2025 hay tres.
 */
const ABREVIADOS: readonly string[] = [
  'jan',
  'feb',
  'mar',
  'apr',
  'may',
  'jun',
  'jul',
  'aug',
  'sep',
  'oct',
  'nov',
  'dec',
]

function mesDeTexto(crudo: string): string | null {
  const partes = /^([a-z]{3})[a-z]*[-\s/]?(\d{2}|\d{4})$/.exec(normalizar(crudo))
  if (partes === null) return null

  const indice = ABREVIADOS.indexOf(partes[1] ?? '')
  if (indice < 0) return null

  const digitos = partes[2] ?? ''
  const anio = digitos.length === 2 ? 2000 + Number(digitos) : Number(digitos)
  return `${String(anio).padStart(4, '0')}-${String(indice + 1).padStart(2, '0')}`
}

/** Lee un mes venga como serial de fecha o como `Jan-25`. */
function leerMes(valor: Celda): string | null {
  if (typeof valor === 'number') return mesDeSerial(valor)
  const crudo = texto(valor)
  return crudo === null ? null : mesDeTexto(crudo)
}

/**
 * Clave de fusion de dos columnas.
 *
 * Mas dura que `normalizar`: tambien saca lo que no es letra ni digito. La
 * hoja tiene el mismo indice escrito «S&P 500 IVV» en un bloque y «S&P500 IVV»
 * en otro, y ese espacio de mas es la unica diferencia entre las dos columnas.
 */
const clave = (nombre: string): string => normalizar(nombre).replace(/[^a-z0-9]/g, '')

const esReferencia = (nombre: string): boolean => {
  const limpio = normalizar(nombre)
  return ES_REFERENCIA.some((patron) => patron.test(limpio))
}

/** La fila cuya columna A dice la etiqueta, o `-1`. */
function filaDe(hoja: Hoja, etiqueta: string): number {
  for (let fila = 0; fila < hoja.filas.length; fila += 1) {
    const rotulo = texto(celda(hoja, fila, 0))
    if (rotulo !== null && normalizar(rotulo) === etiqueta) return fila
  }
  return -1
}

/**
 * Las filas del bloque de metricas indexadas por su etiqueta normalizada.
 *
 * Las filas de anio calendario llegan como numero, no como texto: la hoja
 * tiene `2024` y no `'2024'`, porque quien las escribio las tecleo sin
 * comillas. Solo `2025` esta escrita `2025 (YTD)` y esa si es texto. Se
 * aceptan las dos formas o el bloque anual queda vacio y la comparacion contra
 * la macro pierde ocho columnas sin decir por que.
 */
function filasPorEtiqueta(hoja: Hoja, desde: number): ReadonlyMap<string, number> {
  const filas = new Map<string, number>()
  for (let fila = desde; fila < hoja.filas.length; fila += 1) {
    const valor = celda(hoja, fila, 0)
    const rotulo =
      typeof valor === 'number' && Number.isInteger(valor) ? String(valor) : texto(valor)
    if (rotulo === null) continue
    // La primera gana: las etiquetas de anio se repiten mas abajo en un
    // segundo bloque de resumen que la macro dejo a medio hacer.
    if (!filas.has(normalizar(rotulo))) filas.set(normalizar(rotulo), fila)
  }
  return filas
}

/** Interpreta la hoja `Retornos` de un libro ya abierto. */
export function parsearRetornosDeHoja(hoja: Hoja): RetornosParseados {
  const avisos: AvisoRetornos[] = []
  const aviso = (motivo: AvisoRetornos['motivo'], fondo: string | null, detalle: string) =>
    avisos.push({ motivo, fondo, detalle })

  const filaClase = filaDe(hoja, ETIQUETA_CLASE)
  if (filaClase < 0) {
    throw new Error(
      'La hoja «Retornos» no tiene la fila «Asset Class». Sin ella no se sabe donde ' +
        'termina la serie y empieza el bloque de metricas.',
    )
  }

  const etiquetas = filasPorEtiqueta(hoja, filaClase)
  const filaInception = etiquetas.get(ETIQUETA_INCEPTION) ?? -1
  const filaGuidance = etiquetas.get(ETIQUETA_GUIDANCE) ?? -1
  const filaDomicilio = etiquetas.get(ETIQUETA_DOMICILIO) ?? -1

  // Los meses de la serie, leidos una sola vez de la columna A.
  const mesesPorFila = new Map<number, string>()
  for (let fila = FILA_PRIMER_MES; fila < filaClase; fila += 1) {
    const mes = leerMes(celda(hoja, fila, 0))
    if (mes !== null) mesesPorFila.set(fila, mes)
  }

  const anchoDeFila = (fila: number): number => hoja.filas[fila]?.length ?? 0
  const ancho = Math.max(anchoDeFila(2), filaClase, ...[...mesesPorFila.keys()].map(anchoDeFila))

  /** Lo leido de una columna, antes de fusionar homonimas. */
  const columnas: {
    nombre: string
    assetClass: string | null
    inception: string | null
    guidance: number | null
    domicilio: string | null
    serie: Map<string, number>
    ref: string
  }[] = []

  let grupo: string | null = null

  for (let col = 1; col < ancho; col += 1) {
    const encabezado = texto(celda(hoja, 1, col))
    if (encabezado !== null) {
      const encontrada = CLASES_POR_NOMBRE.find((c) => normalizar(c) === normalizar(encabezado))
      if (encontrada !== undefined) grupo = encontrada
    }

    const nombre = texto(celda(hoja, 2, col))
    if (nombre === null) continue

    const serie = new Map<string, number>()
    for (const [fila, mes] of mesesPorFila) {
      const valor = numero(celda(hoja, fila, col))
      if (valor !== null) serie.set(mes, valor)
    }

    const ref = refA1(2, col)
    if (serie.size === 0) {
      aviso('columna sin serie', nombre, `${ref}: ninguna fila con retorno. Se descarta.`)
      continue
    }

    // La fila «Asset Class» manda; el encabezado de grupo es el respaldo para
    // las columnas que la mesa agrego al final de un bloque sin rellenarla.
    const codigo = texto(celda(hoja, filaClase, col))
    const porCodigo = codigo === null ? undefined : CLASES[normalizar(codigo)]
    const assetClass = porCodigo ?? grupo ?? null
    if (assetClass === null) {
      aviso(
        'clase desconocida',
        nombre,
        `${ref}: la fila «Asset Class» dice ${codigo === null ? '(vacio)' : `«${codigo}»`} y la ` +
          'columna no cae bajo ningun encabezado de grupo.',
      )
    }

    const inceptionCruda = filaInception < 0 ? null : celda(hoja, filaInception, col)
    const inception = inceptionCruda === null ? null : leerMes(inceptionCruda)
    if (inceptionCruda !== null && inception === null) {
      aviso('inception ilegible', nombre, `${ref}: «${String(inceptionCruda)}» no es un mes.`)
    }

    columnas.push({
      nombre,
      assetClass,
      inception,
      guidance: filaGuidance < 0 ? null : numero(celda(hoja, filaGuidance, col)),
      domicilio: filaDomicilio < 0 ? null : texto(celda(hoja, filaDomicilio, col)),
      serie,
      ref,
    })
  }

  // ── Fusion de columnas homonimas ──────────────────────────────────────────
  // La hoja repite un nombre por dos razones distintas y hay que separarlas.
  //
  // Una es el duplicado a secas: alguien pego la columna de nuevo en lugar de
  // extender la que ya estaba. Blue Owl OWLCX esta dos veces bajo Private
  // Debt, con catorce meses en una y doce en la otra. Eso se fusiona: es un
  // solo fondo escrito dos veces.
  //
  // La otra es deliberada: un indice puesto como linea de comparacion en el
  // bloque de cada clase. El S&P 500 aparece bajo Private Equity, Venture
  // Capital y Hedge Funds, cada vez con la serie recortada al periodo que ese
  // bloque mira. Fusionarlas dejaria una sola fila, en una sola clase, y las
  // otras dos vistas se quedarian sin su referencia — que es justamente lo que
  // la mesa mira al lado de los fondos.
  //
  // Asi que la clave de fusion incluye la clase. Dentro de una clase, gana la
  // columna mas larga en los meses que se pisan: las copias cortas estan
  // redondeadas a cuatro decimales y la larga trae el numero entero.
  const porClave = new Map<string, typeof columnas>()
  for (const columna of columnas) {
    const k = `${clave(columna.nombre)}|${columna.assetClass ?? ''}`
    porClave.set(k, [...(porClave.get(k) ?? []), columna])
  }

  // Un nombre que sobrevive en dos clases necesita distinguirse: `nombre` es
  // la clave con la que el importador escribe y con la que la carga mensual
  // empareja lo pegado desde Excel.
  //
  // Y se escribe igual en las tres. La hoja tiene el mismo indice como «S&P
  // 500 IVV» en dos bloques y «S&P500 IVV» en el tercero; tres filas de la
  // misma tabla con tres grafias del mismo nombre se leen como tres cosas.
  // Manda la grafia de la columna con mas historia.
  const clasesPorNombre = new Map<string, Set<string>>()
  const grafiaPorNombre = new Map<string, { nombre: string; meses: number }>()
  for (const columna of columnas) {
    const k = clave(columna.nombre)
    clasesPorNombre.set(k, (clasesPorNombre.get(k) ?? new Set()).add(columna.assetClass ?? ''))
    const mejor = grafiaPorNombre.get(k)
    if (mejor === undefined || columna.serie.size > mejor.meses) {
      grafiaPorNombre.set(k, { nombre: columna.nombre, meses: columna.serie.size })
    }
  }

  const fondos: FondoDelLibro[] = []

  for (const grupoColumnas of porClave.values()) {
    const ordenadas = [...grupoColumnas].sort((a, b) => b.serie.size - a.serie.size)
    const principal = ordenadas[0]
    if (principal === undefined) continue

    const k = clave(principal.nombre)
    const grafia = grafiaPorNombre.get(k)?.nombre ?? principal.nombre
    const repetidoEntreClases = (clasesPorNombre.get(k)?.size ?? 1) > 1
    const nombre =
      repetidoEntreClases && principal.assetClass !== null
        ? `${grafia} (${principal.assetClass})`
        : grafia

    const serie = new Map(principal.serie)
    let comunes = 0
    let discrepan = 0
    let maxima = 0

    for (const otra of ordenadas.slice(1)) {
      for (const [mes, valor] of otra.serie) {
        const previo = serie.get(mes)
        if (previo === undefined) {
          serie.set(mes, valor)
          continue
        }
        comunes += 1
        const diferencia = Math.abs(previo - valor)
        if (diferencia > 0) {
          discrepan += 1
          maxima = Math.max(maxima, diferencia)
        }
      }
    }

    if (ordenadas.length > 1) {
      aviso(
        'columnas fusionadas',
        nombre,
        `${ordenadas.map((c) => c.ref).join(', ')} son el mismo nombre. Manda ${principal.ref} ` +
          `(${principal.serie.size} meses); la serie fusionada queda en ${serie.size}. ` +
          (comunes === 0
            ? 'No se pisan en ningun mes.'
            : `Se pisan en ${comunes} y difieren en ${discrepan}` +
              (discrepan === 0 ? '.' : `, con un maximo de ${maxima.toExponential(1)}.`)),
      )
    }

    const puntos: PuntoSerie[] = [...serie.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([mes, retornoTotal]) => ({ mes, retornoTotal }))

    fondos.push({
      nombre,
      assetClass: principal.assetClass,
      inception: principal.inception,
      guidanceCortoPlazo: principal.guidance,
      domicilio: principal.domicilio,
      esReferencia: esReferencia(principal.nombre),
      serie: puntos,
      columnas: ordenadas.map((c) => c.ref),
    })
  }

  // ── El bloque de metricas que dejo la macro ───────────────────────────────
  const declaradas = new Map<string, MetricasDelLibro>()

  const leerFila = (etiqueta: string, col: number): number | null => {
    const fila = etiquetas.get(etiqueta)
    return fila === undefined ? null : numero(celda(hoja, fila, col))
  }

  for (const fondo of fondos) {
    // La ficha manda la columna mas larga; sus metricas son las de esa columna.
    const col = coordenadaDe(fondo.columnas[0] ?? '')
    if (col === null) continue

    const retorno: Record<string, number | null> = {}
    for (const [etiqueta, ventana] of Object.entries(RETORNO_POR_ETIQUETA)) {
      retorno[ventana] = leerFila(etiqueta, col)
    }

    const desviacion: Record<string, number | null> = {}
    for (const [etiqueta, ventana] of Object.entries(DESVIACION_POR_ETIQUETA)) {
      desviacion[ventana] = leerFila(etiqueta, col)
    }

    const sharpe: Record<string, number | null> = {}
    for (const [etiqueta, ventana] of Object.entries(SHARPE_POR_ETIQUETA)) {
      sharpe[ventana] = leerFila(etiqueta, col)
    }

    const anios: Record<number, number | null> = {}
    for (const [etiqueta, fila] of etiquetas) {
      const anio = /^(\d{4})(?: \(ytd\))?$/.exec(etiqueta)
      if (anio === null) continue
      anios[Number(anio[1])] = numero(celda(hoja, fila, col))
    }

    declaradas.set(fondo.nombre, { retorno, desviacion, sharpe, anios })
  }

  // ── El Treasury 10Y ───────────────────────────────────────────────────────
  const treasuryPorMes: Record<string, number> = {}
  for (const mes of MESES_DEL_ANIO) {
    const fila = etiquetas.get(`treasury 10y (${mes})`)
    if (fila === undefined) continue
    const valor = numero(celda(hoja, fila, 1))
    if (valor !== null) treasuryPorMes[mes] = valor
  }

  return { fondos, treasuryPorMes, declaradas, avisos }
}

/** `AF3` → 31. Inverso parcial de `refA1`, solo la columna. */
function coordenadaDe(ref: string): number | null {
  const letras = /^([A-Z]+)\d+$/.exec(ref)?.[1]
  if (letras === undefined) return null
  let col = 0
  for (const letra of letras) col = col * 26 + (letra.charCodeAt(0) - 64)
  return col - 1
}

/** Abre el `.xlsm` y lee su hoja `Retornos`. */
export function parsearRetornos(bytes: Uint8Array): RetornosParseados {
  const libro = leerLibro(bytes)
  const hoja = libro.hojas.find((h) => normalizar(h.nombre) === 'retornos')
  if (hoja === undefined) {
    throw new Error(
      `El libro no tiene una hoja «Retornos». Tiene: ${libro.hojas.map((h) => h.nombre).join(', ')}.`,
    )
  }
  return parsearRetornosDeHoja(hoja)
}
