'use client'

import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'

import { posicionDeFila } from './datos/mapeo'
import type { FilaPosicion } from './datos/mapeo'
import type { PosicionEditada } from './estado'
import { clienteNavegador } from './supabase/navegador'

/**
 * La ficha trabajada de a dos.
 *
 * Dos cosas distintas, y ahora en **dos canales distintos**:
 *
 *  - **Los cursores y la presencia** son efímeros. No se guardan, no se
 *    recuperan al recargar y no importa si se pierde uno. Van por `broadcast`
 *    y `presence`, que no tocan la base.
 *  - **Los cambios** son estado que ya se guardó. Llegan por
 *    `postgres_changes`, respetan RLS y son la verdad: si el otro asesor marcó
 *    «vender», eso está guardado y esta pantalla tiene que mostrarlo.
 *
 * Estaban juntos en un canal y esa era la fragilidad: `postgres_changes` es lo
 * único de los tres que depende de configuración del servidor —la tabla tiene
 * que estar en la publicación `supabase_realtime`, ver la migración 0014— y si
 * el servidor rechaza esa suscripción, el canal entero queda en error. O sea
 * que una publicación mal configurada se llevaba puestos los cursores, que no
 * necesitan nada de la base. Separados, lo que funciona funciona.
 *
 * La regla que hace que esto no sea peor que no tenerlo: **lo que llega de
 * afuera nunca pisa lo que se está escribiendo acá**. El caso es concreto y
 * pasa siempre: dos personas en la misma fila, una tecleando el valor, y el
 * guardado de la otra llega a mitad de palabra. Sin esa regla, la pantalla
 * borra lo tecleado y quien escribía no entiende qué pasó.
 */

/** Cuánto queda «mía» una posición después de tocarla. */
const GRACIA_MS = 6_000

/** Cada cuánto sale la posición del cursor. 60 ms son ~16 por segundo. */
const RITMO_CURSOR_MS = 60

/** Se deja de dibujar un cursor que no se movió en este tiempo. */
const CURSOR_VIEJO_MS = 20_000

export interface CursorAjeno {
  readonly asesorId: string
  readonly nombre: string
  /** Fracción del ancho y del alto del documento, de 0 a 1. */
  readonly x: number
  readonly y: number
  /** Tono HSL derivado del id: el mismo asesor siempre del mismo color. */
  readonly tono: number
  readonly visto: number
}

/**
 * Un tono estable a partir del id del asesor.
 *
 * Que sea el mismo color en las dos pantallas y en todas las sesiones importa
 * más que qué color sea: «el cursor verde es Marco» solo funciona si el verde
 * es siempre Marco.
 */
export function tonoDe(asesorId: string): number {
  let acumulado = 0
  for (let i = 0; i < asesorId.length; i += 1) {
    acumulado = (acumulado * 31 + asesorId.charCodeAt(i)) % 360
  }
  return acumulado
}

interface Presencia {
  readonly asesorId: string
  readonly nombre: string
}

export interface Companero extends Presencia {
  readonly tono: number
}

/**
 * En qué anda la conexión en vivo.
 *
 * Existe porque el modo de falla de esto es el silencio. Si el canal no
 * conecta, la pantalla se ve exactamente igual que cuando el otro asesor
 * todavía no abrió la ficha, y nadie tiene forma de distinguir «estoy solo» de
 * «esto está roto». Un asesor que confía en unos cursores que no llegan es
 * peor que uno que sabe que no los tiene.
 */
export type EstadoCanal = 'conectando' | 'en-vivo' | 'caido'

export interface Compania {
  /** Los demás asesores en esta ficha, sin contarme. */
  readonly companeros: readonly Companero[]
  readonly cursores: readonly CursorAjeno[]
  readonly estado: EstadoCanal
  /**
   * `false` cuando la presencia y los cursores andan pero la réplica de la
   * base no. Se puede seguir trabajando —solo que los cambios del otro no
   * aparecen solos— y decirlo es la diferencia entre eso y creer que la ficha
   * está al día.
   */
  readonly cambiosEnVivo: boolean
}

interface Opciones {
  readonly fichaId: string
  readonly yo: Presencia
  /** Se llama con cada posición que cambió del otro lado. */
  readonly alCambiarPosicion: (posicion: PosicionEditada) => void
  /** Ids de posiciones que esta pantalla está tocando ahora. */
  readonly mias: () => ReadonlySet<string>
  /**
   * El bloque sobre el que se miden y se dibujan los cursores.
   *
   * Las dos pantallas rara vez tienen el mismo ancho, así que la posición no
   * puede viajar en píxeles. Viaja como fracción de ESTE elemento, y se dibuja
   * como fracción del mismo elemento del otro lado: mientras las dos pantallas
   * muestren la misma ficha, el cursor cae en la fila que corresponde aunque
   * una tenga la ventana a la mitad.
   */
  readonly contenedor: RefObject<HTMLElement | null>
}

const VACIA: Compania = {
  companeros: [],
  cursores: [],
  estado: 'conectando',
  cambiosEnVivo: false,
}

/**
 * Conecta la ficha al canal de su equipo.
 *
 * Devuelve quién más está mirando y dónde tiene el cursor. Los cambios no se
 * devuelven: se entregan por `alCambiarPosicion` para que el llamador los meta
 * en su reductor, que es quien sabe cómo se aplica un cambio a la pantalla.
 */
export function useCompania({
  fichaId,
  yo,
  alCambiarPosicion,
  mias,
  contenedor,
}: Opciones): Compania {
  const [compania, setCompania] = useState<Compania>(VACIA)

  // Los tres viven en refs porque el efecto se monta una vez por ficha y no
  // puede volver a correr cada vez que cambia una función: reconectar el
  // websocket en cada tecla sería peor que no tener tiempo real.
  const alCambiarRef = useRef(alCambiarPosicion)
  const miasRef = useRef(mias)
  const yoRef = useRef(yo)
  useEffect(() => {
    alCambiarRef.current = alCambiarPosicion
    miasRef.current = mias
    yoRef.current = yo
  })

  useEffect(() => {
    if (fichaId === '') return

    const supabase = clienteNavegador()

    /*
     * Dos canales sobre el mismo websocket. `supabase-js` los multiplexa, así
     * que separar no cuesta una conexión más — y compra que la caída de uno no
     * sea la del otro. Ver la nota de arriba del archivo.
     */
    const canalVivo = supabase.channel(`ficha:${fichaId}`, {
      config: { presence: { key: yoRef.current.asesorId } },
    })
    const canalCambios = supabase.channel(`ficha-cambios:${fichaId}`)

    const cursores = new Map<string, CursorAjeno>()

    const refrescarCursores = () => {
      const corte = Date.now() - CURSOR_VIEJO_MS
      setCompania((previa) => ({
        ...previa,
        cursores: [...cursores.values()].filter((c) => c.visto >= corte),
      }))
    }

    canalVivo
      .on('presence', { event: 'sync' }, () => {
        const estado = canalVivo.presenceState<Presencia>()
        const companeros = Object.values(estado)
          .flatMap((entradas) => entradas)
          .filter((entrada) => entrada.asesorId !== yoRef.current.asesorId)
          // El mismo asesor con dos pestañas abiertas es una sola persona.
          .filter(
            (entrada, i, todas) =>
              todas.findIndex((otra) => otra.asesorId === entrada.asesorId) === i,
          )
          .map((entrada) => ({ ...entrada, tono: tonoDe(entrada.asesorId) }))

        // Un cursor sin dueño presente es un cursor de alguien que ya cerró.
        const presentes = new Set(companeros.map((c) => c.asesorId))
        for (const id of [...cursores.keys()]) {
          if (!presentes.has(id)) cursores.delete(id)
        }

        setCompania((previa) => ({
          ...previa,
          companeros,
          cursores: [...cursores.values()],
        }))
      })
      .on('broadcast', { event: 'cursor' }, ({ payload }) => {
        const cursor = payload as { asesorId: string; nombre: string; x: number; y: number }
        if (cursor.asesorId === yoRef.current.asesorId) return
        cursores.set(cursor.asesorId, {
          ...cursor,
          tono: tonoDe(cursor.asesorId),
          visto: Date.now(),
        })
        refrescarCursores()
      })

    canalCambios.on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'ficha_positions',
        filter: `ficha_id=eq.${fichaId}`,
      },
      ({ new: fila }) => {
        const cruda = fila as unknown as FilaPosicion & { id: string }
        // Lo que estoy tocando no se pisa. Incluye el eco de mi propio
        // guardado, que vuelve por este mismo canal unos milisegundos
        // después de que lo escribí.
        if (miasRef.current().has(cruda.id)) return
        alCambiarRef.current(posicionDeFila(cruda))
      },
    )

    /*
     * Los estados del cliente son un enum cuyos valores son estas mismas
     * cadenas; se comparan por cadena para no arrastrar el enum hasta acá.
     * `CLOSED` no se trata como caída: es lo que llega al desmontar.
     */
    void canalVivo.subscribe((estado) => {
      const nombre = String(estado)
      if (nombre === 'SUBSCRIBED') {
        void canalVivo.track(yoRef.current)
        setCompania((previa) => ({ ...previa, estado: 'en-vivo' }))
        return
      }
      if (nombre === 'CHANNEL_ERROR' || nombre === 'TIMED_OUT') {
        setCompania((previa) => ({ ...previa, estado: 'caido' }))
      }
    })

    void canalCambios.subscribe((estado) => {
      const nombre = String(estado)
      if (nombre === 'SUBSCRIBED') {
        setCompania((previa) => ({ ...previa, cambiosEnVivo: true }))
        return
      }
      if (nombre === 'CHANNEL_ERROR' || nombre === 'TIMED_OUT') {
        setCompania((previa) => ({ ...previa, cambiosEnVivo: false }))
      }
    })

    // Un cursor que dejó de moverse porque su dueño se fue sin cerrar la
    // pestaña se apaga solo. Presencia no siempre alcanza: un portátil que se
    // suspende no manda `leave`.
    const barrido = window.setInterval(refrescarCursores, 5_000)

    let ultimoEnvio = 0
    const alMover = (evento: PointerEvent) => {
      const ahora = Date.now()
      if (ahora - ultimoEnvio < RITMO_CURSOR_MS) return

      const bloque = contenedor.current
      if (bloque === null) return
      const caja = bloque.getBoundingClientRect()
      if (caja.width <= 0 || caja.height <= 0) return

      // `clientX` y `caja.left` son los dos relativos a la ventana, así que la
      // resta ya trae el desplazamiento descontado sin leer el scroll.
      const x = (evento.clientX - caja.left) / caja.width
      const y = (evento.clientY - caja.top) / caja.height
      // Fuera del bloque no se manda nada: el cursor sobre el rail o la barra
      // no dice nada de la ficha, y mandarlo lo pegaría contra un borde.
      if (x < 0 || x > 1 || y < 0 || y > 1) return

      ultimoEnvio = ahora

      void canalVivo.send({
        type: 'broadcast',
        event: 'cursor',
        payload: { ...yoRef.current, x, y },
      })
    }

    window.addEventListener('pointermove', alMover)

    return () => {
      window.removeEventListener('pointermove', alMover)
      window.clearInterval(barrido)
      void supabase.removeChannel(canalVivo)
      void supabase.removeChannel(canalCambios)
      setCompania(VACIA)
    }
  }, [fichaId, contenedor])

  return compania
}

/**
 * Las posiciones que esta pantalla está tocando, con su vencimiento.
 *
 * No alcanza con «la que tiene el foco»: entre que se suelta una celda y llega
 * el guardado pasan cientos de milisegundos, y el eco de ese guardado vuelve
 * después. Una posición queda mía unos segundos desde la última tecla, y en
 * ese rato ningún cambio de afuera la toca.
 */
export function useMias(): {
  readonly marcar: (id: string) => void
  readonly mias: () => ReadonlySet<string>
} {
  const tocadas = useRef(new Map<string, number>())

  const marcar = (id: string) => {
    tocadas.current.set(id, Date.now() + GRACIA_MS)
  }

  const mias = () => {
    const ahora = Date.now()
    for (const [id, vence] of tocadas.current) {
      if (vence <= ahora) tocadas.current.delete(id)
    }
    return new Set(tocadas.current.keys())
  }

  return { marcar, mias }
}
