import { Allocation } from '../../componentes/allocation/Allocation'
import { Marco } from '../../componentes/Marco'
import { SinAsesor } from '../../componentes/SinAsesor'
import { armarVista, asignacionDeLaUrl, mezclaDeLaUrl, perfilDeLaUrl } from '../../lib/allocation'
import { datosDeAllocation } from '../../lib/datos/allocation'
import { asesorActual } from '../../lib/supabase/servidor'
import estilos from '../../componentes/allocation/Allocation.module.css'

/**
 * Cuánto cambia un portafolio clásico al meterle alternativos.
 *
 * No sale de ninguna ficha: son dos portafolios teóricos —el 60/40 del perfil
 * y el mismo con un porcentaje de alternativos— medidos contra las series de
 * índices que la mesa ya carga en Retornos. Es la conversación que el asesor
 * tiene en cada reunión y que hasta hoy salía de un Excel sin versionar.
 *
 * Se arma en el servidor porque las series no bajan al navegador: lo que baja
 * son los dos portafolios ya medidos. Y se recalcula en cada lectura, así que
 * el mes que alguien cargue una observación nueva esta pantalla lo muestra sin
 * que nadie toque nada.
 */
export default async function Pagina({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const asesor = await asesorActual()
  if (asesor === null) return <SinAsesor />

  const [parametros, datos] = await Promise.all([searchParams, datosDeAllocation()])

  // Sin tablas no hay pantalla. Decirlo es mejor que dibujar dos donas vacías
  // y una tabla de guiones, que se lee como un portafolio que no rinde nada.
  if (datos.clases.length === 0) {
    return (
      <Marco asesor={asesor} activo="allocation" migas={[{ texto: 'Allocation' }]}>
        <p className={estilos.problema}>
          Falta aplicar la migración <code>0021_allocation_de_alternativos.sql</code>: la base
          todavía no tiene los repartos por perfil ni las mezclas de alternativos.
        </p>
      </Marco>
    )
  }

  const vista = armarVista(
    datos,
    perfilDeLaUrl(parametros),
    mezclaDeLaUrl(parametros, datos),
    asignacionDeLaUrl(parametros),
  )

  return (
    <Marco asesor={asesor} activo="allocation" migas={[{ texto: 'Allocation' }]}>
      <Allocation vista={vista} referencias={datos.referencias} />
    </Marco>
  )
}
