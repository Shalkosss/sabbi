'use client'

import Link from 'next/link'
import { useState } from 'react'

import type { PlanResumido } from '../app/acciones'
import { NOMBRE_CLASE, ORDEN_CLASES } from '../lib/clases'
import { pct, usd } from '../lib/formato'
import estilos from './PanelPlan.module.css'

interface Props {
  readonly plan: PlanResumido
  /** Sin propuesta abierta no hay adonde ir: la ficha se subio antes del cambio. */
  readonly propuestaId: string
}

/**
 * Cómo se mira el portafolio objetivo.
 *
 * `detalle` es la lectura completa —cada clase con sus instrumentos debajo— y
 * es la que se abre: es la forma de la hoja con la que la mesa venía
 * trabajando, y la única que contesta las dos preguntas a la vez, cuánto le
 * toca a cada bloque y con qué se ejecuta.
 *
 * Las otras dos son la misma información recortada, para cuando ya se sabe qué
 * se está buscando: `clases` para juzgar el reparto, `instrumentos` para armar
 * la orden. No son vistas distintas del dato, son menos columnas del mismo.
 */
type Mirada = 'detalle' | 'clases' | 'instrumentos'

const MIRADAS: readonly { readonly valor: Mirada; readonly texto: string }[] = [
  { valor: 'detalle', texto: 'Clases e instrumentos' },
  { valor: 'clases', texto: 'Solo clases' },
  { valor: 'instrumentos', texto: 'Solo instrumentos' },
]

const nombreDe = (clase: string): string =>
  (NOMBRE_CLASE as Readonly<Record<string, string>>)[clase] ?? clase

/**
 * Resultado del cálculo.
 *
 * El cierre del paso 2: el asesor ve en qué queda el portafolio antes de
 * pasar a la propuesta. La vista completa de las siete secciones es la
 * pantalla siguiente, no ésta.
 */
export function PanelPlan({ plan, propuestaId }: Props) {
  const [mirada, setMirada] = useState<Mirada>('detalle')
  const total = plan.totalObjetivoUsd
  const peso = (usdMonto: number) => (total > 0 ? usdMonto / total : 0)

  return (
    <section className={estilos.panel} aria-label="Resultado del cálculo">
      <header className={estilos.cabecera}>
        <h2>Portafolio objetivo</h2>
        <p className={estilos.subtitulo}>
          {usd(total)} en total · {usd(plan.dineroNuevoUsd)} a ejecutar
        </p>
        {propuestaId === '' ? (
          <span className={`${estilos.enlace} ${estilos.sinPropuesta}`}>
            Esta ficha no tiene una propuesta abierta: volvé a subirla.
          </span>
        ) : (
          <div className={estilos.enlace}>
            <a href={`/propuestas/${propuestaId}/deck`} className="secundario" download>
              Descargar el deck
            </a>
            <Link href={`/propuestas/${propuestaId}`} className="primario">
              Ver la propuesta →
            </Link>
          </div>
        )}
      </header>

      <div className={estilos.selector} role="tablist" aria-label="Cómo mirar el portafolio">
        {MIRADAS.map((opcion) => (
          <button
            key={opcion.valor}
            type="button"
            role="tab"
            aria-selected={mirada === opcion.valor}
            className={`${estilos.pestana} ${mirada === opcion.valor ? estilos.pestanaActiva : ''}`}
            onClick={() => setMirada(opcion.valor)}
          >
            {opcion.texto}
          </button>
        ))}
      </div>

      {mirada === 'detalle' && <Detalle plan={plan} total={total} peso={peso} />}
      {mirada === 'clases' && <Clases plan={plan} total={total} peso={peso} />}
      {mirada === 'instrumentos' && <Instrumentos plan={plan} total={total} peso={peso} />}

      {plan.avisos.length > 0 && (
        <ul className={estilos.avisos}>
          {plan.avisos.map((aviso) => (
            <li key={aviso}>{aviso}</li>
          ))}
        </ul>
      )}
    </section>
  )
}

interface VistaProps {
  readonly plan: PlanResumido
  readonly total: number
  readonly peso: (usdMonto: number) => number
}

/**
 * Cada clase con sus instrumentos debajo, en una sola tabla.
 *
 * Es la forma de la hoja: la clase en negrita con su total y su peso, y sus
 * instrumentos indentados con los suyos. Una clase sin instrumentos —el cash,
 * el inmobiliario— sale sola, que es lo que corresponde: no tiene con qué
 * abrirse.
 *
 * Las clases van en el orden del modelo y no por monto. El orden fijo es lo
 * que permite comparar dos portafolios de un vistazo; ordenar por tamaño hace
 * que cada corrida ponga las filas en otro sitio.
 */
function Detalle({ plan, total, peso }: VistaProps) {
  const conMonto = ORDEN_CLASES.map((clase) => ({
    clase,
    resumen: plan.porClase.find((c) => c.clase === clase),
    lineas: plan.lineas.filter((l) => l.clase === clase),
  })).filter((bloque) => (bloque.resumen?.objetivoUsd ?? 0) > 0)

  return (
    <table className={estilos.tabla}>
      <thead>
        <tr>
          <th scope="col">Clase de activo</th>
          <th scope="col" className={estilos.num}>
            Monto
          </th>
          <th scope="col" className={estilos.num}>
            Peso %
          </th>
        </tr>
      </thead>

      <tbody>
        {conMonto.map((bloque) => (
          <Fragmento key={bloque.clase}>
            <tr className={estilos.filaClase}>
              <th scope="rowgroup">
                {nombreDe(bloque.clase)}
                <Marca resumen={bloque.resumen} />
              </th>
              <td className={`${estilos.num} mono`}>{usd(bloque.resumen?.objetivoUsd ?? 0)}</td>
              <td className={`${estilos.num} mono`}>{pct(peso(bloque.resumen?.objetivoUsd ?? 0))}</td>
            </tr>

            {bloque.lineas.map((linea) => (
              <tr key={linea.instrumento} className={estilos.filaLinea}>
                <td title={linea.instrumento}>{linea.instrumento}</td>
                <td className={`${estilos.num} mono`}>{usd(linea.usd)}</td>
                <td className={`${estilos.num} mono`}>{pct(peso(linea.usd))}</td>
              </tr>
            ))}
          </Fragmento>
        ))}
      </tbody>

      <tfoot>
        <tr>
          <td>Total del portafolio</td>
          <td className={`${estilos.num} mono`}>{usd(total)}</td>
          <td className={`${estilos.num} mono`}>{pct(total > 0 ? 1 : 0)}</td>
        </tr>
      </tfoot>
    </table>
  )
}

/** El reparto entre clases, con lo que hay que comprar en cada una. */
function Clases({ plan, total, peso }: VistaProps) {
  return (
    <table className={estilos.tabla}>
      <thead>
        <tr>
          <th scope="col">Clase</th>
          <th scope="col" className={estilos.num}>
            Objetivo
          </th>
          <th scope="col" className={estilos.num}>
            %
          </th>
          <th scope="col" className={estilos.num}>
            A comprar
          </th>
        </tr>
      </thead>
      <tbody>
        {plan.porClase.map((clase) => (
          <tr key={clase.clase}>
            <td>
              {nombreDe(clase.clase)}
              <Marca resumen={clase} />
            </td>
            <td className={`${estilos.num} mono`}>{usd(clase.objetivoUsd)}</td>
            <td className={`${estilos.num} mono ${estilos.tenue}`}>{pct(peso(clase.objetivoUsd))}</td>
            <td className={`${estilos.num} mono`}>
              {clase.dineroNuevoUsd > 0 ? usd(clase.dineroNuevoUsd) : '—'}
            </td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <td>Total</td>
          <td className={`${estilos.num} mono`}>{usd(total)}</td>
          <td className={`${estilos.num} mono`}>{pct(total > 0 ? 1 : 0)}</td>
          <td className={`${estilos.num} mono`}>{usd(plan.dineroNuevoUsd)}</td>
        </tr>
      </tfoot>
    </table>
  )
}

/** La lista plana, que es la que se lleva a la mesa para ejecutar. */
function Instrumentos({ plan, total, peso }: VistaProps) {
  return (
    <table className={estilos.tabla}>
      <thead>
        <tr>
          <th scope="col">Instrumento</th>
          <th scope="col">Clase</th>
          <th scope="col" className={estilos.num}>
            Monto
          </th>
          <th scope="col" className={estilos.num}>
            Peso %
          </th>
        </tr>
      </thead>
      <tbody>
        {plan.lineas.map((linea) => (
          <tr key={`${linea.clase}-${linea.instrumento}`}>
            <td title={linea.instrumento}>{linea.instrumento}</td>
            <td className={estilos.tenue}>{nombreDe(linea.clase)}</td>
            <td className={`${estilos.num} mono`}>{usd(linea.usd)}</td>
            <td className={`${estilos.num} mono ${estilos.tenue}`}>{pct(peso(linea.usd))}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <td colSpan={2}>Total</td>
          <td className={`${estilos.num} mono`}>{usd(total)}</td>
          <td className={`${estilos.num} mono`}>{pct(total > 0 ? 1 : 0)}</td>
        </tr>
      </tfoot>
    </table>
  )
}

/** Por qué una clase vale lo que vale, cuando no lo decidió el benchmark. */
function Marca({ resumen }: { readonly resumen: PlanResumido['porClase'][number] | undefined }) {
  if (resumen === undefined) return null

  if (resumen.fijada) {
    return (
      <span className={estilos.marca} title="El asesor clavó el monto de esta clase">
        fijada
      </span>
    )
  }
  if (resumen.cerrada && resumen.objetivoUsd > 0) {
    return (
      <span className={estilos.marca} title="Cubierta por lo que el cliente conserva">
        cerrada
      </span>
    )
  }
  return null
}

/** Una clase y sus instrumentos son filas hermanas: no van en un `div`. */
function Fragmento({ children }: { readonly children: React.ReactNode }) {
  return <>{children}</>
}
