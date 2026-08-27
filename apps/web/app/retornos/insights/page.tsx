import { Marco } from '../../../componentes/Marco'
import { SinAsesor } from '../../../componentes/SinAsesor'
import { Insights } from '../../../componentes/retornos/Insights'
import { SinFondos } from '../../../componentes/retornos/SinFondos'
import { metricasDeFondos } from '../../../lib/datos/retornos'
import { asesorActual } from '../../../lib/supabase/servidor'

/**
 * Los comparativos entre fondos y entre clases.
 *
 * Sale de las mismas metricas que la tabla maestra — la misma llamada, el
 * mismo `calcularMetricas` — y no de una segunda cuenta. Si el ranking y la
 * tabla pudieran discrepar, uno de los dos estaria mintiendo y no habria forma
 * de saber cual.
 */
export default async function Pagina() {
  const asesor = await asesorActual()
  if (asesor === null) return <SinAsesor />

  const { metricas, riskFree, problema } = await metricasDeFondos()

  return (
    <Marco
      asesor={asesor}
      activo="retornos"
      migas={[{ texto: 'Retornos', ruta: '/retornos/fondos' }, { texto: 'Comparativos' }]}
    >
      {metricas.length === 0 ? (
        <SinFondos problema={problema} />
      ) : (
        <Insights metricas={metricas} riskFree={riskFree} />
      )}
    </Marco>
  )
}
