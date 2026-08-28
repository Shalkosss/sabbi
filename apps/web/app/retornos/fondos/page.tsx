import { Marco } from '../../../componentes/Marco'
import { SinAsesor } from '../../../componentes/SinAsesor'
import { SinRetornos } from '../../../componentes/retornos/SinRetornos'
import { NavRetornos } from '../../../componentes/retornos/NavRetornos'
import { TablaFondos } from '../../../componentes/retornos/TablaFondos'
import type { SerieDeFondo } from '../../../componentes/retornos/TablaFondos'
import { clasesDeFondos, metricasDeFondos } from '../../../lib/datos/retornos'
import { mesLargo } from '../../../lib/formato'
import { asesorActual } from '../../../lib/supabase/servidor'

/**
 * La tabla maestra de retornos.
 *
 * Es la hoja `Distributivos` sin las formulas. Nada de lo que se ve acá esta
 * guardado: cada metrica se calcula al abrir la pantalla, sobre la serie que
 * la mesa cargo. Por eso corregir un NAV de hace seis meses arregla las
 * treinta columnas de esa fila y no deja nada viejo atras.
 *
 * La serie completa viaja con las metricas, y no es un lujo: son ~60 fondos
 * por ~100 meses, unos pocos miles de numeros. Con ella la tabla dibuja la
 * forma de cada fondo en su fila y el panel de detalle abre sin un segundo
 * viaje al servidor — que es la diferencia entre mirar un fondo y esperar por
 * un fondo.
 */
export default async function Pagina() {
  const asesor = await asesorActual()
  if (asesor === null) return <SinAsesor />

  const [{ metricas, riskFree, ultimoMes, sinTreasury, fondos, falta }, clases] = await Promise.all([
    metricasDeFondos(),
    clasesDeFondos(),
  ])

  const series: readonly SerieDeFondo[] = fondos.map((f) => ({
    fondoId: f.ficha.id,
    observaciones: f.observaciones,
  }))

  return (
    <Marco
      asesor={asesor}
      activo="retornos"
      migas={[{ texto: 'Retornos' }, { texto: 'Fondos' }]}
    >
      <NavRetornos />

      {falta !== null ? (
        <SinRetornos falta={falta} />
      ) : (
        <>
          <p style={{ padding: '18px 26px 0', fontSize: 13, color: 'var(--tinta-3)' }}>
            Último mes con datos: {mesLargo(ultimoMes)}.
          </p>
          <TablaFondos
            metricas={metricas}
            series={series}
            clases={clases}
            riskFree={riskFree}
            sinTreasury={sinTreasury}
          />
        </>
      )}
    </Marco>
  )
}
