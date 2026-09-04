import Image from 'next/image'
import Link from 'next/link'

import estilos from './Rail.module.css'

interface Props {
  readonly asesor: { readonly nombre: string; readonly rol: string }
  /** Cual de las secciones esta abierta. */
  readonly activo: Seccion
}

export type Seccion =
  | 'fichas'
  | 'agenda'
  | 'propuestas'
  | 'clientes'
  | 'catalogo'
  | 'macro'
  | 'benchmark'
  | 'allocation'
  | 'retornos'
  | 'bitacora'

interface Item {
  readonly clave: Seccion
  readonly texto: string
  readonly icono: string
  /** Sin ruta, la seccion todavia no existe y el item no se puede apretar. */
  readonly ruta: string | null
}

const SECCIONES: readonly Item[] = [
  { clave: 'fichas', texto: 'Fichas', icono: 'M2 4h12M2 8h12M2 12h8', ruta: '/' },
  {
    clave: 'agenda',
    texto: 'Agenda',
    // Una hoja de calendario con su anilla: el plazo que abre cada ficha.
    icono: 'M2.5 4.5h11v9h-11zM2.5 7h11M5.5 2.5v3M10.5 2.5v3',
    ruta: '/agenda',
  },
  { clave: 'propuestas', texto: 'Propuestas', icono: 'M3 2h7l3 3v9H3z', ruta: null },
  {
    clave: 'clientes',
    texto: 'Clientes',
    icono: 'M8 8a2.5 2.5 0 100-5 2.5 2.5 0 000 5zm-5 6c0-2.5 2.2-4 5-4s5 1.5 5 4',
    ruta: null,
  },
  { clave: 'catalogo', texto: 'Catálogo', icono: 'M2 3h5v10H2zm7 0h5v10H9z', ruta: '/catalogo' },
  {
    clave: 'macro',
    texto: 'Macro',
    // Tres correderas: las palancas con las que se calibra el modelo.
    icono: 'M3 4h10M3 8h10M3 12h10M6 2.5v3M10.5 6.5v3M5 10.5v3',
    ruta: '/macro',
  },
  {
    clave: 'benchmark',
    texto: 'Benchmark',
    // Tres barras de distinto alto: el modelo mirado de lejos.
    icono: 'M3 13V9m5 4V4m5 9v-6',
    ruta: '/benchmark',
  },
  {
    clave: 'allocation',
    texto: 'Allocation',
    // Un anillo con una porcion marcada: la torta y el sleeve de alternativos.
    icono: 'M8 2a6 6 0 106 6H8z',
    ruta: '/allocation',
  },
  {
    clave: 'retornos',
    texto: 'Retornos',
    // Una linea que sube con dos puntos: la serie mensual de un fondo.
    icono: 'M2 12l4-4 3 2 5-6M2 12h12',
    ruta: '/retornos/fondos',
  },
  { clave: 'bitacora', texto: 'Bitácora', icono: 'M8 4v4l3 2M8 14A6 6 0 108 2a6 6 0 000 12z', ruta: null },
]

/** Dos iniciales, que es lo que entra en un circulo de 26 pixeles. */
const iniciales = (nombre: string): string =>
  nombre
    .split(/\s+/)
    .filter((parte) => parte !== '')
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase() ?? '')
    .join('')

/**
 * La navegacion de la aplicacion.
 *
 * Oscura en los dos temas: es el ancla visual de la pantalla y lo que hace que
 * el area de trabajo se lea como una hoja apoyada encima. Las secciones que
 * todavia no existen se muestran apagadas en vez de esconderse — el asesor ve
 * hacia donde va la herramienta y no descubre un enlace muerto.
 */
export function Rail({ asesor, activo }: Props) {
  return (
    <nav className={estilos.rail} aria-label="Secciones">
      <div className={estilos.marca}>
        <Image
          src="/sabbi-wordmark-bone.png"
          alt="Sabbi"
          width={2835}
          height={794}
          className={estilos.logo}
          priority
        />
      </div>

      <p className={estilos.grupo}>Plataforma</p>
      <ul className={estilos.lista}>
        {SECCIONES.map((seccion) => (
          <li key={seccion.clave}>
            {seccion.ruta === null ? (
              <span
                className={`${estilos.item} ${estilos.pendiente}`}
                aria-disabled="true"
                title="Disponible en una fase siguiente"
              >
                <Icono trazo={seccion.icono} />
                {seccion.texto}
              </span>
            ) : (
              <Link
                href={seccion.ruta}
                className={`${estilos.item} ${seccion.clave === activo ? estilos.activo : ''}`}
                aria-current={seccion.clave === activo ? 'page' : undefined}
              >
                <Icono trazo={seccion.icono} />
                {seccion.texto}
              </Link>
            )}
          </li>
        ))}
      </ul>

      <div className={estilos.pie}>
        <span className={estilos.avatar} aria-hidden="true">
          {iniciales(asesor.nombre)}
        </span>
        <span className={estilos.identidad}>
          <span className={estilos.nombre}>{asesor.nombre}</span>
          <span className={estilos.detalle}>
            {asesor.rol === 'admin' ? 'Admin' : 'Asesor'} · motor v8
          </span>
        </span>
      </div>
    </nav>
  )
}

function Icono({ trazo }: { readonly trazo: string }) {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.35"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={estilos.icono}
    >
      <path d={trazo} />
    </svg>
  )
}
