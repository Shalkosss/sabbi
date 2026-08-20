import { cajaDe, colocar, conId, escribir, formasDe, molde, reemplazarFormas } from './forma.js'

/**
 * "Patrimonio total, antes y despues": una tarjeta por clase.
 *
 * Cada clase es una tarjeta con dos columnas —lo que el cliente tiene y lo que
 * tendria— y su subtotal abajo. Las tarjetas se apilan y, cuando ya no entran,
 * siguen en la lamina siguiente.
 *
 * La geometria no esta inventada: sale de medir el deck que Sabbi entrega. Una
 * tarjeta de una fila mide 1,524,000 EMU y cada fila de mas suma 342,900; el
 * subtotal siempre arranca 571,500 antes del pie. Esos numeros se comprobaron
 * contra cuatro tarjetas distintas de dos clientes distintos, y por eso estan
 * escritos como constantes y no como una formula aproximada.
 */

export interface FilaTarjeta {
  readonly nombre: string
  readonly monto: string
}

export interface Tarjeta {
  /** El nombre de la clase, en la banda de la cabecera. */
  readonly clase: string
  /** «$386,000 → $207,000», a la derecha de la cabecera. */
  readonly cambio: string
  readonly antes: readonly FilaTarjeta[]
  readonly despues: readonly FilaTarjeta[]
  readonly subtotalAntes: string
  readonly subtotalDespues: string
}

// ── La geometria, medida sobre el deck ──────────────────────────────────────

/** Alto de una tarjeta de una sola fila. */
const ALTO_BASE = 1_524_000
/** Lo que crece la tarjeta por cada fila de mas. */
const PASO_FILA = 342_900
/** Aire entre una tarjeta y la siguiente. */
const AIRE = 152_400
/** Donde arranca la primera tarjeta de la lamina. */
const Y_PRIMERA = 1_524_000
/** Hasta donde se puede dibujar sin salirse de la lamina. */
const Y_FONDO = 5_900_000

/** Desplazamientos dentro de la tarjeta, contra su borde de arriba. */
const DENTRO = {
  cabecera: 95_250,
  columna: 457_200,
  primeraFila: 666_750,
  /** La linea divisoria va debajo de su fila. */
  divisor: 285_750,
  /** El subtotal arranca a esta distancia del pie de la tarjeta. */
  subtotalDesdeElPie: 571_500,
  subtotalEtiqueta: 57_150,
  subtotalValor: 247_650,
} as const

/** Columnas de la izquierda y de la derecha, en EMU. */
const IZQUIERDA = 685_800
const DERECHA = 6_248_400

/**
 * Los rotulos fijos de la tarjeta.
 *
 * Se escriben en vez de heredarse del molde porque en la plantilla estan
 * tokenizados: el tokenizador no distingue un rotulo de diseno de un dato del
 * cliente, y sin esto la tarjeta clonada sale con un `{{s11.nombre13}}` donde
 * deberia decir SUBTOTAL ANTES.
 */
const ROTULO = {
  subtotalAntes: 'SUBTOTAL ANTES',
  subtotalDespues: 'SUBTOTAL DESPUES',
  /** Lo que se dibuja en la columna de una clase que no tenia nada. */
  vacio: '-',
} as const

export const altoDeTarjeta = (tarjeta: Tarjeta): number =>
  ALTO_BASE + PASO_FILA * Math.max(0, Math.max(tarjeta.antes.length, tarjeta.despues.length) - 1)

/**
 * Reparte las tarjetas en tantas laminas como hagan falta.
 *
 * Una tarjeta que no entra ni sola en una lamina vacia entra igual: dejarla
 * afuera seria perder una clase entera del portafolio en silencio, y el
 * desborde al menos se ve.
 */
export function paginarTarjetas(tarjetas: readonly Tarjeta[]): readonly (readonly Tarjeta[])[] {
  const paginas: Tarjeta[][] = []
  let actual: Tarjeta[] = []
  let y = Y_PRIMERA

  for (const tarjeta of tarjetas) {
    const alto = altoDeTarjeta(tarjeta)
    if (actual.length > 0 && y + alto > Y_FONDO) {
      paginas.push(actual)
      actual = []
      y = Y_PRIMERA
    }
    actual.push(tarjeta)
    y += alto + AIRE
  }

  if (actual.length > 0) paginas.push(actual)
  return paginas
}

// ── Los moldes que la lamina presta ─────────────────────────────────────────

interface Moldes {
  readonly titulo: string
  readonly subtitulo: string
  readonly fondo: string
  readonly banda: string
  readonly cabeceraNombre: string
  readonly cabeceraCambio: string
  readonly etiquetaIzquierda: string
  readonly etiquetaDerecha: string
  readonly filaNombreIzquierda: string
  readonly filaMontoIzquierda: string
  readonly filaNombreDerecha: string
  readonly filaMontoDerecha: string
  readonly divisorIzquierda: string
  readonly divisorDerecha: string
  readonly divisorVertical: string
  readonly vacio: string
  readonly fondoSubtotalA: string
  readonly fondoSubtotalD: string
  readonly subtotalAEtiqueta: string
  readonly subtotalAValor: string
  readonly subtotalDEtiqueta: string
  readonly subtotalDValor: string
}

/**
 * Encuentra un molde de cada pieza en las laminas que se le den.
 *
 * Se buscan por nombre y, cuando hay dos con el mismo, por la columna en la
 * que estan: `Row Nombre` existe a izquierda y a derecha con anchos distintos.
 * `Col Empty` —el guion que se dibuja cuando un lado no tiene nada— solo
 * aparece en las laminas de clases que nacen de cero, asi que se lo busca en
 * todas y no en una.
 */
export function moldesDe(...laminas: readonly string[]): Moldes | null {
  const formas = laminas.flatMap((xml) => [...formasDe(xml)])

  const enIzquierda = (x: number) => (caja: { readonly x: number }) => caja.x === x
  const buscar = (nombre: string, condicion?: (caja: { readonly x: number }) => boolean) =>
    molde(formas, nombre, condicion)

  const piezas = {
    titulo: buscar('TextBox CMP Titulo'),
    subtitulo: buscar('TextBox CMP Subtitulo'),
    fondo: molde(formas, 'Rect', (c) => c.cx > 10_000_000 && c.cy > 500_000),
    banda: molde(formas, 'Rect', (c) => c.cx > 10_000_000 && c.cy === 381_000),
    cabeceraNombre: buscar('Card Header Nombre'),
    cabeceraCambio: buscar('Card Header Cambio'),
    etiquetaIzquierda: buscar('Col Label', enIzquierda(IZQUIERDA)),
    etiquetaDerecha: buscar('Col Label', enIzquierda(DERECHA)),
    filaNombreIzquierda: buscar('Row Nombre', enIzquierda(IZQUIERDA)),
    filaMontoIzquierda: buscar('Row Monto', (c) => c.x > IZQUIERDA && c.x < DERECHA),
    filaNombreDerecha: buscar('Row Nombre', enIzquierda(DERECHA)),
    filaMontoDerecha: buscar('Row Monto', (c) => c.x > DERECHA),
    divisorIzquierda: molde(formas, 'Divider', (c) => c.x === IZQUIERDA && c.cx > 1_000_000),
    divisorDerecha: molde(formas, 'Divider', (c) => c.x === DERECHA && c.cx > 1_000_000),
    divisorVertical: molde(formas, 'Divider', (c) => c.cx < 100_000),
    vacio: buscar('Col Empty'),
    fondoSubtotalA: molde(formas, 'Rect', (c) => c.cx < 6_000_000 && c.x === IZQUIERDA),
    fondoSubtotalD: molde(formas, 'Rect', (c) => c.cx < 6_000_000 && c.x > IZQUIERDA),
    subtotalAEtiqueta: buscar('Subtotal A Label'),
    subtotalAValor: buscar('Subtotal A Val'),
    subtotalDEtiqueta: buscar('Subtotal D Label'),
    subtotalDValor: buscar('Subtotal D Val'),
  }

  const faltante = Object.entries(piezas).find(([, valor]) => valor === null)
  if (faltante !== undefined) return null

  return piezas as Moldes
}

// ── Escribir la lamina ──────────────────────────────────────────────────────

/**
 * Rehace una lamina de "antes y despues" con las tarjetas que se le den.
 *
 * Devuelve la lamina intacta si algun molde falta: preferible una lamina con
 * los datos del cliente de referencia —que se ve mal y se nota— que una a
 * medio dibujar.
 */
export function escribirTarjetas(
  xml: string,
  moldes: Moldes,
  tarjetas: readonly Tarjeta[],
  titulo: { readonly texto: string; readonly bajada: string },
): string {
  let id = 100
  const nueva = (forma: string) => conId(forma, (id += 1))

  const formas: string[] = [
    nueva(escribir(moldes.titulo, titulo.texto)),
    nueva(escribir(moldes.subtitulo, titulo.bajada)),
  ]

  let y = Y_PRIMERA

  for (const tarjeta of tarjetas) {
    const alto = altoDeTarjeta(tarjeta)
    const subtotalY = y + alto - DENTRO.subtotalDesdeElPie

    formas.push(nueva(colocar(moldes.fondo, { y, cy: alto })))
    formas.push(nueva(colocar(moldes.banda, { y })))
    formas.push(
      nueva(colocar(escribir(moldes.cabeceraNombre, tarjeta.clase), { y: y + DENTRO.cabecera })),
    )
    formas.push(
      nueva(colocar(escribir(moldes.cabeceraCambio, tarjeta.cambio), { y: y + DENTRO.cabecera })),
    )
    formas.push(nueva(colocar(moldes.etiquetaIzquierda, { y: y + DENTRO.columna })))
    formas.push(nueva(colocar(moldes.etiquetaDerecha, { y: y + DENTRO.columna })))

    formas.push(
      nueva(
        colocar(moldes.divisorVertical, {
          y: y + DENTRO.columna,
          cy: subtotalY - (y + DENTRO.columna) + DENTRO.subtotalEtiqueta,
        }),
      ),
    )

    const columna = (
      filas: readonly FilaTarjeta[],
      nombre: string,
      monto: string,
      divisor: string,
      x: number,
    ) => {
      if (filas.length === 0) {
        formas.push(
          nueva(colocar(escribir(moldes.vacio, ROTULO.vacio), { x, y: y + DENTRO.primeraFila })),
        )
        return
      }
      filas.forEach((fila, i) => {
        const filaY = y + DENTRO.primeraFila + PASO_FILA * i
        formas.push(nueva(colocar(escribir(nombre, fila.nombre), { y: filaY })))
        formas.push(nueva(colocar(escribir(monto, fila.monto), { y: filaY })))
        formas.push(nueva(colocar(divisor, { y: filaY + DENTRO.divisor })))
      })
    }

    columna(
      tarjeta.antes,
      moldes.filaNombreIzquierda,
      moldes.filaMontoIzquierda,
      moldes.divisorIzquierda,
      IZQUIERDA,
    )
    columna(
      tarjeta.despues,
      moldes.filaNombreDerecha,
      moldes.filaMontoDerecha,
      moldes.divisorDerecha,
      DERECHA,
    )

    formas.push(nueva(colocar(moldes.fondoSubtotalA, { y: subtotalY })))
    formas.push(nueva(colocar(moldes.fondoSubtotalD, { y: subtotalY })))
    formas.push(
      nueva(
        colocar(escribir(moldes.subtotalAEtiqueta, ROTULO.subtotalAntes), {
          y: subtotalY + DENTRO.subtotalEtiqueta,
        }),
      ),
    )
    formas.push(
      nueva(
        colocar(escribir(moldes.subtotalAValor, tarjeta.subtotalAntes), {
          y: subtotalY + DENTRO.subtotalValor,
        }),
      ),
    )
    formas.push(
      nueva(
        colocar(escribir(moldes.subtotalDEtiqueta, ROTULO.subtotalDespues), {
          y: subtotalY + DENTRO.subtotalEtiqueta,
        }),
      ),
    )
    formas.push(
      nueva(
        colocar(escribir(moldes.subtotalDValor, tarjeta.subtotalDespues), {
          y: subtotalY + DENTRO.subtotalValor,
        }),
      ),
    )

    y += alto + AIRE
  }

  return reemplazarFormas(xml, formas)
}

/** El alto que ocuparian estas tarjetas juntas. Para probar el paginado. */
export const altoDe = (tarjetas: readonly Tarjeta[]): number =>
  tarjetas.reduce((acc, tarjeta) => acc + altoDeTarjeta(tarjeta) + AIRE, Y_PRIMERA) - AIRE

export { cajaDe }
