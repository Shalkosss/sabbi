/*
 * La ruta de una ficha: cuatro días hábiles desde que se sube.
 *
 * Un compromiso de entrega no es un dato que alguien teclea: es una cuenta
 * sobre una fecha que la base ya guarda —cuándo se subió la ficha— y sobre el
 * calendario laboral peruano. Escribirlo a mano en una agenda aparte crea dos
 * verdades que se separan el día que alguien sube la ficha un viernes.
 *
 * Todo lo de este módulo es puro: recibe días y devuelve días. No mira el
 * reloj —`hoy` entra como argumento, y lo resuelve el servidor una sola vez
 * por pantalla— porque si lo mirara, el servidor y el navegador podrían
 * pintar calendarios distintos y React lo marcaría como error de hidratación.
 *
 * La unidad es el día calendario en Lima, escrito `YYYY-MM-DD`. Un instante
 * ISO no sirve como clave: dos fichas subidas a las 20:00 y a las 21:00 de un
 * martes caen en el mismo día de trabajo, y esa es la fecha que importa.
 */

/** Un día calendario en Lima, `YYYY-MM-DD`. */
export type Dia = string

export type ClaveHito = 'ficha' | 'portafolio' | 'ppt' | 'revision' | 'entrega'

export interface DefinicionHito {
  readonly clave: ClaveHito
  /** Días hábiles desde el día en que se subió la ficha. */
  readonly habiles: number
  readonly titulo: string
  /** El nombre corto, que es lo que entra en una celda del calendario. */
  readonly corto: string
  readonly detalle: string
}

/**
 * Los cinco hitos de la ruta.
 *
 * El día cero es un hecho —la ficha está subida o no está—; los otros cuatro
 * son fechas tentativas que se van a firmar solas a medida que se acercan. La
 * entrega es la única que no se mueve: es lo que se le prometió al cliente.
 */
export const HITOS: readonly DefinicionHito[] = [
  {
    clave: 'ficha',
    habiles: 0,
    titulo: 'Ficha subida',
    corto: 'Ficha',
    detalle: 'El día que la ficha patrimonial entró a la plataforma. Desde acá corre el plazo.',
  },
  {
    clave: 'portafolio',
    habiles: 1,
    titulo: 'Portafolio listo',
    corto: 'Portafolio',
    detalle: 'La revisión cerrada y la propuesta calculada, con sus excepciones corregidas.',
  },
  {
    clave: 'ppt',
    habiles: 2,
    titulo: 'PPT listo',
    corto: 'PPT',
    detalle: 'Los decks generados desde la propuesta, con el anexo escrito.',
  },
  {
    clave: 'revision',
    habiles: 3,
    titulo: 'Revisión de la mesa',
    corto: 'Revisión',
    detalle: 'Un segundo par de ojos sobre las cifras antes de que salgan de Sabbi.',
  },
  {
    clave: 'entrega',
    habiles: 4,
    titulo: 'Entrega al cliente',
    corto: 'Entrega',
    detalle: 'El compromiso con el cliente. Es la fecha que no se mueve.',
  },
]

/** El plazo completo, en días hábiles. Lo que la mesa le promete al cliente. */
export const PLAZO_HABILES = 4

const DEFINICION = new Map(HITOS.map((hito) => [hito.clave, hito]))

export const hitoDe = (clave: ClaveHito): DefinicionHito => {
  const definicion = DEFINICION.get(clave)
  if (definicion === undefined) throw new Error(`Hito desconocido: ${clave}`)
  return definicion
}

// ── El calendario ───────────────────────────────────────────────────────────

const FORMATO_LIMA = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Lima',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/**
 * El día limeño de un instante.
 *
 * `en-CA` da `YYYY-MM-DD` sin armarlo a mano. La zona va fija: la mesa trabaja
 * en Lima y una ficha subida a las 22:00 no puede aparecer mañana porque quien
 * abre la pantalla está en Madrid.
 */
export const diaEnLima = (instante: string | Date): Dia =>
  FORMATO_LIMA.format(typeof instante === 'string' ? new Date(instante) : instante)

/**
 * Un día se manipula como mediodía UTC.
 *
 * Perú no tiene horario de verano, pero el mediodía deja margen para cualquier
 * desplazamiento y hace que sumar días nunca cruce una frontera de fecha por
 * una hora de diferencia.
 */
const aFecha = (dia: Dia): Date => new Date(`${dia}T12:00:00Z`)

const aDia = (fecha: Date): Dia => fecha.toISOString().slice(0, 10)

export function sumarDias(dia: Dia, dias: number): Dia {
  const fecha = aFecha(dia)
  fecha.setUTCDate(fecha.getUTCDate() + dias)
  return aDia(fecha)
}

/** Lunes es 0 y domingo es 6: la semana como se lee en el calendario. */
export const diaDeSemana = (dia: Dia): number => (aFecha(dia).getUTCDay() + 6) % 7

export const esFinDeSemana = (dia: Dia): boolean => diaDeSemana(dia) >= 5

/**
 * Domingo de Pascua del año, por el algoritmo gregoriano anónimo.
 *
 * Está acá porque Jueves y Viernes Santo son feriados nacionales y se mueven
 * cada año: una lista escrita a mano queda vieja en enero y nadie se entera
 * hasta que una entrega cae en Semana Santa.
 */
function pascua(anio: number): Dia {
  const a = anio % 19
  const b = Math.floor(anio / 100)
  const c = anio % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const mes = Math.floor((h + l - 7 * m + 114) / 31)
  const dia = ((h + l - 7 * m + 114) % 31) + 1
  return `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
}

/**
 * Los feriados nacionales del Perú, por fecha fija.
 *
 * Es un dato de negocio y vive en un solo lugar: la mesa promete días hábiles,
 * y un 29 de junio contado como hábil adelanta una entrega un día entero. Los
 * feriados regionales y los puentes por decreto no están — son del año y no
 * de la regla, y meterlos acá los volvería una verdad que nadie mantiene.
 */
const FIJOS: Readonly<Record<string, string>> = {
  '01-01': 'Año Nuevo',
  '05-01': 'Día del Trabajo',
  '06-07': 'Día de la Bandera',
  '06-29': 'San Pedro y San Pablo',
  '07-23': 'Día de la Fuerza Aérea',
  '07-28': 'Fiestas Patrias',
  '07-29': 'Fiestas Patrias',
  '08-06': 'Batalla de Junín',
  '08-30': 'Santa Rosa de Lima',
  '10-08': 'Combate de Angamos',
  '11-01': 'Todos los Santos',
  '12-08': 'Inmaculada Concepción',
  '12-09': 'Batalla de Ayacucho',
  '12-25': 'Navidad',
}

const movibles = new Map<number, Map<Dia, string>>()

function movilesDe(anio: number): Map<Dia, string> {
  const guardados = movibles.get(anio)
  if (guardados !== undefined) return guardados

  const domingo = pascua(anio)
  const calculados = new Map([
    [sumarDias(domingo, -3), 'Jueves Santo'],
    [sumarDias(domingo, -2), 'Viernes Santo'],
  ])
  movibles.set(anio, calculados)
  return calculados
}

/** El nombre del feriado, o `null` si es un día común. */
export function feriado(dia: Dia): string | null {
  const anio = Number(dia.slice(0, 4))
  return FIJOS[dia.slice(5)] ?? movilesDe(anio).get(dia) ?? null
}

export const esHabil = (dia: Dia): boolean => !esFinDeSemana(dia) && feriado(dia) === null

/**
 * El día hábil que cae `habiles` días después.
 *
 * Avanza de a un día hábil, así que una ficha subida un sábado empieza a
 * contar el lunes sin ninguna regla aparte: el primer paso ya la lleva ahí.
 */
export function sumarHabiles(desde: Dia, habiles: number): Dia {
  let dia = desde
  for (let paso = 0; paso < habiles; paso += 1) {
    do {
      dia = sumarDias(dia, 1)
    } while (!esHabil(dia))
  }
  return dia
}

/**
 * Días hábiles entre dos días, con signo.
 *
 * Cuenta los hábiles que hay que atravesar para ir de `desde` a `hasta`. Sirve
 * para dos cosas: cuánto falta para una entrega, y cuán difuso se dibuja un
 * hito que todavía no llegó.
 */
export function habilesEntre(desde: Dia, hasta: Dia): number {
  if (desde === hasta) return 0
  const haciaAdelante = desde < hasta
  const [a, b] = haciaAdelante ? [desde, hasta] : [hasta, desde]

  let contados = 0
  let dia = a
  while (dia < b) {
    dia = sumarDias(dia, 1)
    if (esHabil(dia)) contados += 1
  }
  return haciaAdelante ? contados : -contados
}

// ── La ruta de un cliente ───────────────────────────────────────────────────

/** Lo que la base sabe de una ficha para armar su ruta. */
export interface FichaEnAgenda {
  readonly fichaId: string
  readonly cliente: string
  readonly asesor: string | null
  /** La subió el asesor de la sesión. */
  readonly mio: boolean
  /** El instante en que se guardó la ficha, tal como lo devuelve la base. */
  readonly subidaIso: string
  /** Los hitos que alguien ya marcó como cumplidos. */
  readonly hechos: readonly ClaveHito[]
}

export type EstadoHito = 'hecho' | 'vencido' | 'hoy' | 'proximo'

export interface HitoDeRuta {
  readonly clave: ClaveHito
  readonly titulo: string
  readonly corto: string
  readonly detalle: string
  readonly dia: Dia
  readonly estado: EstadoHito
  /**
   * De 0 a 1: cuánto se puede confiar en esta fecha hoy.
   *
   * Lo que ya pasó vale 1 porque es un hecho; lo que viene se difumina con la
   * distancia. La vista lo usa para el degradado, no para decidir nada.
   */
  readonly certeza: number
  /** Días hábiles desde hoy. Negativo si quedó atrás. */
  readonly faltan: number
}

export interface Ruta {
  readonly fichaId: string
  readonly cliente: string
  readonly iniciales: string
  /** Índice de color, estable para el mismo cliente en cualquier pantalla. */
  readonly tono: number
  readonly asesor: string | null
  readonly mio: boolean
  readonly inicio: Dia
  readonly entrega: Dia
  readonly hitos: readonly HitoDeRuta[]
  /** Hitos cuya fecha ya pasó y nadie marcó. */
  readonly atrasados: number
  /** Cumplidos sobre el total, de 0 a 1. */
  readonly avance: number
  /** Días hábiles hasta la entrega. Negativo si el plazo ya venció. */
  readonly faltanParaEntrega: number
}

/** Cuántos colores tiene la paleta de la agenda. */
export const TONOS = 8

/**
 * El color preferido de un cliente, derivado de su id.
 *
 * Derivado y no guardado: una columna de color en la base habría que asignarla
 * al crear el cliente, migrarla para los que ya existen y resolver qué pasa
 * cuando dos clientes eligen el mismo. Un hash del id da lo único que importa
 * —que el mismo cliente salga siempre del mismo color— sin guardar nada.
 *
 * Es una preferencia y no la última palabra: `rutasDe` se la respeta salvo que
 * otra ruta que se cruza en el calendario ya la tenga.
 *
 * El color tampoco es la única distinción: cada píldora lleva sus iniciales y
 * el panel el nombre completo. Ocho tonos no alcanzan para veinte clientes, y
 * un calendario que solo se pudiera leer por color no se podría leer.
 */
export function tonoDe(id: string): number {
  let hash = 2166136261
  for (let i = 0; i < id.length; i += 1) {
    hash ^= id.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return Math.abs(hash) % TONOS
}

/** Dos iniciales, que es lo que entra en una píldora de calendario. */
export function inicialesDe(nombre: string): string {
  const partes = nombre.split(/\s+/).filter((parte) => parte !== '')
  if (partes.length === 0) return '—'
  return partes
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase() ?? '')
    .join('')
}

/**
 * El degradado de difusión.
 *
 * Un hito a cuatro días hábiles no es una promesa del mismo peso que el de
 * mañana, y la pantalla tiene que decirlo sin una leyenda: la certeza cae con
 * la distancia y el fondo de la píldora se disuelve con ella. Nunca baja de un
 * mínimo porque una píldora invisible es una píldora que no se puede apretar
 * —el texto, además, se dibuja siempre a contraste pleno—.
 */
function certezaDe(faltan: number): number {
  if (faltan <= 0) return 1
  const caida = faltan / (PLAZO_HABILES + 1)
  return Math.max(0.15, 1 - caida)
}

/**
 * La ruta completa de una ficha, mirada desde `hoy`.
 *
 * El tono entra como argumento porque el color de un cliente depende de con
 * quién comparte calendario; sin él, cada ficha se queda con el que sale de su
 * id. Ver `rutasDe`.
 */
export function rutaDe(ficha: FichaEnAgenda, hoy: Dia, tono = tonoDe(ficha.fichaId)): Ruta {
  const inicio = diaEnLima(ficha.subidaIso)
  const hechos = new Set(ficha.hechos)

  const hitos = HITOS.map((definicion): HitoDeRuta => {
    const dia = sumarHabiles(inicio, definicion.habiles)
    const faltan = habilesEntre(hoy, dia)
    // El día cero no se marca a mano: la ficha está subida, eso es un hecho.
    const hecho = definicion.clave === 'ficha' || hechos.has(definicion.clave)

    const estado: EstadoHito = hecho
      ? 'hecho'
      : dia < hoy
        ? 'vencido'
        : dia === hoy
          ? 'hoy'
          : 'proximo'

    return {
      clave: definicion.clave,
      titulo: definicion.titulo,
      corto: definicion.corto,
      detalle: definicion.detalle,
      dia,
      estado,
      certeza: hecho ? 1 : certezaDe(faltan),
      faltan,
    }
  })

  const cumplidos = hitos.filter((hito) => hito.estado === 'hecho').length
  const entrega = hitos[hitos.length - 1]

  return {
    fichaId: ficha.fichaId,
    cliente: ficha.cliente,
    iniciales: inicialesDe(ficha.cliente),
    tono,
    asesor: ficha.asesor,
    mio: ficha.mio,
    inicio,
    entrega: entrega?.dia ?? inicio,
    hitos,
    atrasados: hitos.filter((hito) => hito.estado === 'vencido').length,
    avance: cumplidos / hitos.length,
    faltanParaEntrega: entrega?.faltan ?? 0,
  }
}

/**
 * Las rutas de todas las fichas, con los colores ya repartidos.
 *
 * Ocho tonos y veinte clientes: por hash solos, dos rutas de la misma semana
 * caen en el mismo color con una frecuencia que en pantalla se nota — tres de
 * ocho fichas compartiendo verde es lo primero que apareció al probar esto.
 *
 * Así que el color se reparte como se colorea un mapa: recorriendo las rutas
 * por fecha de inicio, cada una se queda con su tono preferido salvo que otra
 * que se le cruza ya lo tenga, y en ese caso toma el siguiente libre. Como una
 * ruta dura cuatro días hábiles, las que se cruzan son pocas y casi siempre
 * alcanza para que ninguna repita.
 *
 * El precio es que el color de un cliente puede cambiar si más adelante entra
 * una ficha que se le cruza. Es el intercambio correcto: el color está para
 * distinguir dos rutas que se ven juntas hoy, no para ser el nombre de nadie
 * —para eso están las iniciales y el nombre, que no cambian nunca—.
 */
export function rutasDe(fichas: readonly FichaEnAgenda[], hoy: Dia): readonly Ruta[] {
  const porInicio = fichas
    .map((ficha) => ({ ficha, inicio: diaEnLima(ficha.subidaIso) }))
    .sort(
      (a, b) =>
        a.inicio.localeCompare(b.inicio) || a.ficha.fichaId.localeCompare(b.ficha.fichaId),
    )

  const tonos = new Map<string, number>()
  let vivas: { readonly entrega: Dia; readonly tono: number }[] = []

  for (const { ficha, inicio } of porInicio) {
    const entrega = sumarHabiles(inicio, PLAZO_HABILES)
    // Van ordenadas por inicio, así que lo que terminó antes de que esta
    // empiece no vuelve a cruzarse con nada de lo que viene.
    vivas = vivas.filter((otra) => otra.entrega >= inicio)

    const ocupados = new Set(vivas.map((otra) => otra.tono))
    const preferido = tonoDe(ficha.fichaId)
    let tono = preferido
    for (let paso = 1; paso <= TONOS && ocupados.has(tono); paso += 1) {
      tono = (preferido + paso) % TONOS
    }

    tonos.set(ficha.fichaId, tono)
    vivas.push({ entrega, tono })
  }

  return fichas.map((ficha) => rutaDe(ficha, hoy, tonos.get(ficha.fichaId)))
}

/** Un hito con el cliente al que pertenece: lo que se pinta en una celda. */
export interface HitoEnCalendario {
  readonly ruta: Ruta
  readonly hito: HitoDeRuta
}

/**
 * Los hitos de todas las rutas, indexados por día.
 *
 * Dentro de un día van ordenados por lo que urge: primero lo vencido, después
 * lo del día, y al final lo que solo pasa por ahí.
 */
export function porDia(rutas: readonly Ruta[]): ReadonlyMap<Dia, readonly HitoEnCalendario[]> {
  const mapa = new Map<Dia, HitoEnCalendario[]>()

  for (const ruta of rutas) {
    for (const hito of ruta.hitos) {
      const delDia = mapa.get(hito.dia) ?? []
      delDia.push({ ruta, hito })
      mapa.set(hito.dia, delDia)
    }
  }

  const peso: Record<EstadoHito, number> = { vencido: 0, hoy: 1, proximo: 2, hecho: 3 }
  for (const delDia of mapa.values()) {
    delDia.sort(
      (a, b) =>
        peso[a.hito.estado] - peso[b.hito.estado] ||
        b.hito.clave.localeCompare(a.hito.clave) ||
        a.ruta.cliente.localeCompare(b.ruta.cliente, 'es'),
    )
  }

  return mapa
}

// ── La grilla del mes ───────────────────────────────────────────────────────

export interface Celda {
  readonly dia: Dia
  /** Falso para los días del mes vecino que completan la primera y última semana. */
  readonly delMes: boolean
}

export interface Mes {
  readonly anio: number
  /** 1 a 12, como se dice en voz alta y no como lo cuenta `Date`. */
  readonly mes: number
  readonly semanas: readonly (readonly Celda[])[]
}

const primerDiaDe = (anio: number, mes: number): Dia =>
  `${anio}-${String(mes).padStart(2, '0')}-01`

/**
 * Las seis semanas del mes, de lunes a domingo.
 *
 * Salen siempre seis filas aunque el mes entre en cinco: una grilla que cambia
 * de alto hace saltar la pantalla entera al pasar de mes, y el calendario deja
 * de sentirse como una hoja quieta sobre la que se navega.
 */
export function armarMes(anio: number, mes: number): Mes {
  const primero = primerDiaDe(anio, mes)
  const arranque = sumarDias(primero, -diaDeSemana(primero))

  const semanas: Celda[][] = []
  let dia = arranque

  for (let semana = 0; semana < 6; semana += 1) {
    const fila: Celda[] = []
    for (let columna = 0; columna < 7; columna += 1) {
      fila.push({ dia, delMes: Number(dia.slice(5, 7)) === mes && dia.slice(0, 4) === String(anio) })
      dia = sumarDias(dia, 1)
    }
    semanas.push(fila)
  }

  return { anio, mes, semanas }
}

/** El mes que está `pasos` meses más allá. Negativo va hacia atrás. */
export function mesCorrido(anio: number, mes: number, pasos: number): { anio: number; mes: number } {
  const total = anio * 12 + (mes - 1) + pasos
  // El resto de JavaScript conserva el signo, así que un paso hacia atrás
  // desde enero devolvería el mes cero.
  return { anio: Math.floor(total / 12), mes: (((total % 12) + 12) % 12) + 1 }
}

export const mesDe = (dia: Dia): { anio: number; mes: number } => ({
  anio: Number(dia.slice(0, 4)),
  mes: Number(dia.slice(5, 7)),
})

const NOMBRES_MES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Setiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
]

export const nombreDeMes = (mes: number): string => NOMBRES_MES[mes - 1] ?? ''

/** Los siete rótulos de la cabecera, en el orden en que se lee la semana. */
export const DIAS_SEMANA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'] as const

const DIAS_SEMANA_LARGOS = [
  'lunes',
  'martes',
  'miércoles',
  'jueves',
  'viernes',
  'sábado',
  'domingo',
] as const

/** El día de la semana escrito entero. Va en las etiquetas que lee el lector de pantalla. */
export const nombreDeDiaSemana = (dia: Dia): string => DIAS_SEMANA_LARGOS[diaDeSemana(dia)] ?? ''

/**
 * Un día escrito para leer, sin pasar por la zona horaria del navegador.
 *
 * `Intl` sobre un `Date` haría eso último y la fecha podría salir corrida un
 * día para quien abre la pantalla fuera de Lima. Acá el día ya es un día.
 */
export function diaLargo(dia: Dia): string {
  const nombre = NOMBRES_MES[Number(dia.slice(5, 7)) - 1] ?? ''
  return `${Number(dia.slice(8, 10))} de ${nombre.toLowerCase()} de ${dia.slice(0, 4)}`
}

export function diaCorto(dia: Dia): string {
  const nombre = NOMBRES_MES[Number(dia.slice(5, 7)) - 1] ?? ''
  return `${Number(dia.slice(8, 10))} ${nombre.slice(0, 3).toLowerCase()}`
}
