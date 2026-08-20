import type { Propuesta } from '@sabbi/core'

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
 * 22 si son tablas de verdad — ahi clonar una fila es posible — pero tambien
 * de largo fijo.
 *
 * **Tres laminas piden modelos que el motor no tiene.** El arquetipo del
 * cliente, el puntaje sobre 10 con sus dos componentes ponderados, y el
 * analisis de sobrecostos por producto. Son decisiones de la mesa antes que
 * codigo.
 */

export type EstadoLamina =
  /** Sale entera: o no tiene tokens, o todos tienen fuente. */
  | 'listo'
  /** Falta una decision de negocio antes de poder escribir el mapeo. */
  | 'decision'
  /** El dato existe, pero la lamina hay que redibujarla, no rellenarla. */
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
  readonly valores?: (propuesta: Propuesta, fecha: Date) => ReadonlyMap<string, string>
}

const corta = (fecha: Date): string =>
  new Intl.DateTimeFormat('es-PE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'America/Lima',
  }).format(fecha)

export const MAPA: readonly Lamina[] = [
  {
    numero: 1,
    titulo: 'Portada',
    estado: 'listo',
    falta: '',
    valores: (propuesta, fecha) =>
      new Map([
        ['s01.nombre', propuesta.cliente.nombre],
        ['s01.fecha', corta(fecha)],
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
    estado: 'geometria',
    falta:
      'Las barras y la línea son formas dibujadas, no un gráfico. Hay que recalcular el alto y ' +
      'la posición de doce elementos. Falta además decidir si la serie clara es el benchmark ' +
      'del perfil o el portafolio que se propone: en el deck de referencia coinciden.',
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
    estado: 'decision',
    falta:
      'El titular dice «el cambio más importante». Es una regla a definir: probablemente el ' +
      'mayor delta en puntos porcentuales, pero eso lo decide la mesa. Las tres transiciones ' +
      'de abajo sí salen de la comparativa.',
  },
  {
    numero: 10,
    titulo: 'De dónde sale y a dónde va',
    estado: 'decision',
    falta:
      'El blotter agrupado. El dato está en la sección 7; falta el criterio de agrupación y ' +
      'el corte del «y N más».',
  },
  ...([11, 12, 13, 14, 15, 16] as const).map(
    (numero): Lamina => ({
      numero,
      titulo: `Patrimonio antes y después (${numero - 10} de 6)`,
      estado: 'filas',
      falta:
        'Cada fila es una caja de texto suelta, no una tabla, y hay tantas ranuras como ' +
        'posiciones tenía el cliente de referencia. Necesita clonar y reposicionar filas, y ' +
        'la cantidad de láminas depende del cliente.',
    }),
  ),
  {
    numero: 17,
    titulo: 'Tu rentabilidad',
    estado: 'parcial',
    falta:
      'Seis de los nueve tokens salen de la comparativa — patrimonio, las dos bandas, las dos ' +
      'rentas anuales y su diferencia. Los otros tres son texto sobre un activo puntual del ' +
      'cliente de referencia.',
  },
  { numero: 18, titulo: 'Separador', estado: 'listo', falta: '' },
  { numero: 19, titulo: 'Cierre', estado: 'listo', falta: '' },
  ...([20, 21, 22] as const).map(
    (numero): Lamina => ({
      numero,
      titulo: 'El portafolio propuesto, por instrumento',
      estado: 'filas',
      falta:
        'Son tablas de verdad, así que clonar filas es posible, pero de largo fijo. Falta ' +
        'además de dónde salen las columnas de plazo mínimo y de racional, que no están en ' +
        'el catálogo.',
    }),
  ),
]

/** Las que hoy se pueden armar enteras. */
export const LAMINAS_LISTAS: readonly number[] = MAPA.filter((l) => l.estado === 'listo').map(
  (l) => l.numero,
)

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
