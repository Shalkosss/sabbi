import { ListaDeFichas } from '../componentes/ListaDeFichas'
import { Marco } from '../componentes/Marco'
import { SinAsesor } from '../componentes/SinAsesor'
import { SubirFicha } from '../componentes/SubirFicha'
import { listarFichas } from '../lib/datos/fichas'
import { asesorActual } from '../lib/supabase/servidor'
import { salir } from './ingresar/acciones'
import estilos from './page.module.css'

/**
 * Entrada de la app.
 *
 * El proxy ya garantizó que hay sesión; lo que falta comprobar es que esa
 * sesión corresponda a un asesor de la tabla `advisors`. Sin esa fila las
 * políticas RLS no dejan escribir nada, así que conviene decirlo de frente
 * antes de que alguien cargue una ficha y la pierda.
 */
export default async function Pagina() {
  const asesor = await asesorActual()

  if (asesor === null) return <SinAsesor />

  const fichas = await listarFichas()

  return (
    <Marco
      asesor={asesor}
      activo="fichas"
      migas={[{ texto: 'Fichas' }]}
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
          <p className="eyebrow">Paso 1 de 3</p>
          <h1>Subí la ficha patrimonial</h1>
          <p className={estilos.detalle}>
            El .xlsx que llena el cliente. Sale de acá con sus posiciones en una tabla, lista para
            corregir lo que venga mal antes de calcular nada.
          </p>
        </header>

        <SubirFicha />

        {fichas.length > 0 && (
          <section className={estilos.seccion} aria-labelledby="fichas-guardadas">
            <h2 id="fichas-guardadas">Fichas que cargaste</h2>
            <p className={estilos.pie}>
              La revisión se guarda sola: cada una vuelve a abrirse donde la dejaste.
            </p>
            <ListaDeFichas fichas={fichas} />
          </section>
        )}
      </div>
    </Marco>
  )
}
