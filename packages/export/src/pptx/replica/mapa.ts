import { NOMBRE_CLASE, NOMBRE_CLASE_CORTO } from '@sabbi/core'
import type { Propuesta } from '@sabbi/core'

import { fecha, monto, pct, rangoPct, transicion } from './formato.js'

/**
 * De donde sale el dato de cada lamina del deck replica.
 *
 * Este archivo es el estado real de la fase 6, y esta en codigo y no en un
 * documento a proposito: el dia que una lamina consiga su fuente, se cambia acá
 * y sale en el deck. Mientras diga otra cosa, no sale — un `{{s05.score}}`
 * impreso delante de un cliente es peor que no tener la lamina.
 *
 * Lo que la revision de la plantilla dejo claro, y que no se ve hasta abrirla:
 *
 * **El deck de referencia esta dibujado a mano.** No trae ni una parte de
 * grafico ni un libro incrustado. Las barras de la lamina 4 son 52 formas con
 * su alto en el XML, y los numeros que se leen encima son etiquetas de texto
 * sueltas: cambiar la etiqueta escribe otro numero y deja la barra donde
 * estaba. Reproducirla para otro cliente es recalcular geometria, no sustituir
 * texto.
 *
 * **Las laminas de posiciones son cajas de texto en una grilla.** Las 11 a la
 * 16 no tienen tabla: son `nombre1` a `nombre14` y `monto1` a `monto15`,
 * ranuras fijas de un cliente que tenia esa cantidad de posiciones. Las 20 a la
 * 22 si son tablas de verdad, y para esas el clonado ya esta hecho: `tabla.ts`
 * rehace la tabla con las filas que se le pidan, `paginarFilas` las reparte en
 * varias laminas y el renderizador duplica la lamina tantas veces como haga
 * falta. Lo que les falta es de donde sale el texto de tres de sus columnas.
 *
 * **Tres laminas piden modelos que el motor no tiene.** El arquetipo del
 * cliente, el puntaje sobre 10 con sus dos componentes ponderados, y el
 * analisis de sobrecostos por producto. Son decisiones de la mesa antes que
 * codigo.
 */

export type EstadoLamina =
  /** Sale entera: o no tiene tokens, o todos tienen fuente. */
  | 'listo'
  /** No sale por si sola: es una pagina mas de otra, que ya pagina sola. */
  | 'paginada'
  /** Falta una decision de negocio antes de poder escribir el mapeo. */
  | 'decision'
  /**
   * El dato existe, pero la lamina hay que redibujarla, no rellenarla.
   *
   * Ojo con estas cuando salen en blanco: el texto se vacia, pero lo dibujado
   * no. La lamina conserva las formas del cliente de referencia.
   */
  | 'geometria'
  /** Necesita tantas filas como posiciones tenga el cliente. */
  | 'filas'
  /** Parte de la lamina tiene fuente y parte es texto redactado. */
  | 'parcial'

export interface Lamina {
  readonly numero: number
  readonly titulo: string
  readonly estado: EstadoLamina
  /** Que falta, en una linea. Vacio cuando el estado es `listo`. */
  readonly falta: string
  /** Los valores de sus tokens. Solo las laminas `listo` la traen. */
  readonly valores?: (propuesta: Propuesta, emitido: Date) => ReadonlyMap<string, string>
}

/** Cuantas transiciones de clase entran en la lamina de "que cambia". */
const CAMBIOS_EN_LAMINA = 3

/** Un centavo. Debajo de eso, un cambio es ruido de coma flotante. */
const EPS = 0.01

/**
 * "El cambio mas importante": la clase que mas se mueve, y las tres mayores.
 *
 * El titular sale de la clase con el mayor salto en puntos porcentuales, que
 * es lo que el deck de referencia muestra. Es una regla y no una redaccion:
 * ante el mismo portafolio siempre elige lo mismo, y si la mesa prefiere otro
 * criterio —la concentracion por pais, por ejemplo— se cambia aca y en un solo
 * lugar.
 */
function lamina9(propuesta: Propuesta): ReadonlyMap<string, string> {
  const porSalto = [...propuesta.comparativa.filas]
    .filter((fila) => Math.abs(fila.deltaPp) > EPS)
    .sort((a, b) => Math.abs(b.deltaPp) - Math.abs(a.deltaPp))

  const valores = new Map<string, string>()
  const mayor = porSalto[0]
  if (mayor === undefined) return valores

  valores.set(
    's09.pct',
    `El cambio más importante: ${NOMBRE_CLASE[mayor.clase]} de ${pct(mayor.antesShare)} a ${pct(mayor.despuesShare)}`,
  )
  valores.set('s09.nombre', `En ${NOMBRE_CLASE_CORTO[mayor.clase]}`)
  valores.set('s09.pct2', pct(mayor.antesShare))
  valores.set('s09.pct3', pct(mayor.despuesShare))

  // El titular de beneficio del deck de referencia dice «Portafolio más
  // diversificado». Se dice con el numero que lo sostiene: cuantas clases de
  // activo tiene el portafolio antes y despues.
  const clases = (lado: 'antesUsd' | 'despuesUsd') =>
    propuesta.comparativa.filas.filter((fila) => fila[lado] > EPS).length
  const antes = clases('antesUsd')
  const despues = clases('despuesUsd')
  valores.set(
    's09.nombre2',
    despues > antes
      ? `Portafolio más diversificado: de ${antes} a ${despues} clases de activo`
      : `Portafolio en ${despues} ${despues === 1 ? 'clase' : 'clases'} de activo`,
  )

  // Las tres transiciones de abajo, en el mismo orden de importancia.
  porSalto.slice(0, CAMBIOS_EN_LAMINA).forEach((fila, i) => {
    valores.set(`s09.nombre${i + 3}`, NOMBRE_CLASE_CORTO[fila.clase])
    valores.set(
      i === 0 ? 's09.delta' : `s09.delta${i + 1}`,
      transicion(pct(fila.antesShare), pct(fila.despuesShare)),
    )
  })

  return valores
}

/**
 * "Tu rentabilidad": lo que el plan cambia en plata, no en porcentaje.
 *
 * Las dos bandas y las dos rentas anuales salen de la comparativa. El flujo
 * mensual sale de la distribucion que el catalogo declara para cada linea del
 * objetivo —cupones, dividendos, rentas— que la propuesta ya suma instrumento
 * por instrumento. Lo que no tiene distribucion cargada no suma: el flujo es
 * el que se puede sostener, no el que se querria.
 */
function lamina17(propuesta: Propuesta): ReadonlyMap<string, string> {
  const vista = propuesta.comparativa
  // Los tokens de esta lamina son fragmentos dentro de una frase que la
  // plantilla ya trae escrita — «Patrimonio total …», «+…», «a … más al año» —
  // asi que va solo la cifra. Repetir la palabra la imprime dos veces.
  const valores = new Map<string, string>([['s17.monto', monto(vista.totalDespuesUsd)]])

  const banda = (r: { readonly rango: { readonly min: number; readonly max: number } } | null) =>
    r === null ? null : rangoPct(r.rango.min, r.rango.max)

  const hoy = banda(vista.rentabilidadAntes)
  const objetivo = banda(vista.rentabilidadDespues)
  if (hoy !== null) valores.set('s17.pct', hoy)
  if (objetivo !== null) valores.set('s17.pct2', objetivo)

  const enPlata = (r: { readonly min: number; readonly max: number } | null) =>
    r === null ? null : `${monto(r.min)} – ${monto(r.max)}`

  const anualHoy = enPlata(vista.rentaAnualAntesUsd)
  const anualObjetivo = enPlata(vista.rentaAnualDespuesUsd)
  if (anualHoy !== null) valores.set('s17.monto2', anualHoy)
  if (anualObjetivo !== null) valores.set('s17.monto3', anualObjetivo)

  // La diferencia anual va dos veces en la lamina: el piso de la banda nueva
  // contra el piso de la vieja, y el techo contra el techo. En el deck de
  // referencia son 95,812 y 136,153, que es exactamente esa cuenta.
  const antes = vista.rentaAnualAntesUsd
  const despues = vista.rentaAnualDespuesUsd
  if (antes !== null && despues !== null) {
    const piso = despues.min - antes.min
    const techo = despues.max - antes.max
    // El «+» ya esta en la plantilla; un plan que baje el retorno saldria con
    // el signo contradicho, y es preferible que se vea a que pase de largo.
    valores.set('s17.monto4', `${piso < 0 ? '−' : ''}${monto(Math.abs(piso))}`)
    valores.set('s17.monto5', `${techo < 0 ? '−' : ''}${monto(Math.abs(techo))}`)
  }

  // El flujo distribuible del objetivo: cupones, dividendos y rentas que el
  // catalogo declara. Lo que no tiene distribucion cargada no suma, asi que
  // esta es la cifra que se puede sostener y no la que se querria.
  const distribucionAnual = propuesta.seccion6.grupos
    .flatMap((grupo) => grupo.lineas)
    .reduce((acc, linea) => acc + (linea.distribucionAnualUsd?.min ?? 0), 0)

  valores.set('s17.monto6', distribucionAnual > 0 ? monto(distribucionAnual / 12) : '—')
  valores.set(
    's17.nombre',
    distribucionAnual > 0 ? 'por mes, distribuible' : 'sin distribución cargada en el catálogo',
  )

  return valores
}

/** Cuantas clases entran en el grafico de barras de la lamina 4. */
const CLASES_EN_GRAFICO = 6

/** Filas de venta y de compra que la lamina 10 dibuja. Son fijas en el diseno. */
const FILAS_EN_PLAN = 3

/**
 * "Asi esta parado tu dinero hoy": los totales y la distribucion de hoy.
 *
 * `Patrimonio total` suma lo financiero y lo de uso propio — es el patrimonio
 * del cliente, no su portafolio. `Invertido` es solo la seccion 1, que es sobre
 * lo que el motor decide.
 *
 * Los tokens `pct7` a `pct12` eran la segunda serie del grafico, la del
 * portafolio objetivo, y no se mapean: la seccion 3 clasifica por `assetClass`
 * y la seccion 6 por `ClaseModelo`, que son taxonomias distintas. Cruzarlas a
 * ojo daria un grafico que no cuadra con la lamina del portafolio objetivo.
 *
 * Por eso esa serie no se deja en blanco sino que se borra —linea, marcadores,
 * etiquetas y leyenda—, y de eso se encarga `grafico.ts`. Vaciarle el texto
 * habria dejado la curva del cliente de referencia dibujada al lado de las
 * barras ya corregidas de este, que es la peor de las dos lecturas posibles.
 */
/**
 * Las asset class que entran al grafico, de mayor a menor.
 *
 * Lo usan dos sitios y por eso esta afuera: el mapa, que rotula cada barra, y
 * el redibujado, que les da su alto. Si cada uno eligiera sus clases por su
 * cuenta, un empate resuelto distinto pondria una etiqueta sobre la barra de
 * otra.
 */
export const clasesDelGrafico = (propuesta: Propuesta) =>
  [...propuesta.seccion3.filas]
    .sort((a, b) => b.valorUsd - a.valorUsd)
    .slice(0, CLASES_EN_GRAFICO)

/** Lo que mide cada barra de la lamina 4, en fraccion del patrimonio. */
export const sharesDelGrafico = (propuesta: Propuesta): readonly number[] =>
  clasesDelGrafico(propuesta).map((fila) => fila.share)

function lamina4(propuesta: Propuesta): ReadonlyMap<string, string> {
  const invertido = propuesta.seccion1.totalUsd
  const usoPropio = propuesta.seccion2.totalUsd

  const valores = new Map<string, string>([
    ['s04.monto', monto(invertido + usoPropio)],
    ['s04.monto2', monto(invertido)],
    ['s04.nombre', propuesta.cliente.perfil],
    // La segunda linea de la tarjeta del perfil. El mandato es lo que la
    // acompana en el deck de referencia; sin mandato definido queda vacia, que
    // es mejor que inventarle un subtitulo.
    ['s04.nombre2', propuesta.cliente.mandato ?? ''],
    // La leyenda de la unica serie que queda. La del portafolio objetivo se
    // borra al redibujar, junto con su linea.
    ['s04.nombre9', 'Hoy'],
  ])

  const clases = clasesDelGrafico(propuesta)

  // Las seis ranuras se llenan siempre, tenga el cliente seis asset class o
  // dos. La barra sobrante se dibuja en cero y su etiqueta va vacia: la ranura
  // existe en el dibujo y lo honesto es no escribir nada en ella, no dejar el
  // token sin resolver como si faltara el dato.
  for (let i = 0; i < CLASES_EN_GRAFICO; i += 1) {
    const fila = clases[i]

    // La plantilla numera las etiquetas desde `nombre3` y los porcentajes desde
    // `pct` sin sufijo.
    valores.set(`s04.nombre${i + 3}`, fila?.assetClass ?? '')
    valores.set(i === 0 ? 's04.pct' : `s04.pct${i + 1}`, fila === undefined ? '' : pct(fila.share))
  }

  return valores
}

/**
 * "Tu plan: que mover, cuanto y a donde". El blotter, resumido.
 *
 * La lamina tiene tres filas por lado y el blotter trae las que trae, asi que
 * se muestran las mayores por monto. No es una lista completa y no pretende
 * serlo: el detalle instrumento por instrumento es el anexo.
 *
 * Quedan sin mapear `pct4` a `pct6` —una segunda cifra por fila que podria ser
 * retorno esperado o peso sobre el total, y el diseno no lo aclara— y `conteo`,
 * que por su formato («y N mas») parece un contador de excedente pero cuelga de
 * la etiqueta «Liquidez por ingresar».
 */
function lamina10(propuesta: Propuesta): ReadonlyMap<string, string> {
  const { ventas, compras, totalVentasUsd, totalComprasUsd } = propuesta.seccion7

  const valores = new Map<string, string>([['s10.monto', monto(totalVentasUsd)]])

  const mayores = <T extends { readonly usd: number }>(lineas: readonly T[]) =>
    [...lineas].sort((a, b) => b.usd - a.usd).slice(0, FILAS_EN_PLAN)

  // Los montos de venta van en la columna derecha del bloque: 2, 4 y 6.
  mayores(ventas).forEach((linea, i) => {
    valores.set(i === 0 ? 's10.nombre' : `s10.nombre${i + 1}`, linea.instrumento)
    valores.set(`s10.monto${2 * i + 2}`, monto(linea.usd))
  })

  mayores(compras).forEach((linea, i) => {
    valores.set(`s10.nombre${i + 5}`, linea.instrumento)
    valores.set(`s10.monto${i + 7}`, monto(linea.usd))
    if (totalComprasUsd > 0) {
      valores.set(i === 0 ? 's10.pct' : `s10.pct${i + 1}`, pct(linea.usd / totalComprasUsd))
    }
  })

  return valores
}

export const MAPA: readonly Lamina[] = [
  {
    numero: 1,
    titulo: 'Portada',
    estado: 'listo',
    falta: '',
    valores: (propuesta, emitido) =>
      new Map([
        ['s01.nombre', propuesta.cliente.nombre],
        ['s01.fecha', fecha(emitido)],
      ]),
  },
  { numero: 2, titulo: 'Separador', estado: 'listo', falta: '' },
  {
    numero: 3,
    titulo: 'Tu perfil de inversionista',
    estado: 'decision',
    falta:
      'El arquetipo del cliente y su párrafo. No hay modelo: qué determina que alguien sea ' +
      '«El Aprendiz Activo» y quién escribe el texto de cada uno.',
  },
  {
    numero: 4,
    titulo: 'Así está parado tu dinero hoy',
    estado: 'listo',
    falta: '',
    valores: (propuesta) => lamina4(propuesta),
  },
  {
    numero: 5,
    titulo: 'Tu puntaje',
    estado: 'decision',
    falta:
      'El puntaje sobre 10 y sus dos componentes ponderados — calidad de portafolio 60%, ' +
      'riesgo estructural 40%. El motor no calcula ninguno de los tres.',
  },
  {
    numero: 6,
    titulo: 'Sobrecostos (1 de 2)',
    estado: 'decision',
    falta:
      'El análisis de costos por producto. El motor guarda `feePct` por posición pero no ' +
      'calcula el costo anual ni qué cuenta como sobrecosto.',
  },
  {
    numero: 7,
    titulo: 'Sobrecostos (2 de 2)',
    estado: 'decision',
    falta: 'Lo mismo que la 6, más la conclusión escrita del bloque.',
  },
  {
    numero: 8,
    titulo: 'Los tres ejes',
    estado: 'decision',
    falta:
      'Tres recomendaciones redactadas con cifras derivadas adentro — exceso de liquidez, ' +
      'dependencia de Perú. Ni las cifras ni el texto existen hoy.',
  },
  {
    numero: 9,
    titulo: 'Qué cambia',
    estado: 'listo',
    falta: '',
    // El titular es la clase con el mayor salto en puntos porcentuales, y las
    // tres transiciones de abajo son las tres mayores. Si la mesa prefiere otro
    // criterio para «el cambio más importante», se cambia en `lamina9`.
    valores: (propuesta) => lamina9(propuesta),
  },
  {
    numero: 10,
    titulo: 'De dónde sale y a dónde va',
    estado: 'parcial',
    falta:
      'Las tres ventas y las tres compras mayores ya salen, con el total de lo que se libera. ' +
      'Quedan sin mapear una segunda cifra por fila —el diseño no aclara si es retorno ' +
      'esperado o peso sobre el total— y el contador de «y N más», que por formato parece ' +
      'excedente pero cuelga de la etiqueta «Liquidez por ingresar».',
    valores: (propuesta) => lamina10(propuesta),
  },
  {
    numero: 11,
    titulo: 'Patrimonio total, antes y después',
    estado: 'listo',
    falta: '',
    // No se rellena con tokens: se rehace entera clonando las cajas que el
    // diseño dejó nombradas, una tarjeta por clase. Ver `tarjetas.ts`.
  },
  ...([12, 13, 14, 15, 16] as const).map(
    (numero): Lamina => ({
      numero,
      titulo: 'Antes y después (página más)',
      estado: 'paginada',
      falta:
        'Es la lámina 11 otra vez: en la plantilla son seis porque el cliente de referencia ' +
        'tenía esa cantidad de posiciones. La 11 se pagina sola, así que estas no salen.',
    }),
  ),
  {
    numero: 17,
    titulo: 'Tu rentabilidad',
    estado: 'listo',
    falta: '',
    // Patrimonio, las dos bandas, las dos rentas anuales y su diferencia salen
    // de la comparativa; el flujo mensual, de la distribución que el catálogo
    // declara para cada línea del objetivo.
    valores: (propuesta) => lamina17(propuesta),
  },
  { numero: 18, titulo: 'Separador', estado: 'listo', falta: '' },
  { numero: 19, titulo: 'Cierre', estado: 'listo', falta: '' },
  {
    numero: 20,
    titulo: 'El anexo: cada instrumento en su fila',
    estado: 'listo',
    falta: '',
    // Sus filas no salen de tokens sino de la tabla, que se rehace entera con
    // tantas filas como instrumentos tenga el objetivo. Ver `anexo.ts`.
  },
  ...([21, 22] as const).map(
    (numero): Lamina => ({
      numero,
      titulo: 'El anexo (página más)',
      estado: 'paginada',
      falta:
        'Es la lámina 20 otra vez: en la plantilla son tres porque el cliente de referencia ' +
        'tenía esa cantidad de instrumentos. La 20 se pagina sola, así que estas no salen.',
    }),
  ),
]

/** Las que hoy se pueden armar enteras. */
export const LAMINAS_LISTAS: readonly number[] = MAPA.filter((l) => l.estado === 'listo').map(
  (l) => l.numero,
)

/**
 * El deck entero, salvo las paginas del anexo.
 *
 * Es lo que sale por defecto: la mesa prefiere ver la lamina con sus celdas en
 * blanco antes que no verla. Un hueco dice que falta algo; una lamina ausente
 * no dice nada. Las paginadas quedan afuera igual porque no son laminas
 * propias sino copias de la 20, que se duplica sola segun haga falta.
 */
export const LAMINAS_TODAS: readonly number[] = MAPA.filter(
  (l) => l.estado !== 'paginada',
).map((l) => l.numero)

/** Las que van a salir con algo en blanco. Para poder decirlo antes de bajarlas. */
export const LAMINAS_INCOMPLETAS: readonly number[] = MAPA.filter(
  (l) => l.estado !== 'paginada' && l.estado !== 'listo',
).map((l) => l.numero)

/** Todos los valores que el mapa sabe producir, en una sola tabla. */
export function valoresDe(
  propuesta: Propuesta,
  fecha: Date,
  laminas: readonly number[],
): ReadonlyMap<string, string> {
  const valores = new Map<string, string>()

  for (const lamina of MAPA) {
    if (!laminas.includes(lamina.numero) || lamina.valores === undefined) continue
    for (const [token, valor] of lamina.valores(propuesta, fecha)) valores.set(token, valor)
  }

  return valores
}
