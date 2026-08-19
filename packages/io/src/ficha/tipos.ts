/**
 * Lo que produce el parser de la ficha patrimonial.
 *
 * Es la materia prima de la pantalla de revision: todo llega editable y nada
 * llega decidido. El parser no elige CTA, no empareja contra el catalogo y no
 * inventa una clase que no reconoce — esas tres cosas son del asesor o de un
 * paso posterior.
 */

import type { ClaseModelo, Cta, Plaza } from '@sabbi/core'

import type { Moneda } from './valores.js'

export type OrigenFicha = 'financiero' | 'inmueble'

export interface PosicionFicha {
  readonly orden: number
  readonly origen: OrigenFicha
  /** Fila 1-based de la hoja, para que un aviso apunte a algo verificable. */
  readonly fila: number
  readonly institucionProducto: string
  /** Valor crudo del desplegable. `null` en inmuebles, que no lo tienen. */
  readonly tipoFicha: string | null
  readonly assetClass: string | null
  readonly claseModelo: ClaseModelo | null
  /** La clase se infirio de un tipo ambiguo, o no se pudo resolver. */
  readonly requiereConfirmacion: boolean
  /** El emparejamiento contra el catalogo es un paso posterior. */
  readonly productoId: null
  readonly moneda: Moneda
  readonly plaza: Plaza
  readonly pertenencia: string | null
  readonly pctPertenencia: number
  /** Valor que entra al patrimonio: el declarado por el porcentaje propio. */
  readonly valorUsd: number
  readonly valorDeclaradoUsd: number
  readonly rendimientoEst: number | null
  readonly feePct: number | null
  readonly pais: string | null
  readonly alquilerMensualUsd: number | null
  readonly uso: string | null
  /** Un inmueble de uso propio queda fuera de todo calculo. */
  readonly esInvertible: boolean
  readonly cta: Cta
  readonly montoVentaParcial: number
  readonly editadoManualmente: boolean
}

export interface DeudaFicha {
  readonly orden: number
  readonly fila: number
  readonly nombre: string
  readonly pertenencia: string | null
  readonly valorUsd: number
  readonly plazoAnios: number | null
  readonly interesAnual: number | null
}

export type MotivoIgnorada = 'sin_valor' | 'sin_nombre'

export interface FilaIgnorada {
  readonly fila: number
  readonly origen: OrigenFicha | 'deuda'
  readonly institucionProducto: string
  readonly motivo: MotivoIgnorada
}

export type CodigoAviso =
  | 'rendimiento_dudoso'
  | 'moneda_desconocida'
  | 'clase_sin_resolver'
  | 'clase_inferida'
  | 'bloque_ausente'
  /** La app dio de alta un producto que el catalogo no conocia. */
  | 'producto_nuevo'
  /** El rendimiento no venia en la ficha y salio del catalogo. */
  | 'rendimiento_del_catalogo'

export interface Aviso {
  readonly codigo: CodigoAviso
  readonly mensaje: string
  readonly fila?: number
}

export interface DatosCliente {
  readonly nombre: string | null
  readonly horizonte: string | null
  readonly flujoActual: string | null
  readonly flujoRetiro: string | null
  /** Texto libre del final de la ficha, una entrada por linea escrita. */
  readonly observaciones: readonly string[]
}

export interface EntradaModelo {
  readonly etiqueta: string
  readonly usd: number | null
  readonly pct: number | null
}

/**
 * Bloque de portafolio modelo que algunas fichas traen pegado a la derecha.
 *
 * No entra en ningun calculo: se guarda para contrastarlo despues contra lo
 * que produce el motor y avisar si difieren.
 */
export interface PortafolioModelo {
  readonly perfil: string | null
  readonly montoMinimoEtfUsd: number | null
  readonly entradas: readonly EntradaModelo[]
}

export interface TotalesFicha {
  readonly financieroUsd: number
  readonly inmueblesRentaUsd: number
  readonly usoPropioUsd: number
  /** Ticket del motor: financiero mas inmuebles de renta. */
  readonly invertibleUsd: number
}

export interface FichaParseada {
  readonly hoja: string
  readonly cliente: DatosCliente
  readonly posiciones: readonly PosicionFicha[]
  readonly deudas: readonly DeudaFicha[]
  readonly ignoradas: readonly FilaIgnorada[]
  readonly avisos: readonly Aviso[]
  readonly totales: TotalesFicha
  readonly modelo: PortafolioModelo | null
}
