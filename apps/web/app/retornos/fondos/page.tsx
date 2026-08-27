import { Marco } from '../../../componentes/Marco'
import { SinAsesor } from '../../../componentes/SinAsesor'
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

  const [{ metricas, riskFree, ultimoMes }, clases] = await Promise.all([
    metricasDeFondos(),
    clasesDeFondos(),
  ])

  return (
    <Marco
      asesor={asesor}
      activo="retornos"
      migas={[{ texto: 'Retornos' }, { texto: 'Fondos' }]}
    >
      {metricas.length === 0 ? (
        <p style={{ padding: '28px 26px', color: 'var(--tinta-3)' }}>
          Todavía no hay fondos cargados. Se dan de alta desde la carga mensual.
        </p>
      ) : (
        <>
          <p style={{ padding: '20px 26px 0', fontSize: 13, color: 'var(--tinta-3)' }}>
            Último mes con datos: {mesLargo(ultimoMes)}.
          </p>
          <TablaFondos metricas={metricas} clases={clases} riskFree={riskFree} />
        </>
      )}
    </Marco>
  )
}
