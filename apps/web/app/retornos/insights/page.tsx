import { Marco } from '../../../componentes/Marco'
import { SinAsesor } from '../../../componentes/SinAsesor'
import { NavRetornos } from '../../../componentes/retornos/NavRetornos'
import { Insights } from '../../../componentes/retornos/Insights'
import { SinRetornos } from '../../../componentes/retornos/SinRetornos'
import { metricasDeFondos, diagnosticar } from '../../../lib/datos/retornos'
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

  const { metricas, riskFree, fondos } = await metricasDeFondos()
  const falta = diagnosticar(fondos)

  return (
    <Marco
      asesor={asesor}
      activo="retornos"
      migas={[{ texto: 'Retornos', ruta: '/retornos/fondos' }, { texto: 'Comparativos' }]}
    >
      <NavRetornos />

      {falta !== null ? (
        <SinRetornos falta={falta} />
      ) : (
        <Insights metricas={metricas} riskFree={riskFree} />
      )}
    </Marco>
  )
}
