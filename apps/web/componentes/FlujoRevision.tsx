'use client'

import { evaluarRevision } from '@sabbi/core'
import type { Cta } from '@sabbi/core'
import { useActionState, useEffect, useMemo, useReducer, useRef, useState, useTransition } from 'react'

import { Avisos } from '../componentes/Avisos'
import { PanelParametros } from '../componentes/PanelParametros'
import { PanelPlan } from '../componentes/PanelPlan'
import { Resumen } from '../componentes/Resumen'
import { SubirFicha } from '../componentes/SubirFicha'
import { TablaPosiciones } from '../componentes/TablaPosiciones'
import { aRevisadas, reducir } from '../lib/estado'
import type { Accion, EstadoRevision, Parametros, PosicionEditada } from '../lib/estado'
import { plural } from '../lib/formato'
import { calcularPlan, subirFicha } from './acciones'
import type { PlanResumido, ResultadoSubida } from './acciones'
import estilos from './page.module.css'

export default function Pagina() {
  const [subida, subir, subiendo] = useActionState<ResultadoSubida | null, FormData>(
    subirFicha,
    null,
  )
  const [estado, despacharCrudo] = useReducer(reducir, null)
  const [plan, setPlan] = useState<PlanResumido | null>(null)
  const [calculando, calcular] = useTransition()
  const cargada = useRef<ResultadoSubida | null>(null)

  // Cualquier cambio invalida el plan ya calculado: mostrar cifras viejas al
  // lado de posiciones nuevas es la forma mas rapida de mandar mal una propuesta.
  const despachar = (accion: Accion) => {
    setPlan(null)
    despacharCrudo(accion)
  }

  useEffect(() => {
    if (subida === null || subida === cargada.current || !subida.ok) return
    cargada.current = subida
    despacharCrudo({ tipo: 'cargar', ficha: subida.ficha, archivo: subida.archivo })
  }, [subida])

  if (estado === null) {
    return (
      <main className={estilos.pagina}>
        <Encabezado paso="Paso 1 de 3" titulo="Subí la ficha patrimonial" />
        <SubirFicha
          accion={subir}
          pendiente={subiendo}
          error={subida !== null && !subida.ok ? subida.error : undefined}
        />
      </main>
    )
  }

  return (
    <Revision
      estado={estado}
      despachar={despachar}
      plan={plan}
      calculando={calculando}
      alCalcular={() => {
        calcular(async () => {
          const resultado = await calcularPlan(aRevisadas(estado.posiciones), {
            perfil: estado.parametros.perfil,
            necesitaFlujos: estado.parametros.necesitaFlujos,
            usPerson: estado.parametros.usPerson,
            institucional: estado.parametros.institucional,
            incluirInmueblesDeRenta: estado.parametros.incluirInmueblesDeRenta,
            colchonLiquidezUsd: estado.parametros.colchonLiquidezUsd,
            ticketMinimoUsd: estado.parametros.ticketMinimoUsd,
          })
          setPlan(resultado.ok ? resultado.plan : null)
        })
      }}
    />
  )
}

interface RevisionProps {
  readonly estado: EstadoRevision
  readonly despachar: (accion: Accion) => void
  readonly plan: PlanResumido | null
  readonly calculando: boolean
  readonly alCalcular: () => void
}

function Revision({ estado, despachar, plan, calculando, alCalcular }: RevisionProps) {
  const { ficha, posiciones, parametros } = estado

  const revision = useMemo(
    () =>
      evaluarRevision(aRevisadas(posiciones), {
        usPerson: parametros.usPerson,
        incluirInmueblesDeRenta: parametros.incluirInmueblesDeRenta,
        colchonLiquidezUsd: parametros.colchonLiquidezUsd,
      }),
    [posiciones, parametros],
  )

  const bloqueado = revision.bloqueos.length > 0

  return (
    <main className={estilos.pagina}>
      <Encabezado
        paso="Paso 2 de 3"
        titulo={ficha.cliente.nombre ?? 'Revisión de posiciones'}
        detalle={[
          estado.archivo,
          ficha.cliente.horizonte !== null ? `horizonte ${ficha.cliente.horizonte}` : null,
          plural(posiciones.length, 'posición', 'posiciones'),
        ]
          .filter((parte): parte is string => parte !== null)
          .join(' · ')}
        accion={
          <button
            type="button"
            className="secundario"
            onClick={() => despachar({ tipo: 'descartar' })}
          >
            Cargar otra ficha
          </button>
        }
      />

      <Resumen resumen={revision.resumen} usoPropioVisible={revision.resumen.usoPropioUsd > 0} />

      <Avisos bloqueos={revision.bloqueos} avisos={ficha.avisos} ignoradas={ficha.ignoradas} />

      <PanelParametros
        parametros={parametros}
        cambiar={(cambios: Partial<Parametros>) => despachar({ tipo: 'parametros', cambios })}
        patrimonioUsd={revision.resumen.patrimonioInvertibleUsd}
        inmueblesRentaUsd={revision.resumen.inmueblesRentaUsd}
        flujoDeclarado={ficha.cliente.flujoActual}
      />

      <TablaPosiciones
        posiciones={posiciones}
        editar={(id: string, cambios: Partial<PosicionEditada>) =>
          despachar({ tipo: 'editar', id, cambios })
        }
        marcar={(id: string, cta: Cta) => despachar({ tipo: 'cta', id, cta })}
      />

      {ficha.cliente.observaciones.length > 0 && (
        <details className={estilos.observaciones}>
          <summary>Lo que el cliente escribió al final de la ficha</summary>
          <ul>
            {ficha.cliente.observaciones.map((linea) => (
              <li key={linea}>{linea}</li>
            ))}
          </ul>
        </details>
      )}

      <div className={estilos.barra}>
        <p className={estilos.pie}>
          {bloqueado
            ? 'Resolvé lo de arriba para poder calcular.'
            : revision.resumen.sinMarcar > 0
              ? `Quedan ${plural(revision.resumen.sinMarcar, 'posición sin marcar', 'posiciones sin marcar')}: se calculan como conservadas.`
              : 'Todo listo para calcular.'}
        </p>
        <button
          type="button"
          className="primario"
          disabled={bloqueado || calculando}
          onClick={alCalcular}
        >
          {calculando ? 'Calculando…' : 'Calcular el plan'}
        </button>
      </div>

      {plan !== null && <PanelPlan plan={plan} />}
    </main>
  )
}

interface EncabezadoProps {
  readonly paso: string
  readonly titulo: string
  readonly detalle?: string
  readonly accion?: React.ReactNode
}

function Encabezado({ paso, titulo, detalle, accion }: EncabezadoProps) {
  return (
    <header className={estilos.encabezado}>
      <div>
        <p className="eyebrow">{paso}</p>
        <h1>{titulo}</h1>
        {detalle !== undefined && <p className={estilos.detalle}>{detalle}</p>}
      </div>
      {accion}
    </header>
  )
}
