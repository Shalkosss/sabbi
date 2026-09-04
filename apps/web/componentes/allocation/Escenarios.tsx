import type { Lado } from '../../lib/allocation'
import { mesCorto, pct1 } from '../../lib/formato'
import estilos from './Escenarios.module.css'

/**
 * Qué hizo cada portafolio en cuatro momentos con nombre.
 *
 * La tabla de arriba promedia años; esto contesta la pregunta que el cliente
 * hace de verdad, que es qué pasó cuando se cayó todo. Dos barras por
 * escenario, la misma escala en los cuatro: una escala por escenario haría que
 * una caída de 3% y una de 17% se vean igual de altas.
 *
 * Un escenario que la serie no cubre entero no dibuja barra y lo dice. Es
 * hoy el caso de la crisis financiera y del rebote de 2009, que ninguna serie
 * de alternativos alcanza. Componer los meses que sí están y titularlo «Crisis
 * financiera global» sería contestar por seis meses una pregunta de dieciocho.
 */
export function Escenarios({
  base,
  conAlternativos,
}: {
  readonly base: Lado
  readonly conAlternativos: Lado
}) {
  const filas = base.escenarios.map((suyo, i) => ({
    escenario: suyo.escenario,
    base: suyo.retorno,
    alt: conAlternativos.escenarios[i]?.retorno ?? null,
  }))

  const medibles = filas.filter((f) => f.base !== null || f.alt !== null)
  if (medibles.length === 0) {
    return (
      <p className={estilos.nada}>
        Ninguno de los cuatro escenarios entra entero en las series cargadas, así que no hay
        nada que comparar todavía.
      </p>
    )
  }

  const extremo = Math.max(
    ...medibles.flatMap((f) => [Math.abs(f.base ?? 0), Math.abs(f.alt ?? 0)]),
    0.05,
  )
  const alto = (retorno: number) => (Math.abs(retorno) / extremo) * 50

  return (
    <div className={estilos.bloque}>
      <div className={estilos.grilla}>
        {filas.map((fila) => (
          <figure key={fila.escenario.nombre} className={estilos.escenario}>
            <div className={estilos.par}>
              {[
                { valor: fila.base, clase: estilos.barraBase },
                { valor: fila.alt, clase: estilos.barraAlt },
              ].map((barra, i) => (
                // Dos mitades con el cero al medio: las barras de un escenario
                // negativo cuelgan y las de uno positivo suben, todas desde la
                // misma línea. Sin esa línea común no se puede comparar la
                // pandemia contra el rebote.
                <div key={i} className={estilos.columna}>
                  <div className={estilos.arriba}>
                    {barra.valor !== null && barra.valor >= 0 && (
                      <>
                        <span className={estilos.valor}>{pct1(barra.valor)}</span>
                        <div
                          className={`${estilos.barra} ${barra.clase}`}
                          style={{ height: `${alto(barra.valor)}%` }}
                        />
                      </>
                    )}
                    {barra.valor === null && (
                      <span className={estilos.sinDato} title="La serie no cubre esta ventana">
                        —
                      </span>
                    )}
                  </div>

                  <div className={estilos.abajo}>
                    {barra.valor !== null && barra.valor < 0 && (
                      <>
                        <div
                          className={`${estilos.barra} ${barra.clase}`}
                          style={{ height: `${alto(barra.valor)}%` }}
                        />
                        <span className={estilos.valor}>{pct1(barra.valor)}</span>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <figcaption>
              <b>{fila.escenario.nombre}</b>
              <span>
                {mesCorto(fila.escenario.desde)} – {mesCorto(fila.escenario.hasta)}
              </span>
            </figcaption>
          </figure>
        ))}
      </div>

      <ul className={estilos.leyenda}>
        <li>
          <span className={`${estilos.muestra} ${estilos.barraBase}`} aria-hidden="true" />
          {base.nombre}
        </li>
        <li>
          <span className={`${estilos.muestra} ${estilos.barraAlt}`} aria-hidden="true" />
          {conAlternativos.nombre}
        </li>
      </ul>
    </div>
  )
}
