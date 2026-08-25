'use client'

import type { AjusteClase, ClaseModelo } from '@sabbi/core'
import Link from 'next/link'
import { useState } from 'react'

import type { PlanResumido } from '../app/acciones'
import type { ActivoAgregado, ProductoOfrecible } from '../lib/catalogo'
import { NOMBRE_CLASE, ORDEN_CLASES } from '../lib/clases'
import { pct, usd } from '../lib/formato'
import { CampoMonto } from './CampoMonto'
import estilos from './PanelPlan.module.css'

/**
 * Lo que hace falta para poder tocar el objetivo desde acá.
 *
 * Va agrupado y no suelto en los props por una razón práctica: son seis cosas
 * que solo tienen sentido juntas, y el panel las ignora enteras cuando las
 * modificaciones están apagadas.
 */
export interface Modificar {
  readonly agregados: readonly ActivoAgregado[]
  readonly ajustes: readonly AjusteClase[]
  readonly productos: readonly ProductoOfrecible[]
  readonly cambiarActivo: (activo: ActivoAgregado) => void
  readonly quitarActivo: (id: string) => void
  readonly cambiarAjuste: (clase: ClaseModelo, ajuste: AjusteClase | null) => void
}

interface Props {
  readonly plan: PlanResumido
  /** Sin propuesta abierta no hay adonde ir: la ficha se subio antes del cambio. */
  readonly propuestaId: string
  readonly modificar: Modificar
  /** El plan que se ve ya no corresponde a lo que hay cargado. */
  readonly desactualizado: boolean
  readonly recalculando: boolean
  readonly alActualizar: () => void
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
 * Resultado del cálculo, y el sitio donde se lo corrige.
 *
 * El cierre del paso 2: el asesor ve en qué queda el portafolio antes de pasar
 * a la propuesta. Pero además es donde lo ajusta, y eso es deliberado — hasta
 * ahora había que subir al panel de arriba, tocar un monto a ciegas y bajar a
 * ver qué había pasado. Se corrige mirando el resultado.
 *
 * Las modificaciones vienen apagadas. Un portafolio calculado se lee muchas
 * más veces de las que se toca, y un campo editable invita a tocarlo: la
 * tuerca es lo que separa leer de trabajar.
 */
export function PanelPlan({
  plan,
  propuestaId,
  modificar,
  desactualizado,
  recalculando,
  alActualizar,
}: Props) {
  const [mirada, setMirada] = useState<Mirada>('detalle')
  const [modificaciones, setModificaciones] = useState(false)
  const total = plan.totalObjetivoUsd
  const peso = (usdMonto: number) => (total > 0 ? usdMonto / total : 0)

  return (
    <section className={estilos.panel} aria-label="Resultado del cálculo">
      <header className={estilos.cabecera}>
        <h2>Portafolio objetivo</h2>
        <p className={estilos.subtitulo}>
          {usd(total)} en total · {usd(plan.dineroNuevoUsd)} a ejecutar
        </p>

        <div className={estilos.enlace}>
          <button
            type="button"
            className={`${estilos.tuerca} ${modificaciones ? estilos.tuercaActiva : ''}`}
            aria-pressed={modificaciones}
            onClick={() => setModificaciones((previo) => !previo)}
            title={
              modificaciones
                ? 'Cerrar las modificaciones: el objetivo vuelve a ser solo de lectura'
                : 'Abrir las modificaciones para fijar montos y agregar productos'
            }
          >
            <Tuerca />
            Modificaciones
          </button>

          {desactualizado && (
            <button
              type="button"
              className="primario"
              onClick={alActualizar}
              disabled={recalculando}
            >
              {recalculando ? 'Actualizando…' : 'Actualizar'}
            </button>
          )}

          {propuestaId === '' ? (
            <span className={estilos.sinPropuesta}>
              Esta ficha no tiene una propuesta abierta: volvé a subirla.
            </span>
          ) : (
            <>
              <a href={`/propuestas/${propuestaId}/deck`} className="secundario" download>
                Descargar el deck
              </a>
              <Link href={`/propuestas/${propuestaId}`} className="secundario">
                Ver la propuesta →
              </Link>
            </>
          )}
        </div>
      </header>

      {/*
        Un plan que ya no corresponde a lo que hay cargado no se esconde: se
        marca. Esconderlo dejaba la pantalla en blanco justo después de tocar
        algo, que es cuando uno quiere ver qué cambió.
      */}
      {desactualizado && (
        <p className={estilos.desactualizado} role="status">
          Tocaste algo después de calcular: estas cifras son las de antes.
          <b> Actualizá</b> para que el objetivo vuelva a cuadrar.
        </p>
      )}

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

      {mirada === 'detalle' && (
        <Detalle
          plan={plan}
          total={total}
          peso={peso}
          modificar={modificaciones ? modificar : null}
        />
      )}
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
 *
 * Con las modificaciones abiertas cada bloque gana dos cosas: el monto de la
 * clase se puede clavar, y debajo del último instrumento aparece un `+` para
 * sumar un producto ahí mismo. Es el único sitio donde las dos palancas se ven
 * contra el resultado que van a mover.
 */
function Detalle({
  plan,
  total,
  peso,
  modificar,
}: VistaProps & { readonly modificar: Modificar | null }) {
  // Con las modificaciones abiertas salen las siete clases, tenga o no monto:
  // una clase en cero es justamente a la que uno quiere agregarle algo.
  const bloques = ORDEN_CLASES.map((clase) => ({
    clase,
    resumen: plan.porClase.find((c) => c.clase === clase),
    lineas: plan.lineas.filter((l) => l.clase === clase),
    agregados: (modificar?.agregados ?? []).filter((a) => a.clase === clase),
  })).filter(
    (bloque) =>
      modificar !== null ||
      (bloque.resumen?.objetivoUsd ?? 0) > 0 ||
      bloque.agregados.length > 0,
  )

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
          {modificar !== null && (
            <th scope="col" className={estilos.colFijar}>
              Fijar la clase
            </th>
          )}
        </tr>
      </thead>

      <tbody>
        {bloques.map((bloque) => (
          <Fragmento key={bloque.clase}>
            <tr className={estilos.filaClase}>
              <th scope="rowgroup">
                {nombreDe(bloque.clase)}
                <Marca resumen={bloque.resumen} />
              </th>
              <td className={`${estilos.num} mono`}>{usd(bloque.resumen?.objetivoUsd ?? 0)}</td>
              <td className={`${estilos.num} mono`}>
                {pct(peso(bloque.resumen?.objetivoUsd ?? 0))}
              </td>
              {modificar !== null && (
                <td>
                  <Fijar clase={bloque.clase} modificar={modificar} />
                </td>
              )}
            </tr>

            {bloque.lineas.map((linea) => (
              <tr key={linea.instrumento} className={estilos.filaLinea}>
                <td title={linea.instrumento}>{linea.instrumento}</td>
                <td className={`${estilos.num} mono`}>{usd(linea.usd)}</td>
                <td className={`${estilos.num} mono`}>{pct(peso(linea.usd))}</td>
                {modificar !== null && <td />}
              </tr>
            ))}

            {modificar !== null &&
              bloque.agregados.map((activo) => (
                <Agregado key={activo.id} activo={activo} modificar={modificar} />
              ))}

            {modificar !== null && (
              <tr className={estilos.filaSumar}>
                <td colSpan={4}>
                  <button
                    type="button"
                    className={estilos.sumar}
                    onClick={() =>
                      modificar.cambiarActivo({
                        id: crypto.randomUUID(),
                        nombre: '',
                        montoUsd: 0,
                        clase: bloque.clase,
                        productoId: null,
                        retMin: null,
                        retMax: null,
                        distMin: null,
                        distMax: null,
                        distFrecuencia: null,
                      })
                    }
                  >
                    <span aria-hidden="true">+</span>
                    Agregar un producto a {nombreDe(bloque.clase)}
                  </button>
                </td>
              </tr>
            )}
          </Fragmento>
        ))}
      </tbody>

      <tfoot>
        <tr>
          <td>Total del portafolio</td>
          <td className={`${estilos.num} mono`}>{usd(total)}</td>
          <td className={`${estilos.num} mono`}>{pct(total > 0 ? 1 : 0)}</td>
          {modificar !== null && <td />}
        </tr>
      </tfoot>
    </table>
  )
}

/** Clavar el monto de una clase, o devolverla al modelo. */
function Fijar({
  clase,
  modificar,
}: {
  readonly clase: ClaseModelo
  readonly modificar: Modificar
}) {
  const ajuste = modificar.ajustes.find((a) => a.clase === clase) ?? null

  if (ajuste === null) {
    return (
      <button
        type="button"
        className={estilos.fijarVacio}
        onClick={() => modificar.cambiarAjuste(clase, { clase, modo: 'fijar', montoUsd: 0 })}
        title="Clavar el monto de esta clase; el resto se prorratea entre las demás"
      >
        según el modelo
      </button>
    )
  }

  return (
    <span className={estilos.fijado}>
      <CampoMonto
        valor={ajuste.montoUsd}
        aria-label={`Monto fijado para ${nombreDe(clase)}`}
        alCambiar={(valor) =>
          modificar.cambiarAjuste(clase, { clase, modo: 'fijar', montoUsd: valor ?? 0 })
        }
      />
      <button
        type="button"
        className={estilos.soltar}
        aria-label={`Devolver ${nombreDe(clase)} al modelo`}
        title="Devolver la clase al modelo"
        onClick={() => modificar.cambiarAjuste(clase, null)}
      >
        ×
      </button>
    </span>
  )
}

/**
 * Un producto que el asesor sumó a esta clase.
 *
 * Sin selector de clase: la fila ya está dentro del bloque de su clase, y una
 * celda para cambiarla debajo del encabezado «Peso %» se leía como si dijera
 * otra cosa. Elegir del catálogo la mueve sola —el producto trae su clase— y
 * moverla a mano sigue estando en el panel de arriba.
 */
function Agregado({
  activo,
  modificar,
}: {
  readonly activo: ActivoAgregado
  readonly modificar: Modificar
}) {
  const claseDeProducto = new Map(modificar.productos.map((p) => [p.nombre, p.clase]))

  return (
    <tr className={`${estilos.filaLinea} ${estilos.filaAgregada}`}>
      <td>
        <input
          className={estilos.texto}
          list="productos-ofrecibles"
          value={activo.nombre}
          placeholder="Nombre del producto"
          aria-label="Nombre del producto agregado"
          onChange={(e) => {
            const delCatalogo = claseDeProducto.get(e.target.value) ?? null
            modificar.cambiarActivo({
              ...activo,
              nombre: e.target.value,
              clase: delCatalogo ?? activo.clase,
            })
          }}
        />
      </td>
      <td className={estilos.num}>
        <CampoMonto
          valor={activo.montoUsd}
          aria-label={`Monto de ${activo.nombre === '' ? 'el producto agregado' : activo.nombre}`}
          alCambiar={(valor) => modificar.cambiarActivo({ ...activo, montoUsd: valor ?? 0 })}
        />
      </td>
      <td className={`${estilos.num} ${estilos.tenue}`}>agregado</td>
      <td>
        <button
          type="button"
          className={estilos.soltar}
          aria-label={`Quitar ${activo.nombre === '' ? 'el producto sin nombre' : activo.nombre}`}
          onClick={() => modificar.quitarActivo(activo.id)}
        >
          ×
        </button>
      </td>
    </tr>
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

function Tuerca() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.35"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="2.2" />
      <path d="M8 1.5v1.8M8 12.7v1.8M14.5 8h-1.8M3.3 8H1.5M12.6 3.4l-1.3 1.3M4.7 11.3l-1.3 1.3M12.6 12.6l-1.3-1.3M4.7 4.7L3.4 3.4" />
    </svg>
  )
}

/** Una clase y sus instrumentos son filas hermanas: no van en un `div`. */
function Fragmento({ children }: { readonly children: React.ReactNode }) {
  return <>{children}</>
}
