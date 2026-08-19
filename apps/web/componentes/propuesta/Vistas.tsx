'use client'

import { useState } from 'react'

import type {
  FilaComparativa,
  FilaVistaClase,
  Propuesta,
  RentabilidadPonderada,
  SubfilaVista,
  VistaComparativa,
  VistaHoy,
} from '@sabbi/core'

import { NOMBRE_CLASE_CORTO } from '../../lib/clases'
import { pct1, rangoPct, rangoUsd, usdTabla } from '../../lib/formato'
import estilos from './Vistas.module.css'

/**
 * Las dos miradas de la propuesta, una a la vez.
 *
 * La primera es el portafolio de hoy: qué tiene el cliente y qué rentabilidad
 * ya genera. La segunda es el antes y el después con el portafolio Sabbi —
 * la historia completa sin decirle a nadie qué mover a dónde. El detalle por
 * subclase se abre por fila, para que la primera lectura sea de siete líneas
 * y no de setenta.
 */
export function Vistas({ propuesta }: { readonly propuesta: Propuesta }) {
  const [mirada, setMirada] = useState<'hoy' | 'comparativo'>('comparativo')

  return (
    <section aria-label="Las dos miradas del portafolio">
      <div className={estilos.selector} role="tablist" aria-label="Elegir mirada">
        <button
          type="button"
          role="tab"
          aria-selected={mirada === 'hoy'}
          className={`${estilos.pestana} ${mirada === 'hoy' ? estilos.pestanaActiva : ''}`}
          onClick={() => setMirada('hoy')}
        >
          Tu portafolio hoy
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mirada === 'comparativo'}
          className={`${estilos.pestana} ${mirada === 'comparativo' ? estilos.pestanaActiva : ''}`}
          onClick={() => setMirada('comparativo')}
        >
          Hoy contra Sabbi
        </button>
      </div>

      {mirada === 'hoy' ? (
        <PanelHoy vista={propuesta.vistaHoy} />
      ) : (
        <PanelComparativo vista={propuesta.comparativa} />
      )}
    </section>
  )
}

/** La banda anual, con su cobertura al lado cuando no es total. */
function rent(rentabilidad: RentabilidadPonderada | null): string {
  if (rentabilidad === null) return '—'
  return rangoPct(rentabilidad.rango)
}

function notaCobertura(
  rentabilidad: RentabilidadPonderada | null,
  contexto: string,
): string | null {
  if (rentabilidad === null) return `Sin datos de retorno en ${contexto}: la cifra no se afirma.`
  if (rentabilidad.cobertura >= 0.995) return null
  return `La rentabilidad de ${contexto} se calcula sobre el ${pct1(rentabilidad.cobertura)} del dinero que tiene retorno conocido.`
}

// ── Mirada 1: hoy ─────────────────────────────────────────────────────────

function PanelHoy({ vista }: { readonly vista: VistaHoy }) {
  const nota = notaCobertura(vista.rentabilidad, 'tu portafolio actual')

  return (
    <div role="tabpanel" aria-label="Tu portafolio hoy">
      <div className={estilos.cifras}>
        <div className={estilos.cifra}>
          <span>Patrimonio invertible</span>
          <b>{usdTabla(vista.totalUsd)}</b>
        </div>
        <div className={estilos.cifra}>
          <span>Rentabilidad estimada hoy</span>
          <b>{rent(vista.rentabilidad)}</b>
          {vista.rentabilidad !== null && vista.rentabilidad.cobertura < 0.995 && (
            <span className={estilos.cifraNota}>
              sobre el {pct1(vista.rentabilidad.cobertura)} con dato
            </span>
          )}
        </div>
        <div className={estilos.cifra}>
          <span>Renta anual estimada</span>
          <b>{rangoUsd(vista.rentaAnualUsd)}</b>
        </div>
      </div>

      <div className={estilos.lista}>
        {vista.filas.map((fila) => (
          <FilaHoy key={fila.clase} fila={fila} />
        ))}
      </div>

      {nota !== null && <p className={estilos.notaCobertura}>{nota}</p>}
    </div>
  )
}

/**
 * La pista siempre vale el 100% del portafolio.
 *
 * Escalar al mayor haría que la clase más grande llenara la barra sea cual sea
 * su peso: un 12% se vería lleno. La proporción tiene que leerse contra el
 * total, no contra la vecina.
 */
function FilaHoy({ fila }: { readonly fila: FilaVistaClase }) {
  return (
    <details className={estilos.fila}>
      <summary>
        <div className={estilos.encabezado}>
          <span className={`${estilos.punto} ${estilos[`punto_${fila.clase}`] ?? ''}`} />
          <span className={estilos.nombreClase}>{NOMBRE_CLASE_CORTO[fila.clase]}</span>
          <span className={estilos.montoClase}>{usdTabla(fila.usd)}</span>
          <span className={estilos.shareClase}>{pct1(fila.share)}</span>
          <span className={estilos.rentClase} title="Rentabilidad estimada de la clase">
            {rent(fila.rentabilidad)}
          </span>
          <Chevron />
        </div>
        <div className={estilos.pista}>
          <div
            className={`${estilos.barra} ${estilos[`barra_${fila.clase}`] ?? ''}`}
            style={{ width: `${fila.share * 100}%` }}
          />
        </div>
      </summary>
      <div className={estilos.detalle}>
        <Subfilas subfilas={fila.subfilas} />
      </div>
    </details>
  )
}

// ── Mirada 2: el comparativo ──────────────────────────────────────────────

function PanelComparativo({ vista }: { readonly vista: VistaComparativa }) {
  const notas = [
    notaCobertura(vista.rentabilidadAntes, 'tu portafolio actual'),
    notaCobertura(vista.rentabilidadDespues, 'el portafolio propuesto'),
  ].filter((n): n is string => n !== null)

  return (
    <div role="tabpanel" aria-label="Hoy contra Sabbi">
      <div className={estilos.cifras}>
        <div className={`${estilos.cifra} ${estilos.cifraAcento}`}>
          <span>Rentabilidad estimada</span>
          <div className={estilos.transicion}>
            <span className={`mono ${estilos.antes}`}>{rent(vista.rentabilidadAntes)}</span>
            <span className={estilos.flecha} aria-hidden="true">
              →
            </span>
            <b>{rent(vista.rentabilidadDespues)}</b>
          </div>
          <span className={estilos.cifraNota}>hoy → con Sabbi</span>
        </div>
        <div className={estilos.cifra}>
          <span>Renta anual estimada</span>
          <div className={estilos.transicion}>
            <span className={`mono ${estilos.antes}`}>{rangoUsd(vista.rentaAnualAntesUsd)}</span>
            <span className={estilos.flecha} aria-hidden="true">
              →
            </span>
            <b>{rangoUsd(vista.rentaAnualDespuesUsd)}</b>
          </div>
          <span className={estilos.cifraNota}>hoy → con Sabbi</span>
        </div>
        <div className={estilos.cifra}>
          <span>Patrimonio</span>
          <b>{usdTabla(vista.totalDespuesUsd)}</b>
          <span className={estilos.cifraNota}>el mismo dinero, mejor repartido</span>
        </div>
      </div>

      <div className={estilos.lista}>
        {vista.filas.map((fila) => (
          <FilaComparada key={fila.clase} fila={fila} />
        ))}
      </div>

      {notas.map((nota) => (
        <p key={nota} className={estilos.notaCobertura}>
          {nota}
        </p>
      ))}
    </div>
  )
}

function FilaComparada({ fila }: { readonly fila: FilaComparativa }) {
  const delta = fila.deltaPp
  // Subir no es bueno ni bajar es malo: bajar el cash es la mejora y bajar el
  // inmobiliario también. El chip dice la dirección y el tamaño; juzgar es del
  // asesor, no de la pantalla.
  const sinCambio = Math.abs(delta) < 0.05
  const textoDelta = sinCambio
    ? 'igual'
    : `${delta > 0 ? '↑' : '↓'} ${Math.abs(delta).toFixed(1)} pp`

  return (
    <details className={estilos.fila}>
      <summary>
        <div className={estilos.encabezado}>
          <span className={`${estilos.punto} ${estilos[`punto_${fila.clase}`] ?? ''}`} />
          <span className={estilos.nombreClase}>{NOMBRE_CLASE_CORTO[fila.clase]}</span>
          <span className={estilos.montoClase} title="Hoy → con Sabbi">
            {pct1(fila.antesShare)} → <b>{pct1(fila.despuesShare)}</b>
          </span>
          <span className={`${estilos.delta} ${sinCambio ? estilos.deltaIgual : ''}`}>
            {textoDelta}
          </span>
          <span className={estilos.rentClase} title="Rentabilidad estimada con Sabbi">
            {rent(fila.rentabilidadDespues)}
          </span>
          <Chevron />
        </div>
        <div className={estilos.pistaDoble}>
          <div className={estilos.pista} title={`Hoy: ${pct1(fila.antesShare)}`}>
            <div
              className={estilos.barraAntes}
              style={{ width: `${fila.antesShare * 100}%` }}
            />
          </div>
          <div className={estilos.pista} title={`Con Sabbi: ${pct1(fila.despuesShare)}`}>
            <div
              className={`${estilos.barra} ${estilos[`barra_${fila.clase}`] ?? ''}`}
              style={{ width: `${fila.despuesShare * 100}%` }}
            />
          </div>
        </div>
      </summary>
      <div className={estilos.detalle}>
        <div className={estilos.lados}>
          <div className={estilos.lado}>
            <span>Hoy · {usdTabla(fila.antesUsd)}</span>
            {fila.antesSub.length > 0 ? (
              <Subfilas subfilas={fila.antesSub} />
            ) : (
              <p className={estilos.vacio}>Hoy no tenés nada en esta clase.</p>
            )}
          </div>
          <div className={estilos.lado}>
            <span>Con Sabbi · {usdTabla(fila.despuesUsd)}</span>
            {fila.despuesSub.length > 0 ? (
              <Subfilas subfilas={fila.despuesSub} />
            ) : (
              <p className={estilos.vacio}>El modelo no asigna nada acá.</p>
            )}
          </div>
        </div>
      </div>
    </details>
  )
}

// ── Piezas compartidas ────────────────────────────────────────────────────

function Subfilas({ subfilas }: { readonly subfilas: readonly SubfilaVista[] }) {
  return (
    <div>
      {subfilas.map((sub) => (
        <div key={sub.etiqueta} className={estilos.subfila}>
          <span className={estilos.subNombre}>
            {sub.etiqueta}
            {sub.conservada === true && (
              <span className={estilos.marcaConservada}>ya lo tenés</span>
            )}
          </span>
          <span className={estilos.subMonto}>{usdTabla(sub.usd)}</span>
          <span className={estilos.subShare}>{pct1(sub.share)}</span>
          <span className={estilos.subRent}>{rent(sub.rentabilidad)}</span>
        </div>
      ))}
    </div>
  )
}

function Chevron() {
  return (
    <svg
      className={estilos.chevron}
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2.5 4.5L6 8l3.5-3.5" />
    </svg>
  )
}
