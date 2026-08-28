import type {
  AjusteClase,
  AjusteLinea,
  ClaseModelo,
  Cta,
  EstadoInstitucional,
  Perfil,
  PosicionRevisada,
} from '@sabbi/core'
import type { Aviso, DatosCliente, FilaIgnorada, PortafolioModelo, PosicionFicha } from '@sabbi/io'

import type { ActivoAgregado } from './catalogo'

/**
 * Estado de la pantalla de revisión.
 *
 * Es la misma forma que tiene la revisión en la base: la pantalla no inventa
 * un modelo propio, lee el que vino del servidor y le aplica los cambios del
 * asesor mientras el autoguardado los devuelve. Todo lo que la ficha trajo es
 * editable, porque las fichas llegan con errores, y cada campo que el asesor
 * toca queda anotado en `camposEditados` para poder distinguir de un vistazo
 * lo que corrigió una persona de lo que leyó el parser. Nada se muta: cada
 * acción devuelve un estado nuevo.
 */

export interface PosicionEditada extends PosicionFicha {
  /** El uuid de la fila en `ficha_positions`: clave de React y de cada guardado. */
  readonly id: string
  readonly nota: string
  readonly camposEditados: readonly string[]
}

export interface Parametros {
  readonly perfil: Perfil
  readonly necesitaFlujos: boolean
  readonly usPerson: boolean
  readonly institucional: EstadoInstitucional
  readonly incluirInmueblesDeRenta: boolean
  /**
   * El cliente accede a Inmobiliario Directo.
   *
   * No es lo mismo que `incluirInmueblesDeRenta`: ese dice si los inmuebles
   * que el cliente ya tiene cuentan como patrimonio financiero, este dice si
   * el modelo le puede proponer inmobiliario nuevo.
   */
  readonly accedeInmobiliario: boolean
  readonly colchonLiquidezUsd: number
  readonly ticketMinimoUsd: number
  readonly fxPenUsd: number
}

/**
 * Lo que el asesor le hace al portafolio objetivo, no a la ficha.
 *
 * Son dos palancas distintas y conviene no confundirlas. Un activo agregado
 * suma una línea al objetivo — «Acciones MSFT, 30,000, Renta Variable» — y
 * clava esa parte del ticket. Un ajuste manda sobre una clase entera: la fija
 * en un monto o la saca del cálculo, y el resto se prorratea entre las demás.
 *
 * Ninguna de las dos inventa dinero: el patrimonio sigue siendo el de la
 * ficha, lo que cambia es cómo se reparte.
 */
export interface AjustesObjetivo {
  readonly agregados: readonly ActivoAgregado[]
  readonly ajustes: readonly AjusteClase[]
  /**
   * Montos clavados instrumento por instrumento.
   *
   * La tercera palanca, un nivel por debajo de `ajustes`: la clase ya tiene su
   * monto y esto dice con qué se ejecuta. No mueve el total de la clase, así
   * que nunca puede descuadrar la propuesta contra el patrimonio.
   */
  readonly ajustesLinea: readonly AjusteLinea[]
}

/**
 * Una revisión completa, tal como sale de la base.
 *
 * Los tres identificadores viajan con ella porque cada cambio va a una tabla
 * distinta: las celdas a `ficha_positions`, el perfil regulatorio al cliente y
 * el resto de parámetros a la propuesta.
 */
export interface EstadoRevision extends AjustesObjetivo {
  readonly fichaId: string
  readonly propuestaId: string
  readonly clienteId: string
  readonly archivo: string
  readonly hoja: string
  readonly cliente: DatosCliente
  readonly avisos: readonly Aviso[]
  readonly ignoradas: readonly FilaIgnorada[]
  readonly modelo: PortafolioModelo | null
  readonly posiciones: readonly PosicionEditada[]
  readonly parametros: Parametros
  /** Si la ficha aparece en el calendario de la agenda. */
  readonly ocultaEnAgenda: boolean
}

export type Accion =
  | { readonly tipo: 'editar'; readonly id: string; readonly cambios: Partial<PosicionEditada> }
  | { readonly tipo: 'cta'; readonly id: string; readonly cta: Cta }
  | { readonly tipo: 'parametros'; readonly cambios: Partial<Parametros> }
  | { readonly tipo: 'activo'; readonly activo: ActivoAgregado }
  | { readonly tipo: 'quitar-activo'; readonly id: string }
  /** `ajuste` en `null` saca el ajuste y devuelve la clase al benchmark. */
  | { readonly tipo: 'ajuste'; readonly clase: ClaseModelo; readonly ajuste: AjusteClase | null }
  /** `montoUsd` en `null` suelta la línea y la devuelve al reparto de su clase. */
  | {
      readonly tipo: 'ajuste-linea'
      readonly clase: ClaseModelo
      readonly instrumento: string
      readonly montoUsd: number | null
    }
  /**
   * Una posición que cambió del otro lado y llegó por el canal de la ficha.
   *
   * Reemplaza la fila entera y no la mezcla: lo que llega es la fila de la
   * base, que es la verdad, y mezclarla con lo que hay en pantalla daría una
   * posición que no existe en ningún lado. Quien despacha esto ya se aseguró
   * de que no sea una posición que este asesor esté tocando.
   */
  | { readonly tipo: 'remoto'; readonly posicion: PosicionEditada }

/** Campos que el asesor puede corregir. El resto es derivado o de sistema. */
export const EDITABLES: ReadonlySet<string> = new Set([
  'institucionProducto',
  'tipoFicha',
  'assetClass',
  'claseModelo',
  'moneda',
  'plaza',
  'valorUsd',
  'rendimientoEst',
  'feePct',
  'cta',
  'montoVentaParcial',
  'nota',
  // Sacar una posicion del calculo es una decision, no un dato de la ficha: el
  // inmueble de uso propio llega marcado, pero el asesor tiene que poder sacar
  // —o volver a meter— cualquier otra.
  'esInvertible',
])

/**
 * Los campos que quedan marcados como tocados tras aplicar unos cambios.
 *
 * Vive aparte porque la usan dos: el reductor, para pintar el punto en la
 * celda, y el autoguardado, para mandar la lista a la base sin recalcularla
 * distinto.
 */
export function camposTrasEditar(
  posicion: PosicionEditada,
  cambios: Partial<PosicionEditada>,
): readonly string[] {
  const tocados = Object.keys(cambios).filter(
    (campo) =>
      EDITABLES.has(campo) &&
      cambios[campo as keyof PosicionEditada] !== posicion[campo as keyof PosicionEditada],
  )
  return tocados.length === 0
    ? posicion.camposEditados
    : [...new Set([...posicion.camposEditados, ...tocados])]
}

function aplicar(posicion: PosicionEditada, cambios: Partial<PosicionEditada>): PosicionEditada {
  const camposEditados = camposTrasEditar(posicion, cambios)
  if (camposEditados === posicion.camposEditados) return posicion

  return { ...posicion, ...cambios, editadoManualmente: true, camposEditados }
}

/** Los cambios que produce marcar una decisión, sin aplicarlos. */
export const cambiosDeCta = (posicion: PosicionEditada, cta: Cta): Partial<PosicionEditada> => ({
  cta,
  // Cambiar de decisión limpia el monto: un "conservar" con un monto a vender
  // colgado es la clase de dato que descuadra todo.
  montoVentaParcial: cta === 'venta_parcial' ? posicion.montoVentaParcial : 0,
  // Lo mismo con el reparto. Se conserva al volver a marcar venta condicionada
  // dentro de la misma sesión —cambiar sin querer y deshacer no puede borrar lo
  // que costó teclear— pero no viaja pegado a ninguna otra decisión.
  destinos: cta === 'venta_condicionada' ? (posicion.destinos ?? []) : [],
})

/** Reductor de la pantalla. */
export function reducir(estado: EstadoRevision, accion: Accion): EstadoRevision {
  switch (accion.tipo) {
    case 'editar':
      return {
        ...estado,
        posiciones: estado.posiciones.map((posicion) =>
          posicion.id === accion.id ? aplicar(posicion, accion.cambios) : posicion,
        ),
      }

    case 'cta':
      return {
        ...estado,
        posiciones: estado.posiciones.map((posicion) =>
          posicion.id === accion.id ? aplicar(posicion, cambiosDeCta(posicion, accion.cta)) : posicion,
        ),
      }

    case 'remoto':
      return {
        ...estado,
        posiciones: estado.posiciones.map((posicion) =>
          posicion.id === accion.posicion.id ? accion.posicion : posicion,
        ),
      }

    case 'parametros':
      return { ...estado, parametros: { ...estado.parametros, ...accion.cambios } }

    case 'activo': {
      const existe = estado.agregados.some((a) => a.id === accion.activo.id)
      return {
        ...estado,
        agregados: existe
          ? estado.agregados.map((a) => (a.id === accion.activo.id ? accion.activo : a))
          : [...estado.agregados, accion.activo],
      }
    }

    case 'quitar-activo':
      return { ...estado, agregados: estado.agregados.filter((a) => a.id !== accion.id) }

    case 'ajuste': {
      const resto = estado.ajustes.filter((a) => a.clase !== accion.clase)
      return {
        ...estado,
        ajustes: accion.ajuste === null ? resto : [...resto, accion.ajuste],
      }
    }

    case 'ajuste-linea': {
      // La clave es el par (clase, instrumento): el mismo nombre puede salir en
      // dos clases y un ajuste sobre uno no puede mover al otro.
      const resto = estado.ajustesLinea.filter(
        (a) => a.clase !== accion.clase || a.instrumento !== accion.instrumento,
      )
      return {
        ...estado,
        ajustesLinea:
          accion.montoUsd === null
            ? resto
            : [
                ...resto,
                {
                  clase: accion.clase,
                  instrumento: accion.instrumento,
                  montoUsd: accion.montoUsd,
                },
              ],
      }
    }
  }
}

/** Proyecta las posiciones a lo que el motor entiende. */
export const aRevisadas = (posiciones: readonly PosicionEditada[]): readonly PosicionRevisada[] =>
  posiciones.map((posicion) => ({
    institucionProducto: posicion.institucionProducto,
    origen: posicion.origen,
    claseModelo: posicion.claseModelo,
    productoId: posicion.productoId,
    valorUsd: posicion.valorUsd,
    esInvertible: posicion.esInvertible,
    cta: posicion.cta,
    montoVentaParcial: posicion.montoVentaParcial,
    destinos: posicion.destinos ?? [],
  }))

/**
 * Los avisos que todavía valen, mirando el estado de ahora.
 *
 * `parse_warnings` es una foto de lo que el parser vio al subir la ficha, y se
 * guarda así a propósito: es el registro de qué leyó la máquina y qué arregló
 * una persona. Pero mostrarla tal cual convierte cada aviso en permanente. El
 * asesor le asigna la clase a «AMX», y el cartel de «no pude clasificar AMX»
 * sigue ahí — pidiéndole que haga lo que acaba de hacer, y tapando los avisos
 * que sí quedan por resolver.
 *
 * Cada aviso trae la fila de la que salió. Se busca esa posición y se pregunta
 * si el motivo del aviso sigue en pie: la clase ya está puesta, el rendimiento
 * ya lo corrigió alguien, la moneda ya la eligió. El que no se puede
 * comprobar —o cuya fila ya no está— se muestra: callar un aviso que no
 * sabemos si se resolvió es peor que repetir uno resuelto.
 */
export function avisosVigentes(
  avisos: readonly Aviso[],
  posiciones: readonly PosicionEditada[],
): readonly Aviso[] {
  const porFila = new Map(posiciones.map((posicion) => [posicion.fila, posicion]))

  return avisos.filter((aviso) => {
    if (aviso.fila === undefined) return true
    const posicion = porFila.get(aviso.fila)
    if (posicion === undefined) return true

    const corrigio = (campo: string) => posicion.camposEditados.includes(campo)

    switch (aviso.codigo) {
      // El unico que se puede comprobar contra el dato y no contra la marca de
      // edicion: la clase esta puesta o no lo esta, la haya puesto el parser
      // en una segunda pasada o una persona.
      case 'clase_sin_resolver':
        return posicion.claseModelo === null
      // Estos dicen «revisá esto», y revisarlo es tocarlo. Dejar de mostrarlos
      // porque el valor cambio solo seria callarlos sin que nadie los mirara.
      case 'clase_inferida':
        return !corrigio('claseModelo') && !corrigio('assetClass')
      case 'rendimiento_dudoso':
        return !corrigio('rendimientoEst')
      case 'moneda_desconocida':
        return !corrigio('moneda')
      default:
        return true
    }
  })
}

/** Una venta parcial por encima de la posición no se puede guardar: la base la rechaza. */
export const ventaParcialInvalida = (posicion: PosicionEditada): boolean =>
  posicion.cta === 'venta_parcial' && posicion.montoVentaParcial > posicion.valorUsd
