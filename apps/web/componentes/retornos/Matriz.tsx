'use client'

import { memo, useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'

import { mediana } from '@sabbi/core'

import { guardarCeldas } from '../../app/retornos/acciones'
import type { CeldaEntrada } from '../../app/retornos/acciones'
import { mesCorto } from '../../lib/formato'
import { RETORNO_SOSPECHOSO, aCelda, desdeCelda, mismaCifra } from '../../lib/retornos-celda'
import type { CampoCelda } from '../../lib/retornos-celda'
import estilos from './Matriz.module.css'

export interface ColumnaFondo {
  readonly id: number
  readonly nombre: string
  readonly assetClass: string
  readonly esReferencia: boolean
  readonly activo: boolean
}

export interface CeldaCargada {
  readonly fondoId: number
  readonly mes: string
  readonly nav: number | null
  readonly retorno: number | null
}

interface Props {
  readonly columnas: readonly ColumnaFondo[]
  /** Del mes mas reciente al mas viejo. */
  readonly meses: readonly string[]
  readonly celdas: readonly CeldaCargada[]
  readonly clases: readonly string[]
  readonly treasury: readonly { readonly mes: string; readonly cierre: number }[]
}

const clave = (fondoId: number, mes: string): string => `${fondoId}:${mes}`

export function Matriz({ columnas, meses, celdas, clases, treasury }: Props) {
  const [campo, setCampo] = useState<CampoCelda>('retorno')
  const [clase, setClase] = useState('todas')
  const [busqueda, setBusqueda] = useState('')
  const [rango, setRango] = useState(24)
  const [soloActivos, setSoloActivos] = useState(true)
  const [borrador, setBorrador] = useState<Record<string, string>>({})
  const [estado, setEstado] = useState<string | null>(null)
  const [guardando, empezarGuardado] = useTransition()
  const grilla = useRef<HTMLDivElement>(null)

  /** Lo que la base tiene hoy, por celda. Es contra esto que se mide lo sucio. */
  const cargadas = useMemo(() => {
    const mapa = new Map<string, CeldaCargada>()
    for (const c of celdas) mapa.set(clave(c.fondoId, c.mes), c)
    return mapa
  }, [celdas])

  const visibles = useMemo(() => {
    const texto = busqueda.trim().toLowerCase()
    return columnas.filter(
      (c) =>
        (clase === 'todas' || c.assetClass === clase) &&
        (!soloActivos || c.activo) &&
        (texto === '' || c.nombre.toLowerCase().includes(texto)),
    )
  }, [columnas, clase, busqueda, soloActivos])

  const filas = useMemo(() => (rango === 0 ? meses : meses.slice(0, rango)), [meses, rango])

  const valorDe = useCallback(
    (fondoId: number, mes: string): number | null => {
      const c = cargadas.get(clave(fondoId, mes))
      return campo === 'retorno' ? (c?.retorno ?? null) : (c?.nav ?? null)
    },
    [cargadas, campo],
  )

  const textoDe = useCallback(
    (fondoId: number, mes: string): string => {
      const editado = borrador[`${campo}:${clave(fondoId, mes)}`]
      return editado ?? aCelda(valorDe(fondoId, mes), campo)
    },
    [borrador, campo, valorDe],
  )

  const escribir = useCallback(
    (fondoId: number, mes: string, texto: string) =>
      setBorrador((previo) => ({ ...previo, [`${campo}:${clave(fondoId, mes)}`]: texto })),
    [campo],
  )

  /**
   * Las celdas que cambiaron de verdad.
   *
   * Se compara el numero, no el texto: alguien que entra a una celda de 0.83,
   * la deja igual y sale no escribio nada, y mandar esa fila al upsert le
   * cambiaria el `creado_por` a un dato que nadie toco.
   */
  const sucias = useMemo(() => {
    const lista: { readonly fondoId: number; readonly mes: string; readonly campo: CampoCelda }[] = []

    for (const [llave, texto] of Object.entries(borrador)) {
      const [cual, resto] = [llave.slice(0, llave.indexOf(':')), llave.slice(llave.indexOf(':') + 1)]
      const cualCampo = cual as CampoCelda
      const fondoId = Number(resto.slice(0, resto.indexOf(':')))
      const mes = resto.slice(resto.indexOf(':') + 1)

      const guardado = cargadas.get(clave(fondoId, mes))
      const previo = cualCampo === 'retorno' ? (guardado?.retorno ?? null) : (guardado?.nav ?? null)
      const nuevo = desdeCelda(texto, cualCampo)

      if (mismaCifra(previo, nuevo)) continue
      lista.push({ fondoId, mes, campo: cualCampo })
    }

    return lista
  }, [borrador, cargadas])

  const guardar = () => {
    if (sucias.length === 0) return
    setEstado(null)

    /* Una celda por (fondo, mes), con las dos cifras: ver `guardarCeldas`. */
    const porCelda = new Map<string, CeldaEntrada>()
    for (const sucia of sucias) {
      const llave = clave(sucia.fondoId, sucia.mes)
      const guardado = cargadas.get(llave)
      const previa = porCelda.get(llave)

      const nav =
        borrador[`nav:${llave}`] !== undefined
          ? desdeCelda(borrador[`nav:${llave}`]!, 'nav')
          : (previa?.nav ?? guardado?.nav ?? null)
      const retornoTotal =
        borrador[`retorno:${llave}`] !== undefined
          ? desdeCelda(borrador[`retorno:${llave}`]!, 'retorno')
          : (previa?.retornoTotal ?? guardado?.retorno ?? null)

      porCelda.set(llave, { fondoId: sucia.fondoId, mes: sucia.mes, nav, retornoTotal })
    }

    empezarGuardado(async () => {
      const resultado = await guardarCeldas([...porCelda.values()])
      if (!resultado.ok) {
        setEstado(resultado.error)
        return
      }
      setBorrador({})
      setEstado(`${porCelda.size} ${porCelda.size === 1 ? 'celda guardada' : 'celdas guardadas'}.`)
    })
  }

  /*
   * Ctrl+S guarda. Quien viene de la hoja lo va a apretar igual, y sin esto el
   * navegador abre el dialogo de guardar pagina sobre una tabla a medio cargar.
   *
   * El listener se vuelve a colgar en cada render a proposito: `guardar` lee el
   * borrador de este render, y una version congelada guardaria lo que habia
   * cuando se monto la pantalla.
   */
  useEffect(() => {
    const alTeclear = (evento: KeyboardEvent) => {
      if (!(evento.ctrlKey || evento.metaKey) || evento.key.toLowerCase() !== 's') return
      evento.preventDefault()
      guardar()
    }
    window.addEventListener('keydown', alTeclear)
    return () => window.removeEventListener('keydown', alTeclear)
  })

  const descartar = () => {
    setBorrador({})
    setEstado(null)
  }

  /** Mueve el foco por la grilla. Es lo que hace que esto se cargue sin mouse. */
  const mover = (fila: number, columna: number) => {
    const destino = grilla.current?.querySelector<HTMLInputElement>(
      `input[data-fila="${fila}"][data-columna="${columna}"]`,
    )
    if (destino === null || destino === undefined) return
    destino.focus()
    destino.select()
  }

  const alTeclearCelda = (evento: React.KeyboardEvent<HTMLInputElement>, fila: number, columna: number) => {
    const teclas: Record<string, readonly [number, number]> = {
      ArrowUp: [fila - 1, columna],
      ArrowDown: [fila + 1, columna],
      Enter: [fila + 1, columna],
      ArrowLeft: [fila, columna - 1],
      ArrowRight: [fila, columna + 1],
    }

    /* Las flechas laterales solo navegan si el cursor esta en la punta: adentro
       de un numero a medio escribir tienen que seguir moviendo el cursor. */
    const entrada = evento.currentTarget
    const enPunta =
      evento.key === 'ArrowLeft'
        ? entrada.selectionStart === 0
        : evento.key === 'ArrowRight'
          ? entrada.selectionStart === entrada.value.length
          : true

    const destino = teclas[evento.key]
    if (destino === undefined || !enPunta) {
      if (evento.key === 'Escape') entrada.blur()
      return
    }

    evento.preventDefault()
    mover(destino[0], destino[1])
  }

  /**
   * Pegar un bloque desde Excel.
   *
   * Cae donde esta el cursor y se derrama hacia abajo y a la derecha, como en
   * cualquier hoja. Es lo que convierte «copiar el mes del reporte» en un
   * movimiento y no en cuarenta.
   */
  const alPegar = (evento: React.ClipboardEvent<HTMLInputElement>, fila: number, columna: number) => {
    const texto = evento.clipboardData.getData('text/plain')
    if (!texto.includes('\t') && !texto.includes('\n')) return

    evento.preventDefault()
    const bloque = texto.replace(/\r/g, '').split('\n')
    const cambios: Record<string, string> = {}

    bloque.forEach((linea, y) => {
      if (linea.trim() === '' && y === bloque.length - 1) return
      linea.split('\t').forEach((valor, x) => {
        const mes = filas[fila + y]
        const fondo = visibles[columna + x]
        if (mes === undefined || fondo === undefined) return
        cambios[`${campo}:${clave(fondo.id, mes)}`] = valor.trim()
      })
    })

    setBorrador((previo) => ({ ...previo, ...cambios }))
    setEstado(`${Object.keys(cambios).length} celdas pegadas. Todavía sin guardar.`)
  }

  /**
   * La escala del mapa de calor.
   *
   * Sale de los datos visibles y no de un numero fijo: un mes de crédito
   * privado se mueve 0.8% y uno de venture 12%, y una escala comun pinta la
   * mitad de la tabla en blanco. Es el percentil 90 del valor absoluto, asi
   * que un solo mes extremo no aplana el resto.
   */
  const escala = useMemo(() => {
    if (campo === 'nav') return 1
    const valores: number[] = []
    for (const mes of filas) {
      for (const fondo of visibles) {
        const v = valorDe(fondo.id, mes)
        if (v !== null && v !== 0) valores.push(Math.abs(v))
      }
    }
    if (valores.length === 0) return 0.02
    valores.sort((a, b) => a - b)
    return valores[Math.floor(valores.length * 0.9)] ?? 0.02
  }, [filas, visibles, valorDe, campo])

  /** Mediana y cobertura del mes, sobre los fondos visibles. */
  const resumenDeMes = useCallback(
    (mes: string) => {
      const valores: number[] = []
      for (const fondo of visibles) {
        if (fondo.esReferencia) continue
        const v = valorDe(fondo.id, mes)
        if (v !== null) valores.push(v)
      }
      return { mediana: mediana(valores), cargados: valores.length }
    },
    [visibles, valorDe],
  )

  const cierreTreasury = useMemo(
    () => new Map(treasury.map((t) => [t.mes, t.cierre])),
    [treasury],
  )

  /* Un separador arriba de cada asset class: sesenta columnas sin agrupar son
     sesenta nombres sueltos. */
  const grupos = useMemo(() => {
    const lista: { readonly clase: string; readonly cuantos: number }[] = []
    for (const fondo of visibles) {
      const ultimo = lista.at(-1)
      if (ultimo !== undefined && ultimo.clase === fondo.assetClass) {
        lista[lista.length - 1] = { clase: ultimo.clase, cuantos: ultimo.cuantos + 1 }
      } else {
        lista.push({ clase: fondo.assetClass, cuantos: 1 })
      }
    }
    return lista
  }, [visibles])

  return (
    <div className={estilos.pantalla}>
      <div className={estilos.barra}>
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

        <input
          className={estilos.busqueda}
          type="search"
          placeholder="Buscar un fondo"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          aria-label="Buscar un fondo"
        />

        <select
          className={estilos.select}
          value={clase}
          onChange={(e) => setClase(e.target.value)}
          aria-label="Filtrar por clase de activo"
        >
          <option value="todas">Todas las clases</option>
          {clases.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        <select
          className={estilos.select}
          value={rango}
          onChange={(e) => setRango(Number(e.target.value))}
          aria-label="Cuántos meses se muestran"
        >
          <option value={12}>Últimos 12 meses</option>
          <option value={24}>Últimos 24 meses</option>
          <option value={60}>Últimos 5 años</option>
          <option value={0}>Toda la serie</option>
        </select>

        <label className={estilos.casilla}>
          <input
            type="checkbox"
            checked={soloActivos}
            onChange={(e) => setSoloActivos(e.target.checked)}
          />
          Solo activos
        </label>

        <span className={estilos.conteo}>
          {visibles.length} fondos · {filas.length} meses
        </span>

        <div className={estilos.acciones}>
          {sucias.length > 0 && (
            <button type="button" className={estilos.descartar} onClick={descartar}>
              Descartar
            </button>
          )}
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
                : `Guardar ${sucias.length} ${sucias.length === 1 ? 'cambio' : 'cambios'}`}
          </button>
        </div>
      </div>

      <p className={estilos.ayuda}>
        {campo === 'retorno' ? (
          <>
            <strong>Los retornos van en porcentaje:</strong> 0.83 es 0.83%, igual que en el
            reporte del manager. Flechas para moverse, Enter para bajar, Ctrl+S para guardar.
            Se puede pegar un bloque entero desde Excel: cae donde está el cursor.
          </>
        ) : (
          <>
            <strong>El NAV va tal cual lo publica el manager</strong>, sin convertir. Solo abre
            el retorno entre capital y distribución; ninguna métrica se calcula sobre él.
          </>
        )}
        {estado !== null && <span className={estilos.estado}>{estado}</span>}
      </p>

      <div className={estilos.marco} ref={grilla}>
        <table className={estilos.tabla}>
          <thead>
            <tr className={estilos.filaGrupos}>
              <th className={`${estilos.fija} ${estilos.esquina}`} />
              <th className={estilos.resumenCabecera} colSpan={2}>
                El mes
              </th>
              {grupos.map((g, i) => (
                <th
                  key={`${g.clase}-${i}`}
                  colSpan={g.cuantos}
                  className={estilos.grupo}
                  scope="colgroup"
                >
                  {g.clase}
                </th>
              ))}
            </tr>
            <tr>
              <th className={`${estilos.fija} ${estilos.thMes}`} scope="col">
                Mes
              </th>
              <th className={estilos.thResumen} scope="col" title="Mediana de los fondos visibles">
                Mediana
              </th>
              <th className={estilos.thResumen} scope="col" title="Treasury 10Y del mes">
                T10Y
              </th>
              {visibles.map((fondo) => (
                <th key={fondo.id} className={estilos.thFondo} scope="col" title={fondo.nombre}>
                  <span className={fondo.esReferencia ? estilos.nombreIndice : undefined}>
                    {fondo.nombre}
                  </span>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {filas.map((mes, fila) => {
              const resumen = resumenDeMes(mes)
              const t10y = cierreTreasury.get(mes)
              return (
                <tr key={mes} className={mes.endsWith('-12') ? estilos.cierreDeAnio : undefined}>
                  <th scope="row" className={`${estilos.fija} ${estilos.celdaMes}`}>
                    {mesCorto(mes)}
                    <span className={estilos.cobertura}>{resumen.cargados}</span>
                  </th>
                  <td className={estilos.celdaResumen}>
                    {resumen.mediana === null ? '' : `${(resumen.mediana * 100).toFixed(2)}%`}
                  </td>
                  <td className={estilos.celdaResumen}>
                    {t10y === undefined ? '' : `${(t10y * 100).toFixed(2)}%`}
                  </td>

                  {visibles.map((fondo, columna) => (
                    <Celda
                      key={fondo.id}
                      fila={fila}
                      columna={columna}
                      valor={textoDe(fondo.id, mes)}
                      campo={campo}
                      escala={escala}
                      sucia={borrador[`${campo}:${clave(fondo.id, mes)}`] !== undefined}
                      etiqueta={`${fondo.nombre}, ${mes}`}
                      alCambiar={(texto) => escribir(fondo.id, mes, texto)}
                      alTeclear={alTeclearCelda}
                      alPegar={alPegar}
                    />
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>

        {visibles.length === 0 && (
          <p className={estilos.vacio}>Ningún fondo coincide con el filtro.</p>
        )}
      </div>
    </div>
  )
}

interface PropsCelda {
  readonly fila: number
  readonly columna: number
  readonly valor: string
  readonly campo: CampoCelda
  readonly escala: number
  readonly sucia: boolean
  readonly etiqueta: string
  readonly alCambiar: (texto: string) => void
  readonly alTeclear: (evento: React.KeyboardEvent<HTMLInputElement>, fila: number, columna: number) => void
  readonly alPegar: (evento: React.ClipboardEvent<HTMLInputElement>, fila: number, columna: number) => void
}

/**
 * Una celda de la grilla.
 *
 * `memo` no es una optimizacion prematura acá: son hasta mil quinientas
 * celdas, y sin esto cada tecla que alguien aprieta vuelve a dibujar la tabla
 * entera. Con esto se redibuja la celda que cambio.
 */
const Celda = memo(function Celda({
  fila,
  columna,
  valor,
  campo,
  escala,
  sucia,
  etiqueta,
  alCambiar,
  alTeclear,
  alPegar,
}: PropsCelda) {
  const numero = desdeCelda(valor, campo)

  /*
   * El fondo de la celda dice el signo y el tamaño. La tinta no se toca: lo
   * que se lee es el numero, y un verde sobre verde a media opacidad lo borra.
   */
  const intensidad =
    campo === 'nav' || numero === null || numero === 0
      ? 0
      : Math.min(1, Math.abs(numero) / (escala * 1.6))

  const fondo =
    intensidad === 0
      ? undefined
      : `color-mix(in srgb, var(${numero! > 0 ? '--calor-positivo' : '--calor-negativo'}) ${(
          intensidad * 100
        ).toFixed(0)}%, transparent)`

  const sospechoso = campo === 'retorno' && numero !== null && Math.abs(numero) > RETORNO_SOSPECHOSO

  return (
    <td
      className={`${estilos.celda} ${sucia ? estilos.sucia : ''} ${sospechoso ? estilos.sospechosa : ''}`}
      style={fondo === undefined ? undefined : { background: fondo }}
    >
      <input
        type="text"
        inputMode="decimal"
        value={valor}
        data-fila={fila}
        data-columna={columna}
        aria-label={etiqueta}
        title={sospechoso ? '¿Es una fracción? Acá el retorno va en porcentaje.' : undefined}
        onChange={(e) => alCambiar(e.target.value)}
        onKeyDown={(e) => alTeclear(e, fila, columna)}
        onPaste={(e) => alPegar(e, fila, columna)}
        onFocus={(e) => e.currentTarget.select()}
      />
    </td>
  )
})
