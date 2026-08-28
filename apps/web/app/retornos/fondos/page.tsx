import { Marco } from '../../../componentes/Marco'
import { SinAsesor } from '../../../componentes/SinAsesor'
import { SinRetornos } from '../../../componentes/retornos/SinRetornos'
import { TablaFondos } from '../../../componentes/retornos/TablaFondos'
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
 */
export default async function Pagina() {
  const asesor = await asesorActual()
  if (asesor === null) return <SinAsesor />

  const [{ metricas, riskFree, ultimoMes, sinTreasury, falta }, clases] = await Promise.all([
    metricasDeFondos(),
    clasesDeFondos(),
  ])

  return (
    <Marco
      asesor={asesor}
      activo="retornos"
      migas={[{ texto: 'Retornos' }, { texto: 'Fondos' }]}
    >
      {/*
        Vacía se explica, no se constata. Los tres motivos por los que esta
        pantalla puede no tener nada que mostrar piden cosas distintas, y
        decirlos todos «todavía no hay fondos cargados» mandaba a la mesa a
        cargar a mano una serie que el libro ya trae entera.
      */}
      {falta !== null ? (
        <SinRetornos falta={falta} />
      ) : (
        <>
          <p style={{ padding: '20px 26px 0', fontSize: 13, color: 'var(--tinta-3)' }}>
            Último mes con datos: {mesLargo(ultimoMes)}.
          </p>
          <TablaFondos
            metricas={metricas}
            clases={clases}
            riskFree={riskFree}
            sinTreasury={sinTreasury}
          />
        </>
      )}
    </Marco>
  )
}
