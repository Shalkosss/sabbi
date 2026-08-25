'use client'

import { useState } from 'react'

import { desdeMonto, montoEditable } from '../lib/formato'
import estilos from './CampoMonto.module.css'

/**
 * Un campo de dinero, con separador de miles y su unidad al lado.
 *
 * `123250` a secas se lee mal: hay que contar los dígitos para saber si son
 * ciento veintitrés mil o un millón, y en una columna de montos se cuentan
 * todos. Con el separador puesto la cifra se lee de un vistazo.
 *
 * El separador solo se muestra cuando el campo no está enfocado. Mientras se
 * teclea manda lo tecleado, tal cual — reformatear en cada pulsación mueve el
 * cursor de sitio y hace imposible corregir un dígito del medio.
 *
 * El «USD» va al lado del input y no adentro del valor: así nunca entra al
 * parseo, que es de donde salen los errores de mil veces más.
 */
interface Props {
  readonly valor: number | null
  readonly alCambiar: (valor: number | null) => void
  readonly 'aria-label': string
  readonly unidad?: string
  readonly placeholder?: string | undefined
  /**
   * Clase del envoltorio.
   *
   * Admite `undefined` a proposito: con `exactOptionalPropertyTypes` un
   * `estilos.algo` de un modulo CSS es `string | undefined`, y obligar a cada
   * llamador a resolverlo con un `??` no protege de nada.
   */
  readonly className?: string | undefined
}

export function CampoMonto({
  valor,
  alCambiar,
  unidad = 'USD',
  placeholder,
  className,
  ...resto
}: Props) {
  const [tecleado, setTecleado] = useState<string | null>(null)

  return (
    <span className={`${estilos.campo} ${className ?? ''}`}>
      <input
        {...resto}
        inputMode="decimal"
        className={`${estilos.entrada} mono`}
        value={tecleado ?? montoEditable(valor)}
        placeholder={placeholder}
        onChange={(evento) => {
          setTecleado(evento.target.value)
          alCambiar(desdeMonto(evento.target.value))
        }}
        onBlur={() => setTecleado(null)}
      />
      <span className={estilos.unidad} aria-hidden="true">
        {unidad}
      </span>
    </span>
  )
}
