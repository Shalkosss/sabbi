import 'server-only'

import { congelarPropuesta, reparosParaPublicar, VERSION_MOTOR } from '@sabbi/core'

import { propuestaVigente } from '../propuesta-vigente'
import { asesorActual, clienteServidor } from '../supabase/servidor'

/**
 * La biblioteca compartida y la cadena de versiones.
 *
 * Las propuestas se leen entre todos desde el día uno —`leer_todos` sobre
 * `proposals`— pero hasta acá no había forma de encontrarlas: se llegaba a una
 * propuesta por la ficha que la abrió y nada más. Estas funciones son las que
 * la vuelven una biblioteca: qué armó el equipo, qué salió hacia un cliente y
 * qué versión de qué reemplaza a cuál.
 *
 * Publicar es el único momento en que esta herramienta guarda una cifra. Todo
 * lo demás se deriva en cada lectura a propósito, porque una cifra guardada
 * envejece sin avisar; una propuesta publicada tiene que envejecer, porque es
 * el documento que el cliente tiene en la mano.
 */

export interface PropuestaEnBiblioteca {
  readonly id: string
  readonly fichaId: string | null
  readonly cliente: string
  readonly asesor: string | null
  readonly perfil: string | null
  readonly publicada: boolean
  readonly version: number
  readonly patrimonioUsd: number | null
  readonly creadaEn: string
  readonly publicadaEn: string | null
  readonly publicadaPor: string | null
  readonly macroVersion: number | null
  readonly reemplazaA: string | null
}

interface FilaBiblioteca {
  id: string
  ficha_id: string | null
  perfil: string | null
  estado: string
  version: number
  reemplaza_a: string | null
  patrimonio_financiero_usd: number | null
  macro_version: number | null
  created_at: string
  published_at: string | null
  clients: { nombre: string } | null
  autor: { nombre: string } | null
  editor: { nombre: string } | null
}

const COLUMNAS =
  'id, ficha_id, perfil, estado, version, reemplaza_a, patrimonio_financiero_usd, ' +
  'macro_version, created_at, published_at, clients (nombre), ' +
  'autor:advisor_id (nombre), editor:published_by (nombre)'

const deFila = (fila: FilaBiblioteca): PropuestaEnBiblioteca => ({
  id: fila.id,
  fichaId: fila.ficha_id,
  cliente: fila.clients?.nombre ?? 'Cliente sin nombre',
  asesor: fila.autor?.nombre ?? null,
  perfil: fila.perfil,
  publicada: fila.estado === 'publicada',
  version: fila.version,
  patrimonioUsd: fila.patrimonio_financiero_usd,
  creadaEn: fila.created_at,
  publicadaEn: fila.published_at,
  publicadaPor: fila.editor?.nombre ?? null,
  macroVersion: fila.macro_version,
  reemplazaA: fila.reemplaza_a,
})

/**
 * Todo lo que el equipo tiene armado, lo más nuevo arriba.
 *
 * Sin filtro por asesor: la biblioteca es compartida a propósito. Quien cubre
 * a un colega el lunes tiene que poder abrir lo que dejó el viernes.
 */
export async function listarPropuestas(limite = 200): Promise<readonly PropuestaEnBiblioteca[]> {
  const supabase = await clienteServidor()

  const { data } = await supabase
    .from('proposals')
    .select(COLUMNAS)
    .order('created_at', { ascending: false })
    .limit(limite)
    .returns<FilaBiblioteca[]>()

  return (data ?? []).map(deFila)
}

/**
 * Las versiones de una misma ficha, de la más nueva a la más vieja.
 *
 * La cadena se arma por ficha y no siguiendo `reemplaza_a` hacia atrás: una
 * propuesta que nació sin reemplazar a nadie también es parte de la historia
 * de ese cliente, y seguir punteros dejaría fuera cualquier bifurcación.
 */
export async function cadenaDeVersiones(
  fichaId: string,
): Promise<readonly PropuestaEnBiblioteca[]> {
  if (fichaId === '') return []

  const supabase = await clienteServidor()

  const { data } = await supabase
    .from('proposals')
    .select(COLUMNAS)
    .eq('ficha_id', fichaId)
    .order('version', { ascending: false })
    .returns<FilaBiblioteca[]>()

  return (data ?? []).map(deFila)
}

export type ResultadoPublicar =
  | { readonly ok: true; readonly version: number }
  | {
      readonly ok: false
      readonly motivo: string
      /** Lo que hay que resolver, en las palabras del motor. */
      readonly detalles: readonly string[]
    }

const sinDetalle = (motivo: string): ResultadoPublicar => ({ ok: false, motivo, detalles: [] })

/**
 * Congela la propuesta y la marca publicada.
 *
 * Se calcula una última vez —con la macro activa de este momento— y esa
 * corrida es la que queda escrita entera en `snapshot`, junto con la macro y
 * la versión del motor que la produjeron. A partir de acá la propuesta se lee
 * de ahí: la pantalla, el Excel y los dos decks dejan de correr el motor para
 * este identificador, y da igual lo que pase después con el catálogo.
 *
 * Los reparos no son un formalismo. Una propuesta cuyas compras no cuadran
 * contra sus ventas es una orden que la mesa no puede ejecutar, y publicarla
 * sería dejar ese descuadre escrito para siempre.
 */
export async function publicarPropuesta(propuestaId: string): Promise<ResultadoPublicar> {
  const asesor = await asesorActual()
  if (asesor === null) return sinDetalle('Tu cuenta no está enlazada a un asesor de Sabbi.')

  const vigente = await propuestaVigente(propuestaId)
  if (vigente === null) return sinDetalle('No existe esa propuesta.')

  if (!vigente.ok) {
    return {
      ok: false,
      motivo: 'La propuesta todavía no se puede calcular, así que no hay nada que congelar.',
      detalles: vigente.bloqueos.map((bloqueo) => bloqueo.mensaje),
    }
  }

  if (vigente.cargada.publicada) {
    return sinDetalle(
      `Esta propuesta ya está publicada como v${vigente.cargada.version}. ` +
        'Para cambiarla, generá una versión nueva.',
    )
  }

  const reparos = reparosParaPublicar(vigente.propuesta)
  if (reparos.length > 0) {
    return {
      ok: false,
      motivo: 'La propuesta no está en condiciones de publicarse.',
      detalles: reparos.map((reparo) => reparo.mensaje),
    }
  }

  const ahora = new Date().toISOString()
  const snapshot = congelarPropuesta(vigente.propuesta, {
    macro: {
      version: vigente.versionMacro,
      esDeFabrica: vigente.versionMacro === null,
    },
    motor: VERSION_MOTOR,
    congeladaEn: ahora,
  })

  const supabase = await clienteServidor()

  const { error } = await supabase
    .from('proposals')
    .update({
      snapshot,
      estado: 'publicada',
      published_at: ahora,
      published_by: asesor.id,
      macro_version: vigente.versionMacro,
      engine_version: VERSION_MOTOR,
    })
    .eq('id', propuestaId)

  if (error !== null) return sinDetalle(traducir(error.message))

  await supabase.from('audit_log').insert({
    proposal_id: propuestaId,
    advisor_id: asesor.id,
    accion: 'publicar',
    detalle: {
      version: vigente.cargada.version,
      macro: vigente.versionMacro,
      motor: VERSION_MOTOR,
    },
  })

  return { ok: true, version: vigente.cargada.version }
}

export type ResultadoVersion =
  | { readonly ok: true; readonly propuestaId: string; readonly version: number }
  | { readonly ok: false; readonly error: string }

/** Las columnas que una versión nueva hereda: los parámetros con los que se calcula. */
const HEREDADAS = [
  'client_id',
  'ficha_id',
  'titulo',
  'mandato',
  'perfil',
  'segmento',
  'patrimonio_financiero_usd',
  'patrimonio_uso_propio_usd',
  'institucional_override',
  'toggle_inm_seccion_propia',
  'fx',
  'colchon_liquidez_usd',
  'ticket_minimo_etf_usd',
] as const

/**
 * Abre la versión siguiente de una propuesta.
 *
 * Nace borrador y hereda los parámetros, los ajustes del objetivo y las
 * anotaciones de línea de la anterior: si no los heredara, "corregir una coma"
 * costaría rehacer a mano todo lo que el asesor ya había escrito, y nadie
 * volvería a publicar. Lo que no hereda son las cifras — se recalculan, que es
 * justamente para lo que se abre una versión nueva.
 *
 * La anterior queda intacta y publicada. Las dos se ven en la biblioteca, y la
 * nueva dice a cuál reemplaza.
 */
export async function crearVersionNueva(propuestaId: string): Promise<ResultadoVersion> {
  const asesor = await asesorActual()
  if (asesor === null) return { ok: false, error: 'Tu cuenta no está enlazada a un asesor de Sabbi.' }

  const supabase = await clienteServidor()

  const { data: previa, error: errorPrevia } = await supabase
    .from('proposals')
    .select(`id, estado, version, ${HEREDADAS.join(', ')}`)
    .eq('id', propuestaId)
    .maybeSingle<
      Record<string, unknown> & {
        id: string
        estado: string
        version: number
        ficha_id: string | null
      }
    >()

  if (errorPrevia !== null) return { ok: false, error: traducir(errorPrevia.message) }
  if (previa === null || previa === undefined) return { ok: false, error: 'No existe esa propuesta.' }

  // Una versión sale de algo publicado. Abrir la v2 de un borrador dejaría dos
  // borradores de la misma ficha y ninguna señal de en cuál se está
  // escribiendo, que es exactamente la confusión que las versiones evitan.
  if (previa.estado !== 'publicada') {
    return {
      ok: false,
      error: 'Esta propuesta todavía es un borrador: editala directamente en vez de versionarla.',
    }
  }

  // El número sale del máximo de la ficha, no de `previa.version + 1`: una
  // versión nueva a partir de la v1 cuando ya existe una v2 tiene que ser v3.
  const { data: ultima } =
    previa.ficha_id === null
      ? { data: null }
      : await supabase
          .from('proposals')
          .select('version')
          .eq('ficha_id', previa.ficha_id)
          .order('version', { ascending: false })
          .limit(1)
          .maybeSingle<{ version: number }>()

  const version = (ultima?.version ?? previa.version) + 1

  const heredado: Record<string, unknown> = {}
  for (const columna of HEREDADAS) heredado[columna] = previa[columna]

  const { data: nueva, error } = await supabase
    .from('proposals')
    .insert({
      ...heredado,
      advisor_id: asesor.id,
      estado: 'borrador',
      version,
      reemplaza_a: propuestaId,
    })
    .select('id')
    .single<{ id: string }>()

  if (error !== null || nueva === null) {
    return { ok: false, error: traducir(error?.message ?? 'sin detalle') }
  }

  const arrastre = await arrastrarElTrabajoDelAsesor(propuestaId, nueva.id)

  await supabase.from('audit_log').insert({
    proposal_id: nueva.id,
    advisor_id: asesor.id,
    accion: 'nueva_version',
    detalle: { version, reemplaza_a: propuestaId, arrastre },
  })

  return { ok: true, propuestaId: nueva.id, version }
}

/**
 * Copia a la versión nueva lo que el asesor escribió a mano.
 *
 * Son tres tablas y ninguna se puede derivar: los activos agregados y los
 * ajustes de clase son decisiones sobre el portafolio objetivo, y las
 * anotaciones de línea son las dos columnas del anexo que ningún dato puede
 * llenar. Un fallo acá no cancela la versión —ya está creada y es utilizable—
 * pero queda escrito en la bitácora.
 */
async function arrastrarElTrabajoDelAsesor(
  desde: string,
  hacia: string,
): Promise<Record<string, number | string>> {
  const supabase = await clienteServidor()
  const arrastre: Record<string, number | string> = {}

  for (const tabla of ['proposal_restrictions', 'proposal_class_adjustments', 'proposal_line_notes'] as const) {
    const { data } = await supabase
      .from(tabla)
      .select('*')
      .eq('proposal_id', desde)
      .returns<Record<string, unknown>[]>()

    const filas = (data ?? []).map(({ id: _id, created_at: _creado, ...resto }) => ({
      ...resto,
      proposal_id: hacia,
    }))

    if (filas.length === 0) {
      arrastre[tabla] = 0
      continue
    }

    const { error } = await supabase.from(tabla).insert(filas)
    arrastre[tabla] = error === null ? filas.length : `error: ${error.message}`
  }

  return arrastre
}

function traducir(crudo: string): string {
  if (crudo.includes('una_version_por_ficha')) {
    return 'Alguien acaba de abrir esa misma versión. Recargá la biblioteca y mirá cuál es la última.'
  }
  if (crudo.includes('row-level security')) {
    return 'Tu cuenta no tiene permiso para escribir sobre esta propuesta.'
  }
  if (crudo.includes('ya esta publicada') || crudo.includes('snapshot')) {
    return crudo
  }
  if (crudo.includes('column') && crudo.includes('does not exist')) {
    return 'Esta base todavía no tiene la migración 0011. Corréla antes de publicar.'
  }
  return crudo
}
