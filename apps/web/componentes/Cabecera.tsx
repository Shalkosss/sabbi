'use client'

import type { ResumenPatrimonio } from '@sabbi/core'
import type { DatosCliente } from '@sabbi/io'

import { plural, usd, usdCorto } from '../lib/formato'
import estilos from './Cabecera.module.css'

interface Props {
  readonly cliente: DatosCliente
  readonly archivo: string
  readonly posiciones: number
  readonly resumen: ResumenPatrimonio
}

/**
 * Quien es el cliente y en cuanto va la ficha.
 *
 * Tres cifras, no siete. Las que el asesor mira todo el tiempo y de las que
 * depende que la propuesta cierre; el resto de lo que se sabe del patrimonio
 * vive en la nota de cada una. Se recalculan en cada tecleo, que es lo que
 * convierte la tabla en una herramienta y no en un formulario.
 */
export function Cabecera({ cliente, archivo, posiciones, resumen }: Props) {
  const contexto = [
    cliente.horizonte !== null ? `horizonte ${cliente.horizonte}` : null,
    plural(posiciones, 'posición', 'posiciones'),
    archivo,
  ].filter((parte): parte is string => parte !== null)

  const fuera = [
    resumen.inmueblesRentaUsd > 0 ? `${usdCorto(resumen.inmueblesRentaUsd)} en inmuebles de renta` : null,
    resumen.usoPropioUsd > 0 ? `${usdCorto(resumen.usoPropioUsd)} de uso propio, fuera del cálculo` : null,
  ].filter((parte): parte is string => parte !== null)

  return (
    <header className={estilos.cabecera}>
      <div className={estilos.identidad}>
        <p className="eyebrow">Revisión de la ficha</p>
        <h1>{cliente.nombre ?? 'Cliente sin nombre en la ficha'}</h1>
        <p className={estilos.contexto}>{contexto.join(' · ')}</p>
      </div>

      <div className={estilos.cifras}>
        <Cifra
          etiqueta="Patrimonio invertible"
          valor={usd(resumen.patrimonioInvertibleUsd)}
          nota={fuera.length > 0 ? fuera.join('; ') : 'todo el patrimonio entra al cálculo'}
        />
        <Cifra
          etiqueta="A reinvertir"
          valor={usd(resumen.dineroDisponibleUsd)}
          nota="lo que el plan reparte entre las siete clases"
          destacada
        />
        <Cifra
          etiqueta="Conservado"
          valor={usd(resumen.conservadoUsd)}
          nota={
            resumen.restringidoUsd > 0
              ? `incluye ${usdCorto(resumen.restringidoUsd)} restringido; queda clavado como piso de su clase`
              : 'queda clavado como piso de su clase'
          }
        />
      </div>
    </header>
  )
}

interface CifraProps {
  readonly etiqueta: string
  readonly valor: string
  readonly nota: string
  readonly destacada?: boolean
}

function Cifra({ etiqueta, valor, nota, destacada }: CifraProps) {
  return (
    <div className={estilos.cifra}>
      <p className={estilos.etiqueta}>{etiqueta}</p>
      <p className={`${estilos.valor} mono ${destacada === true ? estilos.destacada : ''}`}>
        {valor}
      </p>
      <p className={estilos.nota}>{nota}</p>
    </div>
  )
}
