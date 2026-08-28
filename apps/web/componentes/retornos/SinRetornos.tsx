import type { FaltaRetornos } from '../../lib/retornos'
import estilos from './SinRetornos.module.css'

/**
 * La matriz de retornos vacía, y por qué.
 *
 * Antes los tres casos se veían igual: una línea gris que decía «todavía no
 * hay fondos cargados». Eso es cierto en uno de los tres, y en los otros dos
 * manda a la mesa a cargar a mano cuatro mil observaciones que el libro ya
 * tiene — o a esperar un dato que la base guarda pero que la consulta no pudo
 * leer.
 *
 * Cada caso dice qué pasó y con qué se arregla, con el comando exacto. Un
 * estado vacío que no dice cómo salir de él es una pantalla rota con buenos
 * modales.
 */
export function SinRetornos({ falta }: { readonly falta: FaltaRetornos }) {
  if (falta === null) return null

  if (falta.motivo === 'consulta') {
    return (
      <Marco
        tono="alerta"
        etiqueta="La base rechazó la consulta"
        titulo="No se pudo leer la matriz de retornos"
        bajada={
          'La tabla está vacía porque la lectura falló, no porque no haya datos. Lo más común ' +
          'es que la base no tenga todavía las tablas del módulo, o que las políticas no dejen ' +
          'leerlas con esta sesión.'
        }
        detalle={falta.detalle}
        pasos={[
          {
            texto: 'Aplicar las migraciones pendientes, que es lo que crea las tablas y sus políticas:',
            comando: 'npm run migrar',
          },
          {
            texto: 'Ver qué quedaría por aplicar, sin tocar nada:',
            comando: 'npm run migrar -- --dry',
          },
        ]}
      />
    )
  }

  if (falta.motivo === 'sin-fondos') {
    return (
      <Marco
        tono="neutro"
        etiqueta="Sin fondos dados de alta"
        titulo="La matriz todavía no tiene de dónde salir"
        bajada={
          'Las tablas están, pero no hay ni un fondo. La carga inicial no se hace a mano: el ' +
          'libro de la mesa entra entero de una vez, con sus series completas, y a partir de ' +
          'ahí se carga un mes por vez desde la carga mensual.'
        }
        pasos={[
          {
            texto: 'Leer el libro sin tocar la base y contrastar el motor contra la macro:',
            comando: 'npm run revisar-retornos -- "reference/Macro_Base_Retornos_Master_Funds.xlsm"',
          },
          {
            texto: 'Importarlo, con el Treasury 10Y incluido. Es idempotente: se puede repetir.',
            comando:
              'npm run importar-retornos -- "reference/Macro_Base_Retornos_Master_Funds.xlsm" --treasury',
          },
        ]}
      />
    )
  }

  return (
    <Marco
      tono="neutro"
      etiqueta="Fondos sin serie"
      titulo="Los fondos están, las observaciones no"
      bajada={
        'Hay fondos dados de alta pero ninguno tiene un solo mes cargado, así que no hay nada ' +
        'que calcular: cada métrica de esta pantalla sale de la serie, no de un valor guardado.'
      }
      pasos={[
        {
          texto: 'Importar las series del libro. No borra nada de lo que ya esté cargado:',
          comando:
            'npm run importar-retornos -- "reference/Macro_Base_Retornos_Master_Funds.xlsm" --treasury',
        },
      ]}
    />
  )
}

interface Paso {
  readonly texto: string
  readonly comando: string
}

function Marco({
  tono,
  etiqueta,
  titulo,
  bajada,
  detalle,
  pasos,
}: {
  readonly tono: 'alerta' | 'neutro'
  readonly etiqueta: string
  readonly titulo: string
  readonly bajada: string
  readonly detalle?: string
  readonly pasos: readonly Paso[]
}) {
  return (
    <section
      className={`${estilos.bloque} ${tono === 'alerta' ? estilos.alerta : ''}`}
      aria-label={titulo}
    >
      <p className={estilos.etiqueta}>{etiqueta}</p>
      <h2 className={estilos.titulo}>{titulo}</h2>
      <p className={estilos.bajada}>{bajada}</p>

      {detalle !== undefined && (
        <p className={estilos.detalle}>
          <span>La base dijo</span>
          <code>{detalle}</code>
        </p>
      )}

      <ol className={estilos.pasos}>
        {pasos.map((paso) => (
          <li key={paso.comando}>
            <span>{paso.texto}</span>
            <code>{paso.comando}</code>
          </li>
        ))}
      </ol>

      <p className={estilos.pie}>
        Los comandos se corren desde la raíz del repositorio, con las credenciales de la base en{' '}
        <code>.env.local</code>.
      </p>
    </section>
  )
}
