/**
 * Montos que el asesor clava instrumento por instrumento.
 *
 * Es la tercera palanca del portafolio objetivo, y la mas fina de las tres. La
 * primera decide cuanto le toca a cada clase —el benchmark, corregido por los
 * ajustes de clase—; la segunda agrega una linea que el modelo no propone. Esta
 * dice, dentro de una clase que ya tiene su monto, cuanto va en cada
 * instrumento: «de los 94,691 de Renta Fija quiero 50,000 en el Treasury 7-10y
 * y el resto donde caiga».
 *
 * La regla es la misma que la de los ajustes de clase, un nivel mas abajo: lo
 * clavado se respeta y el resto se prorratea entre las lineas libres de esa
 * misma clase, en proporcion a lo que ya tenian. El total de la clase no se
 * mueve ni un centavo — quien decide cuanto vale Renta Fija es el benchmark,
 * no esta funcion. Mover dinero de una clase a otra sigue siendo un ajuste de
 * clase, que es donde el asesor puede verlo contra el modelo.
 *
 * Dos lineas no se pueden clavar:
 *
 *  - Las que salen de un piso. Una posicion conservada vale lo que el cliente
 *    tiene; bajarla es vender, y vender se marca en la ficha. Un activo
 *    agregado ya trae su monto escrito por el asesor en su propia fila.
 *  - La unica linea libre de su clase. Su monto *es* el de la clase, asi que
 *    clavarla seria fijar la clase escribiendo en el sitio equivocado. El motor
 *    la devuelve al total de la clase y lo dice.
 *
 * Corre antes del prorrateo de residuales y deja lo clavado exento: si corriera
 * despues, una linea libre podria quedar debajo del ticket minimo y sobrevivir
 * porque ya nadie la barre. Asi el numero que el asesor escribio se respeta y
 * las demas siguen obedeciendo la regla del ticket.
 */

import type { AjusteLinea, ClaseModelo, LineaPlan } from '../domain/tipos.js'
import { NOMBRE_CLASE } from '../domain/tipos.js'

const EPS = 1e-6

/** Un centavo. Por debajo, una diferencia es ruido de coma flotante. */
const TOL = 0.01

export interface ResultadoAjustesDeLinea {
  readonly lineas: readonly LineaPlan[]
  /** Lo que no se pudo aplicar tal cual se pidio. Nunca se calla. */
  readonly avisos: readonly string[]
}

/**
 * La clave de un ajuste: la clase y el instrumento juntos.
 *
 * El mismo nombre puede salir en dos clases —el oro vive en Otros y podria
 * aparecer en otra— y un ajuste sobre uno no puede mover al otro. El espacio
 * alcanza como separador: `ClaseModelo` es una union cerrada de siete tokens y
 * ninguno lleva espacios, asi que dos pares distintos no pueden dar la misma
 * clave.
 */
const clave = (clase: ClaseModelo, instrumento: string): string => `${clase} ${instrumento}`

const redondo = (monto: number): string =>
  monto.toLocaleString('en-US', { maximumFractionDigits: 0 })

/**
 * Aplica los montos clavados por linea, clase por clase.
 *
 * El resultado conserva el orden de entrada y el total de cada clase.
 */
export function fijarLineas(
  lineas: readonly LineaPlan[],
  ajustes: readonly AjusteLinea[],
): ResultadoAjustesDeLinea {
  if (ajustes.length === 0) return { lineas, avisos: [] }

  const pedido = new Map<string, number>()
  for (const ajuste of ajustes) {
    pedido.set(clave(ajuste.clase, ajuste.instrumento), Math.max(0, ajuste.montoUsd))
  }

  const avisos: string[] = []
  const aplicado = new Map<string, number>()

  for (const clase of new Set(lineas.map((l) => l.clase))) {
    const deLaClase = lineas.filter((l) => l.clase === clase)

    // Los pisos no entran en el reparto: no ceden ni reciben. Lo que se reparte
    // es lo que el modelo puso en esa clase.
    const delModelo = deLaClase.filter((l) => l.piso === undefined)
    const clavadas = delModelo.filter((l) => pedido.has(clave(clase, l.instrumento)))
    if (clavadas.length === 0) continue

    const libres = delModelo.filter((l) => !pedido.has(clave(clase, l.instrumento)))
    const disponible = delModelo.reduce((acc, l) => acc + l.usd, 0)
    const baseLibres = libres.reduce((acc, l) => acc + l.usd, 0)

    const montos = clavadas.map((l) => pedido.get(clave(clase, l.instrumento)) ?? 0)
    const suma = montos.reduce((acc, m) => acc + m, 0)

    // ── Se pidio mas de lo que la clase tiene ───────────────────────────────
    if (suma > disponible + TOL) {
      avisos.push(
        `${NOMBRE_CLASE[clase]}: clavaste ${redondo(suma)} entre sus instrumentos y la clase ` +
          `tiene ${redondo(disponible)}. Se repartio ese total en la misma proporcion; para ` +
          'subirla, fija el monto de la clase.',
      )
      const escala = suma > EPS ? disponible / suma : 0
      clavadas.forEach((l, i) => {
        aplicado.set(clave(clase, l.instrumento), (montos[i] ?? 0) * escala)
      })
      for (const l of libres) aplicado.set(clave(clase, l.instrumento), 0)
      continue
    }

    const resto = disponible - suma

    // ── No hay ninguna linea libre que absorba la diferencia ────────────────
    if (libres.length === 0) {
      if (Math.abs(resto) > TOL) {
        avisos.push(
          `${NOMBRE_CLASE[clase]}: no tiene otra linea entre la que repartir, asi que su ` +
            `instrumento vale lo que vale la clase. Quedo en ${redondo(disponible)}; para ` +
            'cambiarlo, fija el monto de la clase.',
        )
      }
      const escala = suma > EPS ? disponible / suma : 0
      clavadas.forEach((l, i) => {
        // Con todo pedido en cero no hay proporcion que respetar: el dinero de
        // la clase se reparte en partes iguales antes que desaparecer.
        aplicado.set(
          clave(clase, l.instrumento),
          suma > EPS ? (montos[i] ?? 0) * escala : disponible / clavadas.length,
        )
      })
      continue
    }

    clavadas.forEach((l, i) => aplicado.set(clave(clase, l.instrumento), montos[i] ?? 0))

    // Las libres se reparten el resto en proporcion a lo que ya tenian. `resto`
    // es lo que les toca en total y no lo que se les suma: `disponible` ya
    // contaba lo que tenian, asi que sumarlo lo contaria dos veces. Si todas
    // estaban en cero no hay proporcion que respetar y van en partes iguales,
    // que es lo unico que no inventa una preferencia que nadie expreso.
    for (const l of libres) {
      aplicado.set(
        clave(clase, l.instrumento),
        baseLibres > EPS ? (resto * l.usd) / baseLibres : resto / libres.length,
      )
    }
  }

  if (aplicado.size === 0) return { lineas, avisos }

  const resultado = lineas
    .map((l): LineaPlan => {
      const usd = aplicado.get(clave(l.clase, l.instrumento))
      if (usd === undefined) return l
      // Lo clavado queda exento del prorrateo de residuales: el numero que el
      // asesor escribio no lo barre una regla de ticket minimo.
      return pedido.has(clave(l.clase, l.instrumento))
        ? { ...l, usd, residuales: 'exenta' }
        : { ...l, usd }
    })
    // Una linea libre que se quedo sin dinero deja de ser una linea. Sale del
    // plan en vez de quedar en cero: una posicion de cero dolares no se ejecuta,
    // ensucia el deck y el Excel, y ademas romperia el invariante de que
    // ninguna linea plena queda por debajo del ticket minimo.
    //
    // Lo clavado en cero SI se queda. Es una decision explicita del asesor y la
    // fila es el unico sitio desde donde puede deshacerla: borrarla lo dejaria
    // con un ajuste que no puede ver ni soltar.
    .filter((l) => l.usd > EPS || pedido.has(clave(l.clase, l.instrumento)) || l.piso !== undefined)

  return { lineas: resultado, avisos }
}
