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
 * Dos cosas distintas que viajan por el mismo canal y conviene no confundir:
 *
 *  - **Los cambios** son estado que ya se guardó en la base. Llegan por
 *    `postgres_changes`, respetan RLS y son la verdad: si el otro asesor
 *    marcó «vender», eso está guardado y esta pantalla tiene que mostrarlo.
 *  - **Los cursores** son efímeros. No se guardan, no se recuperan al
 *    recargar y no importa si se pierde uno: van por `broadcast`, que no toca
 *    la base.
 *  - **Los avisos de «releé»** son una sola palabra por `broadcast`. Los usa
 *    todo lo que no es una posición —los parámetros, los activos agregados,
 *    los ajustes de clase, las anotaciones de la propuesta—, que vive en
 *    varias tablas, se agrega y se borra. Publicar esas tablas obligaría a
 *    seguir cada `insert` y cada `delete`, y un `delete` de Postgres viaja sin
 *    pasar por RLS: llevaría la fila borrada a cualquiera suscrito. Así que no
 *    viaja el dato, viaja el aviso, y quien lo recibe vuelve a leer por el
 *    servidor con su propia sesión.
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

export interface Compania {
  /** Los demás asesores en esta ficha, sin contarme. */
  readonly companeros: readonly Companero[]
  readonly cursores: readonly CursorAjeno[]
}

interface Opciones {
  /**
   * En qué están juntos.
   *
   * Es el nombre del canal: `ficha:<id>` para la revisión, `propuesta:<id>`
   * para la propuesta. Dos pantallas distintas del mismo cliente son dos
   * salas: quien está leyendo la propuesta no aparece como presente en la
   * ficha, porque no lo está.
   */
  readonly sala: string
  readonly yo: Presencia
  /** Alguien de la sala guardó algo que esta pantalla lee entero. */
  readonly alRefrescar: () => void
  /**
   * Aparecer en la lista de quiénes están.
   *
   * En `false` la pantalla escucha la sala pero no se anuncia. Lo usa la
   * propuesta, que sigue los cambios de la ficha para no mostrar cifras
   * viejas: quien la está leyendo no está en la ficha, y decirle a los dos
   * asesores que sí lo está es peor que no decirles nada.
   */
  readonly presente?: boolean
  /**
   * El bloque sobre el que se miden y se dibujan los cursores.
   *
   * Las dos pantallas rara vez tienen el mismo ancho, así que la posición no
   * puede viajar en píxeles. Viaja como fracción de ESTE elemento, y se dibuja
   * como fracción del mismo elemento del otro lado: mientras las dos pantallas
   * muestren la misma ficha, el cursor cae en la fila que corresponde aunque
   * una tenga la ventana a la mitad.
   *
   * Sin contenedor no se mandan ni se reciben cursores, solo presencia: sirve
   * para una pantalla donde saber quién está mirando alcanza.
   */
  readonly contenedor?: RefObject<HTMLElement | null>
  /**
   * Solo la ficha: las posiciones, que sí llegan fila por fila.
   *
   * Son la única cosa compartida que se edita celda por celda y muchas veces
   * por minuto, y la única que la base publica: releer la ficha entera con
   * cada tecla del otro asesor sería un viaje al servidor por tecla.
   */
  readonly posiciones?: {
    readonly fichaId: string
    /** Se llama con cada posición que cambió del otro lado. */
    readonly alCambiar: (posicion: PosicionEditada) => void
    /** Ids de posiciones que esta pantalla está tocando ahora. */
    readonly mias: () => ReadonlySet<string>
  }
}

const VACIA: Compania = { companeros: [], cursores: [] }

/**
 * Un identificador por pestaña, que no es el del asesor.
 *
 * Los dos hacen falta y no son lo mismo. El del asesor dice quién es —el color
 * del cursor, el nombre en la barra— y por eso dos pestañas del mismo asesor
 * son una sola persona. El de la pestaña dice de dónde salió cada mensaje, y
 * por eso un aviso de «releé» que mandé desde esta pestaña lo ignora esta
 * pestaña y lo atiende la otra, que también tiene la ficha abierta y también
 * quedó vieja.
 */
const nuevaSesion = (): string => Math.random().toString(36).slice(2)

/** Lo que devuelve la sala: quién está, dónde tiene el cursor, y el aviso. */
export interface EnLaSala extends Compania {
  /**
   * Avisa a los demás de que esto cambió y hay que volver a leer.
   *
   * Se llama después de que el guardado volvió sin error, no antes: avisar de
   * un cambio que la base todavía no escribió hace que el otro lea lo viejo y
   * se quede con eso hasta el próximo aviso.
   */
  readonly avisar: () => void
}

/**
 * Conecta esta pantalla a la sala donde está el resto.
 *
 * Devuelve quién más está mirando, dónde tiene el cursor y con qué avisarles.
 * Los cambios no se devuelven: los de una posición se entregan por
 * `posiciones.alCambiar` y el resto por `alRefrescar`, para que el llamador
 * los meta en su reductor, que es quien sabe cómo se aplica un cambio a la
 * pantalla.
 */
export function useCompania({
  sala,
  yo,
  alRefrescar,
  contenedor,
  posiciones,
  presente = true,
}: Opciones): EnLaSala {
  const [compania, setCompania] = useState<Compania>(VACIA)

  // Todo esto vive en refs porque el efecto se monta una vez por sala y no
  // puede volver a correr cada vez que cambia una función: reconectar el
  // websocket en cada tecla sería peor que no tener tiempo real.
  const yoRef = useRef(yo)
  const alRefrescarRef = useRef(alRefrescar)
  const posicionesRef = useRef(posiciones)
  const contenedorRef = useRef(contenedor)
  const presenteRef = useRef(presente)
  useEffect(() => {
    yoRef.current = yo
    alRefrescarRef.current = alRefrescar
    posicionesRef.current = posiciones
    contenedorRef.current = contenedor
    presenteRef.current = presente
  })

  const sesion = useRef(nuevaSesion())
  // El canal vive fuera del efecto porque `avisar` se llama desde el
  // autoguardado, que no sabe nada de suscripciones. Vacío mientras no haya
  // sala: avisar sin canal no es un error, es que no hay a quién avisarle.
  const canalRef = useRef<ReturnType<ReturnType<typeof clienteNavegador>['channel']> | null>(null)

  // La ficha se suscribe a sus posiciones; una pantalla sin `posiciones` no.
  // Se lee acá y no dentro del efecto para que el id entre en las dependencias:
  // cambiar de ficha tiene que reconectar.
  const fichaId = posiciones?.fichaId ?? ''

  useEffect(() => {
    if (sala === '') return

    const supabase = clienteNavegador()
    const canal = supabase.channel(sala, {
      config: { presence: { key: yoRef.current.asesorId } },
    })
    canalRef.current = canal

    // Una pantalla sin bloque donde medirlos no dibuja cursores, y una que no
    // se anuncia tampoco: sin esto seguiría atendiendo dieciséis mensajes por
    // segundo y volviendo a pintarse por cada uno para no mostrar nada.
    const conCursores = contenedorRef.current !== undefined && presenteRef.current

    const cursores = new Map<string, CursorAjeno>()

    const refrescarCursores = () => {
      const corte = Date.now() - CURSOR_VIEJO_MS
      setCompania((previa) => ({
        ...previa,
        cursores: [...cursores.values()].filter((c) => c.visto >= corte),
      }))
    }

    canal
      .on('presence', { event: 'sync' }, () => {
        const estado = canal.presenceState<Presencia>()
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

        setCompania({ companeros, cursores: [...cursores.values()] })
      })
      .on('broadcast', { event: 'refrescar' }, ({ payload }) => {
        // El aviso que salió de esta pestaña ya está aplicado acá: releer sería
        // un viaje al servidor para traerse lo que uno mismo acaba de escribir.
        // El de otra pestaña del mismo asesor sí se atiende: es otra pantalla.
        if ((payload as { sesion?: string }).sesion === sesion.current) return
        alRefrescarRef.current()
      })

    if (conCursores) {
      canal.on('broadcast', { event: 'cursor' }, ({ payload }) => {
        const cursor = payload as { asesorId: string; nombre: string; x: number; y: number }
        if (cursor.asesorId === yoRef.current.asesorId) return
        cursores.set(cursor.asesorId, {
          ...cursor,
          tono: tonoDe(cursor.asesorId),
          visto: Date.now(),
        })
        refrescarCursores()
      })
    }

    if (fichaId !== '') {
      canal.on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'ficha_positions',
          filter: `ficha_id=eq.${fichaId}`,
        },
        ({ new: fila }) => {
          const cruda = fila as unknown as FilaPosicion & { id: string }
          const posiciones = posicionesRef.current
          if (posiciones === undefined) return
          // Lo que estoy tocando no se pisa. Incluye el eco de mi propio
          // guardado, que vuelve por este mismo canal unos milisegundos
          // después de que lo escribí.
          if (posiciones.mias().has(cruda.id)) return
          posiciones.alCambiar(posicionDeFila(cruda))
        },
      )
    }

    void canal.subscribe((estado) => {
      // `REALTIME_SUBSCRIBE_STATES.SUBSCRIBED` es un enum del cliente y su
      // valor es esta misma cadena; se compara por cadena para no arrastrar el
      // enum hasta acá, y el linter pide que la comparación sea explícita.
      if (String(estado) !== 'SUBSCRIBED') return
      if (!presenteRef.current) return
      void canal.track(yoRef.current)
    })

    // Un cursor que dejó de moverse porque su dueño se fue sin cerrar la
    // pestaña se apaga solo. Presencia no siempre alcanza: un portátil que se
    // suspende no manda `leave`.
    const barrido = conCursores ? window.setInterval(refrescarCursores, 5_000) : null

    let ultimoEnvio = 0
    const alMover = (evento: PointerEvent) => {
      const ahora = Date.now()
      if (ahora - ultimoEnvio < RITMO_CURSOR_MS) return

      const bloque = contenedorRef.current?.current ?? null
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

      void canal.send({
        type: 'broadcast',
        event: 'cursor',
        payload: { ...yoRef.current, x, y },
      })
    }

    if (conCursores) window.addEventListener('pointermove', alMover)

    return () => {
      window.removeEventListener('pointermove', alMover)
      if (barrido !== null) window.clearInterval(barrido)
      canalRef.current = null
      void supabase.removeChannel(canal)
      setCompania(VACIA)
    }
  }, [sala, fichaId])

  const avisar = () => {
    void canalRef.current?.send({
      type: 'broadcast',
      event: 'refrescar',
      payload: { sesion: sesion.current },
    })
  }

  return { ...compania, avisar }
}

/**
 * Lo que esta pantalla está tocando, con su vencimiento.
 *
 * No alcanza con «lo que tiene el foco»: entre que se suelta una celda y llega
 * el guardado pasan cientos de milisegundos, y el eco de ese guardado vuelve
 * después. Lo tocado queda mío unos segundos desde la última tecla, y en ese
 * rato ningún cambio de afuera lo toca.
 *
 * Las claves son las mismas con las que se encola el guardado —el uuid de una
 * posición, `parametros`, `activo:<id>`, `ajuste:<clase>`—, así que lo que se
 * protege es exactamente lo que está en vuelo.
 */
export function useMias(): {
  readonly marcar: (id: string) => void
  readonly mias: () => ReadonlySet<string>
  readonly alSoltar: (accion: () => void) => void
} {
  const tocadas = useRef(new Map<string, number>())
  const pendiente = useRef<number | null>(null)

  useEffect(
    () => () => {
      if (pendiente.current !== null) window.clearTimeout(pendiente.current)
    },
    [],
  )

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

  /**
   * Vuelve a llamar cuando esta pantalla suelte lo que está tocando.
   *
   * Cierra el agujero de la regla de arriba. Proteger lo que se está
   * escribiendo significa descartar el cambio del otro que llegó en el medio,
   * y descartarlo sin más deja esta pantalla con un valor que la base ya no
   * tiene — y el próximo guardado, que manda el bloque entero, lo escribiría
   * de vuelta pisando al otro sin que nadie se entere. Así que lo que se
   * descartó se vuelve a pedir en cuanto vence la gracia.
   *
   * Mientras el asesor siga tecleando, la gracia se corre y esto también: la
   * relectura llega cuando pare, que es cuando se puede aplicar sin molestar.
   */
  const alSoltar = (accion: () => void) => {
    const vencimientos = [...tocadas.current.values()]
    if (vencimientos.length === 0) return

    if (pendiente.current !== null) window.clearTimeout(pendiente.current)
    // Un pelo después del vencimiento: exactamente encima, `mias()` todavía
    // podría contarlas como vigentes por un milisegundo de redondeo.
    const espera = Math.max(...vencimientos) - Date.now() + 100
    pendiente.current = window.setTimeout(() => {
      pendiente.current = null
      accion()
    }, espera)
  }

  return { marcar, mias, alSoltar }
}
