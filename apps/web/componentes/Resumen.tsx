'use client'

import type { ResumenPatrimonio } from '@sabbi/core'

import { plural, usd } from '../lib/formato'
import estilos from './Resumen.module.css'

interface Props {
  readonly resumen: ResumenPatrimonio
  readonly usoPropioVisible: boolean
}

/**
 * Las tres cifras que el asesor mira todo el tiempo.
 *
 * Se recalculan en cada tecleo, que es lo que convierte la tabla en una
 * herramienta y no en un formulario.
 */
export function Resumen({ resumen, usoPropioVisible }: Props) {
  return (
    <div className={estilos.fila}>
      <Cifra
        etiqueta="Patrimonio financiero"
        valor={usd(resumen.patrimonioInvertibleUsd)}
        detalle={
          resumen.inmueblesRentaUsd > 0
            ? `incluye ${usd(resumen.inmueblesRentaUsd)} de inmuebles en renta`
            : 'sin inmuebles de renta'
        }
      />
      <Cifra
        etiqueta="A reinvertir"
        valor={usd(resumen.dineroDisponibleUsd)}
        detalle={`quedan ${usd(resumen.conservadoUsd)} conservados`}
        destacada
      />
      <Cifra
        etiqueta="Sin marcar"
        valor={String(resumen.sinMarcar)}
        detalle={
          resumen.sinMarcar === 0
            ? 'todas decididas'
            : `${plural(resumen.sinMarcar, 'posición cuenta', 'posiciones cuentan')} como conservadas`
        }
        alerta={resumen.sinMarcar > 0}
      />
      {usoPropioVisible && (
        <Cifra
          etiqueta="Uso propio"
          valor={usd(resumen.usoPropioUsd)}
          detalle="fuera de todo cálculo"
          tenue
        />
      )}
    </div>
  )
}

interface CifraProps {
  readonly etiqueta: string
  readonly valor: string
  readonly detalle: string
  readonly destacada?: boolean
  readonly alerta?: boolean
  readonly tenue?: boolean
}

function Cifra({ etiqueta, valor, detalle, destacada, alerta, tenue }: CifraProps) {
  const clases = [
    estilos.cifra,
    destacada === true ? estilos.destacada : '',
    alerta === true ? estilos.alerta : '',
    tenue === true ? estilos.tenue : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={clases}>
      <p className={estilos.etiqueta}>{etiqueta}</p>
      <p className={`${estilos.valor} mono`}>{valor}</p>
      <p className={estilos.detalle}>{detalle}</p>
    </div>
  )
}
