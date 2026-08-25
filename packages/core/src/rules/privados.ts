/**
 * Reparto de Mercados Privados y su club deal.
 *
 * Port de `PlanificarPrivados` y de la parte de subfondos de
 * `ProcesarPrivadosYOtros` de la macro v4.
 *
 * En la hoja, el club deal es una fila DENTRO de Mercados Privados: consume el
 * benchmark de esa clase y se presenta como seccion propia. Aqui son dos
 * clases del modelo —`privados` y `club`— pero el reparto se decide sobre el
 * dinero de las dos juntas, que es lo que hace la macro. Partirlo en dos
 * decisiones independientes daria otro portafolio.
 *
 * Tres tramos, por el monto libre de la clase:
 *
 *   L < minFondo                    el fondo no existe: todo al club deal, y
 *                                   si el club tampoco llega a su minimo, el
 *                                   dinero se va a Mercados Publicos
 *   minFondo <= L < minFondo+minClub alcanza para uno solo: todo al fondo
 *   L >= minFondo + minClub          conviven: cada uno toma su minimo y el
 *                                   sobrante se reparte por peso de benchmark
 *
 * Que el dinero pueda VOLVER a Mercados Publicos es la parte que sorprende, y
 * es deliberada: un monto que no alcanza para ningun vehiculo privado no se
 * queda parado en una clase que no lo puede colocar.
 *
 * Los subfondos institucionales se evaluan por separado contra su minimo. Con
 * que uno califique se abre, y el monto de los que no califican se reparte
 * entre los que si, a prorrata de su peso. Si ninguno llega, todo se queda en
 * el Fondo Oportunidad.
 */

import type { Perfil } from '../domain/tipos.js'
import { aperturaFm } from './institucional.js'
import type { EstadoInstitucional } from './institucional.js'

const EPS = 1e-6
const TOL = 0.01

export const FONDO_OPORTUNIDAD = 'Sabbi Fondo Oportunidad'
export const FONDO_RE_INFRA = 'FM RE Infra'
export const FONDO_PRIVATE_CREDIT = 'FM PC'
export const FONDO_PE_VC = 'FM PE VC'

/** Destino de flujos de la clase. Mensual, 6.65% o 7.25%. */
export const FONDO_DIVIDENDOS_GLOBAL = 'Fondo Visión Dividendos Global'

/** Unico producto de la familia club que paga flujos. Trimestral, 8.25%. */
export const FONDO_ESTRATEGICO = 'Sabbi Fondo Estratégico'

/**
 * Nota que arrastra todo fondo institucional.
 *
 * El motor no usa el umbral institucional como compuerta: abre el split y
 * estampa la nota, que traslada la decision al asesor. Solo un forzado manual
 * la saca — o cierra el split entero.
 */
export const NOTA_INSTITUCIONAL =
  'Disponible solo para clientes Institucionales; caso contrario, asignar a Sabbi Fondo Oportunidad.'

/**
 * Nombre de la etiqueta del club deal segun el monto.
 *
 * No decide si el club entra: solo como se llama.
 */
export function etiquetaClubDeal(montoUsd: number, umbralClaseAUsd: number): string {
  return montoUsd >= umbralClaseAUsd
    ? 'Fondo Edifica Diversificado Clase A'
    : 'Fondo Edifica Diversificado Clase B'
}

export interface UmbralesPrivados {
  readonly minFondoUsd: number
  readonly minClubUsd: number
  readonly minSubfondoUsd: number
  readonly umbralClaseAUsd: number
}

export interface PlanPrivados {
  /** Monto que abre el club deal. Cero cuando no abre. */
  readonly clubUsd: number
  /** Monto que queda en la familia del Fondo Oportunidad. */
  readonly fondoUsd: number
  /**
   * Monto que ninguna de las dos pudo tomar y vuelve a Mercados Publicos.
   *
   * Es la valvula de la regla: dinero que no alcanza para ningun vehiculo
   * privado no se queda parado en una clase que no lo puede colocar.
   */
  readonly aPublicosUsd: number
}

export interface OpcionesPlan {
  /** Dinero nuevo de las dos clases juntas: privados mas club. */
  readonly libreUsd: number
  /**
   * Lo que le tocaria al club deal si no hubiera minimos.
   *
   * Su peso de benchmark mas la parte del inmobiliario que se derivo aqui.
   */
  readonly objetivoClubUsd: number
  readonly umbrales: UmbralesPrivados
}

/**
 * Decide cuanto abre el club deal y cuanto queda en el fondo.
 *
 * Se resuelve ANTES de repartir los ETFs porque puede devolver monto hacia
 * Mercados Publicos, y ese monto tiene que entrar a la cascada.
 */
export function planificarPrivados(opciones: OpcionesPlan): PlanPrivados {
  const { libreUsd, umbrales } = opciones
  const { minFondoUsd, minClubUsd } = umbrales

  const vacio: PlanPrivados = { clubUsd: 0, fondoUsd: 0, aPublicosUsd: 0 }
  if (libreUsd <= EPS) return vacio

  const objetivoClub = Math.min(Math.max(opciones.objetivoClubUsd, 0), libreUsd)
  const pesoClub = objetivoClub / libreUsd

  // El benchmark no contempla club deals en este perfil.
  if (objetivoClub <= EPS) {
    return libreUsd >= minFondoUsd - TOL
      ? { clubUsd: 0, fondoUsd: libreUsd, aPublicosUsd: 0 }
      : { clubUsd: 0, fondoUsd: 0, aPublicosUsd: libreUsd }
  }

  // TRAMO 1: el fondo no puede existir, asi que todo se juega al club deal.
  if (libreUsd < minFondoUsd - TOL) {
    return libreUsd >= minClubUsd - TOL
      ? { clubUsd: libreUsd, fondoUsd: 0, aPublicosUsd: 0 }
      : { clubUsd: 0, fondoUsd: 0, aPublicosUsd: libreUsd }
  }

  // TRAMO 2: alcanza para el fondo pero no para los dos.
  if (libreUsd < minFondoUsd + minClubUsd - TOL) {
    return { clubUsd: 0, fondoUsd: libreUsd, aPublicosUsd: 0 }
  }

  // TRAMO 3: conviven. Cada uno toma su minimo y el sobrante se reparte segun
  // el peso de benchmark de cada vehiculo.
  const sobrante = libreUsd - (minFondoUsd + minClubUsd)
  return {
    clubUsd: minClubUsd + sobrante * pesoClub,
    fondoUsd: minFondoUsd + sobrante * (1 - pesoClub),
    aPublicosUsd: 0,
  }
}

export interface LineaPrivados {
  readonly instrumento: string
  readonly usd: number
  readonly nota?: string
}

export interface OpcionesFondo {
  readonly perfil: Perfil
  /**
   * Toggle de flujos de la propuesta. Con el activo ningun fondo mutuo recibe
   * dinero: los FM son iliquidos y no distribuyen.
   */
  readonly necesitaFlujos?: boolean
  /** Check institucional de la propuesta. Por defecto `auto`. */
  readonly institucional?: EstadoInstitucional
  readonly minSubfondoUsd: number
}

/** Split del Fondo Oportunidad entre los tres institucionales, por perfil. */
function splitInstitucional(perfil: Perfil): Readonly<Record<string, number>> {
  return perfil === 'Arriesgado'
    ? { [FONDO_RE_INFRA]: 0, [FONDO_PRIVATE_CREDIT]: 0.3, [FONDO_PE_VC]: 0.7 }
    : { [FONDO_RE_INFRA]: 0.5, [FONDO_PRIVATE_CREDIT]: 0.5, [FONDO_PE_VC]: 0 }
}

/**
 * Abre la familia del Fondo Oportunidad en sus subfondos.
 *
 * Cada subfondo se evalua POR SEPARADO contra el minimo. Con que uno califique
 * se abre, y el monto de los que no califican se le suma a prorrata de su
 * peso. Si ninguno califica, todo queda en el Fondo Oportunidad — que no tiene
 * minimo y por eso es el destino residual de la clase.
 */
export function repartirFondo(montoUsd: number, opciones: OpcionesFondo): LineaPrivados[] {
  const { perfil, necesitaFlujos = false, institucional = 'auto', minSubfondoUsd } = opciones
  if (montoUsd <= EPS) return []

  // Los FM no distribuyen. Con flujos activos el split ni se evalua.
  if (necesitaFlujos) return [{ instrumento: FONDO_DIVIDENDOS_GLOBAL, usd: montoUsd }]

  const apertura = aperturaFm(institucional)
  if (apertura === 'cerrada') return [{ instrumento: FONDO_OPORTUNIDAD, usd: montoUsd }]

  const split = splitInstitucional(perfil)
  const califica = Object.entries(split).filter(
    ([, peso]) => peso > 0 && montoUsd * peso >= minSubfondoUsd - TOL,
  )

  if (califica.length === 0) return [{ instrumento: FONDO_OPORTUNIDAD, usd: montoUsd }]

  // Los que no califican reparten su monto entre los que si, a prorrata.
  const pesoQuePasa = califica.reduce((acc, [, peso]) => acc + peso, 0)

  return califica.map(([instrumento, peso]) => ({
    instrumento,
    usd: (montoUsd * peso) / pesoQuePasa,
    // Confirmado por el asesor, el disclaimer sobra.
    ...(apertura === 'con-nota' ? { nota: NOTA_INSTITUCIONAL } : {}),
  }))
}

/**
 * La linea del club deal, ya decidido su monto.
 *
 * Con flujos activos el destino no es Edifica: Sabbi Fondo Estrategico es el
 * unico de la familia que distribuye.
 */
export function lineaClub(
  montoUsd: number,
  opciones: { readonly necesitaFlujos?: boolean; readonly umbralClaseAUsd: number },
): LineaPrivados | null {
  if (montoUsd <= EPS) return null

  return {
    instrumento:
      opciones.necesitaFlujos === true
        ? FONDO_ESTRATEGICO
        : etiquetaClubDeal(montoUsd, opciones.umbralClaseAUsd),
    usd: montoUsd,
  }
}
