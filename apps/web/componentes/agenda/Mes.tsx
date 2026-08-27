'use client'

import { useLayoutEffect, useRef } from 'react'
import type { KeyboardEvent } from 'react'

import {
  DIAS_SEMANA,
  diaLargo,
  esHabil,
  feriado,
  nombreDeDiaSemana,
  sumarDias,
} from '../../lib/agenda'
import type { Dia, HitoEnCalendario, Mes as Grilla } from '../../lib/agenda'
import { Pildora } from './Pildora'
import { pinta } from './tono'
import estilos from './Agenda.module.css'

/**
 * El mes, seis semanas de lunes a domingo.
 *
 * La grilla es un `grid` de ARIA con foco itinerante: una sola celda entra en
 * el orden de tabulación y las flechas mueven dentro. Cuarenta y dos paradas
 * de tabulador por mes harían del calendario un obstáculo para quien navega
 * con teclado, que es justo al revés de lo que un calendario tiene que ser.
 *
 * Los días inhábiles no se esconden: se apagan y dicen por qué. Un feriado que
 * no se ve deja al asesor preguntándose por qué la entrega saltó dos días.
 */

interface Props {
  readonly mes: Grilla
  readonly hoy: Dia
  readonly diaElegido: Dia
  readonly calendario: ReadonlyMap<Dia, readonly HitoEnCalendario[]>
  /** Ficha cuyo hilo está encendido; el resto se apaga. */
  readonly enfocado: string | null
  readonly alElegirDia: (dia: Dia) => void
  readonly alEnfocar: (fichaId: string | null) => void
}

/**
 * Cuántas píldoras entran en una celda antes del «+N».
 *
 * Tres es lo que cabe sin que la fila crezca. La celda completa siempre se
 * puede ver: apretarla abre el día en el panel de al lado.
 */
const MAXIMO_EN_CELDA = 3

export function Mes({
  mes,
  hoy,
  diaElegido,
  calendario,
  enfocado,
  alElegirDia,
  alEnfocar,
}: Props) {
  const celdas = useRef(new Map<Dia, HTMLButtonElement | null>())
  // Una flecha que se sale de la grilla cambia de mes, y el foco tiene que
  // seguir al día en la grilla nueva. Se anota acá y se resuelve después del
  // pintado, que es cuando el botón existe.
  const foco = useRef<Dia | null>(null)

  useLayoutEffect(() => {
    const pedido = foco.current
    if (pedido === null) return
    foco.current = null
    celdas.current.get(pedido)?.focus()
  })

  const mover = (evento: KeyboardEvent<HTMLButtonElement>, desde: Dia) => {
    const salto: Readonly<Record<string, number>> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
      PageUp: -28,
      PageDown: 28,
    }

    const pasos = salto[evento.key]
    if (pasos === undefined) return

    evento.preventDefault()
    const destino = sumarDias(desde, pasos)
    foco.current = destino
    alElegirDia(destino)
  }

  return (
    <section className={estilos.calendario} aria-label="Calendario de entregas">
      <div className={estilos.grilla} role="grid" aria-label="Días del mes">
        <div className={estilos.semanaCabecera} role="row">
          {DIAS_SEMANA.map((rotulo) => (
            <span key={rotulo} className={estilos.rotuloDia} role="columnheader" aria-label={rotulo}>
              {rotulo}
            </span>
          ))}
        </div>

        {mes.semanas.map((semana) => (
          <div key={semana[0]?.dia} className={estilos.semana} role="row">
            {semana.map((celda) => {
              const entradas = calendario.get(celda.dia) ?? []
              const nombreFeriado = feriado(celda.dia)
              // La celda toma el color del cliente encendido para dibujar su
              // hilo: la ruta se sigue de un vistazo, sin leer pildora por
              // pildora cual es de quien.
              const delEnfocado =
                enfocado === null
                  ? undefined
                  : entradas.find((entrada) => entrada.ruta.fichaId === enfocado)

              return (
                <div key={celda.dia} className={estilos.celdaEnvoltura} role="gridcell">
                  <button
                    type="button"
                    ref={(nodo) => {
                      celdas.current.set(celda.dia, nodo)
                    }}
                    className={estilos.celda}
                    tabIndex={celda.dia === diaElegido ? 0 : -1}
                    onClick={() => alElegirDia(celda.dia)}
                    onKeyDown={(evento) => mover(evento, celda.dia)}
                    data-fuera={!celda.delMes || undefined}
                    data-inhabil={!esHabil(celda.dia) || undefined}
                    data-hoy={celda.dia === hoy || undefined}
                    data-elegida={celda.dia === diaElegido || undefined}
                    data-en-ruta={delEnfocado === undefined ? undefined : true}
                    style={delEnfocado === undefined ? undefined : pinta(delEnfocado.ruta.tono)}
                    aria-current={celda.dia === hoy ? 'date' : undefined}
                    aria-label={etiqueta(celda.dia, nombreFeriado, entradas)}
                  >
                    <span className={estilos.filaNumero}>
                      <span className={`${estilos.numero} mono`}>
                        {Number(celda.dia.slice(8, 10))}
                      </span>
                      {nombreFeriado !== null && (
                        <span className={estilos.feriado} title={nombreFeriado}>
                          {nombreFeriado}
                        </span>
                      )}
                    </span>

                    <span className={estilos.pildoras}>
                      {entradas.slice(0, MAXIMO_EN_CELDA).map((entrada) => (
                        <Pildora
                          key={`${entrada.ruta.fichaId}-${entrada.hito.clave}`}
                          entrada={entrada}
                          atenuada={enfocado !== null && enfocado !== entrada.ruta.fichaId}
                          alEnfocar={alEnfocar}
                        />
                      ))}
                      {entradas.length > MAXIMO_EN_CELDA && (
                        <span className={estilos.mas}>
                          +{entradas.length - MAXIMO_EN_CELDA} más
                        </span>
                      )}
                    </span>
                  </button>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </section>
  )
}

/**
 * Lo que oye quien no ve la celda.
 *
 * Sin esto la celda se anuncia como un número suelto: el color, la difusión y
 * la posición en la grilla no existen para un lector de pantalla, así que todo
 * lo que la celda dice visualmente tiene que estar también en su etiqueta.
 */
function etiqueta(
  dia: Dia,
  nombreFeriado: string | null,
  entradas: readonly HitoEnCalendario[],
): string {
  const cabeza = `${nombreDeDiaSemana(dia)} ${diaLargo(dia)}`
  const feriadoTexto = nombreFeriado === null ? '' : `, feriado: ${nombreFeriado}`

  if (entradas.length === 0) return `${cabeza}${feriadoTexto}, sin hitos`

  const detalle = entradas
    .map((entrada) => `${entrada.ruta.cliente}, ${entrada.hito.titulo}, ${estado(entrada)}`)
    .join('; ')

  return `${cabeza}${feriadoTexto}, ${entradas.length} hitos: ${detalle}`
}

const estado = ({ hito }: HitoEnCalendario): string =>
  hito.estado === 'hecho'
    ? 'cumplido'
    : hito.estado === 'vencido'
      ? 'vencido'
      : hito.estado === 'hoy'
        ? 'para hoy'
        : 'pendiente'
