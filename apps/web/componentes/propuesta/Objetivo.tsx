'use client'

import type { AnotacionLinea, Propuesta } from '@sabbi/core'
import { useState } from 'react'

import { guardarCambioAnotacion, leerAnotaciones } from '../../app/acciones'
import { useAutoguardado } from '../../lib/autoguardado'
import { NOMBRE_CLASE } from '../../lib/clases'
import { pct1, puntos, rangoPct, rangoUsd, usdTabla } from '../../lib/formato'
import { useCompania, useMias } from '../../lib/tiempo-real'
import { Companeros } from '../Cursores'
import { Guardado } from '../Guardado'
import { Cuadre, Seccion, Tabla } from './Seccion'
import estilos from './Propuesta.module.css'

/**
 * Sección 6: el portafolio objetivo.
 *
 * Dos tablas que hay que leer juntas. La primera dice a dónde va el dinero; la
 * segunda, por qué eso no es el benchmark. El modelo puro es el mismo motor
 * corrido ignorando lo que el cliente ya tiene, así que cada punto de
 * diferencia tiene un origen concreto: una posición conservada que clavó su
 * clase.
 */
const VACIA: AnotacionLinea = { descripcion: '', proposito: '' }

interface Props {
  readonly propuesta: Propuesta
  /** Sin propuesta abierta no hay donde guardar lo que el asesor escriba. */
  readonly propuestaId: string
  /** Quién es, para la sala: las dos columnas se llenan de a dos. */
  readonly asesor: { readonly id: string; readonly nombre: string }
  /**
   * Publicada: las dos columnas del asesor se leen pero no se escriben.
   *
   * Salieron impresas en el anexo del deck que el cliente ya tiene. Dejarlas
   * editables ofreceria cambiar un texto que no va a cambiar en ningun lado.
   */
  readonly congelada?: boolean
}

export function Objetivo({ propuesta, propuestaId, asesor, congelada = false }: Props) {
  const { seccion6 } = propuesta
  const { parametros } = seccion6

  // Lo que el asesor escribe vive en pantalla mientras teclea y sale solo, por
  // la misma cola que el resto de la aplicacion. El valor de partida es el que
  // vino del servidor dentro de cada linea.
  const [anotaciones, setAnotaciones] = useState<ReadonlyMap<string, AnotacionLinea>>(new Map())
  const { marcar: marcarMia, mias, alSoltar } = useMias()

  const { companeros, avisar } = useCompania({
    // Una propuesta publicada no se edita, así que no hay sala a la que
    // entrar: nadie va a escribir nada que el otro tenga que ver llegar.
    sala: propuestaId === '' || congelada ? '' : `propuesta:${propuestaId}`,
    yo: { asesorId: asesor.id, nombre: asesor.nombre },
    // Sin contenedor no hay cursores, y acá no hacen falta: lo único que se
    // edita en la propuesta son estas dos columnas, y el nombre de quien está
    // escribiendo al lado del estado de guardado dice lo que hay que saber.
    alRefrescar: () => {
      void releer()
    },
  })

  const { estado: guardado, encolar } = useAutoguardado<AnotacionLinea>(async (clave, anotacion) => {
    const resultado = await guardarCambioAnotacion(propuestaId, clave, anotacion)
    if (resultado.error === undefined) avisar()
    return resultado
  })

  const anotacionDe = (instrumento: string, base: AnotacionLinea): AnotacionLinea =>
    anotaciones.get(instrumento) ?? base

  const anotar = (instrumento: string, base: AnotacionLinea, cambio: Partial<AnotacionLinea>) => {
    const siguiente = { ...anotacionDe(instrumento, base), ...cambio }
    // Desde acá y por unos segundos esta línea es mía: si el otro guarda la
    // suya y esta pantalla vuelve a leer, lo que estoy tecleando no se pisa.
    marcarMia(instrumento)
    setAnotaciones((previas) => new Map(previas).set(instrumento, siguiente))
    encolar(instrumento, siguiente)
  }

  /**
   * Vuelve a leer las anotaciones cuando el otro asesor guardó una.
   *
   * Las que vinieron con el render no se pueden usar de respaldo después de
   * releer: una anotación que alguien borró no vuelve en la lectura, y
   * mostrarla otra vez sería resucitarla. Por eso las que estaban escritas y
   * ya no están se fijan vacías en vez de dejarse caer al valor del render.
   */
  const releer = async () => {
    const frescas = await leerAnotaciones(propuestaId)
    const tocadas = mias()

    setAnotaciones((previas) => {
      const siguientes = new Map(frescas)

      for (const grupo of seccion6.grupos) {
        for (const linea of grupo.lineas) {
          const escrita = linea.descripcion !== '' || linea.proposito !== ''
          if (escrita && !siguientes.has(linea.instrumento)) {
            siguientes.set(linea.instrumento, VACIA)
          }
        }
      }

      for (const [instrumento, anotacion] of previas) {
        if (tocadas.has(instrumento)) siguientes.set(instrumento, anotacion)
      }

      return siguientes
    })

    // Lo que se dejó sin pisar porque este asesor lo está escribiendo se vuelve
    // a pedir cuando lo suelte: si no, la línea se queda con un texto que la
    // base ya no tiene y el próximo guardado lo escribiría de vuelta.
    alSoltar(() => {
      void releer()
    })
  }

  // Una celda vacía en una tabla de retornos se lee como un cero. Se cuentan
  // para poder decir en una línea que es falta de dato y no falta de retorno.
  const sinCatalogo = seccion6.grupos
    .flatMap((grupo) => grupo.lineas)
    .filter((linea) => linea.retornoTotal === null).length

  return (
    <Seccion
      numero={6}
      titulo="Portafolio objetivo"
      bajada="Lo que el motor propone, instrumento por instrumento, con lo que el cliente conserva ya incorporado."
    >
      <div className={estilos.parametros}>
        <Parametro etiqueta="Ticket financiero total" valor={usdTabla(parametros.ticketFinancieroTotalUsd)} />
        <Parametro etiqueta="A reinvertir" valor={usdTabla(parametros.montoAReinvertirUsd)} destacado />
        <Parametro etiqueta="Base de redistribución" valor={usdTabla(parametros.baseRedistribucionUsd)} />
        <Parametro etiqueta="Modelo Inmobiliario" valor={pct1(parametros.pctModeloInmobiliario)} />
        <Parametro etiqueta="Colchón de liquidez" valor={usdTabla(parametros.colchonLiquidezUsd)} />
        <Parametro etiqueta="FX asumido" valor={parametros.fxPenUsd.toFixed(2)} />
      </div>

      <Tabla>
        <thead>
          <tr>
            <th scope="col">Clase e instrumento</th>
            <th scope="col" className={estilos.num}>
              USD
            </th>
            <th scope="col" className={estilos.num}>
              %
            </th>
            <th scope="col" className={estilos.num}>
              Retorno total esp.
            </th>
            <th scope="col">Moneda</th>
            <th scope="col">Plazo mín.</th>
            <th scope="col" className={estilos.num}>
              Retorno distributivo
            </th>
            <th scope="col" className={estilos.num}>
              Distribución anual
            </th>
          </tr>
        </thead>
        <tbody>
          {seccion6.grupos.map((grupo) => (
            <Fragmento key={grupo.clase}>
              <tr className={estilos.grupo}>
                <td>
                  {NOMBRE_CLASE[grupo.clase]}
                  {grupo.cerrada && (
                    <span
                      className={`${estilos.marca} ${estilos.conservada}`}
                      title="Lo que el cliente conserva ya cubre el objetivo de la clase"
                    >
                      cerrada
                    </span>
                  )}
                </td>
                <td className={estilos.num}>{usdTabla(grupo.objetivoUsd)}</td>
                <td className={estilos.num}>{pct1(grupo.share)}</td>
                <td colSpan={5} />
              </tr>
              {grupo.lineas.map((linea) => (
                <tr key={`${grupo.clase}-${linea.instrumento}`}>
                  <td className={estilos.sangria}>
                    {linea.instrumento}
                    <span
                      className={`${estilos.marca} ${linea.conservada ? estilos.conservada : estilos.nueva}`}
                    >
                      {linea.conservada ? 'conservada' : 'nueva'}
                    </span>
                    {linea.nota !== null && <div className={estilos.tenue}>{linea.nota}</div>}
                    <div className={estilos.anotacion}>
                      <input
                        className={estilos.campoAnotacion}
                        value={anotacionDe(linea.instrumento, linea).descripcion}
                        placeholder={congelada ? '' : 'Descripción — qué es'}
                        aria-label={`Descripción de ${linea.instrumento}`}
                        readOnly={congelada}
                        onChange={(e) =>
                          anotar(linea.instrumento, linea, { descripcion: e.target.value })
                        }
                      />
                      <input
                        className={estilos.campoAnotacion}
                        value={anotacionDe(linea.instrumento, linea).proposito}
                        placeholder={congelada ? '' : 'Propósito — para qué está'}
                        aria-label={`Propósito de ${linea.instrumento}`}
                        readOnly={congelada}
                        onChange={(e) =>
                          anotar(linea.instrumento, linea, { proposito: e.target.value })
                        }
                      />
                    </div>
                  </td>
                  <td className={estilos.num}>{usdTabla(linea.usd)}</td>
                  <td className={estilos.num}>{pct1(linea.share)}</td>
                  <td className={estilos.num}>{rangoPct(linea.retornoTotal)}</td>
                  <td>{linea.moneda ?? '—'}</td>
                  <td>{linea.liquidez ?? '—'}</td>
                  <td className={estilos.num}>{rangoPct(linea.retornoDistributivo)}</td>
                  <td className={estilos.num}>{rangoUsd(linea.distribucionAnualUsd)}</td>
                </tr>
              ))}
            </Fragmento>
          ))}
        </tbody>
        <tfoot>
          <tr className={estilos.total}>
            <td>Total portafolio objetivo</td>
            <td className={estilos.num}>{usdTabla(seccion6.totalUsd)}</td>
            <td className={estilos.num}>{pct1(1)}</td>
            <td colSpan={5} />
          </tr>
        </tfoot>
      </Tabla>

      <div className={estilos.pieAnotaciones}>
        <p className={estilos.bajada}>
          Descripción y propósito los escribe el asesor: son las dos columnas del anexo del
          deck que ningún dato puede llenar.{' '}
          {congelada
            ? 'Estas son las que salieron publicadas; para cambiarlas hay que abrir una versión nueva.'
            : 'Se guardan solas.'}
        </p>
        {!congelada && (
          <span className={estilos.pieCompania}>
            <Companeros companeros={companeros} />
            <Guardado estado={guardado} sinGuardar={0} />
          </span>
        )}
      </div>

      <Cuadre
        etiqueta="Objetivo contra patrimonio financiero"
        montoUsd={seccion6.cuadreUsd}
        explicacion="el portafolio no suma el patrimonio: hay dinero que el motor perdió o duplicó"
      />

      {sinCatalogo > 0 && (
        <p className={estilos.bajada} style={{ marginTop: 10 }}>
          {sinCatalogo === 1
            ? 'Un instrumento no tiene retorno esperado en el catálogo y va sin cifra.'
            : `${sinCatalogo} instrumentos no tienen retorno esperado en el catálogo y van sin cifra.`}{' '}
          El nombre con el que el motor los imprime no coincide con el de la tabla de productos.
        </p>
      )}

      <h3 style={{ marginTop: 28, marginBottom: 8 }}>Recomendado contra modelo puro</h3>
      <p className={estilos.bajada}>
        El modelo puro es el benchmark aplicado al patrimonio entero, ignorando lo que el cliente ya
        tiene. La diferencia en puntos es lo que explica cada desvío.
      </p>

      <Tabla>
        <thead>
          <tr>
            <th scope="col">Clase e instrumento</th>
            <th scope="col" className={estilos.num}>
              Modelo
            </th>
            <th scope="col" className={estilos.num}>
              Recomendado
            </th>
            <th scope="col" className={estilos.num}>
              Dif. (pp)
            </th>
          </tr>
        </thead>
        <tbody>
          {seccion6.comparativo.map((fila) => (
            <tr
              key={`${fila.nivel}-${fila.clase}-${fila.etiqueta}`}
              className={fila.nivel === 'clase' ? estilos.grupo : undefined}
            >
              <td className={fila.nivel === 'instrumento' ? estilos.sangria : undefined}>
                {fila.nivel === 'clase' ? NOMBRE_CLASE[fila.clase] : fila.etiqueta}
              </td>
              <td className={estilos.num}>{usdTabla(fila.modeloUsd)}</td>
              <td className={estilos.num}>{usdTabla(fila.recomendadoUsd)}</td>
              <td className={estilos.num}>{puntos(fila.difPp)}</td>
            </tr>
          ))}
        </tbody>
      </Tabla>
    </Seccion>
  )
}

function Parametro({
  etiqueta,
  valor,
  destacado,
}: {
  readonly etiqueta: string
  readonly valor: string
  readonly destacado?: boolean
}) {
  return (
    <div className={`${estilos.parametro} ${destacado === true ? estilos.destacado : ''}`}>
      <span>{etiqueta}</span>
      <b>{valor}</b>
    </div>
  )
}

/** `<>` no acepta key; esto sí, y evita meter un `<tbody>` por grupo. */
function Fragmento({ children }: { readonly children: React.ReactNode }) {
  return <>{children}</>
}
