import { Benchmark } from '../../componentes/Benchmark'
import { Marco } from '../../componentes/Marco'
import { SinAsesor } from '../../componentes/SinAsesor'
import { matrizDeBenchmark, reglasDeLaUrl, vistaDeLaUrl } from '../../lib/benchmark'
import { asesorActual } from '../../lib/supabase/servidor'

/**
 * El universo del modelo.
 *
 * No depende de ninguna ficha ni de la base: es el motor corrido en vacío
 * contra cada ticket y cada perfil. Se arma en el servidor porque los pesos
 * del benchmark no bajan al navegador, y se recalcula en cada lectura para
 * que el día que la mesa toque la configuración esta vista lo muestre sin
 * que nadie tenga que subir una ficha de prueba.
 */
export default async function Pagina({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const asesor = await asesorActual()
  if (asesor === null) return <SinAsesor />

  // Las reglas viajan en la URL y no en el estado de la pantalla: así una
  // corrida se puede pegar en un mensaje y el otro ve exactamente la misma.
  const parametros = await searchParams

  return (
    <Marco asesor={asesor} activo="benchmark" migas={[{ texto: 'Benchmark' }]}>
      <Benchmark
        matriz={matrizDeBenchmark(reglasDeLaUrl(parametros), vistaDeLaUrl(parametros))}
      />
    </Marco>
  )
}
