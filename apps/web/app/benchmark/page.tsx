import { Benchmark } from '../../componentes/Benchmark'
import { Marco } from '../../componentes/Marco'
import { SinAsesor } from '../../componentes/SinAsesor'
import {
  matrizDeBenchmark,
  miradaDeLaUrl,
  perfilesDeLaUrl,
  reglasDeLaUrl,
} from '../../lib/benchmark'
import { macroActiva } from '../../lib/datos/macro'
import { asesorActual } from '../../lib/supabase/servidor'

/**
 * El universo del modelo.
 *
 * No depende de ninguna ficha ni de la base de clientes: es el motor corrido
 * en vacío contra cada ticket y cada perfil, con la macro que la mesa tiene
 * guardada. Se arma en el servidor porque los pesos del benchmark no bajan al
 * navegador, y se recalcula en cada lectura para que el día que alguien toque
 * la macro esta vista lo muestre sin que nadie suba una ficha de prueba.
 */
export default async function Pagina({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const asesor = await asesorActual()
  if (asesor === null) return <SinAsesor />

  // Las reglas y los perfiles viajan en la URL y no en el estado de la
  // pantalla: así una corrida se puede pegar en un mensaje y el otro ve
  // exactamente la misma.
  const [parametros, activa] = await Promise.all([searchParams, macroActiva()])

  return (
    <Marco asesor={asesor} activo="benchmark" migas={[{ texto: 'Benchmark' }]}>
      <Benchmark
        matriz={matrizDeBenchmark(
          activa.macro,
          reglasDeLaUrl(parametros, activa.macro),
          perfilesDeLaUrl(parametros),
          miradaDeLaUrl(parametros),
          activa.esDeFabrica,
        )}
        problemaDeMacro={activa.problema}
      />
    </Marco>
  )
}
