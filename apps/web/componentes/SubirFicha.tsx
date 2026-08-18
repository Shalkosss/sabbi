'use client'

import { useRef, useState } from 'react'

import estilos from './SubirFicha.module.css'

interface Props {
  readonly accion: (datos: FormData) => void
  readonly pendiente: boolean
  readonly error?: string | undefined
}

/**
 * Paso 1: subir la ficha.
 *
 * Estado vacío que enseña: antes de arrastrar nada, la pantalla dice en dos
 * líneas qué va a pasar. Un solo botón primario.
 */
export function SubirFicha({ accion, pendiente, error }: Props) {
  const entrada = useRef<HTMLInputElement>(null)
  const formulario = useRef<HTMLFormElement>(null)
  const [encima, setEncima] = useState(false)
  const [elegido, setElegido] = useState<string | null>(null)

  const soltar = (evento: React.DragEvent) => {
    evento.preventDefault()
    setEncima(false)
    const archivo = evento.dataTransfer.files[0]
    if (!archivo || !entrada.current) return

    const transferencia = new DataTransfer()
    transferencia.items.add(archivo)
    entrada.current.files = transferencia.files
    setElegido(archivo.name)
    formulario.current?.requestSubmit()
  }

  return (
    <form action={accion} ref={formulario} className={estilos.formulario}>
      <div
        className={`${estilos.zona} ${encima ? estilos.encima : ''}`}
        onDragOver={(evento) => {
          evento.preventDefault()
          setEncima(true)
        }}
        onDragLeave={() => setEncima(false)}
        onDrop={soltar}
      >
        <p className={estilos.titulo}>Arrastrá la ficha patrimonial acá</p>
        <p className={estilos.ayuda}>
          Es el <b>.xlsx</b> que llena el cliente. Leemos sus posiciones, sus inmuebles y sus notas,
          y te las dejamos en una tabla para que corrijas lo que venga mal antes de calcular nada.
        </p>

        <input
          ref={entrada}
          type="file"
          name="ficha"
          accept=".xlsx"
          className={estilos.archivo}
          id="ficha"
          onChange={(evento) => {
            const archivo = evento.target.files?.[0]
            if (!archivo) return
            setElegido(archivo.name)
            formulario.current?.requestSubmit()
          }}
        />

        <label htmlFor="ficha" className="primario">
          {pendiente ? 'Leyendo…' : 'Elegir archivo'}
        </label>

        {elegido !== null && !pendiente && <p className={estilos.elegido}>{elegido}</p>}
      </div>

      {error !== undefined && (
        <p role="alert" className={estilos.error}>
          {error}
        </p>
      )}
    </form>
  )
}
