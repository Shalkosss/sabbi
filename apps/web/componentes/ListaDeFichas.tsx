import Link from 'next/link'

import type { FichaEnLista } from '../lib/datos/fichas'
import { usdCorto } from '../lib/formato'
import estilos from './ListaDeFichas.module.css'

/**
 * Las fichas ya cargadas.
 *
 * Es lo que hace visible que la revisión ya no vive en memoria: se cierra el
 * navegador y el trabajo sigue acá.
 */
export function ListaDeFichas({ fichas }: { readonly fichas: readonly FichaEnLista[] }) {
  return (
    <ul className={estilos.lista}>
      {fichas.map((ficha) => (
        <li key={ficha.id}>
          <Link href={`/fichas/${ficha.id}`} className={estilos.tarjeta}>
            <span className={estilos.cliente}>{ficha.cliente}</span>
            <span className={estilos.archivo}>{ficha.archivo}</span>
            <span className={`${estilos.monto} mono`}>
              {ficha.patrimonioUsd === null ? '—' : usdCorto(ficha.patrimonioUsd)}
            </span>
            <span className={estilos.fecha}>
              <Fecha iso={ficha.fecha} />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

/**
 * La fecha se formatea en el servidor y con zona fija.
 *
 * Dejarla al navegador la haría distinta entre el render del servidor y el del
 * cliente, y React lo marca como error de hidratación.
 */
function Fecha({ iso }: { readonly iso: string }) {
  const formato = new Intl.DateTimeFormat('es-PE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'America/Lima',
  })

  return <time dateTime={iso}>{formato.format(new Date(iso))}</time>
}
