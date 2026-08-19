/**
 * Mapa de taxonomias: del texto de la ficha a la clase del motor.
 *
 * Tres niveles que no se mezclan (Anexo C de la especificacion):
 *
 *   tipoFicha    valor crudo del desplegable — "Fondos mutuos", "Otro"
 *   assetClass   taxonomia granular que ve el cliente — "Money Market"
 *   claseModelo  las cinco clases del motor — fijo, variable, privados, inm, cash
 *
 * Esta tabla es el seed de `asset_class_map`, no una regla cerrada: la app
 * puede agregar filas y `clasificar` recibe el juego de reglas por argumento.
 *
 * Lo que no se reconoce no se inventa. Una posicion sin clase vuelve con
 * `claseModelo: null` y `requiereConfirmacion`, para que la pantalla de
 * revision la destaque; nunca cae en un cajon "Otros" en silencio, porque el
 * dinero mal clasificado desplaza el reparto entero.
 */

import type { ClaseModelo } from '@sabbi/core'

import { normalizar } from '../texto.js'

export interface ReglaTaxonomia {
  /** Texto normalizado que se busca dentro del campo. */
  readonly patron: string
  /** Donde busca: el nombre del producto o el tipo del desplegable. */
  readonly campo: 'nombre' | 'tipo'
  readonly assetClass: string
  readonly claseModelo: ClaseModelo
  /** Menor gana. Las reglas por nombre van antes que las de tipo. */
  readonly prioridad: number
  /**
   * `inferida` marca la regla que resuelve un tipo ambiguo — "Fondos mutuos"
   * puede ser money market, renta fija o renta variable — y obliga a que el
   * asesor confirme la clase antes de calcular.
   */
  readonly confianza: 'exacta' | 'inferida'
}

export interface EntradaClasificacion {
  readonly tipoFicha: string | null
  readonly nombre: string
}

export interface Clasificacion {
  readonly assetClass: string | null
  readonly claseModelo: ClaseModelo | null
  readonly requiereConfirmacion: boolean
  /** Patron que la resolvio. `null` cuando ninguna regla aplico. */
  readonly regla: string | null
}

const MONEY_MARKET = 'Money Market'
const BONOS = 'Bonos Públicos'
const ACCIONES = 'Acciones Públicas'
const CLUB_RE = 'Club Deals Real Estate'
const ALT_RE = 'Alternativos Real Estate'
const ALT_MAC = 'Alternativos Multi Asset Class'
const ALT_PE = 'Alternativos Private Equity'
const ALT_CREDITO = 'Alternativos Crédito Privado'
const NOTAS = 'Notas estructuradas'
const CRIPTO = 'Criptomonedas'
const ORO = 'Oro'

const porNombre = (
  patron: string,
  assetClass: string,
  claseModelo: ClaseModelo,
  prioridad = 20,
): ReglaTaxonomia => ({
  patron,
  campo: 'nombre',
  assetClass,
  claseModelo,
  prioridad,
  confianza: 'exacta',
})

const porTipo = (
  patron: string,
  assetClass: string,
  claseModelo: ClaseModelo,
  confianza: 'exacta' | 'inferida' = 'exacta',
): ReglaTaxonomia => ({
  patron,
  campo: 'tipo',
  assetClass,
  claseModelo,
  prioridad: 100,
  confianza,
})

/** Seed de `asset_class_map`. El orden no importa: manda `prioridad`. */
export const SEED_TAXONOMIA: readonly ReglaTaxonomia[] = [
  // ── Productos Sabbi y familias de privados, que el motor trata distinto ──
  porNombre('fondo oportunidad', ALT_MAC, 'privados', 10),
  porNombre('vision dividendos', ALT_MAC, 'privados', 10),
  // El Fondo Estrategico es el producto de flujos de la familia club.
  porNombre('fondo estrategico', CLUB_RE, 'club', 10),
  porNombre('edifica', CLUB_RE, 'club', 10),
  porNombre('club deal', CLUB_RE, 'club', 10),
  porNombre('cds-fed', CLUB_RE, 'club', 10),
  porNombre('re infra', ALT_RE, 'privados', 10),
  // La clase Otros: BTC via IBIT y oro, cada uno con su subclase.
  porNombre('ibit', CRIPTO, 'otros', 10),
  porNombre('bitcoin', CRIPTO, 'otros', 10),
  porNombre('btc', CRIPTO, 'otros', 12),
  porNombre('ethereum', CRIPTO, 'otros', 12),
  porNombre('cripto', CRIPTO, 'otros', 12),
  // "tesoro" contiene "oro": la regla de bonos del tesoro escuda a la del metal.
  porNombre('tesoro', BONOS, 'fijo', 15),
  porNombre('oro', ORO, 'otros', 25),
  porNombre('xau', ORO, 'otros', 25),
  porNombre('lingote', ORO, 'otros', 25),
  porNombre('prestamo directo', ALT_CREDITO, 'privados', 10),
  porNombre('deuda privada', ALT_CREDITO, 'privados', 10),
  porNombre('credito privado', ALT_CREDITO, 'privados', 10),
  porNombre('private credit', ALT_CREDITO, 'privados', 10),
  porNombre('venture capital', ALT_PE, 'privados', 10),
  porNombre('private equity', ALT_PE, 'privados', 10),
  porNombre('nota estructurada', NOTAS, 'fijo', 10),

  // ── ETFs: el subyacente manda sobre la envoltura ──
  porNombre('treasury', BONOS, 'fijo', 15),
  porNombre('corporate bond', BONOS, 'fijo', 15),
  porNombre('high yield', BONOS, 'fijo', 15),
  porNombre('bond', BONOS, 'fijo', 18),
  porNombre('s&p 500', ACCIONES, 'variable', 15),
  porNombre('msci', ACCIONES, 'variable', 15),
  porNombre('equity', ACCIONES, 'variable', 18),

  // ── Pistas de subtipo dentro del nombre ──
  porNombre('renta variable', ACCIONES, 'variable'),
  porNombre('acciones', ACCIONES, 'variable'),
  porNombre('renta fija', BONOS, 'fijo'),
  porNombre('bonos', BONOS, 'fijo'),
  porNombre('seguro con devolucion', BONOS, 'fijo'),
  porNombre('fondo universitario', BONOS, 'fijo'),
  porNombre('money market', MONEY_MARKET, 'cash'),
  porNombre('cts', MONEY_MARKET, 'cash'),
  porNombre('plazo fijo', MONEY_MARKET, 'cash'),
  porNombre('cuenta corriente', MONEY_MARKET, 'cash'),

  // ── Defaults del desplegable ──
  porTipo('deposito plazo fijo', MONEY_MARKET, 'cash'),
  porTipo('cuenta ahorros', MONEY_MARKET, 'cash'),
  porTipo('inversiones alternativas', ALT_PE, 'privados'),
  porTipo('fondos mutuos', MONEY_MARKET, 'cash', 'inferida'),
  porTipo('otro', MONEY_MARKET, 'cash', 'inferida'),
]

/** Resuelve tipo y nombre a asset class y clase del motor. */
export function clasificar(
  entrada: EntradaClasificacion,
  reglas: readonly ReglaTaxonomia[] = SEED_TAXONOMIA,
): Clasificacion {
  const nombre = normalizar(entrada.nombre)
  const tipo = normalizar(entrada.tipoFicha ?? '')

  const aplicables = reglas
    .filter((regla) => (regla.campo === 'nombre' ? nombre : tipo).includes(normalizar(regla.patron)))
    .sort((a, b) => a.prioridad - b.prioridad)

  const elegida = aplicables[0]
  if (elegida === undefined) {
    return { assetClass: null, claseModelo: null, requiereConfirmacion: true, regla: null }
  }

  return {
    assetClass: elegida.assetClass,
    claseModelo: elegida.claseModelo,
    requiereConfirmacion: elegida.confianza === 'inferida',
    regla: elegida.patron,
  }
}
