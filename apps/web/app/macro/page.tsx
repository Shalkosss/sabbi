import { MACRO_DE_FABRICA } from '@sabbi/config'

import { Marco } from '../../componentes/Marco'
import { SinAsesor } from '../../componentes/SinAsesor'
import { EditorMacro } from '../../componentes/macro/EditorMacro'
import { macroActiva, versionesDeMacro } from '../../lib/datos/macro'
import { asesorActual } from '../../lib/supabase/servidor'

/**
 * La macro del portafolio.
 *
 * Es el modelo Sabbi escrito en un solo sitio: los pesos que reparten el
 * patrimonio entre clases e instrumentos, y los umbrales que convierten ese
 * reparto en líneas ejecutables. Lo que se guarda acá es lo que corre en la
 * propuesta, en la matriz del benchmark y en los dos decks — los tres llaman
 * al mismo motor con este mismo objeto y no tienen otra fuente.
 *
 * La edita cualquier asesor con sesión. Es la herramienta con la que la mesa
 * calibra el modelo, y un permiso que obliga a pedirle a otro que teclee un
 * número no protege el modelo: hace que se calibre en una hoja suelta que
 * después nadie puede auditar. Lo que lo hace seguro es que nada se
 * sobreescribe — cada guardado es una versión nueva con su autor y su nota, y
 * volver a la anterior es guardar otra vez.
 */
export default async function Pagina({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const asesor = await asesorActual()
  if (asesor === null) return <SinAsesor />

  const [activa, historial, parametros] = await Promise.all([
    macroActiva(),
    versionesDeMacro(),
    searchParams,
  ])

  // Las tres palancas que se prueban en la pantalla de Benchmark pueden llegar
  // propuestas por la URL: probar y fijar tiene que ser un solo paso.
  const propuestas: Record<string, string> = {}
  for (const clave of ['etf', 'umbral', 'inm']) {
    const crudo = parametros[clave]
    const valor = Array.isArray(crudo) ? crudo[0] : crudo
    if (valor !== undefined && valor !== '') propuestas[clave] = valor
  }

  return (
    <Marco asesor={asesor} activo="macro" migas={[{ texto: 'Macro' }]}>
      <EditorMacro
        guardada={activa.macro}
        deFabrica={MACRO_DE_FABRICA}
        esDeFabrica={activa.esDeFabrica}
        problema={activa.problema}
        guardadaEn={activa.guardadaEn}
        guardadaPor={activa.guardadaPor}
        historial={historial}
        propuestas={propuestas}
      />
    </Marco>
  )
}
