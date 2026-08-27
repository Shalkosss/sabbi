'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import estilos from './NavRetornos.module.css'

const VISTAS = [
  { ruta: '/retornos/fondos', texto: 'Tabla maestra', pie: 'métricas por fondo' },
  { ruta: '/retornos/matriz', texto: 'Matriz', pie: 'la serie mes a mes, editable' },
  { ruta: '/retornos/insights', texto: 'Comparativos', pie: 'rankings y dispersión' },
  { ruta: '/retornos/carga', texto: 'Cargar un mes', pie: 'el mes recién cerrado' },
] as const

/**
 * Las cuatro vistas del modulo, siempre a la vista.
 *
 * Estaban colgadas del rail bajo un solo item, asi que la matriz y los
 * comparativos existian sin que nadie los pudiera encontrar: la unica forma de
 * llegar era escribir la URL. Cuatro pantallas de un mismo dominio necesitan
 * su propia barra, no un item que abre una de las cuatro.
 */
export function NavRetornos() {
  const ruta = usePathname()

  return (
    <nav className={estilos.barra} aria-label="Vistas de retornos">
      {VISTAS.map((vista) => {
        const activa = ruta === vista.ruta
        return (
          <Link
            key={vista.ruta}
            href={vista.ruta}
            className={activa ? estilos.activa : estilos.vista}
            aria-current={activa ? 'page' : undefined}
          >
            <span className={estilos.texto}>{vista.texto}</span>
            <span className={estilos.pie}>{vista.pie}</span>
          </Link>
        )
      })}
    </nav>
  )
}
