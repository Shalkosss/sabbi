'use client'

import { useActionState } from 'react'

import { ingresar } from '../app/ingresar/acciones'
import type { ResultadoIngreso } from '../app/ingresar/acciones'
import estilos from './FormularioIngreso.module.css'

interface Props {
  readonly volver: string
}

export function FormularioIngreso({ volver }: Props) {
  const [resultado, accion, pendiente] = useActionState<ResultadoIngreso, FormData>(ingresar, null)

  return (
    <form action={accion} className={estilos.formulario}>
      <input type="hidden" name="volver" value={volver} />

      <label className={estilos.campo}>
        <span>Correo</span>
        <input
          type="email"
          name="email"
          autoComplete="username"
          required
          placeholder="nombre@sabbi.com"
        />
      </label>

      <label className={estilos.campo}>
        <span>Contraseña</span>
        <input type="password" name="clave" autoComplete="current-password" required />
      </label>

      {resultado !== null && (
        <p role="alert" className={estilos.error}>
          {resultado.error}
        </p>
      )}

      <button type="submit" className="primario" disabled={pendiente}>
        {pendiente ? 'Entrando…' : 'Entrar'}
      </button>

      <p className={estilos.pie}>
        Las cuentas las crea el equipo de Sabbi. Si no tenés una, pedila por interno.
      </p>
    </form>
  )
}
