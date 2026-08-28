import { cajaDe, colocar, formasDe } from './forma.js'
import type { Caja } from './forma.js'
import { escapar } from './xml.js'

/**
 * El grafico de la lamina 4, que hay que redibujar y no rellenar.
 *
 * El deck de referencia esta dibujado a mano: no trae ni una parte de grafico
 * ni un libro incrustado. Las barras son formas con su alto escrito en el XML y
 * los porcentajes que se leen encima son cajas de texto sueltas. Sustituir el
 * texto escribe otro numero y deja la barra donde estaba, asi que la lamina
 * salia con las cifras del cliente que se esta atendiendo sobre la proporcion
 * del cliente de referencia. Una barra que no corresponde a su etiqueta es peor
 * que una lamina en blanco: se lee como un dato y no lo es.
 *
 * Reproducirla es geometria. Son doce elementos: seis barras, que cambian de
 * alto y de origen, y sus seis etiquetas, que las siguen.
 *
 * ## El eje no se mueve, se renombra
 *
 * El deck dibuja seis lineas horizontales equiespaciadas y las rotula de 0% a
 * 50%. Reescalar moviendolas seria rehacer el trazado; en cambio se les cambia
 * el rotulo, que son cajas de texto. Con las mismas lineas a 20% por escalon el
 * eje llega a 100%, y una clase que se lleva el 70% del patrimonio entra en la
 * lamina en vez de salirse por arriba de ella. Es el mismo grafico con otra
 * regla graduada.
 *
 * ## La segunda serie se va
 *
 * La lamina traia dos series: el portafolio de hoy y el objetivo. La segunda no
 * se puede mapear —la seccion 3 clasifica por asset class y la 6 por clase del
 * modelo, y cruzarlas a ojo daria un grafico que no cuadra con la lamina del
 * objetivo— asi que se borra: su linea, sus marcadores, sus etiquetas y su
 * entrada en la leyenda. Dejarla dibujada seria mostrar el portafolio objetivo
 * de un desconocido al lado del patrimonio real de este cliente, y con las
 * barras ya corregidas se leeria como si fuera suyo.
 */

/** La linea del cero, medida sobre la barra de altura cero que trae la lamina. */
export const BASE_EMU = 4_584_700

/** Lo que separa dos lineas del eje. Las seis estan equiespaciadas. */
export const PASO_EMU = 508_000

/** Cuantos escalones hay dibujados sobre el cero. */
export const PASOS = 5

/** El ancho de cada barra. Es lo que las distingue del resto de las formas. */
export const ANCHO_BARRA = 798_195

/** Lo que la etiqueta de una barra deja libre sobre ella. */
export const HOLGURA_ETIQUETA = 12_700

/** Cuantas barras dibuja la lamina. */
export const BARRAS = 6

/**
 * Los escalones que el eje sabe rotular, en fraccion.
 *
 * No es cualquier numero: un eje que dijera «0%, 13%, 26%» seria ilegible. La
 * escalera va de menos a mas y se toma el primero que alcanza.
 */
const ESCALONES: readonly number[] = [0.02, 0.05, 0.1, 0.2, 0.25, 0.5]

const UN_EMU_DE_TOLERANCIA = 1_000

/** El token que rotula cada barra. La plantilla numera desde el segundo. */
export const tokenDeBarra = (i: number): string => (i === 0 ? 's04.pct' : `s04.pct${i + 1}`)

/** Los tokens de la segunda serie, la que no tiene fuente. */
export const TOKENS_SEGUNDA_SERIE: readonly string[] = [7, 8, 9, 10, 11, 12].map(
  (n) => `s04.pct${n}`,
)

/** La entrada de leyenda de la segunda serie. */
const TOKEN_LEYENDA_OBJETIVO = 's04.nombre10'

/**
 * El escalon con el que el eje llega a cubrir la barra mas alta.
 *
 * Si ninguno alcanza —una sola clase con mas del 100%, que no deberia existir—
 * se queda con el mayor y la barra se recorta contra el techo del eje. Es
 * preferible a dibujar una barra por encima del titulo de la lamina.
 */
export function escalonPara(shares: readonly number[]): number {
  const mayor = shares.reduce((max, share) => Math.max(max, share), 0)
  const ultimo = ESCALONES[ESCALONES.length - 1] ?? 0.5

  return ESCALONES.find((escalon) => escalon * PASOS >= mayor) ?? ultimo
}

/** Lo que mide el area del grafico de la linea del cero al rotulo de arriba. */
const ALTO_DEL_EJE = PASO_EMU * PASOS

/**
 * Cuantos EMU mide una fraccion del patrimonio con ese escalon.
 *
 * Se recorta contra el techo del eje. No deberia hacer falta —el escalon se
 * elige justamente para que la barra mas alta entre— pero si algun dia no
 * entrara, una barra recortada se lee como recortada y una que sale por arriba
 * se dibuja encima del titulo de la lamina.
 */
const alturaDe = (share: number, escalon: number): number =>
  Math.min(ALTO_DEL_EJE, Math.max(0, Math.round((share / escalon) * PASO_EMU)))

const textoDe = (forma: string): string =>
  (forma.match(/<a:t>([\s\S]*?)<\/a:t>/g) ?? [])
    .map((t) => t.replace(/<\/?a:t>/g, ''))
    .join('')

const tieneToken = (forma: string, token: string): boolean => forma.includes(`{{${token}}}`)

/** Las barras, de izquierda a derecha. Se reconocen por su ancho y por apoyarse en el cero. */
function barrasDe(xml: string): readonly string[] {
  return formasDe(xml)
    .filter((forma) => {
      if (!forma.includes('<a:custGeom')) return false
      const caja = cajaDe(forma)
      return (
        caja.cx === ANCHO_BARRA &&
        Math.abs(caja.y + caja.cy - BASE_EMU) <= UN_EMU_DE_TOLERANCIA
      )
    })
    .sort((a, b) => cajaDe(a).x - cajaDe(b).x)
}

/**
 * Le cambia el rotulo a las seis lineas del eje.
 *
 * Las encuentra por lo que dicen —un porcentaje entero— y por estar a la
 * izquierda de la primera barra, que es donde va un eje vertical. El orden se
 * lee del dibujo, de abajo hacia arriba, para no depender de que la plantilla
 * las guarde en ningun orden en particular.
 */
function rotularEje(
  xml: string,
  escalon: number,
  xDeLaPrimeraBarra: number,
): { readonly xml: string; readonly escalon: number } {
  const rotulos = formasDe(xml)
    .filter((forma) => /^\d+%$/.test(textoDe(forma)) && cajaDe(forma).x < xDeLaPrimeraBarra)
    .sort((a, b) => cajaDe(b).y - cajaDe(a).y)

  // Sin los seis rotulos no se puede reescalar, y escalar las barras contra un
  // eje que sigue diciendo otra cosa seria dibujar cifras falsas. Se deja el
  // eje como esta y se usa el escalon que ya dice.
  if (rotulos.length !== PASOS + 1) {
    const segundo = Number(textoDe(rotulos[1] ?? '').replace('%', ''))
    return { xml, escalon: Number.isFinite(segundo) && segundo > 0 ? segundo / 100 : escalon }
  }

  const conEje = rotulos.reduce((acc, forma, i) => {
    const valor = `${Math.round(escalon * i * 100)}%`
    return acc.replace(forma, forma.replace(/<a:t>[\s\S]*?<\/a:t>/, `<a:t>${escapar(valor)}</a:t>`))
  }, xml)

  return { xml: conEje, escalon }
}

/** Quita una forma del XML, si esta. */
const quitar = (xml: string, forma: string): string => xml.replace(forma, '')

const GRUPO = /<p:grpSp>[\s\S]*?<\/p:grpSp>/g
const IMAGEN = /<p:pic>[\s\S]*?<\/p:pic>/g

const centroDe = (caja: Caja) => ({ x: caja.x + caja.cx / 2, y: caja.y + caja.cy / 2 })

/**
 * Lo que puede separar a una pastilla de su etiqueta.
 *
 * Medido sobre la lamina: la pastilla es la etiqueta ensanchada 50,800 EMU y
 * subida 12,700, asi que sus centros coinciden en x y quedan a 12,700 en y. No
 * se la busca por contener a la etiqueta —no la contiene, sobresale a los lados
 * pero no por abajo— sino por estar centrada en el mismo sitio.
 */
const DISTANCIA_PASTILLA = 50_800

const mismoCentro = (a: Caja, b: Caja): boolean => {
  const ca = centroDe(a)
  const cb = centroDe(b)
  return Math.abs(ca.x - cb.x) <= DISTANCIA_PASTILLA && Math.abs(ca.y - cb.y) <= DISTANCIA_PASTILLA
}

/**
 * Borra la serie del portafolio objetivo entera.
 *
 * Son cuatro cosas y hay que llevarse las cuatro: el grupo con la linea y sus
 * marcadores —el unico del grafico que trae imagenes—, las seis etiquetas de
 * porcentaje, la pastilla que cada una lleva detras, y la entrada de la leyenda
 * con su cuadrito de color. Dejar una sola de ellas deja media serie dibujada.
 */
function quitarSegundaSerie(xml: string): string {
  let salida = xml

  for (const grupo of salida.match(GRUPO) ?? []) {
    if (grupo.includes('<p:pic>')) salida = quitar(salida, grupo)
  }

  for (const token of TOKENS_SEGUNDA_SERIE) {
    const etiqueta = formasDe(salida).find((forma) => tieneToken(forma, token))
    if (etiqueta === undefined) continue

    // La pastilla es la forma sin texto que va detras de la etiqueta, centrada
    // en el mismo sitio. Se la busca antes de sacar la etiqueta, porque es la
    // etiqueta la que dice donde esta. Una barra nunca es una pastilla, y
    // decirlo evita que una etiqueta que cae dentro de su propia barra se lleve
    // la barra por delante.
    const caja = cajaDe(etiqueta)
    const pastilla = formasDe(salida).find((forma) => {
      if (forma === etiqueta || textoDe(forma) !== '') return false
      const suya = cajaDe(forma)
      return suya.cx !== ANCHO_BARRA && mismoCentro(suya, caja)
    })

    salida = quitar(salida, etiqueta)
    if (pastilla !== undefined) salida = quitar(salida, pastilla)
  }

  const leyenda = formasDe(salida).find((forma) => tieneToken(forma, TOKEN_LEYENDA_OBJETIVO))
  if (leyenda !== undefined) {
    // El cuadrito de color va dibujado inmediatamente antes de su texto.
    const imagenes = salida.match(IMAGEN) ?? []
    const anterior = imagenes.filter((img) => salida.indexOf(img) < salida.indexOf(leyenda)).pop()

    salida = quitar(salida, leyenda)
    if (anterior !== undefined) salida = quitar(salida, anterior)
  }

  return salida
}

export interface ResultadoGrafico {
  readonly xml: string
  /** El escalon con el que quedo rotulado el eje, en fraccion. */
  readonly escalon: number
  /** Cuantas barras se redibujaron. Seis cuando la lamina esta entera. */
  readonly barras: number
}

/**
 * Redibuja el grafico con las participaciones del cliente.
 *
 * Las `shares` llegan en fraccion y en el mismo orden en que el mapa rotula las
 * asset class, que es de mayor a menor. Menos de seis deja las barras sobrantes
 * en cero, que es lo que corresponde: su etiqueta tampoco tiene valor.
 */
export function redibujarGrafico(xml: string, shares: readonly number[]): ResultadoGrafico {
  const sinObjetivo = quitarSegundaSerie(xml)
  const barras = barrasDe(sinObjetivo)

  if (barras.length === 0) return { xml: sinObjetivo, escalon: ESCALONES[2] ?? 0.1, barras: 0 }

  const primera = cajaDe(barras[0] ?? '')
  const eje = rotularEje(sinObjetivo, escalonPara(shares), primera.x)
  const { escalon } = eje

  let salida = eje.xml

  barras.forEach((barra, i) => {
    const cy = alturaDe(shares[i] ?? 0, escalon)
    const y = BASE_EMU - cy

    salida = salida.replace(barra, colocar(barra, { y, cy }))

    // La etiqueta va sobre su barra, a la holgura que el diseno dejo. No se la
    // desplaza junto con la barra sino que se la vuelve a colocar: la plantilla
    // trae una que PowerPoint habia apartado para esquivar la linea del
    // objetivo, y esa linea ya no esta.
    const etiqueta = formasDe(salida).find((forma) => tieneToken(forma, tokenDeBarra(i)))
    if (etiqueta === undefined) return

    const suya = cajaDe(etiqueta)
    salida = salida.replace(
      etiqueta,
      colocar(etiqueta, { y: y - suya.cy - HOLGURA_ETIQUETA }),
    )
  })

  return { xml: salida, escalon, barras: barras.length }
}
