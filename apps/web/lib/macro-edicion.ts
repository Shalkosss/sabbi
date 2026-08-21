import type { Benchmarks, Macro } from '@sabbi/config'
import { CLASES, conValorDeMacro } from '@sabbi/core'
import type { ClaseModelo, Perfil, ReglasMotor } from '@sabbi/core'

/**
 * Editar la macro sin estropear lo que no se tocó.
 *
 * Los pesos de la hoja `Data` llegan con dieciséis dígitos y esa precisión no
 * es decorativa: redondearlos a cuatro decimales desplaza la base de
 * redistribución en 6,502.88 USD sobre el caso Ana Tumi. Un editor que
 * reescribiera los treinta y cinco pesos cada vez que se guarda —aunque se
 * hubiera cambiado uno— haría exactamente ese redondeo, sin que nadie lo pida
 * y sin que nadie lo vea.
 *
 * Por eso todo lo de acá cambia un valor y devuelve el resto intacto, bit por
 * bit. Lo que no se toca sale del editor igual que entró.
 *
 * La segunda idea es cómo se editan los instrumentos. En el archivo, el peso
 * de un ETF está sobre el patrimonio total —`iShares Core S&P 500` pesa 12.6%
 * del portafolio, no 46% de su clase—, y así son imposibles de repartir a
 * mano: subir la clase obliga a recalcular los cinco. Acá se editan como
 * reparto interno, que es como se piensan, y al escribirlos se vuelven a
 * multiplicar por el peso de la clase. Las dos formas dicen lo mismo; solo una
 * se puede teclear.
 *
 * Todo esto corre en el navegador —es la pantalla de Macro— y por eso solo
 * habla con `@sabbi/core`, que es puro. De `@sabbi/config` toma los tipos y
 * nada más: importar su módulo arrastraría Zod y el JSON de benchmarks al
 * bundle de una pantalla que ya los recibe por props.
 */

const EPS = 1e-12

/** El peso de una clase en un perfil. */
export const pesoDeClase = (macro: Macro, clase: ClaseModelo, perfil: Perfil): number =>
  macro.pesos.clases[clase].pesos[perfil]

/** Lo que suman las siete clases de un perfil. Tiene que ser 1. */
export const sumaDelPerfil = (macro: Macro, perfil: Perfil): number =>
  CLASES.reduce((total, clase) => total + pesoDeClase(macro, clase, perfil), 0)

/**
 * El reparto interno de una clase: qué parte de ella se lleva cada producto.
 *
 * Es lo que el motor usa de verdad —`pesosDeClase` renormaliza dentro de la
 * clase— y lo que se puede leer y teclear. Con la clase en cero no hay
 * proporción que calcular y el reparto se muestra parejo.
 */
export function repartoInterno(
  macro: Macro,
  clase: ClaseModelo,
  perfil: Perfil,
): readonly number[] {
  const productos = macro.pesos.clases[clase].productos
  const total = productos.reduce((acc, p) => acc + p.pesos[perfil], 0)
  if (total <= EPS) return productos.map(() => (productos.length === 0 ? 0 : 1 / productos.length))
  return productos.map((p) => p.pesos[perfil] / total)
}

/** Copia la configuración de pesos cambiando una sola clase. */
function conClase(
  pesos: Benchmarks,
  clase: ClaseModelo,
  cambio: (c: Benchmarks['clases'][ClaseModelo]) => Benchmarks['clases'][ClaseModelo],
): Benchmarks {
  return { ...pesos, clases: { ...pesos.clases, [clase]: cambio(pesos.clases[clase]) } }
}

/**
 * Cambia el peso de una clase en un perfil.
 *
 * Los instrumentos de esa clase se reescalan para conservar su reparto: subir
 * Renta Variable de 16% a 20% no cambia qué parte se lleva el S&P 500, cambia
 * cuánto es esa parte. Es lo que hace la hoja y lo que espera quien lo teclea.
 */
export function conPesoDeClase(
  macro: Macro,
  clase: ClaseModelo,
  perfil: Perfil,
  fraccion: number,
): Macro {
  const reparto = repartoInterno(macro, clase, perfil)

  return {
    ...macro,
    pesos: conClase(macro.pesos, clase, (c) => ({
      ...c,
      pesos: { ...c.pesos, [perfil]: fraccion },
      productos: c.productos.map((producto, i) => ({
        ...producto,
        pesos: { ...producto.pesos, [perfil]: fraccion * (reparto[i] ?? 0) },
      })),
    })),
  }
}

/**
 * Cambia lo que se lleva un instrumento dentro de su clase, en un perfil.
 *
 * Solo mueve ese instrumento. Los demás quedan donde estaban y el reparto deja
 * de sumar 100%, que es exactamente lo que la pantalla tiene que mostrar: el
 * asesor decide si sube otro, baja otro o cuadra el bloque entero.
 */
export function conRepartoInterno(
  macro: Macro,
  clase: ClaseModelo,
  indice: number,
  perfil: Perfil,
  fraccionInterna: number,
): Macro {
  const pesoClase = pesoDeClase(macro, clase, perfil)

  return {
    ...macro,
    pesos: conClase(macro.pesos, clase, (c) => ({
      ...c,
      productos: c.productos.map((producto, i) =>
        i === indice
          ? { ...producto, pesos: { ...producto.pesos, [perfil]: pesoClase * fraccionInterna } }
          : producto,
      ),
    })),
  }
}

/**
 * Reparte la diferencia hasta 1 entre las clases que no se tocaron.
 *
 * Es el gesto que la mesa hace de verdad: «Renta Variable va en 20%, el resto
 * que se acomode». Prorratea sobre lo que cada clase ya tenía, así que las
 * proporciones entre ellas no cambian — solo la escala.
 *
 * `intactas` son las que se dejan mover. Si están todas tocadas, se mueven
 * todas: es preferible cuadrar el perfil que dejarlo sin cuadrar.
 */
export function cuadrarPerfil(
  macro: Macro,
  perfil: Perfil,
  intactas: ReadonlySet<ClaseModelo>,
): Macro {
  const faltante = 1 - sumaDelPerfil(macro, perfil)
  if (Math.abs(faltante) <= EPS) return macro

  const candidatas = CLASES.filter((c) => intactas.has(c) && pesoDeClase(macro, c, perfil) > EPS)
  const mueve = candidatas.length > 0 ? candidatas : CLASES.filter((c) => pesoDeClase(macro, c, perfil) > EPS)
  const base = mueve.reduce((total, c) => total + pesoDeClase(macro, c, perfil), 0)
  if (base <= EPS) return macro

  const factor = (base + faltante) / base
  // Un factor negativo dejaria pesos negativos: el sobrante es mayor que todo
  // lo que hay para achicar. No se cuadra a la fuerza; la pantalla lo dice.
  if (factor < 0) return macro

  return mueve.reduce(
    (acumulada, clase) =>
      conPesoDeClase(acumulada, clase, perfil, pesoDeClase(acumulada, clase, perfil) * factor),
    macro,
  )
}

/** Lo que suma el reparto interno de una clase. Tiene que ser 1. */
export const sumaDelReparto = (macro: Macro, clase: ClaseModelo, perfil: Perfil): number => {
  const pesoClase = pesoDeClase(macro, clase, perfil)
  if (pesoClase <= EPS) return 0
  return (
    macro.pesos.clases[clase].productos.reduce((total, p) => total + p.pesos[perfil], 0) / pesoClase
  )
}

/** Reparte la diferencia hasta 100% entre los instrumentos de una clase. */
export function cuadrarReparto(macro: Macro, clase: ClaseModelo, perfil: Perfil): Macro {
  const pesoClase = pesoDeClase(macro, clase, perfil)
  const productos = macro.pesos.clases[clase].productos
  if (pesoClase <= EPS || productos.length === 0) return macro

  const suma = productos.reduce((total, p) => total + p.pesos[perfil], 0)
  if (suma <= EPS) {
    // Todo en cero: no hay proporcion que conservar y el reparto va parejo.
    return productos.reduce(
      (acumulada, _, i) => conRepartoInterno(acumulada, clase, i, perfil, 1 / productos.length),
      macro,
    )
  }

  const factor = pesoClase / suma
  return productos.reduce(
    (acumulada, producto, i) =>
      conRepartoInterno(
        acumulada,
        clase,
        i,
        perfil,
        (producto.pesos[perfil] * factor) / pesoClase,
      ),
    macro,
  )
}

/** Cambia un umbral del motor por su ruta: `club.minUsd`. */
export const conRegla = (macro: Macro, ruta: string, valor: number): Macro => ({
  ...macro,
  reglas: conValorDeMacro(macro.reglas, ruta, valor),
})

/** Cambia a dónde va el capital del inmobiliario disuelto. */
export const conDestinoInmobiliario = (
  macro: Macro,
  destino: ReglasMotor['inmobiliario']['destino'],
): Macro => ({
  ...macro,
  reglas: { ...macro.reglas, inmobiliario: { ...macro.reglas.inmobiliario, destino } },
})

/**
 * Una versión guardada de la macro, para el historial.
 *
 * Vive acá y no junto a la lectura de la base porque la pantalla la muestra, y
 * ese módulo es `server-only`: un `import type` se borra al compilar, pero
 * dejar la referencia invita a que alguien la convierta en un import de valor
 * y descubra el problema en producción.
 */
export interface VersionDeMacro {
  readonly version: number
  readonly nota: string
  readonly creadaEn: string
  readonly autor: string | null
  readonly activa: boolean
}

export interface Descuadre {
  readonly donde: string
  readonly suma: number
}

/**
 * Lo que impide guardar.
 *
 * Es la misma condición que valida el esquema del lado del servidor, mirada
 * antes: un perfil cuyas clases no suman 1 reparte mal el patrimonio y no lo
 * dice, y un reparto interno que se pasa de su clase haría que un instrumento
 * pese más que el bloque que lo contiene. Que la pantalla lo diga primero no
 * saca la validación de la base — la duplica a propósito, porque el mensaje de
 * Zod llega tarde y sin señalar la celda.
 */
export function descuadres(macro: Macro, perfiles: readonly Perfil[]): readonly Descuadre[] {
  const fuera: Descuadre[] = []

  for (const perfil of perfiles) {
    const suma = sumaDelPerfil(macro, perfil)
    // La misma tolerancia del esquema: 1e-6 deja pasar el error de coma
    // flotante del Excel sin tolerar un benchmark realmente mal cuadrado.
    if (Math.abs(suma - 1) > 1e-6) fuera.push({ donde: perfil, suma })
  }

  for (const clase of CLASES) {
    if (macro.pesos.clases[clase].productos.length === 0) continue
    for (const perfil of perfiles) {
      const suma = sumaDelReparto(macro, clase, perfil)
      if (suma > 1 + 1e-9) {
        fuera.push({ donde: `${macro.pesos.clases[clase].nombre} · ${perfil}`, suma })
      }
    }
  }

  return fuera
}
