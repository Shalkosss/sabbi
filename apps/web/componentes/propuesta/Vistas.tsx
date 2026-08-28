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
 * Las miradas de la propuesta, una a la vez.
 *
 * La primera es la que se abre: el portafolio de hoy y el objetivo, uno al
 * lado del otro y fila contra fila. Es la lectura que no pide nada — se ven
 * las dos formas juntas y el cambio salta sin que nadie tenga que restar. Las
 * dos columnas comparten las mismas siete clases en el mismo orden, así que
 * comparar es mirar en horizontal.
 *
 * La segunda sí resta: el antes contra el después con su delta en puntos, el
 * detalle por subclase y la rentabilidad de cada lado. Es la que se usa para
 * explicar, no para mirar.
 */
export function Vistas({ propuesta }: { readonly propuesta: Propuesta }) {
  const [mirada, setMirada] = useState<'lado' | 'comparativo'>('lado')

  const pestana = (valor: typeof mirada, texto: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={mirada === valor}
      className={`${estilos.pestana} ${mirada === valor ? estilos.pestanaActiva : ''}`}
      onClick={() => setMirada(valor)}
    >
      {texto}
    </button>
  )

  return (
    <section aria-label="Las miradas del portafolio">
      <div className={estilos.selector} role="tablist" aria-label="Elegir mirada">
        {pestana('lado', 'Hoy y objetivo')}
        {pestana('comparativo', 'Hoy contra Sabbi')}
      </div>

      {mirada === 'lado' && (
        <PanelLadoALado vista={propuesta.comparativa} hoy={propuesta.vistaHoy} />
      )}
      {mirada === 'comparativo' && <PanelComparativo vista={propuesta.comparativa} />}
    </section>
  )
}

/**
 * Cuántos puntos de la rentabilidad pone una parte del portafolio.
 *
 * Se muestra al lado del peso, y la gracia es justamente la diferencia entre
 * los dos: una clase puede ser el 16% del dinero y poner 0.3 puntos de los 4.9
 * que rinde el portafolio. Va en la misma unidad que la cifra de la cabecera y
 * la columna suma esa cifra, que es lo único que la vuelve verificable de un
 * vistazo. Sin dato no se escribe un cero — un aporte que no se puede calcular
 * no es un aporte nulo.
 */
const aporte = (parte: number | null): string => (parte === null ? '—' : pct1(parte))

/** El texto de ayuda de la columna. Una sola vez: lo usan las dos miradas. */
const AYUDA_APORTE =
  'Cuántos puntos de la rentabilidad del portafolio pone esta línea: su peso por su retorno. ' +
  'La columna entera suma la rentabilidad estimada.'

/**
 * El aporte total de una lista de filas.
 *
 * `null` cuando ninguna tiene dato: una columna que no se puede sumar no
 * imprime un cero al pie, que se leería como «no aporta nada».
 */
const aporteTotal = (partes: readonly (number | null)[]): number | null =>
  partes.every((parte) => parte === null)
    ? null
    : partes.reduce((acc: number, parte) => acc + (parte ?? 0), 0)

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

// ── Mirada 1: hoy y objetivo, uno al lado del otro ────────────────────────

/**
 * Las dos fotos juntas, fila contra fila.
 *
 * Sale de la misma vista comparativa que la mirada 2 —no de una segunda
 * cuenta— y solo cambia cómo se dispone: en vez de una fila con los dos
 * valores y su delta, dos columnas con las mismas siete clases en el mismo
 * orden. La barra de cada lado se mide contra el 100% de su portafolio, así
 * que el ancho es comparable de una columna a la otra.
 *
 * Sin instrumentos: son setenta líneas y esta es la primera lectura. El
 * detalle instrumento por instrumento está en la mirada de al lado y en el
 * bloque de trabajo de más abajo.
 */
function PanelLadoALado({
  vista,
  hoy,
}: {
  readonly vista: VistaComparativa
  readonly hoy: VistaHoy
}) {
  const notas = [
    notaCobertura(vista.rentabilidadAntes, 'tu portafolio actual'),
    notaCobertura(vista.rentabilidadDespues, 'el portafolio propuesto'),
  ].filter((n): n is string => n !== null)

  return (
    <div role="tabpanel" aria-label="Tu portafolio hoy y el objetivo">
      <div className={estilos.cifras}>
        <div className={estilos.cifra}>
          <span>Patrimonio invertible</span>
          <b>{usdTabla(hoy.totalUsd)}</b>
          <span className={estilos.cifraNota}>el mismo dinero en los dos</span>
        </div>
        <div className={`${estilos.cifra} ${estilos.cifraAcento}`}>
          <span>Rentabilidad estimada</span>
          <div className={estilos.transicion}>
            <span className={`mono ${estilos.antes}`}>{rent(vista.rentabilidadAntes)}</span>
            <span className={estilos.flecha} aria-hidden="true">
              →
            </span>
            <b>{rent(vista.rentabilidadDespues)}</b>
          </div>
          <span className={estilos.cifraNota}>hoy → objetivo</span>
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
          <span className={estilos.cifraNota}>hoy → objetivo</span>
        </div>
      </div>

      {/*
        Qué dice cada columna, una sola vez y arriba de las dos.

        El rótulo de la tabla tiene que caber en su pista, así que dice «Aporte»
        y nada más; sin esta línea, entender la columna obliga a pasar el mouse
        por una celda — y en una propuesta impresa, a adivinar.
      */}
      <p className={estilos.leyendaColumnas}>
        <b>Peso</b> es cuánto del dinero está en esa clase. <b>Aporte</b> es cuántos puntos de la
        rentabilidad pone: su peso por su retorno. Las dos dicen cosas distintas — una clase
        puede ser el 20% del dinero y no poner un solo punto —, y la columna de aportes suma
        exactamente la rentabilidad estimada que dice el pie de su portafolio.
      </p>

      <div className={estilos.columnas}>
        <ColumnaPortafolio
          titulo="Tu portafolio hoy"
          totalUsd={vista.totalAntesUsd}
          rentabilidad={vista.rentabilidadAntes}
          rentaAnualUsd={vista.rentaAnualAntesUsd}
          filas={vista.filas.map((f) => ({
            clase: f.clase,
            usd: f.antesUsd,
            share: f.antesShare,
            aporteRenta: f.aporteRentaAntes,
          }))}
          esObjetivo={false}
        />
        <ColumnaPortafolio
          titulo="El portafolio objetivo"
          totalUsd={vista.totalDespuesUsd}
          rentabilidad={vista.rentabilidadDespues}
          rentaAnualUsd={vista.rentaAnualDespuesUsd}
          filas={vista.filas.map((f) => ({
            clase: f.clase,
            usd: f.despuesUsd,
            share: f.despuesShare,
            aporteRenta: f.aporteRentaDespues,
          }))}
          esObjetivo
          movimientos={vista.filas.map((f) => f.despuesUsd - f.antesUsd)}
        />
      </div>

      {notas.map((nota) => (
        <p key={nota} className={estilos.notaCobertura}>
          {nota}
        </p>
      ))}
    </div>
  )
}

interface FilaLado {
  readonly clase: FilaVistaClase['clase']
  readonly usd: number
  readonly share: number
  /** Puntos de la rentabilidad del portafolio que pone esta clase. */
  readonly aporteRenta: number | null
}

function ColumnaPortafolio({
  titulo,
  totalUsd,
  rentabilidad,
  rentaAnualUsd,
  filas,
  esObjetivo,
  movimientos,
}: {
  readonly titulo: string
  readonly totalUsd: number
  readonly rentabilidad: RentabilidadPonderada | null
  readonly rentaAnualUsd: Parameters<typeof rangoUsd>[0]
  readonly filas: readonly FilaLado[]
  readonly esObjetivo: boolean
  /** Lo que hay que mover en cada clase para llegar. Solo el objetivo lo trae. */
  readonly movimientos?: readonly number[]
}) {
  // El fondo de la columna de movimiento se mide contra el mayor de todos y no
  // contra el patrimonio: lo que hay que ver es cuál es el movimiento grande
  // de este plan, y contra el total todos se verían igual de pálidos.
  const mayorMovimiento = Math.max(1, ...(movimientos ?? []).map((m) => Math.abs(m)))

  // El ancho de las columnas numéricas es fijo y no `auto`: con `auto` cada
  // lado se dimensiona contra sus propias cifras —«100,000» y «119,836» miden
  // distinto— y las dos columnas dejan de leerse en horizontal, que es lo único
  // que esta vista aporta sobre leer las dos por separado.
  const rejilla = movimientos === undefined ? estilos.rejillaLado : estilos.rejillaLadoMov

  const total = aporteTotal(filas.map((f) => f.aporteRenta))

  return (
    <section className={estilos.columna}>
      <header className={estilos.columnaCabecera}>
        <h3>{titulo}</h3>
        <b className="mono">{usdTabla(totalUsd)}</b>
      </header>

      <div className={estilos.lista}>
        {/*
          Los rótulos de las columnas. No estaban, y sin ellos la fila era tres
          números sueltos: nadie puede saber que el segundo es un peso y el
          tercero un aporte a la rentabilidad mirándolos.
        */}
        <div className={`${rejilla} ${estilos.rotulos}`}>
          <span aria-hidden="true" />
          <span>Clase</span>
          <span>Monto</span>
          <span>Peso</span>
          <span title={AYUDA_APORTE}>Aporte</span>
          {movimientos !== undefined && <span>A mover</span>}
        </div>

        {filas.map((fila, i) => (
          <div key={fila.clase} className={estilos.filaLado}>
            <div className={rejilla}>
              <span className={`${estilos.punto} ${estilos[`punto_${fila.clase}`] ?? ''}`} />
              <span className={estilos.nombreClase}>{NOMBRE_CLASE_CORTO[fila.clase]}</span>
              <span className={estilos.montoClase}>{usdTabla(fila.usd)}</span>
              <span className={estilos.shareClase}>{pct1(fila.share)}</span>
              <span className={estilos.aporteClase} title={AYUDA_APORTE}>
                {aporte(fila.aporteRenta)}
              </span>
              {movimientos !== undefined && (
                <Movimiento usd={movimientos[i] ?? 0} mayor={mayorMovimiento} />
              )}
            </div>
            <div className={estilos.pista}>
              <div
                className={
                  esObjetivo
                    ? `${estilos.barra} ${estilos[`barra_${fila.clase}`] ?? ''}`
                    : estilos.barraAntes
                }
                style={{ width: `${fila.share * 100}%` }}
              />
            </div>
          </div>
        ))}

        {/*
          El pie de la lista existe por el aporte: una columna que dice sumar la
          rentabilidad y no muestra su suma obliga a sumar siete celdas a mano
          para creerle. El peso da 100% por construcción y el monto es el total;
          los tres juntos son el cuadre de la columna.
        */}
        <div className={`${rejilla} ${estilos.filaTotal}`}>
          <span aria-hidden="true" />
          <span>Total</span>
          <span className={estilos.montoClase}>{usdTabla(totalUsd)}</span>
          <span className={estilos.shareClase}>{pct1(filas.length === 0 ? 0 : 1)}</span>
          <span className={estilos.aporteClase} title={AYUDA_APORTE}>
            {aporte(total)}
          </span>
          {movimientos !== undefined && <span aria-hidden="true" />}
        </div>
      </div>

      {/*
        El pie de la columna: de qué sirve ese reparto. Hasta acá se leyó cómo
        está repartido el dinero; sin la rentabilidad al lado, comparar las dos
        columnas es comparar formas y nada más.
      */}
      <dl className={estilos.pieColumna}>
        <div>
          <dt>Total</dt>
          <dd className="mono">{usdTabla(totalUsd)}</dd>
        </div>
        <div>
          <dt>Rentabilidad estimada</dt>
          <dd>{rent(rentabilidad)}</dd>
        </div>
        <div>
          <dt>Renta anual estimada</dt>
          <dd>{rangoUsd(rentaAnualUsd)}</dd>
        </div>
      </dl>

    </section>
  )
}

/**
 * Lo que hay que mover en una clase para llegar al objetivo.
 *
 * Comprar y vender no son mejor y peor —bajar el cash es la mejora y bajar el
 * inmobiliario también— así que el color no juzga: dice la dirección. Son los
 * dos colores que la aplicación ya usa para «lo que se propone» y «la cifra
 * que importa», no un semáforo.
 *
 * La intensidad del fondo es el tamaño del movimiento contra el mayor del
 * plan. Es lo que hace que los dos o tres que de verdad importan salten sin
 * tener que leer siete cifras y compararlas a mano.
 */
function Movimiento({ usd, mayor }: { readonly usd: number; readonly mayor: number }) {
  // Un movimiento por debajo de mil dólares no es una orden: es el resto de un
  // prorrateo, y pintarlo haría ruido en cada fila.
  if (Math.abs(usd) < 1_000) {
    return <span className={`${estilos.movimiento} ${estilos.sinMovimiento}`}>—</span>
  }

  const compra = usd > 0

  return (
    <span
      className={`${estilos.movimiento} ${compra ? estilos.compra : estilos.venta}`}
      style={{ '--fuerza': Math.min(1, Math.abs(usd) / mayor).toFixed(3) } as React.CSSProperties}
      title={`${compra ? 'Comprar' : 'Vender'} ${usdTabla(Math.abs(usd))} para llegar al objetivo`}
    >
      {compra ? '+' : '−'}
      {usdTabla(Math.abs(usd))}
    </span>
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
        {/* Los mismos rótulos que la mirada de al lado: la fila es la misma. */}
        <div className={`${estilos.encabezado} ${estilos.rotulos}`}>
          <span aria-hidden="true" />
          <span>Clase</span>
          <span>Hoy → con Sabbi</span>
          <span>Cambio</span>
          <span title={AYUDA_APORTE}>Aporte</span>
          <span aria-hidden="true" />
        </div>

        {vista.filas.map((fila) => (
          <FilaComparada key={fila.clase} fila={fila} />
        ))}

        {/* El cuadre de la columna: la suma tiene que dar la cifra de arriba. */}
        <div className={`${estilos.encabezado} ${estilos.filaTotal}`}>
          <span aria-hidden="true" />
          <span>Total con Sabbi</span>
          <span aria-hidden="true" />
          <span aria-hidden="true" />
          <span className={estilos.aporteClase} title={AYUDA_APORTE}>
            {aporte(aporteTotal(vista.filas.map((f) => f.aporteRentaDespues)))}
          </span>
          <span aria-hidden="true" />
        </div>
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
          <span className={estilos.aporteClase} title={AYUDA_APORTE}>
            {aporte(fila.aporteRentaDespues)}
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
          <span className={estilos.subAporte} title={AYUDA_APORTE}>
            {aporte(sub.aporteRenta)}
          </span>
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
