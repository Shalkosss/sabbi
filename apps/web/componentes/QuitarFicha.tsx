'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { ocultarFichaEnAgenda, quitarFicha } from '../app/acciones'
import estilos from './QuitarFicha.module.css'

/**
 * El boton para quitar la ficha entera.
 *
 * Vive en la cabecera de la revision y no en un menu de admin: la accion es
 * del equipo, la puede hacer cualquier asesor y la usa quien detecta el
 * problema — la duplicada, la carga de prueba, el cliente que no era.
 *
 * Pide confirmacion escrita porque `Estas seguro?` con dos clics es lo que
 * borra fichas de verdad por accidente: escribir el nombre del cliente hace
 * pensar una vez mas antes de mandar la accion.
 */
export function QuitarFicha({
  fichaId,
  cliente,
  ocultaEnAgenda,
}: {
  readonly fichaId: string
  readonly cliente: string
  readonly ocultaEnAgenda: boolean
}) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [texto, setTexto] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [enVuelo, iniciar] = useTransition()
  const [oculta, setOculta] = useState(ocultaEnAgenda)

  const alternarAgenda = () => {
    setError(null)
    const proximo = !oculta
    setOculta(proximo)
    iniciar(async () => {
      const resultado = await ocultarFichaEnAgenda(fichaId, proximo)
      if (resultado.error !== undefined) {
        setOculta(!proximo)
        setError(resultado.error)
      }
    })
  }

  const esperado = cliente.trim()
  const puede = texto.trim().toLowerCase() === esperado.toLowerCase()

  const enviar = () => {
    setError(null)
    iniciar(async () => {
      const resultado = await quitarFicha(fichaId)
      if (!resultado.ok) {
        setError(resultado.error)
        return
      }
      router.push('/')
      router.refresh()
    })
  }

  if (!abierto) {
    return (
      <>
        <button
          type="button"
          className={estilos.disparador}
          onClick={alternarAgenda}
          disabled={enVuelo}
          title={
            oculta
              ? 'La ficha no aparece en el calendario. Apretá para volver a mostrarla.'
              : 'Esconde la ficha del calendario de la agenda. No la borra.'
          }
        >
          {oculta ? 'Mostrar en agenda' : 'Ocultar de agenda'}
        </button>
        <button
          type="button"
          className={estilos.disparador}
          onClick={() => setAbierto(true)}
          title="Quitar esta ficha, sus posiciones, sus hitos de agenda y las propuestas en borrador"
        >
          Quitar ficha
        </button>
        {error !== null && <span className={estilos.errorInline}>{error}</span>}
      </>
    )
  }

  return (
    <div className={estilos.dialogo} role="dialog" aria-label="Quitar la ficha">
      <p className={estilos.explicacion}>
        Se van la ficha, sus posiciones, los hitos de agenda y las propuestas en borrador.
      </p>
      <label className={estilos.confirmacion}>
        <span>
          Para confirmar, escribí <b>{esperado}</b>.
        </span>
        <input
          type="text"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder={esperado}
          autoFocus
          disabled={enVuelo}
        />
      </label>
      {error !== null && <p className={estilos.error}>{error}</p>}
      <div className={estilos.botones}>
        <button
          type="button"
          className={estilos.confirmar}
          onClick={enviar}
          disabled={!puede || enVuelo}
        >
          {enVuelo ? 'Quitando…' : 'Quitar la ficha'}
        </button>
        <button
          type="button"
          className={estilos.cancelar}
          onClick={() => {
            setAbierto(false)
            setTexto('')
            setError(null)
          }}
          disabled={enVuelo}
        >
          Cancelar
        </button>
      </div>
    </div>
  )
}
