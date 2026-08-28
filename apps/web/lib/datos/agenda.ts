import 'server-only'

import type { ClaveHito, FichaEnAgenda } from '../agenda'
import { asesorActual, clienteServidor } from '../supabase/servidor'

/**
 * Lectura y escritura de la agenda.
 *
 * No hay tabla de fechas: la ruta de cada ficha se calcula sobre el día en que
 * se subió, que es un dato que `fichas` ya guarda. Lo único que se persiste es
 * lo cumplido, y vive en `agenda_hitos`.
 *
 * Se leen las fichas de todo el equipo y no solo las propias, por la misma
 * razón por la que la biblioteca es compartida: una entrega que vence mañana
 * es un problema de la mesa aunque la ficha la haya subido otro. Quién puede
 * marcar un hito es otra cosa y la decide RLS.
 */

export interface AgendaCargada {
  readonly fichas: readonly FichaEnAgenda[]
  /**
   * La migración `0015` todavía no corrió contra esta base.
   *
   * La agenda sigue sirviendo —las fechas son un cálculo, no una lectura— pero
   * nada se puede marcar, y la pantalla lo dice en vez de fallar al primer
   * clic con un error de Postgres.
   */
  readonly sinTablaDeHitos: boolean
}

interface FilaFicha {
  id: string
  created_at: string
  created_by: string | null
  clients: { nombre: string } | null
}

interface FilaHito {
  ficha_id: string
  hito: string
}

/** Postgres para «esa tabla no existe». */
const TABLA_AUSENTE = '42P01'

const HITOS_MARCABLES: readonly string[] = ['portafolio', 'ppt', 'revision', 'entrega']

/**
 * Las fichas en ruta, de la más reciente a la más vieja.
 *
 * El límite es alto a propósito: el calendario se navega mes a mes hacia atrás
 * y una ficha que no viajó deja un mes vacío que parece un mes sin trabajo.
 */
export async function cargarAgenda(limite = 240): Promise<AgendaCargada> {
  const asesor = await asesorActual()
  const supabase = await clienteServidor()

  const { data: fichas } = await supabase
    .from('fichas')
    .select('id, created_at, created_by, clients(nombre)')
    .eq('oculta_en_agenda', false)
    .order('created_at', { ascending: false })
    .limit(limite)
    .returns<FilaFicha[]>()

  const filas = fichas ?? []
  if (filas.length === 0) return { fichas: [], sinTablaDeHitos: false }

  // Los asesores se traen aparte y no como `select` anidado: la tabla tiene
  // una fila por persona de la mesa, y un embed de PostgREST se rompe entero
  // el día que alguien agrega una segunda clave foránea hacia `advisors`.
  const { data: asesores } = await supabase
    .from('advisors')
    .select('id, nombre')
    .returns<{ id: string; nombre: string }[]>()

  const nombrePorAsesor = new Map((asesores ?? []).map((fila) => [fila.id, fila.nombre]))

  const { data: hitos, error: errorHitos } = await supabase
    .from('agenda_hitos')
    .select('ficha_id, hito')
    .in(
      'ficha_id',
      filas.map((fila) => fila.id),
    )
    .returns<FilaHito[]>()

  const sinTablaDeHitos = errorHitos?.code === TABLA_AUSENTE

  const hechosPorFicha = new Map<string, ClaveHito[]>()
  for (const fila of hitos ?? []) {
    // Un valor que no esté en la lista solo puede venir de una edición a mano
    // en la base. Se ignora en vez de colarse como un hito fantasma.
    if (!HITOS_MARCABLES.includes(fila.hito)) continue
    const hechos = hechosPorFicha.get(fila.ficha_id) ?? []
    hechos.push(fila.hito as ClaveHito)
    hechosPorFicha.set(fila.ficha_id, hechos)
  }

  return {
    sinTablaDeHitos,
    fichas: filas.map((fila) => ({
      fichaId: fila.id,
      cliente: fila.clients?.nombre ?? 'Sin nombre',
      asesor: fila.created_by === null ? null : (nombrePorAsesor.get(fila.created_by) ?? null),
      mio: asesor !== null && fila.created_by === asesor.id,
      subidaIso: fila.created_at,
      hechos: hechosPorFicha.get(fila.id) ?? [],
    })),
  }
}

/**
 * Marca o desmarca un hito cumplido.
 *
 * Desmarcar borra la fila: el hito cumplido es la fila que existe. Quién puede
 * hacerlo no se decide acá sino en la política de `agenda_hitos` — un chequeo
 * en la app sería una segunda regla que puede quedar más floja que la de la
 * base.
 */
export async function marcarHito(
  fichaId: string,
  hito: ClaveHito,
  hecho: boolean,
): Promise<{ readonly error?: string }> {
  if (!HITOS_MARCABLES.includes(hito)) {
    return { error: 'Ese hito no se marca a mano: la ficha está subida o no está.' }
  }

  const asesor = await asesorActual()
  if (asesor === null) return { error: 'Tu cuenta no está enlazada a un asesor de Sabbi.' }

  const supabase = await clienteServidor()

  const { error } = hecho
    ? await supabase
        .from('agenda_hitos')
        .upsert(
          { ficha_id: fichaId, hito, hecho_at: new Date().toISOString(), hecho_por: asesor.id },
          { onConflict: 'ficha_id,hito' },
        )
    : await supabase.from('agenda_hitos').delete().eq('ficha_id', fichaId).eq('hito', hito)

  if (error === null) return {}

  if (error.code === TABLA_AUSENTE) {
    return { error: 'La agenda todavía no está migrada en esta base. Corré `npm run migrar`.' }
  }

  // La política rechaza el insert sobre una ficha ajena con este código. La
  // pantalla ya no ofrece el control en ese caso; esto cubre el camino que no
  // pasa por la pantalla.
  if (error.code === '42501') {
    return { error: 'Esa ficha la subió otro asesor. Solo su dueño o un admin marcan sus hitos.' }
  }

  return { error: `No pude guardar el hito: ${error.message}` }
}
