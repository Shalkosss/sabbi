import { armarMes, partirMes, rangoDeMeses } from '@sabbi/core'

import { Marco } from '../../../componentes/Marco'
import { SinAsesor } from '../../../componentes/SinAsesor'
import { NavRetornos } from '../../../componentes/retornos/NavRetornos'
import { CargaMensual } from '../../../componentes/retornos/CargaMensual'
import type { FondoParaCargar } from '../../../componentes/retornos/CargaMensual'
import { listarFondosConSerie, serieTreasury, ultimoMesCargado } from '../../../lib/datos/retornos'
import { asesorActual } from '../../../lib/supabase/servidor'

/**
 * La carga mensual.
 *
 * El mes por defecto es el siguiente al ultimo cargado, que es lo que alguien
 * viene a hacer el 99% de las veces. Se puede volver a cualquier mes anterior
 * para corregir: como no hay nada derivado guardado, corregir un NAV de 2023
 * arregla toda la fila de ese fondo sin ningun recalculo manual.
 */
export default async function Pagina({
  searchParams,
}: {
  readonly searchParams: Promise<{ readonly mes?: string }>
}) {
  const asesor = await asesorActual()
  if (asesor === null) return <SinAsesor />

  const [fondos, treasury] = await Promise.all([listarFondosConSerie(), serieTreasury()])
  const { mes: mesPedido } = await searchParams

  const ultimo = ultimoMesCargado(fondos)
  const siguiente = (mes: string): string => {
    const p = partirMes(mes)
    if (p === null) return mes
    return p.mes === 12 ? armarMes(p.anio + 1, 1) : armarMes(p.anio, p.mes + 1)
  }

  // Sin serie todavia, el mes por defecto es el actual. Es el unico lugar del
  // modulo que mira el reloj, y es de presentacion: el motor nunca lo hace.
  const ahora = new Date()
  const mesActual = armarMes(ahora.getUTCFullYear(), ahora.getUTCMonth() + 1)
  const porDefecto = ultimo === null ? mesActual : siguiente(ultimo)

  const mes =
    mesPedido !== undefined && partirMes(mesPedido) !== null ? mesPedido : porDefecto

  const primero = fondos
    .flatMap((f) => f.observaciones.map((o) => o.mes))
    .sort((a, b) => a.localeCompare(b))[0]

  /* De atras para adelante: el mes que se carga tiene que quedar arriba. */
  const disponibles = [...rangoDeMeses(primero ?? mes, [mes, porDefecto].sort().at(-1) ?? mes)]
    .reverse()

  const paraCargar: readonly FondoParaCargar[] = fondos
    .filter((f) => f.activo)
    .map((f) => {
      const observacion = f.observaciones.find((o) => o.mes === mes)
      return {
        id: Number(f.ficha.id),
        nombre: f.ficha.nombre,
        assetClass: f.ficha.assetClass,
        nav: observacion?.nav ?? null,
        retornoTotal: observacion?.retornoTotal ?? null,
      }
    })

  return (
    <Marco
      asesor={asesor}
      activo="retornos"
      migas={[{ texto: 'Retornos', ruta: '/retornos/fondos' }, { texto: 'Carga mensual' }]}
    >
      <NavRetornos />

      <CargaMensual
        mes={mes}
        mesesDisponibles={disponibles.length === 0 ? [mes] : disponibles}
        fondos={paraCargar}
        treasury={treasury.find((t) => t.mes === mes)?.cierre ?? null}
      />
    </Marco>
  )
}
