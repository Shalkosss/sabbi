import PptxGenJS from 'pptxgenjs'

import { NOMBRE_CLASE } from '@sabbi/core'
import type { ClaseModelo, GrupoObjetivo, Propuesta } from '@sabbi/core'

import { COLOR, COLOR_CLASE, HOJA, TAMANO, TIPOGRAFIA } from './marca.js'
import { delta, fechaLarga, pct1, rangoUsd, rent, usd, usdCorto } from './formato.js'

/**
 * El deck redisenado: la propuesta contada en laminas.
 *
 * No replica el deck de referencia — eso es la otra salida — sino que arma uno
 * a partir de lo que el motor ya produce, y solo con eso. Cada cifra de cada
 * lamina sale del objeto `Propuesta`: no hay una segunda implementacion de
 * ninguna suma, que es como tres versiones del mismo numero terminan siendo
 * tres numeros distintos.
 *
 * El orden es el de la pantalla y por la misma razon: la historia del cliente
 * es su portafolio de hoy contra el que se le propone. El detalle de ejecucion
 * —que se vende y que se compra— va al final, que es donde lo necesita la mesa
 * y no el cliente.
 */

/** Filas que entran en una lamina del objetivo antes de pasar a la siguiente. */
const FILAS_POR_LAMINA = 13

export interface OpcionesDeck {
  /**
   * La fecha que va en la portada.
   *
   * Llega como argumento y no de `new Date()` adentro: el mismo deck armado
   * dos veces tiene que dar el mismo archivo, y un test no puede fijar el
   * reloj de un modulo que lo lee por su cuenta.
   */
  readonly fecha: Date
  /** Pie de pagina. El nombre del asesor que lo genero, si se quiere. */
  readonly asesor?: string
}

export async function armarDeckRediseno(
  propuesta: Propuesta,
  opciones: OpcionesDeck,
): Promise<Uint8Array> {
  const pptx = new PptxGenJS()
  pptx.layout = 'LAYOUT_16x9'
  pptx.author = 'Sabbi'
  pptx.company = 'Sabbi'
  pptx.title = `Chequeo Patrimonial 360° — ${propuesta.cliente.nombre}`

  portada(pptx, propuesta, opciones)
  hoy(pptx, propuesta)
  comparativo(pptx, propuesta)
  rentabilidad(pptx, propuesta)
  objetivo(pptx, propuesta)
  dosPortafolios(pptx, propuesta)
  ejecucion(pptx, propuesta)
  notas(pptx, propuesta)

  const salida = await pptx.write({ outputType: 'nodebuffer' })
  return salida as Uint8Array
}

// ── Piezas compartidas ──────────────────────────────────────────────────────

/** Una lamina de contenido: fondo hueso, titulo y su bajada. */
function lamina(pptx: PptxGenJS, titulo: string, bajada?: string): PptxGenJS.Slide {
  const slide = pptx.addSlide()
  slide.background = { color: COLOR.hueso }

  slide.addText(titulo, {
    x: HOJA.margen,
    y: 0.38,
    w: HOJA.contenido,
    h: 0.45,
    fontFace: TIPOGRAFIA,
    fontSize: TAMANO.titulo,
    bold: true,
    color: COLOR.verdeNoche,
  })

  if (bajada !== undefined) {
    slide.addText(bajada, {
      x: HOJA.margen,
      y: 0.86,
      w: HOJA.contenido,
      h: 0.3,
      fontFace: TIPOGRAFIA,
      fontSize: TAMANO.bajada,
      color: COLOR.tinta3,
      valign: 'top',
    })
  }

  // La franja del pie: sostiene la lamina sin competir con el contenido.
  slide.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: HOJA.alto - 0.06,
    w: HOJA.ancho,
    h: 0.06,
    fill: { color: COLOR.verde },
  })

  return slide
}

/** Una cifra grande con su etiqueta encima. */
function cifra(
  slide: PptxGenJS.Slide,
  x: number,
  y: number,
  w: number,
  etiqueta: string,
  valor: string,
  nota?: string,
): void {
  slide.addText(etiqueta.toUpperCase(), {
    x,
    y,
    w,
    h: 0.22,
    fontFace: TIPOGRAFIA,
    fontSize: TAMANO.pie,
    bold: true,
    charSpacing: 1.2,
    color: COLOR.tinta4,
  })
  slide.addText(valor, {
    x,
    y: y + 0.2,
    w,
    h: 0.42,
    fontFace: TIPOGRAFIA,
    fontSize: TAMANO.cifra,
    bold: true,
    color: COLOR.verdeNoche,
  })
  if (nota !== undefined) {
    slide.addText(nota, {
      x,
      y: y + 0.62,
      w,
      h: 0.24,
      fontFace: TIPOGRAFIA,
      fontSize: TAMANO.pie,
      color: COLOR.tinta3,
    })
  }
}

/**
 * Una barra que siempre vale el 100% del portafolio.
 *
 * Escalarla al mayor haria que la clase mas grande llenara la pista sea cual
 * sea su peso, y un 12% se veria lleno. La proporcion se lee contra el total,
 * nunca contra la vecina.
 */
function barra(
  pptx: PptxGenJS,
  slide: PptxGenJS.Slide,
  x: number,
  y: number,
  ancho: number,
  share: number,
  color: string,
): void {
  slide.addShape(pptx.ShapeType.rect, {
    x,
    y,
    w: ancho,
    h: 0.085,
    fill: { color: COLOR.pista },
  })
  if (share <= 0) return
  slide.addShape(pptx.ShapeType.rect, {
    x,
    y,
    w: Math.max(0.02, ancho * Math.min(1, share)),
    h: 0.085,
    fill: { color },
  })
}

/** Pie con la nota de cobertura, cuando la rentabilidad no la sostiene todo. */
function pie(slide: PptxGenJS.Slide, texto: string): void {
  slide.addText(texto, {
    x: HOJA.margen,
    y: HOJA.alto - 0.52,
    w: HOJA.contenido,
    h: 0.3,
    fontFace: TIPOGRAFIA,
    fontSize: TAMANO.pie,
    color: COLOR.tinta4,
    valign: 'top',
  })
}

const colorDe = (clase: ClaseModelo): string => COLOR_CLASE[clase]

// ── Lamina 1: portada ───────────────────────────────────────────────────────

function portada(pptx: PptxGenJS, propuesta: Propuesta, opciones: OpcionesDeck): void {
  const slide = pptx.addSlide()
  slide.background = { color: COLOR.verdeNoche }

  slide.addText('SABBI', {
    x: HOJA.margen,
    y: 0.5,
    w: 4,
    h: 0.3,
    fontFace: TIPOGRAFIA,
    fontSize: 13,
    bold: true,
    charSpacing: 3,
    color: COLOR.lima,
  })

  slide.addText('Chequeo Patrimonial 360°', {
    x: HOJA.margen,
    y: 2.0,
    w: HOJA.contenido,
    h: 0.4,
    fontFace: TIPOGRAFIA,
    fontSize: 15,
    color: COLOR.lima,
  })

  slide.addText(propuesta.cliente.nombre, {
    x: HOJA.margen,
    y: 2.42,
    w: HOJA.contenido,
    h: 0.8,
    fontFace: TIPOGRAFIA,
    fontSize: 40,
    bold: true,
    color: COLOR.hueso,
  })

  const datos = [
    `Perfil ${propuesta.cliente.perfil}`,
    ...(propuesta.cliente.mandato === null ? [] : [`Mandato ${propuesta.cliente.mandato}`]),
    fechaLarga(opciones.fecha),
  ]

  slide.addText(datos.join('   ·   '), {
    x: HOJA.margen,
    y: 3.3,
    w: HOJA.contenido,
    h: 0.3,
    fontFace: TIPOGRAFIA,
    fontSize: 12,
    color: COLOR.lavanda,
  })

  slide.addShape(pptx.ShapeType.rect, {
    x: HOJA.margen,
    y: 3.75,
    w: 1.6,
    h: 0.045,
    fill: { color: COLOR.verde },
  })

  if (opciones.asesor !== undefined) {
    slide.addText(`Preparado por ${opciones.asesor}`, {
      x: HOJA.margen,
      y: HOJA.alto - 0.7,
      w: HOJA.contenido,
      h: 0.25,
      fontFace: TIPOGRAFIA,
      fontSize: TAMANO.pie,
      color: COLOR.tenueSobreOscuro,
    })
  }
}

// ── Lamina 2: tu portafolio hoy ─────────────────────────────────────────────

function hoy(pptx: PptxGenJS, propuesta: Propuesta): void {
  const vista = propuesta.vistaHoy
  const slide = lamina(pptx, 'Tu portafolio hoy', 'Lo que tenés y lo que ya te está rindiendo.')

  const ancho = HOJA.contenido / 3
  cifra(slide, HOJA.margen, 1.28, ancho, 'Patrimonio invertible', usd(vista.totalUsd), 'USD')
  cifra(
    slide,
    HOJA.margen + ancho,
    1.28,
    ancho,
    'Rentabilidad estimada',
    rent(vista.rentabilidad),
    'anual, sobre lo que tiene dato',
  )
  cifra(
    slide,
    HOJA.margen + ancho * 2,
    1.28,
    ancho,
    'Renta anual estimada',
    rangoUsd(vista.rentaAnualUsd),
    'USD por año',
  )

  slide.addText('MONTO          %          RETORNO EST.', {
    x: HOJA.margen + 3.4,
    y: 2.2,
    w: 3.3,
    h: 0.18,
    fontFace: TIPOGRAFIA,
    fontSize: TAMANO.pie,
    bold: true,
    align: 'right',
    charSpacing: 0.8,
    color: COLOR.tinta4,
    valign: 'top',
  })

  let y = 2.5
  for (const fila of vista.filas) {
    slide.addText(NOMBRE_CLASE[fila.clase], {
      x: HOJA.margen,
      y,
      w: 3.4,
      h: 0.2,
      fontFace: TIPOGRAFIA,
      fontSize: TAMANO.cuerpo,
      color: COLOR.tinta,
    })
    slide.addText(usd(fila.usd), {
      x: HOJA.margen + 3.4,
      y,
      w: 1.3,
      h: 0.2,
      fontFace: TIPOGRAFIA,
      fontSize: TAMANO.cuerpo,
      align: 'right',
      color: COLOR.tinta2,
    })
    slide.addText(pct1(fila.share), {
      x: HOJA.margen + 4.75,
      y,
      w: 0.7,
      h: 0.2,
      fontFace: TIPOGRAFIA,
      fontSize: TAMANO.cuerpo,
      align: 'right',
      color: COLOR.tinta3,
    })
    slide.addText(rent(fila.rentabilidad), {
      x: HOJA.margen + 5.5,
      y,
      w: 1.2,
      h: 0.2,
      fontFace: TIPOGRAFIA,
      fontSize: TAMANO.cuerpo,
      align: 'right',
      color: COLOR.tinta3,
    })
    barra(pptx, slide, HOJA.margen + 6.95, y + 0.06, 1.95, fila.share, colorDe(fila.clase))
    y += 0.34
  }

  if (vista.rentabilidad !== null && vista.rentabilidad.cobertura < 0.995) {
    pie(
      slide,
      `La rentabilidad se calcula sobre el ${pct1(vista.rentabilidad.cobertura)} del dinero que tiene retorno conocido.`,
    )
  }
}

// ── Lamina 3: hoy contra Sabbi ──────────────────────────────────────────────

function comparativo(pptx: PptxGenJS, propuesta: Propuesta): void {
  const vista = propuesta.comparativa
  const slide = lamina(
    pptx,
    'Hoy contra Sabbi',
    'El mismo dinero, repartido de otra manera. Las barras valen el 100% del portafolio.',
  )

  // Las dos pistas van una encima de la otra, asi que la leyenda lleva su
  // muestra de color: dos rotulos sueltos al lado no dicen cual es cual.
  const leyenda: readonly [string, string][] = [
    ['hoy', COLOR.borde],
    ['con Sabbi', COLOR.verde],
  ]
  leyenda.forEach(([texto, color], indice) => {
    const x = HOJA.margen + 5.9 + indice * 0.95
    slide.addShape(pptx.ShapeType.rect, {
      x,
      y: 1.36,
      w: 0.16,
      h: 0.085,
      fill: { color },
    })
    slide.addText(texto, {
      x: x + 0.22,
      y: 1.3,
      w: 0.75,
      h: 0.2,
      fontFace: TIPOGRAFIA,
      fontSize: TAMANO.pie,
      color: COLOR.tinta4,
      valign: 'top',
    })
  })

  let y = 1.62
  for (const fila of vista.filas) {
    slide.addText(NOMBRE_CLASE[fila.clase], {
      x: HOJA.margen,
      y,
      w: 3.1,
      h: 0.2,
      fontFace: TIPOGRAFIA,
      fontSize: TAMANO.cuerpo,
      color: COLOR.tinta,
    })
    slide.addText(`${pct1(fila.antesShare)}  →  ${pct1(fila.despuesShare)}`, {
      x: HOJA.margen + 3.1,
      y,
      w: 1.6,
      h: 0.2,
      fontFace: TIPOGRAFIA,
      fontSize: TAMANO.cuerpo,
      align: 'right',
      color: COLOR.tinta2,
    })
    slide.addText(delta(fila.deltaPp), {
      x: HOJA.margen + 4.8,
      y,
      w: 0.9,
      h: 0.2,
      fontFace: TIPOGRAFIA,
      fontSize: TAMANO.cuerpo,
      align: 'right',
      color: COLOR.tinta3,
    })
    barra(pptx, slide, HOJA.margen + 5.9, y + 0.02, 3.0, fila.antesShare, COLOR.borde)
    barra(pptx, slide, HOJA.margen + 5.9, y + 0.13, 3.0, fila.despuesShare, colorDe(fila.clase))
    y += 0.4
  }

  pie(
    slide,
    'Subir no es mejor ni bajar es peor: la flecha dice la dirección y el número el tamaño del cambio.',
  )
}

// ── Lamina 4: la rentabilidad ───────────────────────────────────────────────

function rentabilidad(pptx: PptxGenJS, propuesta: Propuesta): void {
  const vista = propuesta.comparativa
  const slide = lamina(
    pptx,
    'Lo que cambia en la rentabilidad',
    'La banda anual esperada del portafolio, antes y después.',
  )

  const ancho = HOJA.contenido / 2

  cifra(
    slide,
    HOJA.margen,
    1.5,
    ancho,
    'Rentabilidad estimada hoy',
    rent(vista.rentabilidadAntes),
    'anual',
  )
  cifra(
    slide,
    HOJA.margen + ancho,
    1.5,
    ancho,
    'Con Sabbi',
    rent(vista.rentabilidadDespues),
    'anual',
  )
  cifra(
    slide,
    HOJA.margen,
    2.75,
    ancho,
    'Renta anual estimada hoy',
    rangoUsd(vista.rentaAnualAntesUsd),
    'USD por año',
  )
  cifra(
    slide,
    HOJA.margen + ancho,
    2.75,
    ancho,
    'Con Sabbi',
    rangoUsd(vista.rentaAnualDespuesUsd),
    'USD por año',
  )

  cifra(
    slide,
    HOJA.margen,
    4.0,
    ancho,
    'Patrimonio',
    usd(vista.totalDespuesUsd),
    'el mismo dinero, mejor repartido',
  )

  const coberturas = [vista.rentabilidadAntes, vista.rentabilidadDespues].filter(
    (r) => r !== null && r.cobertura < 0.995,
  )
  if (coberturas.length > 0) {
    pie(
      slide,
      'Las bandas se ponderan solo sobre el dinero que tiene retorno conocido en el catálogo; lo que no lo tiene no se afirma.',
    )
  }
}

// ── Lamina 5 y siguientes: el portafolio objetivo ───────────────────────────

/** Reparte los grupos en laminas sin partir una clase por la mitad. */
function paginar(grupos: readonly GrupoObjetivo[]): GrupoObjetivo[][] {
  const paginas: GrupoObjetivo[][] = []
  let actual: GrupoObjetivo[] = []
  let filas = 0

  for (const grupo of grupos) {
    const alto = 1 + grupo.lineas.length
    if (filas > 0 && filas + alto > FILAS_POR_LAMINA) {
      paginas.push(actual)
      actual = []
      filas = 0
    }
    actual.push(grupo)
    filas += alto
  }
  if (actual.length > 0) paginas.push(actual)
  return paginas
}

function objetivo(pptx: PptxGenJS, propuesta: Propuesta): void {
  const grupos = propuesta.seccion6.grupos.filter((grupo) => grupo.lineas.length > 0)
  if (grupos.length === 0) return

  const paginas = paginar(grupos)

  paginas.forEach((pagina, indice) => {
    const sufijo = paginas.length > 1 ? ` (lámina ${indice + 1} de ${paginas.length})` : ''
    const slide = lamina(
      pptx,
      'El portafolio propuesto',
      `Instrumento por instrumento, con su retorno esperado${sufijo}.`,
    )

    let y = 1.5
    for (const grupo of pagina) {
      slide.addShape(pptx.ShapeType.rect, {
        x: HOJA.margen,
        y: y + 0.05,
        w: 0.07,
        h: 0.16,
        fill: { color: colorDe(grupo.clase) },
      })
      slide.addText(NOMBRE_CLASE[grupo.clase], {
        x: HOJA.margen + 0.16,
        y,
        w: 4.6,
        h: 0.22,
        fontFace: TIPOGRAFIA,
        fontSize: TAMANO.seccion,
        bold: true,
        color: COLOR.verdeProfundo,
      })
      slide.addText(`${usd(grupo.objetivoUsd)}   ·   ${pct1(grupo.share)}`, {
        x: HOJA.margen + 4.8,
        y,
        w: 4.1,
        h: 0.22,
        fontFace: TIPOGRAFIA,
        fontSize: TAMANO.seccion,
        bold: true,
        align: 'right',
        color: COLOR.verdeProfundo,
      })
      y += 0.28

      for (const linea of grupo.lineas) {
        const etiqueta = linea.conservada ? `${linea.instrumento}  (ya lo tenés)` : linea.instrumento
        slide.addText(etiqueta, {
          x: HOJA.margen + 0.16,
          y,
          w: 5.2,
          h: 0.2,
          fontFace: TIPOGRAFIA,
          fontSize: TAMANO.cuerpo,
          color: COLOR.tinta2,
        })
        slide.addText(usd(linea.usd), {
          x: HOJA.margen + 5.4,
          y,
          w: 1.3,
          h: 0.2,
          fontFace: TIPOGRAFIA,
          fontSize: TAMANO.cuerpo,
          align: 'right',
          color: COLOR.tinta2,
        })
        slide.addText(pct1(linea.share), {
          x: HOJA.margen + 6.75,
          y,
          w: 0.8,
          h: 0.2,
          fontFace: TIPOGRAFIA,
          fontSize: TAMANO.cuerpo,
          align: 'right',
          color: COLOR.tinta3,
        })
        slide.addText(linea.retornoTotal === null ? '—' : rent({ rango: linea.retornoTotal, cobertura: 1 }), {
          x: HOJA.margen + 7.6,
          y,
          w: 1.3,
          h: 0.2,
          fontFace: TIPOGRAFIA,
          fontSize: TAMANO.cuerpo,
          align: 'right',
          color: COLOR.tinta3,
        })
        y += 0.24
      }
      y += 0.12
    }

    slide.addText('MONTO          %          RETORNO EST.', {
      x: HOJA.margen + 5.4,
      y: 1.22,
      w: 3.5,
      h: 0.18,
      fontFace: TIPOGRAFIA,
      fontSize: TAMANO.pie,
      bold: true,
      align: 'right',
      charSpacing: 0.8,
      color: COLOR.tinta4,
    })
  })
}

// ── Los dos portafolios, solo cuando el asesor ajusto algo ──────────────────

function dosPortafolios(pptx: PptxGenJS, propuesta: Propuesta): void {
  const vista = propuesta.dosPortafolios
  if (vista === null) return

  const slide = lamina(
    pptx,
    'Los dos portafolios',
    'El que sale del modelo y el que sale de los ajustes, contra tu portafolio de hoy.',
  )

  cifra(
    slide,
    HOJA.margen,
    1.2,
    HOJA.contenido / 2,
    'Dinero que cambió de clase por los ajustes',
    usd(vista.movidoUsd),
    // Un ajuste que coincide con lo que el modelo ya daba no mueve nada, y eso
    // tambien es una respuesta: conviene que la lamina lo diga en vez de dejar
    // un cero sin explicacion.
    vista.movidoUsd < 1 ? 'los ajustes no cambiaron el reparto' : 'USD',
  )
  cifra(
    slide,
    HOJA.margen + HOJA.contenido / 2,
    1.2,
    HOJA.contenido / 2,
    'Rentabilidad: modelo → ajustado',
    `${rent(vista.sistema.rentabilidad)}  →  ${rent(vista.ajustado.rentabilidad)}`,
    'anual',
  )

  slide.addText('HOY          MODELO          AJUSTADO', {
    x: HOJA.margen + 3.3,
    y: 2.3,
    w: 5.6,
    h: 0.2,
    fontFace: TIPOGRAFIA,
    fontSize: TAMANO.pie,
    bold: true,
    align: 'right',
    charSpacing: 0.8,
    color: COLOR.tinta4,
  })

  let y = 2.6
  for (const fila of vista.filas) {
    slide.addText(NOMBRE_CLASE[fila.clase] + (fila.fijada ? '  · fijada' : ''), {
      x: HOJA.margen,
      y,
      w: 3.3,
      h: 0.2,
      fontFace: TIPOGRAFIA,
      fontSize: TAMANO.cuerpo,
      color: COLOR.tinta,
    })
    const columnas: readonly [string, number][] = [
      [usdCorto(fila.hoyUsd), 3.4],
      [usdCorto(fila.sistemaUsd), 4.7],
      [usdCorto(fila.ajustadoUsd), 6.0],
    ]
    for (const [texto, x] of columnas) {
      slide.addText(texto, {
        x: HOJA.margen + x,
        y,
        w: 1.2,
        h: 0.2,
        fontFace: TIPOGRAFIA,
        fontSize: TAMANO.cuerpo,
        align: 'right',
        color: COLOR.tinta2,
      })
    }
    slide.addText(Math.abs(fila.deltaUsd) < 1 ? 'igual' : `${fila.deltaUsd > 0 ? '▲' : '▼'} ${usdCorto(Math.abs(fila.deltaUsd))}`, {
      x: HOJA.margen + 7.4,
      y,
      w: 1.5,
      h: 0.2,
      fontFace: TIPOGRAFIA,
      fontSize: TAMANO.cuerpo,
      align: 'right',
      color: COLOR.tinta3,
    })
    y += 0.34
  }

  pie(slide, 'La última columna es la diferencia entre el portafolio ajustado y el del modelo.')
}

// ── Que se ejecuta ──────────────────────────────────────────────────────────

function ejecucion(pptx: PptxGenJS, propuesta: Propuesta): void {
  const { ventas, compras, totalVentasUsd, totalComprasUsd } = propuesta.seccion7
  if (ventas.length === 0 && compras.length === 0) return

  const slide = lamina(
    pptx,
    'Qué se ejecuta',
    'El detalle de la mesa: de dónde sale el dinero y a dónde va.',
  )

  const columna = (
    x: number,
    titulo: string,
    total: number,
    filas: readonly { readonly etiqueta: string; readonly usd: number }[],
  ) => {
    slide.addText(titulo.toUpperCase(), {
      x,
      y: 1.25,
      w: 4.2,
      h: 0.2,
      fontFace: TIPOGRAFIA,
      fontSize: TAMANO.pie,
      bold: true,
      charSpacing: 1.2,
      color: COLOR.tinta4,
    })
    slide.addText(usd(total), {
      x,
      y: 1.45,
      w: 4.2,
      h: 0.36,
      fontFace: TIPOGRAFIA,
      fontSize: 17,
      bold: true,
      color: COLOR.verdeNoche,
    })

    let y = 1.95
    // Doce lineas y el resto agregado: una lamina con cuarenta filas de seis
    // puntos no la lee nadie, y el Excel de la propuesta ya trae el detalle.
    const visibles = filas.slice(0, 12)
    const resto = filas.slice(12)

    for (const fila of visibles) {
      slide.addText(fila.etiqueta, {
        x,
        y,
        w: 3.1,
        h: 0.2,
        fontFace: TIPOGRAFIA,
        fontSize: 9.5,
        color: COLOR.tinta2,
      })
      slide.addText(usd(fila.usd), {
        x: x + 3.1,
        y,
        w: 1.1,
        h: 0.2,
        fontFace: TIPOGRAFIA,
        fontSize: 9.5,
        align: 'right',
        color: COLOR.tinta2,
      })
      y += 0.24
    }

    if (resto.length > 0) {
      const suma = resto.reduce((acc, fila) => acc + fila.usd, 0)
      slide.addText(`y ${resto.length} líneas más`, {
        x,
        y,
        w: 3.1,
        h: 0.2,
        fontFace: TIPOGRAFIA,
        fontSize: 9.5,
        italic: true,
        color: COLOR.tinta4,
      })
      slide.addText(usd(suma), {
        x: x + 3.1,
        y,
        w: 1.1,
        h: 0.2,
        fontFace: TIPOGRAFIA,
        fontSize: 9.5,
        align: 'right',
        color: COLOR.tinta4,
      })
    }
  }

  columna(
    HOJA.margen,
    'De dónde sale',
    totalVentasUsd,
    [...ventas]
      .sort((a, b) => b.usd - a.usd)
      .map((venta) => ({ etiqueta: `${venta.instrumento} · ${venta.accion}`, usd: venta.usd })),
  )
  columna(
    HOJA.margen + 4.7,
    'A dónde va',
    totalComprasUsd,
    [...compras]
      .sort((a, b) => b.usd - a.usd)
      .map((compra) => ({ etiqueta: compra.instrumento, usd: compra.usd })),
  )
}

// ── Notas ───────────────────────────────────────────────────────────────────

function notas(pptx: PptxGenJS, propuesta: Propuesta): void {
  if (propuesta.avisos.length === 0) return

  const slide = lamina(
    pptx,
    'Notas del cálculo',
    'Lo que el motor decidió y conviene que quede escrito.',
  )

  slide.addText(
    propuesta.avisos.map((aviso) => ({ text: aviso, options: { bullet: true, breakLine: true } })),
    {
      x: HOJA.margen,
      y: 1.3,
      w: HOJA.contenido,
      h: 3.6,
      fontFace: TIPOGRAFIA,
      fontSize: 10,
      color: COLOR.tinta2,
      lineSpacingMultiple: 1.3,
      valign: 'top',
    },
  )
}
