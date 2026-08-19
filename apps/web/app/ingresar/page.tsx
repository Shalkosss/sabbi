import { FormularioIngreso } from '../../componentes/FormularioIngreso'
import estilos from '../page.module.css'

interface Props {
  readonly searchParams: Promise<{ readonly volver?: string }>
}

export default async function PaginaIngreso({ searchParams }: Props) {
  const { volver } = await searchParams

  return (
    <main className={estilos.pagina}>
      <header className={estilos.encabezado}>
        <div>
          <p className="eyebrow">Sabbi</p>
          <h1>Plan Patrimonial</h1>
          <p className={estilos.detalle}>Entrá con tu cuenta de asesor para empezar.</p>
        </div>
      </header>

      <FormularioIngreso volver={volver ?? '/'} />
    </main>
  )
}
