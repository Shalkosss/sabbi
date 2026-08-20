'use client'

import { evaluarRevision, posicionesIncompletas } from '@sabbi/core'
import type { AjusteClase, Bloqueo, ClaseModelo, Cta, Restriccion } from '@sabbi/core'
import { useMemo, useReducer, useState, useTransition } from 'react'

import {
  calcularPlan,
  guardarCambioActivo,
  guardarCambioAjuste,
  guardarCambioParametros,
  guardarCambioPosicion,
} from '../app/acciones'
import type { PlanResumido } from '../app/acciones'
import { useAutoguardado } from '../lib/autoguardado'
import type { ProductoOfrecible } from '../lib/catalogo'
import {
  aRevisadas,
  cambiosDeCta,
  camposTrasEditar,
  reducir,
  ventaParcialInvalida,
} from '../lib/estado'
import type { EstadoRevision, Parametros, PosicionEditada } from '../lib/estado'
import { plural } from '../lib/formato'
import { AjustesObjetivo } from './AjustesObjetivo'
import { Avisos } from './Avisos'
import { BarraAccion } from './BarraAccion'
import type { Salida } from './BarraAccion'
import { BarraParametros } from './BarraParametros'
import { Cabecera } from './Cabecera'
import { Guardado } from './Guardado'
import { Marco } from './Marco'
import { PanelPlan } from './PanelPlan'
import { TablaPosiciones } from './TablaPosiciones'
import estilos from './Revision.module.css'

/**
 * Claves de la cola de autoguardado.
 *
 * Las posiciones se encolan por su uuid, así que un prefijo con dos puntos no
 * puede chocar con ninguna. Borrar viaja por la misma cola que guardar —con la
 * bandera `eliminado`— y no por una acción aparte: la cola garantiza que no
 * haya dos envíos de la misma clave en vuelo, y sin esa garantía un borrado
 * podría llegar antes que el guardado que lo precede.
 */
const CLAVE_PARAMETROS = 'parametros'
const PREFIJO_ACTIVO = 'activo:'
const PREFIJO_AJUSTE = 'ajuste:'

type ActivoEnCola = Restriccion & { readonly eliminado: boolean }
type AjusteEnCola = AjusteClase & { readonly eliminado: boolean }

type Cambio = Partial<PosicionEditada> | Parametros | ActivoEnCola | AjusteEnCola

interface Props {
  readonly inicial: EstadoRevision
  readonly asesor: { readonly nombre: string; readonly rol: string }
  /** El menú ofrecible, para el desplegable de activos agregados. */
  readonly productos: readonly ProductoOfrecible[]
}

/**
 * Paso 2: la revisión de la ficha.
 *
 * El estado nace de lo que devolvió la base y vuelve a ella sola: no hay botón
 * de guardar porque nadie lo apretaría. Lo que sí hay es un botón de calcular,
 * porque calcular es una decisión.
 */
export function Revision({ inicial, asesor, productos }: Props) {
  const [estado, despacharCrudo] = useReducer(reducir, inicial)
  const [plan, setPlan] = useState<PlanResumido | null>(null)
  // Lo que el servidor rechazó y el gate del navegador no había previsto. Sin
  // esto el botón giraba y no pasaba nada: nadie sabía por qué.
  const [rechazo, setRechazo] = useState<readonly Bloqueo[]>([])
  const [calculando, calcular] = useTransition()

  const { estado: guardado, encolar } = useAutoguardado<Cambio>(async (clave, cambios) => {
    if (clave.startsWith(PREFIJO_ACTIVO)) {
      const { eliminado, ...activo } = cambios as ActivoEnCola
      return guardarCambioActivo(estado.propuestaId, activo, eliminado)
    }
    if (clave.startsWith(PREFIJO_AJUSTE)) {
      const { eliminado, ...ajuste } = cambios as AjusteEnCola
      return guardarCambioAjuste(estado.propuestaId, ajuste, eliminado)
    }
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
    setRechazo([])
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
    setRechazo([])
    despacharCrudo({ tipo: 'parametros', cambios })
    encolar(CLAVE_PARAMETROS, { ...estado.parametros, ...cambios })
  }

  const cambiarActivo = (activo: Restriccion) => {
    setPlan(null)
    setRechazo([])
    despacharCrudo({ tipo: 'activo', activo })
    encolar(`${PREFIJO_ACTIVO}${activo.id}`, { ...activo, eliminado: false })
  }

  const quitarActivo = (id: string) => {
    const activo = estado.agregados.find((candidato) => candidato.id === id)
    if (activo === undefined) return
    setPlan(null)
    setRechazo([])
    despacharCrudo({ tipo: 'quitar-activo', id })
    encolar(`${PREFIJO_ACTIVO}${id}`, { ...activo, eliminado: true })
  }

  const cambiarAjuste = (clase: ClaseModelo, ajuste: AjusteClase | null) => {
    setPlan(null)
    setRechazo([])
    despacharCrudo({ tipo: 'ajuste', clase, ajuste })
    encolar(
      `${PREFIJO_AJUSTE}${clase}`,
      ajuste === null
        ? { clase, modo: 'fijar' as const, montoUsd: 0, eliminado: true }
        : { ...ajuste, eliminado: false },
    )
  }

  const { cliente, posiciones, parametros, agregados, ajustes } = estado

  const revision = useMemo(
    () =>
      evaluarRevision(aRevisadas(posiciones), {
        usPerson: parametros.usPerson,
        incluirInmueblesDeRenta: parametros.incluirInmueblesDeRenta,
        colchonLiquidezUsd: parametros.colchonLiquidezUsd,
        ticketMinimoUsd: parametros.ticketMinimoUsd,
        restricciones: agregados,
        ajustes,
      }),
    [posiciones, parametros, agregados, ajustes],
  )

  // La regla de producto: ningún dato vacío pasa en silencio. Es la misma
  // lista que marca cada fila y que bloquea el armado de la propuesta.
  const incompletas = useMemo(() => posicionesIncompletas(posiciones), [posiciones])
  const bloqueos: readonly Bloqueo[] =
    incompletas.length === 0
      ? revision.bloqueos
      : [
          ...revision.bloqueos,
          {
            codigo: 'datos_incompletos',
            mensaje: `Faltan datos en ${plural(incompletas.length, 'posición', 'posiciones')}: ${incompletas
              .slice(0, 6)
              .map((f) => f.institucionProducto)
              .join(', ')}${incompletas.length > 6 ? '…' : ''}. Cada fila marca qué le falta.`,
          },
        ]

  const bloqueado = bloqueos.length > 0
  const aMostrar = [...bloqueos, ...rechazo]
  const hayAvisos =
    aMostrar.length > 0 || estado.avisos.length > 0 || estado.ignoradas.length > 0

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
        restricciones: agregados,
        ajustes,
      })
      setPlan(resultado.ok ? resultado.plan : null)
      setRechazo(resultado.ok ? [] : resultado.bloqueos)
    })
  }

  const sinPropuesta = estado.propuestaId === ''

  const nota = bloqueado
    ? 'Resolvé lo de arriba para poder calcular.'
    : plan !== null
      ? sinPropuesta
        ? 'El plan está calculado, pero esta ficha no tiene una propuesta abierta: volvé a subirla para poder verla y descargar los decks.'
        : 'El plan está calculado. Seguí a la propuesta para verlo entero y bajar los decks.'
      : revision.resumen.sinMarcar > 0
        ? `Quedan ${plural(revision.resumen.sinMarcar, 'posición sin marcar', 'posiciones sin marcar')}: se calculan como conservadas.`
        : 'Todo listo. El cálculo corre en el servidor: los pesos del modelo no salen de ahí.'

  // Una vez que hay plan, la barra deja de ser un botón y pasa a ser la salida
  // de la pantalla: es donde el asesor está mirando cuando termina de calcular.
  const salidas: readonly Salida[] =
    plan === null || sinPropuesta
      ? []
      : [
          {
            href: `/propuestas/${estado.propuestaId}/deck`,
            texto: 'Descargar el deck',
            descarga: true,
          },
          { href: `/propuestas/${estado.propuestaId}`, texto: 'Ver la propuesta →' },
        ]

  return (
    <Marco
      asesor={asesor}
      activo="fichas"
      migas={[
        { texto: 'Fichas', ruta: '/' },
        { texto: cliente.nombre ?? estado.archivo },
      ]}
      acciones={<Guardado estado={guardado} sinGuardar={posicionesSinGuardar} />}
    >
      <Cabecera
        cliente={cliente}
        archivo={estado.archivo}
        posiciones={posiciones.length}
        resumen={revision.resumen}
      />

      <BarraParametros
        parametros={parametros}
        cambiar={cambiarParametros}
        patrimonioUsd={revision.resumen.patrimonioInvertibleUsd}
        inmueblesRentaUsd={revision.resumen.inmueblesRentaUsd}
        flujoDeclarado={cliente.flujoActual}
      />

      <AjustesObjetivo
        agregados={agregados}
        ajustes={ajustes}
        productos={productos}
        patrimonioUsd={revision.resumen.patrimonioInvertibleUsd}
        cambiarActivo={cambiarActivo}
        quitarActivo={quitarActivo}
        cambiarAjuste={cambiarAjuste}
      />

      {hayAvisos && (
        <div className={estilos.avisos}>
          <Avisos bloqueos={aMostrar} avisos={estado.avisos} ignoradas={estado.ignoradas} />
        </div>
      )}

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

      {plan !== null && (
        <div className={estilos.plan}>
          <PanelPlan plan={plan} propuestaId={estado.propuestaId} />
        </div>
      )}

      <BarraAccion
        nota={nota}
        texto={calculando ? 'Calculando…' : plan === null ? 'Calcular el plan' : 'Recalcular'}
        deshabilitado={bloqueado || calculando}
        alApretar={alCalcular}
        salidas={salidas}
      />
    </Marco>
  )
}
