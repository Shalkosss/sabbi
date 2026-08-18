import type { Cta, EstadoInstitucional, Perfil, PosicionRevisada } from '@sabbi/core'
import type { FichaParseada, PosicionFicha } from '@sabbi/io'

/**
 * Estado de la pantalla de revisión.
 *
 * Todo lo que la ficha trajo es editable, porque las fichas llegan con errores.
 * Cada campo que el asesor toca queda anotado en `camposEditados` para poder
 * distinguir de un vistazo lo que corrigió una persona de lo que leyó el
 * parser. Nada se muta: cada acción devuelve un estado nuevo.
 */

export interface PosicionEditada extends PosicionFicha {
  /** Clave estable para React y para las acciones. */
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
  readonly colchonLiquidezUsd: number
  readonly ticketMinimoUsd: number
  readonly fxPenUsd: number
}

export interface EstadoRevision {
  readonly archivo: string
  readonly ficha: FichaParseada
  readonly posiciones: readonly PosicionEditada[]
  readonly parametros: Parametros
}

export type Accion =
  | { readonly tipo: 'cargar'; readonly ficha: FichaParseada; readonly archivo: string }
  | { readonly tipo: 'editar'; readonly id: string; readonly cambios: Partial<PosicionEditada> }
  | { readonly tipo: 'cta'; readonly id: string; readonly cta: Cta }
  | { readonly tipo: 'parametros'; readonly cambios: Partial<Parametros> }
  | { readonly tipo: 'descartar' }

/** Campos que el asesor puede corregir. El resto es derivado o de sistema. */
const EDITABLES = new Set([
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
])

const FX_POR_DEFECTO = 3.4
const TICKET_ETF_POR_DEFECTO = 20_000

export function estadoInicial(ficha: FichaParseada, archivo: string): EstadoRevision {
  return {
    archivo,
    ficha,
    posiciones: ficha.posiciones.map((posicion) => ({
      ...posicion,
      id: `${posicion.origen}-${posicion.fila}`,
      // La ficha no trae notas: son del asesor y nacen vacías.
      nota: '',
      camposEditados: [],
    })),
    parametros: {
      perfil: 'Moderado',
      necesitaFlujos: false,
      usPerson: false,
      institucional: 'auto',
      incluirInmueblesDeRenta: true,
      colchonLiquidezUsd: 0,
      // La propia ficha suele traer el mínimo de ETF en su bloque de la derecha.
      ticketMinimoUsd: ficha.modelo?.montoMinimoEtfUsd ?? TICKET_ETF_POR_DEFECTO,
      fxPenUsd: FX_POR_DEFECTO,
    },
  }
}

function aplicar(posicion: PosicionEditada, cambios: Partial<PosicionEditada>): PosicionEditada {
  const tocados = Object.keys(cambios).filter(
    (campo) =>
      EDITABLES.has(campo) &&
      cambios[campo as keyof PosicionEditada] !== posicion[campo as keyof PosicionEditada],
  )
  if (tocados.length === 0) return posicion

  return {
    ...posicion,
    ...cambios,
    editadoManualmente: true,
    camposEditados: [...new Set([...posicion.camposEditados, ...tocados])],
  }
}

/**
 * Reductor de la pantalla. `null` es "todavia no hay ficha".
 */
export function reducir(estado: EstadoRevision | null, accion: Accion): EstadoRevision | null {
  if (accion.tipo === 'cargar') return estadoInicial(accion.ficha, accion.archivo)
  if (accion.tipo === 'descartar') return null
  if (estado === null) return null

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
          posicion.id === accion.id
            ? aplicar(posicion, {
                cta: accion.cta,
                // Cambiar de decisión limpia el monto: un "conservar" con un
                // monto a vender colgado es la clase de dato que descuadra todo.
                montoVentaParcial: accion.cta === 'venta_parcial' ? posicion.montoVentaParcial : 0,
              })
            : posicion,
        ),
      }

    case 'parametros':
      return { ...estado, parametros: { ...estado.parametros, ...accion.cambios } }
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
  }))
