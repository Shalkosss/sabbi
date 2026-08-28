import Link from 'next/link'

import type { FichaEnLista } from '../lib/datos/fichas'
import { usdCorto } from '../lib/formato'
import estilos from './ListaDeFichas.module.css'

/**
 * Las fichas de la mesa.
 *
 * Es lo que hace visible que la revisión ya no vive en memoria: se cierra el
 * navegador y el trabajo sigue acá.
 *
 * Están las de todos, no solo las propias. Quien la subió va en la tarjeta —
 * una ficha sin dueño visible en una lista compartida es una ficha que dos
 * personas vuelven a cargar—, y la propia lleva una marca en vez de una
 * sección aparte: son la misma clase de cosa y separarlas obliga a buscar en
 * dos lugares el cliente que uno tiene en la cabeza.
 */
export function ListaDeFichas({ fichas }: { readonly fichas: readonly FichaEnLista[] }) {
  return (
    <ul className={estilos.lista}>
      {fichas.map((ficha) => (
        <li key={ficha.id}>
          <Link
            href={`/fichas/${ficha.id}`}
            className={ficha.mia ? `${estilos.tarjeta} ${estilos.mia}` : estilos.tarjeta}
          >
            <span className={estilos.cliente}>{ficha.cliente}</span>
            <span className={estilos.archivo}>
              {ficha.mia ? (
                <span className={estilos.tuya}>tuya</span>
              ) : (
                ficha.asesor !== null && <span className={estilos.autor}>{ficha.asesor}</span>
              )}
              {ficha.archivo}
            </span>
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
