import { salir } from '../app/ingresar/acciones'
import estilos from '../app/page.module.css'

/**
 * Sesión válida sin ficha de asesor.
 *
 * Pasa cuando alguien tiene cuenta en Supabase Auth pero nadie lo dio de alta
 * en `advisors`. Podría leer, pero no escribir nada: las políticas piden esa
 * fila. Mejor decirlo acá que dejarlo descubrir al guardar.
 */
export function SinAsesor() {
  return (
    <main className={estilos.pagina}>
      <header className={estilos.encabezado}>
        <div>
          <p className="eyebrow">Cuenta sin dar de alta</p>
          <h1>Falta un paso</h1>
          <p className={estilos.detalle}>
            Tu cuenta existe, pero todavía no está enlazada a un asesor de Sabbi. Pedile al admin
            que te agregue y volvé a entrar.
          </p>
        </div>
        <form action={salir}>
          <button type="submit" className="secundario">
            Salir
          </button>
        </form>
      </header>
    </main>
  )
}
