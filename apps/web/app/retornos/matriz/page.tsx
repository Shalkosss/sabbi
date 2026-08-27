import { armarMes, rangoDeMeses } from '@sabbi/core'

import { Marco } from '../../../componentes/Marco'
import { SinAsesor } from '../../../componentes/SinAsesor'
import { NavRetornos } from '../../../componentes/retornos/NavRetornos'
import { Matriz } from '../../../componentes/retornos/Matriz'
import type { ColumnaFondo, CeldaCargada } from '../../../componentes/retornos/Matriz'
import { clasesDeFondos, listarFondosConSerie, serieTreasury, ultimoMesCargado } from '../../../lib/datos/retornos'
import { asesorActual } from '../../../lib/supabase/servidor'

/**
 * La hoja, pero viva.
 *
 * `Distributivos` se cargaba y se leia en la misma grilla: los meses bajando y
 * los fondos al costado. La primera version de esta app partio eso en dos —
 * una tabla de metricas que no deja tocar nada y una pantalla de carga que
 * solo ve un mes — y con eso perdio lo unico que la hoja hacia bien: ver la
 * serie entera y corregirla donde esta el error.
 *
 * Acá vuelve entera, y con lo que el Excel no podia dar: la celda se pinta
 * segun cuanto se aparta, el mes trae su mediana al lado, y guardar reescribe
 * solo las celdas que alguien toco.
 */
export default async function Pagina() {
  const asesor = await asesorActual()
  if (asesor === null) return <SinAsesor />

  const [fondos, clases, treasury] = await Promise.all([
    listarFondosConSerie(),
    clasesDeFondos(),
    serieTreasury(),
  ])

  const ultimo = ultimoMesCargado(fondos)

  // El mes en curso entra aunque nadie lo haya cargado: es la fila que alguien
  // viene a llenar, y si no existe no hay donde escribir el mes nuevo.
  const ahora = new Date()
  const mesActual = armarMes(ahora.getUTCFullYear(), ahora.getUTCMonth() + 1)
  const hasta = ultimo === null || ultimo < mesActual ? mesActual : ultimo

  const primero = fondos
    .flatMap((f) => f.observaciones.map((o) => o.mes))
    .sort((a, b) => a.localeCompare(b))[0]

  /* Del mes mas reciente al mas viejo: se carga y se corrige por arriba. */
  const meses = [...rangoDeMeses(primero ?? hasta, hasta)].reverse()

  const columnas: readonly ColumnaFondo[] = fondos.map((f) => ({
    id: Number(f.ficha.id),
    nombre: f.ficha.nombre,
    assetClass: f.ficha.assetClass,
    esReferencia: f.ficha.esReferencia,
    activo: f.activo,
  }))

  const celdas: readonly CeldaCargada[] = fondos.flatMap((f) =>
    f.observaciones.map((o) => ({
      fondoId: Number(f.ficha.id),
      mes: o.mes,
      nav: o.nav,
      retorno: o.retornoTotal,
    })),
  )

  return (
    <Marco
      asesor={asesor}
      activo="retornos"
      migas={[{ texto: 'Retornos', ruta: '/retornos/fondos' }, { texto: 'Matriz' }]}
    >
      <NavRetornos />

      <Matriz
        columnas={columnas}
        meses={meses}
        celdas={celdas}
        clases={clases}
        treasury={treasury}
      />
    </Marco>
  )
}
