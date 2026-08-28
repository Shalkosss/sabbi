import { Agenda } from '../../componentes/agenda/Agenda'
import { Marco } from '../../componentes/Marco'
import { SinAsesor } from '../../componentes/SinAsesor'
import { diaEnLima } from '../../lib/agenda'
import { cargarAgenda } from '../../lib/datos/agenda'
import { asesorActual } from '../../lib/supabase/servidor'

/**
 * La agenda de entregas.
 *
 * Cada ficha subida abre una ruta de cuatro días hábiles, y el calendario es
 * esa ruta puesta sobre el mes: el portafolio al primer día, el PPT al
 * segundo, la revisión de la mesa al tercero y la entrega al cuarto.
 *
 * Las cinco fechas son un cálculo puro sobre el día en que se subió la ficha,
 * y la pantalla lo corre sobre la marcha. Lo único que no puede correr en el
 * navegador es `hoy`: depende del reloj y de la zona horaria de quien mira, y
 * resolverlo ahí haría que el servidor y el cliente pinten calendarios
 * distintos. Entra una sola vez, desde Lima, y baja como dato.
 *
 * La agenda es del equipo entero, y marcar un hito también: si la ficha la
 * trabaja cualquiera, decir que ese trabajo está hecho también. Antes era del
 * dueño de la ficha o de un admin, y eso dejaba media agenda en solo lectura
 * justo para quien había hecho el trabajo.
 */
export default async function Pagina() {
  const asesor = await asesorActual()
  if (asesor === null) return <SinAsesor />

  const { fichas, sinTablaDeHitos } = await cargarAgenda()

  return (
    <Marco asesor={asesor} activo="agenda" migas={[{ texto: 'Agenda' }]}>
      <Agenda
        fichas={fichas}
        hoy={diaEnLima(new Date())}
        sinTablaDeHitos={sinTablaDeHitos}
      />
    </Marco>
  )
}
