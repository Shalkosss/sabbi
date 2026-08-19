import { notFound } from 'next/navigation'

import { Revision } from '../../../componentes/Revision'
import { SinAsesor } from '../../../componentes/SinAsesor'
import { cargarRevision } from '../../../lib/datos/fichas'
import { asesorActual } from '../../../lib/supabase/servidor'

/**
 * La revisión de una ficha.
 *
 * Se lee entera en el servidor y baja ya armada: el navegador nunca consulta
 * la base por su cuenta, así que las políticas RLS son el único control de
 * acceso que hay que auditar. Una ficha que no existe — o que las políticas no
 * dejan ver — es un 404, no un error: no hay por qué confirmarle a nadie que
 * ese identificador existe.
 */
export default async function Pagina({ params }: { params: Promise<{ id: string }> }) {
  const asesor = await asesorActual()
  if (asesor === null) return <SinAsesor />

  const { id } = await params
  const revision = await cargarRevision(id)
  if (revision === null) notFound()

  return <Revision inicial={revision} asesor={asesor} />
}
