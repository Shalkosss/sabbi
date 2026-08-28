import { redirect } from 'next/navigation'

/**
 * `/retornos` no era ninguna de las cuatro vistas, asi que no era nada.
 *
 * El modulo se abre siempre por la tabla maestra: es la que reemplaza a la
 * hoja y la unica que sirve para mirar sin buscar un fondo primero. Quien
 * escribe la ruta corta —o llega desde un enlace viejo— entra por ahi en vez
 * de comerse un 404.
 */
export default function Pagina() {
  redirect('/retornos/fondos')
}
