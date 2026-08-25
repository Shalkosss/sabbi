/**
 * La cascada por tramos de Mercados Privados y Club Deals.
 *
 * Port de `PlanificarPrivados` de la macro Benchmark Sabbi v4. Es la
 * diferencia mas grande entre las dos versiones del modelo, y no es un
 * numero: es quien decide.
 *
 * En la v8 cada clase se queda con lo que su peso de benchmark le dio, y si a
 * Club Deals le toco menos que su minimo ese dinero cae al destino de
 * residuos. En la v4 las dos clases comparten un solo monto —el club es un
 * producto dentro de privados que se muestra en su propia seccion— y son los
 * minimos los que deciden que vehiculo llega a existir:
 *
 *  - **Debajo del minimo del fondo.** El Fondo Oportunidad no se puede abrir,
 *    asi que todo va al club deal. Si tampoco alcanza para el club, no hay
 *    vehiculo posible y el dinero se devuelve a mercados publicos.
 *  - **Entre ese minimo y la suma de los dos.** Alcanza para el fondo pero no
 *    para los dos: todo al fondo. Partirlo dejaria al club sin ticket.
 *  - **Por encima.** Conviven. Cada uno toma su minimo y el sobrante se parte
 *    segun el peso de benchmark que cada uno traia.
 *
 * Cash nunca participa: no es destino de dinero que busca retorno.
 *
 * La funcion es aritmetica pura sobre montos. Que el dinero devuelto llegue a
 * Renta Fija y Renta Variable, y que el reparto por clase se corrija para que
 * siga cuadrando, lo hace el ensamblador del plan — es lo unico que cruza
 * clases y no puede vivir aca dentro.
 */

const EPS = 1e-6

export interface OpcionesTramos {
  /** Minimo para que el Fondo Oportunidad exista. */
  readonly minOportunidadUsd: number
  /** Minimo para que el club deal abra linea propia. */
  readonly minClubUsd: number
}

export interface RepartoTramos {
  /** Lo que se queda Club Deals. */
  readonly clubUsd: number
  /** Lo que se queda Mercados Privados. */
  readonly privadosUsd: number
  /** Lo que ningun vehiculo privado puede tomar y vuelve a publicos. */
  readonly aPublicosUsd: number
  /** El tramo que decidio, para poder decirlo en un aviso. */
  readonly tramo: 'sin_monto' | 'sin_club' | 'solo_club' | 'solo_fondo' | 'ambos'
}

/**
 * Reparte entre el club deal y el Fondo Oportunidad el dinero nuevo de las dos
 * clases juntas.
 *
 * @param librePrivadosUsd dinero nuevo de Mercados Privados
 * @param libreClubUsd     dinero nuevo de Club Deals, que fija su peso relativo
 */
export function repartirPorTramos(
  librePrivadosUsd: number,
  libreClubUsd: number,
  opciones: OpcionesTramos,
): RepartoTramos {
  const { minOportunidadUsd, minClubUsd } = opciones

  const total = Math.max(0, librePrivadosUsd) + Math.max(0, libreClubUsd)
  if (total <= EPS) {
    return { clubUsd: 0, privadosUsd: 0, aPublicosUsd: 0, tramo: 'sin_monto' }
  }

  // Lo que le tocaria al club si no hubiera minimos. Es su peso de benchmark
  // dentro del monto compartido, y es lo que despues parte el sobrante.
  const objetivoClub = Math.min(Math.max(0, libreClubUsd), total)
  const pesoClub = objetivoClub / total

  // El benchmark de este perfil no contempla club deals. El unico destino
  // posible es el fondo, y si no llega a su minimo el dinero vuelve a
  // publicos: no hay un club al que mandarlo.
  if (objetivoClub <= EPS) {
    return total >= minOportunidadUsd - EPS
      ? { clubUsd: 0, privadosUsd: total, aPublicosUsd: 0, tramo: 'solo_fondo' }
      : { clubUsd: 0, privadosUsd: 0, aPublicosUsd: total, tramo: 'sin_club' }
  }

  // Tramo 1: el fondo no puede existir, asi que todo al club. Si tampoco
  // alcanza para el club, no hay vehiculo y el dinero se devuelve.
  if (total < minOportunidadUsd - EPS) {
    return total >= minClubUsd - EPS
      ? { clubUsd: total, privadosUsd: 0, aPublicosUsd: 0, tramo: 'solo_club' }
      : { clubUsd: 0, privadosUsd: 0, aPublicosUsd: total, tramo: 'sin_club' }
  }

  // Tramo 2: alcanza para el fondo pero no para los dos. Partirlo dejaria al
  // club por debajo de su ticket, asi que el fondo se lo lleva entero.
  if (total < minOportunidadUsd + minClubUsd - EPS) {
    return { clubUsd: 0, privadosUsd: total, aPublicosUsd: 0, tramo: 'solo_fondo' }
  }

  // Tramo 3: conviven. Cada uno toma su minimo y el sobrante se parte segun el
  // peso que cada uno traia del benchmark.
  const sobrante = total - (minOportunidadUsd + minClubUsd)
  return {
    clubUsd: minClubUsd + sobrante * pesoClub,
    privadosUsd: minOportunidadUsd + sobrante * (1 - pesoClub),
    aPublicosUsd: 0,
    tramo: 'ambos',
  }
}
