'use client'

import { evaluarRevision, posicionesIncompletas } from '@sabbi/core'
import type { AjusteClase, Bloqueo, ClaseModelo, Cta } from '@sabbi/core'
import { useMemo, useReducer, useRef, useState, useTransition } from 'react'

import {
  calcularPlan,
  guardarCambioActivo,
  guardarCambioAjuste,
  guardarCambioParametros,
  guardarCambioPosicion,
  leerObjetivo,
} from '../app/acciones'
import type { PlanResumido } from '../app/acciones'
import { useAutoguardado } from '../lib/autoguardado'
import type { ActivoAgregado, ProductoOfrecible } from '../lib/catalogo'
import {
  CLAVE_PARAMETROS,
  PREFIJO_ACTIVO,
  PREFIJO_AJUSTE,
  aRevisadas,
  avisosVigentes,
  cambiosDeCta,
  camposTrasEditar,
  claveActivo,
  claveAjuste,
  reducir,
  ventaParcialInvalida,
} from '../lib/estado'
import type { EstadoRevision, Parametros, PosicionEditada } from '../lib/estado'
import { plural } from '../lib/formato'
import { useCompania, useMias } from '../lib/tiempo-real'
import { AjustesObjetivo } from './AjustesObjetivo'
import { Avisos } from './Avisos'
import { Companeros, Cursores } from './Cursores'
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
 * Borrar viaja por la misma cola que guardar —con la bandera `eliminado`— y no
 * por una acción aparte: la cola garantiza que no haya dos envíos de la misma
 * clave en vuelo, y sin esa garantía un borrado podría llegar antes que el
 * guardado que lo precede. Las claves salen de `estado.ts` porque las comparten
 * la cola, la marca de «esto lo estoy tocando yo» y la fusión con lo que llega
 * del otro asesor.
 */
type ActivoEnCola = ActivoAgregado & { readonly eliminado: boolean }
type AjusteEnCola = AjusteClase & { readonly eliminado: boolean }

type Cambio = Partial<PosicionEditada> | Parametros | ActivoEnCola | AjusteEnCola

interface Props {
  readonly inicial: EstadoRevision
  /** `id` va para la presencia: es lo que identifica a cada uno en el canal. */
  readonly asesor: { readonly id: string; readonly nombre: string; readonly rol: string }
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
  /**
   * El plan que se ve ya no corresponde a lo que hay cargado.
   *
   * Antes un cambio borraba el plan y la pantalla quedaba en blanco justo
   * cuando uno queria ver que habia cambiado. Ahora se queda, marcado: las
   * cifras son las de antes hasta que alguien apriete Actualizar.
   */
  const [desactualizado, setDesactualizado] = useState(false)
  /** La ficha se pliega en cuanto hay plan: el trabajo pasa a ser el objetivo. */
  const [fichaAbierta, setFichaAbierta] = useState(true)
  const [calculando, calcular] = useTransition()

  // El bloque sobre el que se miden los cursores de todos. Los dos lados usan
  // el mismo, así que la posición viaja como fracción de él y no en píxeles.
  const lienzo = useRef<HTMLDivElement | null>(null)
  const { marcar: marcarMia, mias, alSoltar } = useMias()

  /**
   * Vuelve a leer lo que cuelga de la propuesta.
   *
   * Se llama cuando el otro asesor avisó que guardó algo que no es una
   * posición: los parámetros, un activo agregado, un ajuste de clase. Se lee
   * entero y de una vez —son tres tablas cortas— y el reductor se queda con lo
   * que este asesor esté tocando en ese momento.
   */
  const refrescarObjetivo = async () => {
    const objetivo = await leerObjetivo(estado.fichaId)
    if (objetivo === null) return

    // Un cambio de afuera invalida el plan igual que uno de acá: las cifras
    // calculadas dejaron de corresponder a lo que está en pantalla.
    setDesactualizado(true)
    setRechazo([])
    despacharCrudo({ tipo: 'sincronizar', objetivo, mias: mias() })

    // Lo que no se aplicó porque este asesor lo estaba tocando se vuelve a
    // pedir en cuanto lo suelte: quedarse con un valor que la base ya no tiene
    // termina escribiéndolo de vuelta en el próximo guardado.
    alSoltar(() => {
      void refrescarObjetivo()
    })
  }

  const { companeros, cursores, avisar } = useCompania({
    // Sin ficha no hay sala. No pasa en la pantalla normal —la ficha viene de
    // la ruta— pero un id vacío abriría un canal llamado `ficha:` en el que
    // caerían todas las fichas sin id a la vez.
    sala: estado.fichaId === '' ? '' : `ficha:${estado.fichaId}`,
    yo: { asesorId: asesor.id, nombre: asesor.nombre },
    contenedor: lienzo,
    alRefrescar: () => {
      void refrescarObjetivo()
    },
    posiciones: {
      fichaId: estado.fichaId,
      mias,
      // Un cambio de afuera invalida el plan igual que uno de acá: las cifras
      // calculadas dejaron de corresponder a las posiciones que están en
      // pantalla, y mostrarlas juntas es la forma más rápida de mandar mal una
      // propuesta.
      alCambiar: (posicion) => {
        setDesactualizado(true)
        setRechazo([])
        despacharCrudo({ tipo: 'remoto', posicion })
      },
    },
  })

  const guardar = async (clave: string, cambios: Cambio): Promise<{ readonly error?: string }> => {
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
  }

  /** Lo que no es una posición y por eso viaja avisando, no publicándose. */
  const esDelObjetivo = (clave: string) =>
    clave === CLAVE_PARAMETROS ||
    clave.startsWith(PREFIJO_ACTIVO) ||
    clave.startsWith(PREFIJO_AJUSTE)

  const { estado: guardado, encolar } = useAutoguardado<Cambio>(async (clave, cambios) => {
    const resultado = await guardar(clave, cambios)
    // El aviso sale después de que la base confirmó, no antes: avisar de un
    // cambio que todavía no se escribió hace que el otro lea lo viejo y se
    // quede con eso hasta el próximo aviso. Las posiciones no avisan —la base
    // publica cada `update` y la fila llega sola—; el resto vive en tablas que
    // no se publican, así que el aviso es lo único que tiene el otro lado.
    if (resultado.error === undefined && esDelObjetivo(clave)) avisar()
    return resultado
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
    setDesactualizado(true)
    setRechazo([])
    // Desde acá y por unos segundos, esta posición es mía: ningún cambio que
    // llegue del otro asesor la va a pisar mientras la estoy escribiendo.
    marcarMia(id)
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
    setDesactualizado(true)
    setRechazo([])
    // Desde acá y por unos segundos, los parámetros son míos: una relectura
    // disparada por el otro asesor no me borra el número a medio teclear.
    marcarMia(CLAVE_PARAMETROS)
    despacharCrudo({ tipo: 'parametros', cambios })
    encolar(CLAVE_PARAMETROS, { ...estado.parametros, ...cambios })
  }

  const cambiarActivo = (activo: ActivoAgregado) => {
    setDesactualizado(true)
    setRechazo([])
    marcarMia(claveActivo(activo.id))
    despacharCrudo({ tipo: 'activo', activo })
    encolar(claveActivo(activo.id), { ...activo, eliminado: false })
  }

  const quitarActivo = (id: string) => {
    const activo = estado.agregados.find((candidato) => candidato.id === id)
    if (activo === undefined) return
    setDesactualizado(true)
    setRechazo([])
    marcarMia(claveActivo(id))
    despacharCrudo({ tipo: 'quitar-activo', id })
    encolar(claveActivo(id), { ...activo, eliminado: true })
  }

  const cambiarAjuste = (clase: ClaseModelo, ajuste: AjusteClase | null) => {
    setDesactualizado(true)
    setRechazo([])
    marcarMia(claveAjuste(clase))
    despacharCrudo({ tipo: 'ajuste', clase, ajuste })
    encolar(
      claveAjuste(clase),
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
              .join(', ')}${incompletas.length > 6 ? '…' : ''}. Cada fila marca qué le falta y se completa ahí mismo, en la tabla de arriba.`,
          },
        ]

  const bloqueado = bloqueos.length > 0
  const aMostrar = [...bloqueos, ...rechazo]
  // Los del parser, filtrados contra el estado de ahora: un aviso que ya se
  // resolvió no puede seguir pidiendo que lo resuelvan.
  const avisos = avisosVigentes(estado.avisos, posiciones)
  const hayAvisos = aMostrar.length > 0 || avisos.length > 0 || estado.ignoradas.length > 0

  const alCalcular = () => {
    calcular(async () => {
      setDesactualizado(false)
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
      // Calculado por primera vez, la ficha se pliega: el trabajo pasa a ser
      // el objetivo, y ochenta filas de posiciones entre medio son ruido.
      if (resultado.ok) setFichaAbierta(false)
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
      acciones={
        <>
          <Companeros companeros={companeros} />
          <Guardado estado={guardado} sinGuardar={posicionesSinGuardar} />
        </>
      }
    >
      <div ref={lienzo} className={estilos.lienzo}>
      <Cursores cursores={cursores} />
      <Cabecera
        cliente={cliente}
        archivo={estado.archivo}
        posiciones={posiciones.length}
        resumen={revision.resumen}
      />

      {/*
        Publicada, esta pantalla ya no manda sobre nada: los parámetros no se
        pueden guardar y las cifras que el cliente tiene son las congeladas.
        Decirlo acá arriba evita que el asesor descubra el corte de a un error
        por tecla, y deja a un clic el único camino que queda.
      */}
      {estado.propuestaPublicada && (
        <p className={estilos.publicada} role="status">
          La propuesta de esta ficha ya está publicada, así que sus cifras están congeladas y los
          parámetros no aceptan cambios.{' '}
          <a href={`/propuestas/${estado.propuestaId}`}>
            Abrila para generar una versión nueva →
          </a>
        </p>
      )}

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
          <Avisos bloqueos={aMostrar} avisos={avisos} ignoradas={estado.ignoradas} />
        </div>
      )}

      {/*
        La ficha se verifica una vez. Despues de eso son ochenta filas entre el
        asesor y lo que vino a mirar, asi que se pliega sola en cuanto hay plan
        — y se vuelve a abrir de un click, porque corregir un valor sigue
        siendo lo que uno hace cuando el objetivo no cierra.
      */}
      <div className={estilos.ficha}>
        <button
          type="button"
          className={estilos.verFicha}
          aria-expanded={fichaAbierta}
          onClick={() => setFichaAbierta((previa) => !previa)}
        >
          {fichaAbierta ? 'Ocultar' : 'Mostrar'} la ficha
          <span className={estilos.verFichaNota}>
            {plural(posiciones.length, 'posición', 'posiciones')}
            {agregados.length > 0 && ` · ${plural(agregados.length, 'agregado', 'agregados')}`}
          </span>
        </button>

        {fichaAbierta && (
          <TablaPosiciones
            posiciones={posiciones}
            productos={productos}
            editar={editar}
            marcar={marcar}
            agregados={agregados}
            cambiarActivo={cambiarActivo}
            quitarActivo={quitarActivo}
          />
        )}
      </div>

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
          <PanelPlan
            plan={plan}
            propuestaId={estado.propuestaId}
            desactualizado={desactualizado}
            recalculando={calculando}
            alActualizar={alCalcular}
            modificar={{
              agregados,
              ajustes,
              productos,
              cambiarActivo,
              quitarActivo,
              cambiarAjuste,
            }}
          />
        </div>
      )}

      {/*
        El menu del catalogo, una sola vez para toda la pantalla: lo usan la
        tabla de posiciones y el panel del objetivo, y duplicarlo son doscientas
        opciones repetidas en el DOM.
      */}
      <datalist id="productos-ofrecibles">
        {productos.map((producto) => (
          <option key={producto.nombre} value={producto.nombre} />
        ))}
      </datalist>

      <BarraAccion
        nota={nota}
        texto={calculando ? 'Calculando…' : plan === null ? 'Calcular el plan' : 'Recalcular'}
        deshabilitado={bloqueado || calculando}
        alApretar={alCalcular}
        salidas={salidas}
      />
      </div>
    </Marco>
  )
}
