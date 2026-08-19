/**
 * El tema de la pantalla.
 *
 * Por defecto manda el sistema operativo. Si el asesor elige, esa eleccion
 * queda en `data-tema` sobre el <html> y en `localStorage`, y ahi se queda:
 * abrir una ficha a las once de la noche no deberia repintar la pantalla de
 * blanco. Los colores no viven aca — los resuelve `light-dark()` en el CSS a
 * partir de `color-scheme`, asi que esto solo mueve un atributo.
 */

export type Tema = 'claro' | 'oscuro'

export const CLAVE_TEMA = 'sabbi-tema'

/** Evento propio: el interruptor no puede escuchar cambios de un dataset. */
export const EVENTO_TEMA = 'sabbi:tema'

export const esTema = (valor: unknown): valor is Tema => valor === 'claro' || valor === 'oscuro'

/**
 * Se inyecta en el <head> y corre antes del primer pintado.
 *
 * Sin esto, la pagina se pinta con el tema del sistema y recien despues salta
 * al elegido: un destello blanco en cada navegacion. Va minificado a mano
 * porque es lo unico que bloquea el render.
 */
export const GUION_TEMA = `try{var t=localStorage.getItem(${JSON.stringify(CLAVE_TEMA)});if(t==="claro"||t==="oscuro")document.documentElement.dataset.tema=t}catch(e){}`

/** El tema efectivo: el elegido, o el del sistema si nadie eligio. */
export function temaActual(): Tema {
  const elegido = document.documentElement.dataset.tema
  if (esTema(elegido)) return elegido
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'oscuro' : 'claro'
}

export function aplicarTema(tema: Tema): void {
  document.documentElement.dataset.tema = tema
  try {
    window.localStorage.setItem(CLAVE_TEMA, tema)
  } catch {
    // Modo privado o almacenamiento lleno: el tema vale para esta pestana y
    // nada mas. No es motivo para romper la pantalla.
  }
  window.dispatchEvent(new Event(EVENTO_TEMA))
}
