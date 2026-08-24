'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'

import type { PropuestaEnBiblioteca } from '../../lib/datos/biblioteca'
import { usdCorto } from '../../lib/formato'
import estilos from './Biblioteca.module.css'

/**
 * La biblioteca del equipo.
 *
 * Todo lo que Sabbi armó, de quien sea. Las propuestas se leen entre todos
 * desde el día uno —así están escritas las políticas de la base— pero hasta
 * acá no había forma de encontrarlas: se llegaba a una propuesta por la ficha
 * que la abrió, y quien cubría a un colega el lunes no tenía cómo abrir lo que
 * había dejado el viernes.
 *
 * El filtro tiene dos ejes porque son las dos preguntas que se hacen: «cómo se
 * llama el cliente» y «esto ya salió o todavía lo estoy trabajando».
 */

type Filtro = 'todas' | 'publicadas' | 'borradores'

const ETIQUETA: Readonly<Record<Filtro, string>> = {
  todas: 'Todas',
  publicadas: 'Publicadas',
  borradores: 'Borradores',
}

interface Props {
  readonly propuestas: readonly PropuestaEnBiblioteca[]
}

export function Biblioteca({ propuestas }: Props) {
  const [filtro, setFiltro] = useState<Filtro>('todas')
  const [busqueda, setBusqueda] = useState('')

  const cuenta = useMemo(
    () => ({
      todas: propuestas.length,
      publicadas: propuestas.filter((propuesta) => propuesta.publicada).length,
      borradores: propuestas.filter((propuesta) => !propuesta.publicada).length,
    }),
    [propuestas],
  )

  const visibles = useMemo(() => {
    const texto = busqueda.trim().toLowerCase()

    return propuestas.filter((propuesta) => {
      if (filtro === 'publicadas' && !propuesta.publicada) return false
      if (filtro === 'borradores' && propuesta.publicada) return false
      if (texto === '') return true

      return (
        propuesta.cliente.toLowerCase().includes(texto) ||
        (propuesta.asesor ?? '').toLowerCase().includes(texto)
      )
    })
  }, [propuestas, filtro, busqueda])

  return (
    <>
      <div className={estilos.controles}>
        <div className={estilos.filtros} role="group" aria-label="Filtrar propuestas">
          {(['todas', 'publicadas', 'borradores'] as const).map((clave) => (
            <button
              key={clave}
              type="button"
              className={`${estilos.filtro} ${filtro === clave ? estilos.filtroActivo : ''}`}
              aria-pressed={filtro === clave}
              onClick={() => setFiltro(clave)}
            >
              {ETIQUETA[clave]}
              <span className={estilos.cuenta}>{cuenta[clave]}</span>
            </button>
          ))}
        </div>

        <input
          type="search"
          className={estilos.busqueda}
          value={busqueda}
          placeholder="Buscar por cliente o asesor"
          aria-label="Buscar por cliente o asesor"
          onChange={(evento) => setBusqueda(evento.target.value)}
        />
      </div>

      {visibles.length === 0 ? (
        <p className={estilos.vacio}>
          {propuestas.length === 0
            ? 'Todavía no hay ninguna propuesta. Empezá subiendo una ficha.'
            : 'Ninguna propuesta coincide con ese filtro.'}
        </p>
      ) : (
        <ul className={estilos.lista}>
          {visibles.map((propuesta) => (
            <li key={propuesta.id}>
              <Link href={`/propuestas/${propuesta.id}`} className={estilos.tarjeta}>
                <span className={estilos.cliente}>
                  {propuesta.cliente}
                  <Sello propuesta={propuesta} />
                </span>
                <span className={estilos.asesor}>{propuesta.asesor ?? 'sin asesor'}</span>
                <span className={`${estilos.monto} mono`}>
                  {propuesta.patrimonioUsd === null ? '—' : usdCorto(propuesta.patrimonioUsd)}
                </span>
                <span className={estilos.fecha}>
                  <Fecha iso={propuesta.publicadaEn ?? propuesta.creadaEn} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

/**
 * El estado en dos palabras: la versión y si salió.
 *
 * La versión va siempre, también en la v1: es como la mesa se refiere a una
 * propuesta por correo, y verla escrita evita la pregunta de si esta es la que
 * se mandó.
 */
function Sello({ propuesta }: { readonly propuesta: PropuestaEnBiblioteca }) {
  return (
    <>
      <span className={estilos.version}>v{propuesta.version}</span>
      <span
        className={`${estilos.sello} ${propuesta.publicada ? estilos.publicada : estilos.borrador}`}
        title={
          propuesta.publicada
            ? `Congelada${propuesta.macroVersion === null ? '' : ` con la macro v${propuesta.macroVersion}`}${
                propuesta.publicadaPor === null ? '' : ` por ${propuesta.publicadaPor}`
              }`
            : 'Se recalcula en cada lectura, con la macro de hoy'
        }
      >
        {propuesta.publicada ? 'publicada' : 'borrador'}
      </span>
    </>
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
