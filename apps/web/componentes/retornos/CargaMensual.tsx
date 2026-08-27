'use client'

import { useMemo, useState, useTransition } from 'react'

import { desdeInput } from '../../lib/formato'
import { guardarMes, guardarTreasury } from '../../app/retornos/acciones'
import type { ObservacionEntrada } from '../../app/retornos/acciones'
import estilos from './CargaMensual.module.css'

export interface FondoParaCargar {
  readonly id: number
  readonly nombre: string
  readonly assetClass: string
  readonly nav: number | null
  readonly retornoTotal: number | null
}

interface Props {
  readonly mes: string
  readonly mesesDisponibles: readonly string[]
  readonly fondos: readonly FondoParaCargar[]
  readonly treasury: number | null
}

/** Lo tecleado por fondo, antes de guardar. */
type Borrador = Record<number, { readonly nav: string; readonly retorno: string }>

const aTexto = (valor: number | null): string => (valor === null ? '' : String(valor))

/**
 * La carga del mes.
 *
 * Una fila por fondo y dos celdas: NAV y retorno total. Son dos numeros
 * distintos y ninguno sale del otro — el retorno total incluye la
 * distribucion, que en un fondo de credito es casi todo. La apertura entre
 * capital y distribucion se calcula sola y se muestra a la derecha, para que
 * quien carga vea si el numero que pego tiene sentido antes de guardarlo.
 *
 * El pegado desde Excel existe porque la alternativa real no es teclear
 * cuarenta filas: es seguir usando la hoja.
 */
export function CargaMensual({ mes, mesesDisponibles, fondos, treasury }: Props) {
  const [mesActivo, setMesActivo] = useState(mes)
  const [borrador, setBorrador] = useState<Borrador>(() =>
    Object.fromEntries(
      fondos.map((f) => [f.id, { nav: aTexto(f.nav), retorno: aTexto(f.retornoTotal) }]),
    ),
  )
  const [pegado, setPegado] = useState('')
  const [estado, setEstado] = useState<string | null>(null)
  const [guardando, empezarGuardado] = useTransition()
  const [treasuryTexto, setTreasuryTexto] = useState(aTexto(treasury))

  const cambiar = (id: number, campo: 'nav' | 'retorno', valor: string) =>
    setBorrador((previo) => ({
      ...previo,
      [id]: { ...(previo[id] ?? { nav: '', retorno: '' }), [campo]: valor },
    }))

  const cargados = useMemo(
    () => fondos.filter((f) => (borrador[f.id]?.retorno ?? '') !== '').length,
    [fondos, borrador],
  )

  /**
   * Lee lo pegado desde Excel: `nombre <tab> nav <tab> retorno`.
   *
   * El emparejamiento es por nombre exacto, sin acentos ni mayusculas. Un
   * nombre que no matchea NO se carga contra el fondo mas parecido: se informa
   * y se deja afuera. Adivinar acá escribe la serie de BCRED adentro de BDEBT
   * y nadie lo nota hasta que el ranking sale raro.
   */
  const aplicarPegado = () => {
    const normalizar = (texto: string) =>
      texto
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')

    const porNombre = new Map(fondos.map((f) => [normalizar(f.nombre), f.id]))
    const nuevo = { ...borrador }
    const sinMatch: string[] = []
    let aplicadas = 0

    for (const linea of pegado.split('\n')) {
      if (linea.trim() === '') continue

      const partes = linea.split('\t').map((p) => p.trim())
      const nombre = partes[0] ?? ''
      const id = porNombre.get(normalizar(nombre))

      if (id === undefined) {
        sinMatch.push(nombre)
        continue
      }

      const actual = nuevo[id] ?? { nav: '', retorno: '' }
      nuevo[id] = {
        nav: partes[1] !== undefined && partes[1] !== '' ? partes[1] : actual.nav,
        retorno: partes[2] !== undefined && partes[2] !== '' ? partes[2] : actual.retorno,
      }
      aplicadas += 1
    }

    setBorrador(nuevo)
    setPegado('')
    setEstado(
      sinMatch.length === 0
        ? `${aplicadas} filas aplicadas.`
        : `${aplicadas} filas aplicadas. Sin fondo que coincida: ${sinMatch.join(', ')}.`,
    )
  }

  const guardar = () => {
    setEstado(null)

    const filas: ObservacionEntrada[] = fondos.map((f) => ({
      fondoId: f.id,
      nav: desdeInput(borrador[f.id]?.nav ?? ''),
      retornoTotal: desdeInput(borrador[f.id]?.retorno ?? ''),
    }))

    empezarGuardado(async () => {
      const resultado = await guardarMes(mesActivo, filas)
      setEstado(resultado.ok ? `Guardado: ${resultado.guardadas} fondos.` : resultado.error)
    })
  }

  /* Se dispara al salir del campo: el Treasury es un numero por mes y no vale
     la pena un boton propio para el. */
  const guardarElTreasury = () => {
    empezarGuardado(async () => {
      const resultado = await guardarTreasury(mesActivo, desdeInput(treasuryTexto))
      setEstado(resultado.ok ? 'Treasury guardado.' : resultado.error)
    })
  }

  return (
    <div className={estilos.pantalla}>
      <div className={estilos.barra}>
        <label className={estilos.campoMes}>
          Mes
          <select
            value={mesActivo}
            onChange={(e) => {
              // Cambiar de mes recarga desde el servidor: el borrador es de
              // este mes y arrastrarlo al siguiente duplicaria los numeros.
              window.location.search = `?mes=${e.target.value}`
              setMesActivo(e.target.value)
            }}
          >
            {mesesDisponibles.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>

        <label className={estilos.campoMes}>
          Treasury 10Y (cierre del último día)
          <input
            type="text"
            inputMode="decimal"
            value={treasuryTexto}
            onChange={(e) => setTreasuryTexto(e.target.value)}
            onBlur={guardarElTreasury}
            placeholder="0.0425"
          />
        </label>

        <span className={estilos.conteo}>
          {cargados} de {fondos.length} fondos con retorno
        </span>

        <button
          type="button"
          className={estilos.guardar}
          onClick={guardar}
          disabled={guardando}
        >
          {guardando ? 'Guardando…' : 'Guardar el mes'}
        </button>
      </div>

      {estado !== null && <p className={estilos.estado}>{estado}</p>}

      <details className={estilos.pegar}>
        <summary>Pegar desde Excel</summary>
        <p>
          Tres columnas, separadas por tabulación: nombre del fondo, NAV, retorno total. El
          retorno va como fracción (0.0086), no como porcentaje. Un nombre que no coincida con
          ningún fondo se informa y no se carga.
        </p>
        <textarea
          value={pegado}
          onChange={(e) => setPegado(e.target.value)}
          rows={6}
          placeholder={'Blue Owl ORENT\t10.70\t0.0059'}
        />
        <button type="button" onClick={aplicarPegado} disabled={pegado.trim() === ''}>
          Aplicar
        </button>
      </details>

      <table className={estilos.tabla}>
        <thead>
          <tr>
            <th scope="col">Fondo</th>
            <th scope="col">Asset Class</th>
            <th scope="col">NAV</th>
            <th scope="col">Retorno total</th>
            <th scope="col">Distribución implícita</th>
          </tr>
        </thead>
        <tbody>
          {fondos.map((f) => {
            const fila = borrador[f.id] ?? { nav: '', retorno: '' }
            const nav = desdeInput(fila.nav)
            const retorno = desdeInput(fila.retorno)

            /*
             * La apertura solo se puede mostrar con el NAV del mes anterior,
             * que esta pantalla no tiene. Lo que si se puede mostrar es el
             * signo del retorno, que es la revision que atrapa el error mas
             * comun: pegar 0.86 donde iba 0.0086.
             */
            const sospechoso = retorno !== null && Math.abs(retorno) > 0.5

            return (
              <tr key={f.id}>
                <th scope="row">{f.nombre}</th>
                <td className={estilos.tenue}>{f.assetClass}</td>
                <td>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={fila.nav}
                    onChange={(e) => cambiar(f.id, 'nav', e.target.value)}
                    aria-label={`NAV de ${f.nombre}`}
                  />
                </td>
                <td>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={fila.retorno}
                    onChange={(e) => cambiar(f.id, 'retorno', e.target.value)}
                    aria-label={`Retorno total de ${f.nombre}`}
                    className={sospechoso ? estilos.sospechoso : undefined}
                  />
                </td>
                <td className={estilos.tenue}>
                  {sospechoso
                    ? '¿Es un porcentaje? Va como fracción.'
                    : nav === null || retorno === null
                      ? ''
                      : 'Se calcula al guardar'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
