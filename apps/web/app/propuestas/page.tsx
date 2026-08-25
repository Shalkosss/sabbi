import { Biblioteca } from '../../componentes/biblioteca/Biblioteca'
import { Marco } from '../../componentes/Marco'
import { SinAsesor } from '../../componentes/SinAsesor'
import { listarPropuestas } from '../../lib/datos/biblioteca'
import { asesorActual } from '../../lib/supabase/servidor'
import { salir } from '../ingresar/acciones'
import estilos from '../page.module.css'

/**
 * La biblioteca compartida.
 *
 * Es la contraparte de la pantalla de fichas: ahí está lo que uno subió, acá
 * está lo que el equipo armó. Se lee entera en el servidor y baja ya filtrada
 * por RLS, que es el único control de acceso: la política dice que cualquier
 * asesor autenticado lee todo, y esta pantalla es la que por fin lo aprovecha.
 */
export default async function Pagina() {
  const asesor = await asesorActual()
  if (asesor === null) return <SinAsesor />

  const propuestas = await listarPropuestas()
  const publicadas = propuestas.filter((propuesta) => propuesta.publicada).length

  return (
    <Marco
      asesor={asesor}
      activo="propuestas"
      migas={[{ texto: 'Propuestas' }]}
      acciones={
        <form action={salir}>
          <button type="submit" className="secundario">
            Salir
          </button>
        </form>
      }
    >
      <div className={estilos.pagina}>
        <header className={estilos.encabezado}>
          <p className="eyebrow">Biblioteca del equipo</p>
          <h1>Todo lo que Sabbi tiene armado</h1>
          <p className={estilos.detalle}>
            Las propuestas de todos, no solo las tuyas. Un <b>borrador</b> se recalcula cada vez
            que se abre, con la ficha y la macro de hoy. Una <b>publicada</b> quedó congelada el
            día que salió: sus cifras son las que el cliente tiene, y no se mueven aunque después
            cambie el catálogo o la macro.
          </p>
        </header>

        <Biblioteca propuestas={propuestas} />

        <p className={estilos.pie}>
          {propuestas.length === 0
            ? 'La lista se llena sola: cada ficha que se sube abre su propuesta.'
            : `${publicadas} de ${propuestas.length} ya salieron hacia un cliente.`}
        </p>
      </div>
    </Marco>
  )
}
