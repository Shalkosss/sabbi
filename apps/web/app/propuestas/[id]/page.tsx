import { reparosParaPublicar } from '@sabbi/core'
import { LAMINAS_INCOMPLETAS, LAMINAS_TODAS } from '@sabbi/export'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { Marco } from '../../../componentes/Marco'
import { SinAsesor } from '../../../componentes/SinAsesor'
import { Blotter } from '../../../componentes/propuesta/Blotter'
import { Distribucion } from '../../../componentes/propuesta/Distribucion'
import { FotoActual } from '../../../componentes/propuesta/FotoActual'
import { Objetivo } from '../../../componentes/propuesta/Objetivo'
import { Publicacion } from '../../../componentes/propuesta/Publicacion'
import { Vistas } from '../../../componentes/propuesta/Vistas'
import { cadenaDeVersiones } from '../../../lib/datos/biblioteca'
import { propuestaVigente } from '../../../lib/propuesta-vigente'
import vistas from '../../../componentes/propuesta/Vistas.module.css'
import { asesorActual } from '../../../lib/supabase/servidor'
import estilos from '../../../componentes/propuesta/Propuesta.module.css'

/**
 * La propuesta, entera y sin descargar nada.
 *
 * Un borrador se arma en el servidor en cada lectura, a partir de la revisión
 * guardada y del mismo motor que corrió el asesor: no guarda cifras propias
 * que puedan quedar viejas. Una propuesta publicada hace lo contrario y por la
 * misma razón — es la que el cliente ya tiene — y se lee de su snapshot. Cuál
 * de las dos cosas está pasando lo decide `propuestaVigente`, y el panel de
 * arriba lo dice antes de que se lea una sola cifra.
 *
 * Los pesos del modelo no bajan al navegador, solo los resultados.
 */
export default async function Pagina({ params }: { params: Promise<{ id: string }> }) {
  const asesor = await asesorActual()
  if (asesor === null) return <SinAsesor />

  const { id } = await params
  const resultado = await propuestaVigente(id)
  if (resultado === null) notFound()

  const { cargada } = resultado
  const cadena = await cadenaDeVersiones(cargada.fichaId)

  const marco = (contenido: React.ReactNode) => (
    <Marco
      asesor={asesor}
      activo="propuestas"
      migas={[
        { texto: 'Propuestas', ruta: '/propuestas' },
        {
          texto: cargada.revision.cliente.nombre ?? cargada.revision.archivo,
          ruta: `/fichas/${cargada.revision.fichaId}`,
        },
        { texto: `v${cargada.version}` },
      ]}
      acciones={
        <>
          {/*
            Los dos decks se arman en el momento, del mismo objeto que pinta
            esta pantalla. Son enlaces y no botones con estado: la descarga la
            resuelve el navegador, y una propuesta sin calcular devuelve el
            motivo en texto en vez de un archivo vacío.

            El réplica sale entero, y las láminas que todavía no tienen de
            dónde sacar su dato salen con las celdas en blanco: un hueco se
            llena a mano antes de la reunión, una lámina ausente no se ve. El
            título del enlace dice cuántas van así.
          */}
          {/*
            El Excel primero: es el documento de trabajo de la mesa —el que se
            anota y se manda por correo— y el que más veces se baja. Los dos
            decks son para la reunión.
          */}
          <a
            href={`/propuestas/${cargada.propuestaId}/xlsx`}
            className="secundario"
            title="Las siete secciones en una hoja, del inventario de hoy al blotter"
            download
          >
            Descargar el Excel
          </a>
          <a href={`/propuestas/${cargada.propuestaId}/deck`} className="secundario" download>
            Descargar el deck
          </a>
          <a
            href={`/propuestas/${cargada.propuestaId}/replica`}
            className="secundario"
            title={`Formato réplica — ${LAMINAS_TODAS.length} láminas, ${LAMINAS_INCOMPLETAS.length} todavía con celdas en blanco`}
            download
          >
            Deck réplica
          </a>
          <Link href={`/fichas/${cargada.revision.fichaId}`} className="secundario">
            Volver a la revisión
          </Link>
        </>
      }
    >
      {contenido}
    </Marco>
  )

  if (!resultado.ok) {
    return marco(
      <div className={estilos.bloqueado}>
        <p className="eyebrow">Propuesta sin calcular</p>
        <h1>Falta resolver la revisión</h1>
        <p className={estilos.bajada}>
          El motor no puede correr con la ficha como está, así que no hay propuesta que mostrar.
        </p>
        <ul>
          {resultado.bloqueos.map((bloqueo) => (
            <li key={bloqueo.codigo}>{bloqueo.mensaje}</li>
          ))}
        </ul>
      </div>,
    )
  }

  const { propuesta, congelada } = resultado

  // Los reparos se evalúan acá y no en el navegador: son la misma función que
  // corre al publicar, y tenerla de un solo lado es lo que garantiza que el
  // botón esté apagado exactamente cuando la acción va a fallar.
  //
  // Quién manda acá es el estado en la base, no si el snapshot se pudo leer:
  // una publicada con el snapshot ilegible sigue estando publicada, y lo que
  // hay que ofrecerle es la versión nueva, no volver a publicarla.
  const reparos = cargada.publicada ? [] : reparosParaPublicar(propuesta)

  return marco(
    <div className={estilos.documento}>
      <header className={estilos.banda}>
        <p className={estilos.bandaEtiqueta}>Chequeo patrimonial 360°</p>
        <h1>{propuesta.cliente.nombre}</h1>
      </header>
      <div className={estilos.subbanda}>
        <span>
          Perfil <b>{propuesta.cliente.perfil}</b>
        </span>
        <span>
          Mandato <b>{propuesta.cliente.mandato ?? 'sin definir'}</b>
        </span>
        <span>
          Estado <b>{cargada.estado}</b>
        </span>
        <span>
          Versión <b>{cargada.version}</b>
        </span>
      </div>

      {/*
        Una publicada cuyo snapshot no se puede leer se recalcula, pero eso no
        puede pasar en silencio: lo que se está viendo no es lo que salió.
      */}
      {resultado.snapshotIlegible !== null && (
        <p className={estilos.avisoFuerte} role="alert">
          {resultado.snapshotIlegible}
        </p>
      )}

      <Publicacion
        propuestaId={cargada.propuestaId}
        version={cargada.version}
        publicada={cargada.publicada}
        publicadaEn={congelada?.congeladaEn ?? cargada.publicadaEn}
        publicadaPor={cargada.publicadaPor}
        macroVersion={congelada?.macroVersion ?? cargada.macroVersion}
        motor={congelada?.motor ?? null}
        reparos={reparos.map((reparo) => reparo.mensaje)}
        cadena={cadena.map((vecina) => ({
          id: vecina.id,
          version: vecina.version,
          publicada: vecina.publicada,
          fecha: vecina.publicadaEn ?? vecina.creadaEn,
        }))}
      />

      {propuesta.avisos.length > 0 && (
        <ul className={estilos.avisos}>
          {propuesta.avisos.map((aviso) => (
            <li key={aviso}>{aviso}</li>
          ))}
        </ul>
      )}

      <Vistas propuesta={propuesta} />

      {/*
        El detalle de trabajo — la ficha completa, el objetivo instrumento por
        instrumento y el blotter de ventas y compras — queda plegado: es para
        la mesa, no para la primera lectura. Marco lo pidió así: la historia
        del cliente es el antes contra el después, no qué mover a dónde.
      */}
      <details className={vistas.tecnico}>
        <summary>
          <span className={vistas.eyebrowTecnico}>Detalle de trabajo</span>
          La ficha completa, el objetivo instrumento por instrumento y el blotter de la mesa
        </summary>
        <FotoActual propuesta={propuesta} />
        <Distribucion propuesta={propuesta} />
        <Objetivo
          propuesta={propuesta}
          propuestaId={cargada.propuestaId}
          congelada={cargada.publicada}
        />
        <Blotter propuesta={propuesta} />
      </details>
    </div>,
  )
}
