import { Benchmark } from '../../componentes/Benchmark'
import { Marco } from '../../componentes/Marco'
import { SinAsesor } from '../../componentes/SinAsesor'
import { matrizDeBenchmark } from '../../lib/benchmark'
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
export default async function Pagina() {
  const asesor = await asesorActual()
  if (asesor === null) return <SinAsesor />

  return (
    <Marco asesor={asesor} activo="benchmark" migas={[{ texto: 'Benchmark' }]}>
      <Benchmark matriz={matrizDeBenchmark()} />
    </Marco>
  )
}
