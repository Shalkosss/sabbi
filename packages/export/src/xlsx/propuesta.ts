/**
 * La propuesta, en una hoja de calculo.
 *
 * Reproduce el libro `Propuesta Ana Tumi.xlsx` que la mesa venia armando a
 * mano: una sola hoja con las siete secciones apiladas, de la foto actual al
 * blotter. Es el documento de trabajo — el que se anota, se filtra y se manda
 * por correo —, no la presentacion; para eso estan los dos decks.
 *
 * Sale del objeto `Propuesta` y solo de ahi, igual que el deck redisenado. No
 * hay una segunda implementacion de ninguna suma, y por la misma razon no hay
 * una sola formula en el archivo: una celda con `=SUMA(...)` seria una cuenta
 * que el motor ya hizo, escrita otra vez, libre de divergir en cuanto alguien
 * inserte una fila.
 *
 * Los totales y los cuadres van igual. Que la seccion 7 diga que compras menos
 * ventas da cero es justamente lo que hace que la propuesta se pueda publicar,
 * y esa cifra tiene que viajar con el archivo.
 */

import { NOMBRE_CLASE } from '@sabbi/core'
import type { Cta, Propuesta, Rango } from '@sabbi/core'

import { COLOR } from '../pptx/rediseno/marca.js'
import { escribirLibro } from './libro.js'
import type { Celda, Entrada, Formato, Hoja } from './libro.js'

/** Las columnas que usa la hoja. La seccion 1 es la mas ancha y manda. */
const COLUMNAS = 10

const ANCHOS = [5, 40, 16, 24, 9, 11, 15, 12, 15, 34]

const TITULO: Formato = { negrita: true, tamano: 15, color: COLOR.verdeNoche }
const BAJADA: Formato = { tamano: 10, color: COLOR.tinta3 }

/** La banda verde que abre cada seccion. Es la unica tinta fuerte de la hoja. */
const SECCION: Formato = {
  negrita: true,
  tamano: 11,
  color: COLOR.hueso,
  fondo: COLOR.verdeProfundo,
  alineacion: 'izquierda',
}

const CABECERA: Formato = {
  negrita: true,
  tamano: 9,
  color: COLOR.tinta2,
  fondo: COLOR.pista,
  bordeAbajo: true,
  ajustar: true,
}
const CABECERA_DER: Formato = { ...CABECERA, alineacion: 'derecha' }

const TEXTO: Formato = { tamano: 10, color: COLOR.tinta }
const TENUE: Formato = { tamano: 10, color: COLOR.tinta3 }
const NOTA: Formato = { tamano: 9, color: COLOR.tinta3, ajustar: true }
const INDICE: Formato = { tamano: 9, color: COLOR.tinta4, alineacion: 'derecha' }

const USD: Formato = { tamano: 10, color: COLOR.tinta, numero: 'moneda' }
const PCT: Formato = { tamano: 10, color: COLOR.tinta2, numero: 'porcentaje' }

const CLASE: Formato = { negrita: true, tamano: 10, color: COLOR.verdeProfundo }
const CLASE_USD: Formato = { ...CLASE, numero: 'moneda' }
const CLASE_PCT: Formato = { ...CLASE, numero: 'porcentaje' }

const TOTAL: Formato = {
  negrita: true,
  tamano: 10,
  color: COLOR.tinta,
  fondo: COLOR.hueso,
  bordeArriba: true,
}
const TOTAL_USD: Formato = { ...TOTAL, numero: 'moneda' }
const TOTAL_PCT: Formato = { ...TOTAL, numero: 'porcentaje' }

/** El cuadre: la cifra que decide si la propuesta se puede publicar. */
const CUADRE_OK: Formato = { negrita: true, tamano: 10, color: '2E6B14', numero: 'moneda' }
/** Puntos porcentuales: no son dinero y no llevan separador de miles. */
const PUNTOS: Formato = { tamano: 10, color: COLOR.tinta2, numero: 'puntos' }
const CUADRE_MAL: Formato = { negrita: true, tamano: 10, color: '96351F', numero: 'moneda' }

/** Un centavo. Por debajo, una diferencia es ruido de coma flotante. */
const TOL = 0.01

const DECISION: Readonly<Record<Cta, string>> = {
  conservar: 'Conservar',
  venta_total: 'Venta total',
  venta_parcial: 'Venta parcial',
  venta_condicionada: 'Venta condicionada',
  sin_marcar: 'Sin marcar',
}

export interface OpcionesXlsx {
  /**
   * La fecha del encabezado.
   *
   * Llega como argumento y no de `new Date()` adentro, por lo mismo que el
   * deck: el mismo libro armado dos veces tiene que dar el mismo archivo.
   */
  readonly fecha: Date
  readonly asesor?: string
  /** Version de la macro con la que se calculo. Va en el pie. */
  readonly versionMacro?: number | null
}

/** Una fila completada hasta el ancho de la hoja. */
const fila = (...celdas: Entrada[]): readonly Entrada[] => {
  const salida = [...celdas]
  while (salida.length < COLUMNAS) salida.push(null)
  return salida
}

const vacia = (): readonly Entrada[] => fila()

/** La banda de seccion, pintada de lado a lado. */
function banda(texto: string): readonly Entrada[] {
  const celdas: Entrada[] = [{ v: texto, f: SECCION }]
  while (celdas.length < COLUMNAS) celdas.push({ v: null, f: SECCION })
  return celdas
}

const t = (valor: string | null, f: Formato = TEXTO): Celda => ({ v: valor, f })
const n = (valor: number | null, f: Formato = USD): Celda => ({ v: valor, f })

/** Un rango del catalogo, en texto. Sin dato no se escribe nada, ni un cero. */
function rango(r: Rango | null, comoPct = true): string | null {
  if (r === null) return null
  const uno = (v: number) => (comoPct ? `${(v * 100).toFixed(1)}%` : v.toFixed(2))
  return r.min === r.max ? uno(r.min) : `${uno(r.min)} a ${uno(r.max)}`
}

/**
 * Arma el .xlsx de la propuesta.
 *
 * Devuelve los bytes. No toca el disco ni la red: el que lo pide decide si lo
 * manda por HTTP o lo compara contra otro en un test.
 */
export function armarXlsxPropuesta(propuesta: Propuesta, opciones: OpcionesXlsx): Uint8Array {
  const filas: (readonly Entrada[])[] = []
  const combinar: string[] = []

  /** Agrega una fila y devuelve su numero 1-based, para poder combinarla. */
  const agregar = (f: readonly Entrada[]): number => {
    filas.push(f)
    return filas.length
  }

  const seccion = (texto: string): void => {
    agregar(vacia())
    const r = agregar(banda(texto))
    combinar.push(`A${r}:J${r}`)
  }

  // ── Encabezado ────────────────────────────────────────────────────────
  const rTitulo = agregar(
    fila({ v: `CHEQUEO PATRIMONIAL 360° — ${propuesta.cliente.nombre}`, f: TITULO }),
  )
  combinar.push(`A${rTitulo}:J${rTitulo}`)

  const rBajada = agregar(
    fila({
      v:
        `Perfil: ${propuesta.cliente.perfil}` +
        `  |  Mandato: ${propuesta.cliente.mandato ?? 'sin definir'}` +
        `  |  ${opciones.fecha.toISOString().slice(0, 10)}` +
        (opciones.asesor === undefined ? '' : `  |  ${opciones.asesor}`),
      f: BAJADA,
    }),
  )
  combinar.push(`A${rBajada}:J${rBajada}`)

  if (propuesta.avisos.length > 0) {
    for (const aviso of propuesta.avisos) {
      const r = agregar(fila({ v: `· ${aviso}`, f: NOTA }))
      combinar.push(`A${r}:J${r}`)
    }
  }

  // ── 1. Foto actual ────────────────────────────────────────────────────
  seccion('1.  FOTO ACTUAL — LISTA DE ACTIVOS (patrimonio financiero)')
  agregar(
    fila(
      t('#', CABECERA),
      t('Institución / Producto', CABECERA),
      t('Tipo de la ficha', CABECERA),
      t('Asset class', CABECERA),
      t('Moneda', CABECERA),
      t('Plaza', CABECERA),
      t('Valor USD', CABECERA_DER),
      t('Rend. est.', CABECERA_DER),
      t('Decisión', CABECERA),
      t('Nota', CABECERA),
    ),
  )

  for (const f of propuesta.seccion1.filas) {
    agregar(
      fila(
        n(f.orden, INDICE),
        t(f.institucionProducto),
        t(f.tipoFicha, TENUE),
        t(f.assetClass, TENUE),
        t(f.moneda, TENUE),
        t(f.plaza, TENUE),
        n(f.valorUsd),
        n(f.rendimientoEst, PCT),
        t(
          f.cta === 'venta_parcial'
            ? `${DECISION[f.cta]} (${f.montoVentaParcialUsd.toFixed(2)})`
            : DECISION[f.cta],
          TENUE,
        ),
        t(f.nota === '' ? null : f.nota, NOTA),
      ),
    )
  }

  agregar(
    fila(
      t(null, TOTAL),
      t('Total patrimonio financiero', TOTAL),
      t(null, TOTAL),
      t(null, TOTAL),
      t(null, TOTAL),
      t(null, TOTAL),
      n(propuesta.seccion1.totalUsd, TOTAL_USD),
      t(null, TOTAL),
      t(null, TOTAL),
      t(null, TOTAL),
    ),
  )

  // ── 2. Uso propio ─────────────────────────────────────────────────────
  seccion('2.  INMUEBLE DE USO PROPIO (fuera del patrimonio financiero)')
  agregar(
    fila(
      t('Institución / Producto', CABECERA),
      t('País', CABECERA),
      t('% pertenencia', CABECERA_DER),
      t('Valor total USD', CABECERA_DER),
      t('Valor tuyo USD', CABECERA_DER),
      t('Uso', CABECERA),
      t('Rend. est.', CABECERA_DER),
      t('Decisión', CABECERA),
      t('Nota', CABECERA),
    ),
  )

  if (propuesta.seccion2.filas.length === 0) {
    agregar(fila(t('La ficha no trae inmuebles de uso propio.', TENUE)))
  }

  for (const f of propuesta.seccion2.filas) {
    agregar(
      fila(
        t(f.institucionProducto),
        t(f.pais, TENUE),
        n(f.pctPertenencia, PCT),
        n(f.valorTotalUsd),
        n(f.valorTuyoUsd),
        t(f.uso, TENUE),
        n(f.rendimientoEst, PCT),
        t(DECISION[f.cta], TENUE),
        t(f.nota === '' ? null : f.nota, NOTA),
      ),
    )
  }

  agregar(
    fila(
      t('Total uso propio', TOTAL),
      t(null, TOTAL),
      t(null, TOTAL),
      t(null, TOTAL),
      n(propuesta.seccion2.totalUsd, TOTAL_USD),
      t(null, TOTAL),
      t(null, TOTAL),
      t(null, TOTAL),
      t(null, TOTAL),
    ),
  )

  // ── 3. Distribucion por asset class ───────────────────────────────────
  seccion('3.  DISTRIBUCIÓN POR ASSET CLASS  (ex casas)')
  agregar(
    fila(
      t('Asset class', CABECERA),
      t('Valor USD', CABECERA_DER),
      t('%', CABECERA_DER),
      t('Se conserva USD', CABECERA_DER),
      t('Se vende USD', CABECERA_DER),
    ),
  )

  for (const f of propuesta.seccion3.filas) {
    agregar(
      fila(t(f.assetClass), n(f.valorUsd), n(f.share, PCT), n(f.seConservaUsd), n(f.seVendeUsd)),
    )
  }

  agregar(
    fila(
      t('Total', TOTAL),
      n(propuesta.seccion3.totalUsd, TOTAL_USD),
      n(propuesta.seccion3.totalUsd > 0 ? 1 : 0, TOTAL_PCT),
      t(null, TOTAL),
      t(null, TOTAL),
    ),
  )

  // ── 4. Resumen de decisiones ──────────────────────────────────────────
  seccion('4.  RESUMEN CTA — QUÉ SE CONSERVA Y QUÉ SE VENDE')
  agregar(fila(t('Decisión', CABECERA), t('Valor USD', CABECERA_DER), t('%', CABECERA_DER)))

  for (const f of propuesta.seccion4.filas) {
    agregar(fila(t(f.etiqueta), n(f.valorUsd), n(f.share, PCT)))
  }

  agregar(
    fila(
      t('Total', TOTAL),
      n(propuesta.seccion4.totalUsd, TOTAL_USD),
      n(propuesta.seccion4.totalUsd > 0 ? 1 : 0, TOTAL_PCT),
    ),
  )

  // ── 5. Exposicion ─────────────────────────────────────────────────────
  seccion('5.  EXPOSICIÓN ACTUAL — MONEDA Y PLAZA')
  agregar(fila(t('Por moneda', CABECERA), t('Valor USD', CABECERA_DER), t('%', CABECERA_DER)))
  for (const f of propuesta.seccion5.porMoneda) {
    agregar(fila(t(f.etiqueta), n(f.valorUsd), n(f.share, PCT)))
  }

  agregar(vacia())
  agregar(fila(t('Por plaza', CABECERA), t('Valor USD', CABECERA_DER), t('%', CABECERA_DER)))
  for (const f of propuesta.seccion5.porPlaza) {
    agregar(fila(t(f.etiqueta), n(f.valorUsd), n(f.share, PCT)))
  }

  // ── 6. Portafolio objetivo ────────────────────────────────────────────
  seccion(`6.  PROPUESTA OBJETIVO — TICKET DE INVERSIÓN  (perfil ${propuesta.cliente.perfil})`)

  const p = propuesta.seccion6.parametros
  const parametro = (etiqueta: string, valor: number, formato: Formato = USD): void => {
    agregar(fila(t(etiqueta, TENUE), n(valor, formato)))
  }
  parametro('Ticket financiero total', p.ticketFinancieroTotalUsd)
  parametro('Monto a reinvertir', p.montoAReinvertirUsd)
  parametro('Colchón de liquidez', p.colchonLiquidezUsd)
  parametro('Base de redistribución', p.baseRedistribucionUsd)
  parametro('% modelo inmobiliario', p.pctModeloInmobiliario, PCT)
  parametro('Tipo de cambio PEN/USD', p.fxPenUsd, { tamano: 10, color: COLOR.tinta, numero: 'decimal' })
  parametro('Ticket mínimo de ETF', p.ticketMinimoUsd)

  agregar(vacia())
  agregar(
    fila(
      t('Clase / Instrumento', CABECERA),
      t('USD', CABECERA_DER),
      t('%', CABECERA_DER),
      t('Origen', CABECERA),
      t('Retorno total', CABECERA_DER),
      t('Retorno distributivo', CABECERA_DER),
      t('Distribución anual USD', CABECERA_DER),
      t('Moneda', CABECERA),
      t('Plazo mínimo', CABECERA),
      t('Nota', CABECERA),
    ),
  )

  for (const grupo of propuesta.seccion6.grupos) {
    agregar(
      fila(
        t(NOMBRE_CLASE[grupo.clase], CLASE),
        n(grupo.objetivoUsd, CLASE_USD),
        n(grupo.share, CLASE_PCT),
        t(grupo.cerrada ? 'clase cerrada en su piso' : null, TENUE),
      ),
    )

    for (const linea of grupo.lineas) {
      agregar(
        fila(
          t(`    ${linea.instrumento}`),
          n(linea.usd),
          n(linea.share, PCT),
          t(linea.conservada ? 'Conservado' : 'Compra', TENUE),
          t(rango(linea.retornoTotal), TENUE),
          t(rango(linea.retornoDistributivo), TENUE),
          t(rango(linea.distribucionAnualUsd, false), TENUE),
          t(linea.moneda, TENUE),
          t(linea.liquidez, TENUE),
          t(linea.nota, NOTA),
        ),
      )
    }
  }

  const rCuadre6 = agregar(
    fila(
      t('Total objetivo', TOTAL),
      n(propuesta.seccion6.totalUsd, TOTAL_USD),
      n(propuesta.seccion6.totalUsd > 0 ? 1 : 0, TOTAL_PCT),
      t(null, TOTAL),
      t(null, TOTAL),
      t(null, TOTAL),
      t(null, TOTAL),
      t(null, TOTAL),
      t(null, TOTAL),
      t(null, TOTAL),
    ),
  )
  void rCuadre6

  agregar(
    fila(
      t('Cuadre contra el patrimonio financiero', TENUE),
      n(
        propuesta.seccion6.cuadreUsd,
        Math.abs(propuesta.seccion6.cuadreUsd) <= TOL ? CUADRE_OK : CUADRE_MAL,
      ),
      t(
        Math.abs(propuesta.seccion6.cuadreUsd) <= TOL
          ? 'cuadra'
          : 'NO cuadra — la propuesta no se publica',
        TENUE,
      ),
    ),
  )

  // El modelo puro al lado del recomendado: la tabla que explica por que el
  // plan se desvia, y la que el asesor usa para defender la propuesta.
  agregar(vacia())
  agregar(
    fila(
      t('Modelo puro contra recomendado', CABECERA),
      t('Modelo USD', CABECERA_DER),
      t('Recomendado USD', CABECERA_DER),
      t('Diferencia p.p.', CABECERA_DER),
    ),
  )

  for (const f of propuesta.seccion6.comparativo) {
    const esClase = f.nivel === 'clase'
    // La fila de clase trae la clave del motor en `etiqueta` — `fijo`, `inm` —
    // y el nombre sale del diccionario, igual que en la pantalla.
    const nombre = esClase ? NOMBRE_CLASE[f.clase] : `    ${f.etiqueta}`
    agregar(
      fila(
        t(nombre, esClase ? CLASE : TEXTO),
        n(f.modeloUsd, esClase ? CLASE_USD : USD),
        n(f.recomendadoUsd, esClase ? CLASE_USD : USD),
        n(f.difPp, PUNTOS),
      ),
    )
  }

  // ── 7. Blotter ────────────────────────────────────────────────────────
  seccion('7.  BLOTTER — CUADRE DE COMPRAS Y VENTAS')
  agregar(fila(t('Ventas', CABECERA), t('Acción', CABECERA), t('USD', CABECERA_DER)))

  if (propuesta.seccion7.ventas.length === 0) {
    agregar(fila(t('No hay ventas: todo lo que hay se conserva.', TENUE)))
  }
  for (const v of propuesta.seccion7.ventas) {
    agregar(fila(t(v.instrumento), t(v.accion, TENUE), n(v.usd)))
  }
  agregar(
    fila(t('Total ventas', TOTAL), t(null, TOTAL), n(propuesta.seccion7.totalVentasUsd, TOTAL_USD)),
  )

  agregar(vacia())
  agregar(fila(t('Compras', CABECERA), t('Clase', CABECERA), t('USD', CABECERA_DER)))
  if (propuesta.seccion7.compras.length === 0) {
    agregar(fila(t('No hay compras: no se liberó dinero.', TENUE)))
  }
  for (const c of propuesta.seccion7.compras) {
    agregar(fila(t(c.instrumento), t(NOMBRE_CLASE[c.clase], TENUE), n(c.usd)))
  }
  agregar(
    fila(
      t('Total compras', TOTAL),
      t(null, TOTAL),
      n(propuesta.seccion7.totalComprasUsd, TOTAL_USD),
    ),
  )

  const cuadra7 = Math.abs(propuesta.seccion7.cuadreUsd) <= TOL
  agregar(
    fila(
      t('Compras menos ventas', TENUE),
      t(null),
      n(propuesta.seccion7.cuadreUsd, cuadra7 ? CUADRE_OK : CUADRE_MAL),
      t(cuadra7 ? 'cuadra' : 'NO cuadra — la propuesta no se publica', TENUE),
    ),
  )

  // ── Pie ───────────────────────────────────────────────────────────────
  agregar(vacia())
  const rPie = agregar(
    fila({
      v:
        'Generado por la plataforma Sabbi desde el mismo motor que arma la propuesta en pantalla ' +
        'y los dos decks. Sin fórmulas: cada cifra es la que el motor calculó' +
        (opciones.versionMacro === undefined || opciones.versionMacro === null
          ? ' con la macro de fábrica.'
          : ` con la macro v${opciones.versionMacro}.`),
      f: NOTA,
    }),
  )
  combinar.push(`A${rPie}:J${rPie}`)

  const hoja: Hoja = {
    nombre: `360 ${propuesta.cliente.nombre}`,
    filas,
    anchos: ANCHOS,
    combinar,
    // Las dos primeras filas son el nombre del cliente y su perfil: en una hoja
    // de ciento veinte filas hay que poder seguir viendo de quien es.
    congelar: 'A3',
  }

  return escribirLibro([hoja])
}
