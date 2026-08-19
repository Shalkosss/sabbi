import type { ClaseModelo, Propuesta } from '@sabbi/core'

import { pct1, puntos, rangoPct, rangoUsd, usdTabla } from '../../lib/formato'
import { Cuadre, Seccion, Tabla } from './Seccion'
import estilos from './Propuesta.module.css'

const NOMBRE_CLASE: Readonly<Record<ClaseModelo, string>> = {
  inm: 'Inmobiliario Directo',
  fijo: 'Mercados Públicos — Renta Fija',
  variable: 'Mercados Públicos — Renta Variable',
  privados: 'Mercados Privados',
  cash: 'Cash',
}

/**
 * Sección 6: el portafolio objetivo.
 *
 * Dos tablas que hay que leer juntas. La primera dice a dónde va el dinero; la
 * segunda, por qué eso no es el benchmark. El modelo puro es el mismo motor
 * corrido ignorando lo que el cliente ya tiene, así que cada punto de
 * diferencia tiene un origen concreto: una posición conservada que clavó su
 * clase.
 */
export function Objetivo({ propuesta }: { readonly propuesta: Propuesta }) {
  const { seccion6 } = propuesta
  const { parametros } = seccion6

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
                <td colSpan={4} />
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
                  </td>
                  <td className={estilos.num}>{usdTabla(linea.usd)}</td>
                  <td className={estilos.num}>{pct1(linea.share)}</td>
                  <td className={estilos.num}>{rangoPct(linea.retornoTotal)}</td>
                  <td>{linea.moneda ?? '—'}</td>
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
            <td colSpan={4} />
          </tr>
        </tfoot>
      </Tabla>

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
