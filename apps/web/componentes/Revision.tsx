'use client'

import { evaluarRevision } from '@sabbi/core'
import type { Cta } from '@sabbi/core'
import Link from 'next/link'
import { useMemo, useReducer, useState, useTransition } from 'react'

import { calcularPlan, guardarCambioParametros, guardarCambioPosicion } from '../app/acciones'
import type { PlanResumido } from '../app/acciones'
import estilos from '../app/page.module.css'
import { useAutoguardado } from '../lib/autoguardado'
import {
  aRevisadas,
  cambiosDeCta,
  camposTrasEditar,
  reducir,
  ventaParcialInvalida,
} from '../lib/estado'
import type { EstadoRevision, Parametros, PosicionEditada } from '../lib/estado'
import { plural } from '../lib/formato'
import { Avisos } from './Avisos'
import { Guardado } from './Guardado'
import { PanelParametros } from './PanelParametros'
import { PanelPlan } from './PanelPlan'
import { Resumen } from './Resumen'
import { TablaPosiciones } from './TablaPosiciones'

/** Clave de la cola para el bloque de parámetros. Ninguna posición usa este id. */
const CLAVE_PARAMETROS = 'parametros'

type Cambio = Partial<PosicionEditada> | Parametros

/**
 * Paso 2: la revisión de la ficha.
 *
 * El estado nace de lo que devolvió la base y vuelve a ella sola: no hay botón
 * de guardar porque nadie lo apretaría. Lo que sí hay es un botón de calcular,
 * porque calcular es una decisión.
 */
export function Revision({ inicial }: { readonly inicial: EstadoRevision }) {
  const [estado, despacharCrudo] = useReducer(reducir, inicial)
  const [plan, setPlan] = useState<PlanResumido | null>(null)
  const [calculando, calcular] = useTransition()

  const { estado: guardado, encolar } = useAutoguardado<Cambio>(async (clave, cambios) => {
    if (clave !== CLAVE_PARAMETROS) {
      return guardarCambioPosicion(clave, cambios as Partial<PosicionEditada>)
    }
    if (estado.propuestaId === '') {
      return { error: 'Esta ficha no tiene una propuesta abierta. Volvé a subirla.' }
    }
    return guardarCambioParametros(estado.propuestaId, estado.clienteId, cambios as Parametros)
  })

  const posicionesSinGuardar = estado.posiciones.filter(ventaParcialInvalida).length

  const editar = (id: string, cambios: Partial<PosicionEditada>) => {
    const posicion = estado.posiciones.find((candidata) => candidata.id === id)
    if (posicion === undefined) return

    // Volver a escribir el mismo valor no es una corrección: no ensucia la
    // pantalla ni gasta un viaje a la base.
    const camposEditados = camposTrasEditar(posicion, cambios)
    if (camposEditados === posicion.camposEditados) return

    // Cualquier cambio invalida el plan ya calculado: mostrar cifras viejas al
    // lado de posiciones nuevas es la forma más rápida de mandar mal una propuesta.
    setPlan(null)
    despacharCrudo({ tipo: 'editar', id, cambios })

    const siguiente = { ...posicion, ...cambios }
    // Un monto a vender por encima de la posición lo rechaza la base. Se queda
    // en pantalla, marcado, y sale en cuanto el asesor lo corrige.
    if (ventaParcialInvalida(siguiente)) return

    encolar(id, { ...cambios, camposEditados })
  }

  const marcar = (id: string, cta: Cta) => {
    const posicion = estado.posiciones.find((candidata) => candidata.id === id)
    if (posicion === undefined) return
    editar(id, cambiosDeCta(posicion, cta))
  }

  const cambiarParametros = (cambios: Partial<Parametros>) => {
    setPlan(null)
    despacharCrudo({ tipo: 'parametros', cambios })
    encolar(CLAVE_PARAMETROS, { ...estado.parametros, ...cambios })
  }

  const { cliente, posiciones, parametros } = estado

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

  const alCalcular = () => {
    calcular(async () => {
      const resultado = await calcularPlan(aRevisadas(posiciones), {
        perfil: parametros.perfil,
        necesitaFlujos: parametros.necesitaFlujos,
        usPerson: parametros.usPerson,
        institucional: parametros.institucional,
        incluirInmueblesDeRenta: parametros.incluirInmueblesDeRenta,
        colchonLiquidezUsd: parametros.colchonLiquidezUsd,
        ticketMinimoUsd: parametros.ticketMinimoUsd,
      })
      setPlan(resultado.ok ? resultado.plan : null)
    })
  }

  return (
    <main className={estilos.pagina}>
      <header className={estilos.encabezado}>
        <div>
          <p className="eyebrow">Paso 2 de 3</p>
          <h1>{cliente.nombre ?? 'Revisión de posiciones'}</h1>
          <p className={estilos.detalle}>
            {[
              estado.archivo,
              cliente.horizonte !== null ? `horizonte ${cliente.horizonte}` : null,
              plural(posiciones.length, 'posición', 'posiciones'),
            ]
              .filter((parte): parte is string => parte !== null)
              .join(' · ')}
          </p>
        </div>
        <div className={estilos.accionesEncabezado}>
          <Guardado estado={guardado} sinGuardar={posicionesSinGuardar} />
          <Link href="/" className="secundario">
            Cargar otra ficha
          </Link>
        </div>
      </header>

      <Resumen resumen={revision.resumen} usoPropioVisible={revision.resumen.usoPropioUsd > 0} />

      <Avisos bloqueos={revision.bloqueos} avisos={estado.avisos} ignoradas={estado.ignoradas} />

      <PanelParametros
        parametros={parametros}
        cambiar={cambiarParametros}
        patrimonioUsd={revision.resumen.patrimonioInvertibleUsd}
        inmueblesRentaUsd={revision.resumen.inmueblesRentaUsd}
        flujoDeclarado={cliente.flujoActual}
      />

      <TablaPosiciones posiciones={posiciones} editar={editar} marcar={marcar} />

      {cliente.observaciones.length > 0 && (
        <details className={estilos.observaciones}>
          <summary>Lo que el cliente escribió al final de la ficha</summary>
          <ul>
            {cliente.observaciones.map((linea) => (
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
