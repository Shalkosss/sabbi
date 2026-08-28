'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'

import { VENTANAS, armarMes, crecimiento, resumirSerie, ventanaDe } from '@sabbi/core'
import type { MetricasFondo, ObservacionMensual } from '@sabbi/core'

import { guardarCeldas } from '../../app/retornos/acciones'
import type { CeldaEntrada } from '../../app/retornos/acciones'
import { SIN_DATO, mesLargo, pctFondo, sharpe } from '../../lib/formato'
import { aCelda, desdeCelda, mismaCifra } from '../../lib/retornos-celda'
import type { CampoCelda } from '../../lib/retornos-celda'
import { CurvaFondo } from './CurvaFondo'
import estilos from './PanelFondo.module.css'

interface Props {
  readonly metricas: MetricasFondo
  readonly observaciones: readonly ObservacionMensual[]
  /** El indice de la misma clase, para dibujar contra que se compara. */
  readonly referencia?:
    | { readonly nombre: string; readonly observaciones: readonly ObservacionMensual[] }
    | undefined
  readonly cerrar: () => void
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/**
 * Un fondo, abierto.
 *
 * La tabla maestra contesta «cuanto rindio» en treinta columnas. Esto contesta
 * las otras dos que la mesa hace enseguida y la hoja nunca supo mostrar: como
 * llego hasta ahi, y donde esta el mes que falta.
 *
 * La grilla de abajo es la tabla de retornos mensuales de toda la vida —un
 * anio por fila, doce meses por columna— y es editable. Es el mismo gesto que
 * en la hoja: encontrar el mes raro y corregirlo donde se lo ve, sin salir a
 * otra pantalla ni buscar el fondo de nuevo en una lista de sesenta.
 */
export function PanelFondo({ metricas, observaciones, referencia, cerrar }: Props) {
  const [campo, setCampo] = useState<CampoCelda>('retorno')
  const [borrador, setBorrador] = useState<Record<string, string>>({})
  const [estado, setEstado] = useState<string | null>(null)
  const [guardando, empezarGuardado] = useTransition()

  /* Escape cierra. Es un panel que se abre sobre la tabla, no una pagina. */
  useEffect(() => {
    const alTeclear = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') cerrar()
    }
    window.addEventListener('keydown', alTeclear)
    return () => window.removeEventListener('keydown', alTeclear)
  }, [cerrar])

  const porMes = useMemo(() => new Map(observaciones.map((o) => [o.mes, o])), [observaciones])

  const curva = useMemo(() => crecimiento(observaciones), [observaciones])
  const resumen = useMemo(() => resumirSerie(observaciones), [observaciones])

  const curvaReferencia = useMemo(
    () =>
      referencia === undefined
        ? undefined
        : { nombre: referencia.nombre, puntos: crecimiento(referencia.observaciones) },
    [referencia],
  )

  /** Los anios de la grilla, del mas reciente al mas viejo. */
  const anios = useMemo(() => {
    const conDato = observaciones.filter((o) => o.retornoTotal !== null || o.nav !== null)
    if (conDato.length === 0) return [new Date().getUTCFullYear()]
    const desde = Number(conDato[0]!.mes.slice(0, 4))
    const hasta = Number(conDato.at(-1)!.mes.slice(0, 4))
    const lista: number[] = []
    for (let a = hasta; a >= desde; a -= 1) lista.push(a)
    return lista
  }, [observaciones])

  const textoDe = (mes: string): string => {
    const editado = borrador[`${campo}:${mes}`]
    if (editado !== undefined) return editado
    const obs = porMes.get(mes)
    return aCelda(campo === 'retorno' ? (obs?.retornoTotal ?? null) : (obs?.nav ?? null), campo)
  }

  const sucias = useMemo(() => {
    const meses = new Set<string>()
    for (const [llave, texto] of Object.entries(borrador)) {
      const cual = llave.slice(0, llave.indexOf(':')) as CampoCelda
      const mes = llave.slice(llave.indexOf(':') + 1)
      const obs = porMes.get(mes)
      const previo = cual === 'retorno' ? (obs?.retornoTotal ?? null) : (obs?.nav ?? null)
      const nuevo = desdeCelda(texto, cual)
      if (mismaCifra(previo, nuevo)) continue
      meses.add(mes)
    }
    return [...meses]
  }, [borrador, porMes])

  const guardar = () => {
    if (sucias.length === 0) return
    setEstado(null)

    const celdas: CeldaEntrada[] = sucias.map((mes) => {
      const obs = porMes.get(mes)
      const nav =
        borrador[`nav:${mes}`] !== undefined
          ? desdeCelda(borrador[`nav:${mes}`]!, 'nav')
          : (obs?.nav ?? null)
      const retornoTotal =
        borrador[`retorno:${mes}`] !== undefined
          ? desdeCelda(borrador[`retorno:${mes}`]!, 'retorno')
          : (obs?.retornoTotal ?? null)
      return { fondoId: Number(metricas.fondo.id), mes, nav, retornoTotal }
    })

    empezarGuardado(async () => {
      const resultado = await guardarCeldas(celdas)
      if (!resultado.ok) {
        setEstado(resultado.error)
        return
      }
      setBorrador({})
      setEstado(`${celdas.length} ${celdas.length === 1 ? 'mes guardado' : 'meses guardados'}.`)
    })
  }

  const si = ventanaDe(metricas, 'si')
  const anual = ventanaDe(metricas, '1y')

  /** El retorno del anio calendario, tal como lo calculo el motor. */
  const retornoDelAnio = (anio: number) => metricas.anios.find((a) => a.anio === anio)

  return (
    <div className={estilos.telon} onClick={cerrar} role="presentation">
      <aside
        className={estilos.panel}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Serie de ${metricas.fondo.nombre}`}
      >
        <header className={estilos.cabecera}>
          <div>
            <h2>{metricas.fondo.nombre}</h2>
            <p className={estilos.ficha}>
              {metricas.fondo.assetClass}
              {metricas.fondo.domicilio !== null && ` · ${metricas.fondo.domicilio}`}
              {metricas.fondo.inception !== null &&
                ` · inception ${mesLargo(metricas.fondo.inception)}`}
              {metricas.fondo.esReferencia && (
                <span className={estilos.marcaIndice}>índice de mercado</span>
              )}
            </p>
          </div>
          <button type="button" className={estilos.cerrar} onClick={cerrar} aria-label="Cerrar">
            ✕
          </button>
        </header>

        <div className={estilos.cuerpo}>
          <div className={estilos.tarjetas}>
            <Dato
              rotulo="Since inception"
              valor={pctFondo(si?.retorno ?? null)}
              pie={`${si?.mesesUsados ?? 0} meses, anualizado`}
            />
            <Dato rotulo="Último año" valor={pctFondo(anual?.retorno ?? null)} pie="12 meses" />
            <Dato
              rotulo="Desviación"
              valor={pctFondo(si?.desviacion ?? null)}
              pie="anualizada, since inception"
            />
            <Dato
              rotulo="Sharpe"
              valor={sharpe(si?.sharpe ?? null)}
              pie={
                metricas.mesDelRiskFree === null
                  ? `risk-free de respaldo ${pctFondo(metricas.riskFree)}`
                  : `T10Y de ${mesLargo(metricas.mesDelRiskFree)}`
              }
            />
            <Dato
              rotulo="Máxima caída"
              valor={resumen.caida.mes === null ? SIN_DATO : pctFondo(resumen.caida.profundidad)}
              pie={
                resumen.caida.mes === null
                  ? 'nunca estuvo bajo su máximo'
                  : resumen.caida.recuperoEn === null
                    ? `${mesLargo(resumen.caida.mes)} · todavía no la recupera`
                    : `${mesLargo(resumen.caida.mes)} · recuperó en ${resumen.caida.recuperoEn} meses`
              }
              alerta
            />
            <Dato
              rotulo="Meses en verde"
              valor={resumen.aciertos === null ? SIN_DATO : pctFondo(resumen.aciertos)}
              pie={`${resumen.positivos} de ${resumen.meses}${
                resumen.rachaActual > 0 ? ` · ${resumen.rachaActual} seguidos` : ''
              }`}
            />
          </div>

          {resumen.huecos > 0 && (
            <p className={estilos.aviso}>
              {resumen.huecos} {resumen.huecos === 1 ? 'mes' : 'meses'} sin cargar entre el
              primero y el último de la serie. Las ventanas que los cruzan se calculan sin ellos:
              están en blanco en la grilla de abajo.
            </p>
          )}

          <CurvaFondo puntos={curva} referencia={curvaReferencia} />

          <section className={estilos.grilla}>
            <header className={estilos.barraGrilla}>
              <div className={estilos.grupoControl} role="group" aria-label="Qué se edita">
                <button
                  type="button"
                  className={campo === 'retorno' ? estilos.pestanaActiva : estilos.pestana}
                  onClick={() => setCampo('retorno')}
                >
                  Retorno total
                </button>
                <button
                  type="button"
                  className={campo === 'nav' ? estilos.pestanaActiva : estilos.pestana}
                  onClick={() => setCampo('nav')}
                >
                  NAV
                </button>
              </div>

              <span className={estilos.nota}>
                {campo === 'retorno'
                  ? 'En porcentaje: 0.83 es 0.83%.'
                  : 'Valor cuota, tal como lo publica el manager.'}
              </span>

              {estado !== null && <span className={estilos.estado}>{estado}</span>}

              <button
                type="button"
                className={estilos.guardar}
                onClick={guardar}
                disabled={guardando || sucias.length === 0}
              >
                {guardando
                  ? 'Guardando…'
                  : sucias.length === 0
                    ? 'Sin cambios'
                    : `Guardar ${sucias.length}`}
              </button>
            </header>

            <table className={estilos.tabla}>
              <thead>
                <tr>
                  <th scope="col">Año</th>
                  {MESES.map((mes) => (
                    <th key={mes} scope="col" className={estilos.numerica}>
                      {mes}
                    </th>
                  ))}
                  <th scope="col" className={estilos.numerica} title="Retorno del año calendario">
                    Año
                  </th>
                </tr>
              </thead>
              <tbody>
                {anios.map((anio) => {
                  const delAnio = retornoDelAnio(anio)
                  return (
                    <tr key={anio}>
                      <th scope="row" className={estilos.anio}>
                        {anio}
                      </th>
                      {MESES.map((_, i) => {
                        const mes = armarMes(anio, i + 1)
                        const texto = textoDe(mes)
                        const numero = desdeCelda(texto, campo)
                        return (
                          <td
                            key={mes}
                            className={`${estilos.celda} ${
                              borrador[`${campo}:${mes}`] !== undefined ? estilos.sucia : ''
                            }`}
                          >
                            <input
                              type="text"
                              inputMode="decimal"
                              value={texto}
                              aria-label={`${campo === 'nav' ? 'NAV' : 'Retorno'} de ${mesLargo(mes)}`}
                              className={
                                campo === 'retorno' && numero !== null && numero < 0
                                  ? estilos.negativo
                                  : undefined
                              }
                              onChange={(e) =>
                                setBorrador((previo) => ({
                                  ...previo,
                                  [`${campo}:${mes}`]: e.target.value,
                                }))
                              }
                              onFocus={(e) => e.currentTarget.select()}
                            />
                          </td>
                        )
                      })}
                      <td
                        className={`${estilos.numerica} ${estilos.total} ${
                          (delAnio?.retorno ?? 0) < 0 ? estilos.negativo : ''
                        }`}
                      >
                        {pctFondo(delAnio?.retorno ?? null)}
                        {delAnio?.parcial === true && <span className={estilos.parcial}>YTD</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            <p className={estilos.pieGrilla}>
              La columna «Año» no se edita: sale de componer los meses de esa fila. Corregir un
              mes de 2023 la recalcula sola, y con ella las treinta columnas de la tabla maestra —
              no hay ninguna métrica guardada que se pueda desincronizar.
            </p>
          </section>

          <section className={estilos.ventanas}>
            <h3>Todas las ventanas</h3>
            <table className={estilos.tabla}>
              <thead>
                <tr>
                  <th scope="col">Ventana</th>
                  <th scope="col" className={estilos.numerica}>
                    Retorno
                  </th>
                  <th scope="col" className={estilos.numerica}>
                    Desviación
                  </th>
                  <th scope="col" className={estilos.numerica}>
                    Sharpe
                  </th>
                  <th scope="col" className={estilos.numerica}>
                    Meses
                  </th>
                </tr>
              </thead>
              <tbody>
                {VENTANAS.map((v) => {
                  const dato = ventanaDe(metricas, v.clave)
                  return (
                    <tr key={v.clave}>
                      <th scope="row">{v.etiqueta}</th>
                      <td
                        className={`${estilos.numerica} ${
                          (dato?.retorno ?? 0) < 0 ? estilos.negativo : ''
                        }`}
                      >
                        {pctFondo(dato?.retorno ?? null)}
                      </td>
                      <td className={estilos.numerica}>{pctFondo(dato?.desviacion ?? null)}</td>
                      <td className={estilos.numerica}>{sharpe(dato?.sharpe ?? null)}</td>
                      <td className={`${estilos.numerica} ${estilos.tenue}`}>
                        {dato?.mesesUsados === 0 ? SIN_DATO : dato?.mesesUsados}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </section>
        </div>
      </aside>
    </div>
  )
}

/** Una cifra con su rotulo y de donde sale. */
function Dato({
  rotulo,
  valor,
  pie,
  alerta,
}: {
  readonly rotulo: string
  readonly valor: string
  readonly pie: string
  readonly alerta?: boolean
}) {
  return (
    <article className={estilos.tarjeta}>
      <span className={estilos.rotulo}>{rotulo}</span>
      <strong className={alerta === true ? estilos.cifraAlerta : estilos.cifra}>{valor}</strong>
      <span className={estilos.pie}>{pie}</span>
    </article>
  )
}
