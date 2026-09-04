import { colorClase } from '../../lib/colores-allocation'
import type { Tajada } from '../../lib/allocation'
import { pct1 } from '../../lib/formato'
import estilos from './Dona.module.css'

/**
 * El reparto de un portafolio, como anillo.
 *
 * Anillo y no torta llena: el agujero deja poner el título adentro y, sobre
 * todo, quita el centro —que es donde una torta llena invita a comparar
 * ángulos que nadie sabe comparar—. La lectura real la hace la leyenda, que
 * lleva la cifra al lado del color; el anillo dice la proporción gruesa.
 *
 * Las tajadas salen en el orden de `allocation_clases` y no de mayor a menor:
 * las dos donas de la pantalla se leen una al lado de la otra, y un orden que
 * depende del tamaño hace que la misma clase salte de lugar entre las dos.
 */
export function Dona({
  titulo,
  tajadas,
}: {
  readonly titulo: string
  readonly tajadas: readonly Tajada[]
}) {
  const RADIO = 60
  const CIRCUNFERENCIA = 2 * Math.PI * RADIO

  let recorrido = 0

  return (
    <figure className={estilos.bloque}>
      <figcaption className={estilos.titulo}>{titulo}</figcaption>

      <div className={estilos.cuerpo}>
        <svg viewBox="0 0 160 160" className={estilos.anillo} role="img" aria-label={titulo}>
          {tajadas.map((tajada) => {
            const largo = tajada.peso * CIRCUNFERENCIA
            const offset = -recorrido * CIRCUNFERENCIA
            recorrido += tajada.peso

            return (
              <circle
                key={tajada.clase}
                cx="80"
                cy="80"
                r={RADIO}
                fill="none"
                stroke={colorClase(tajada.clase)}
                strokeWidth="26"
                strokeDasharray={`${largo} ${CIRCUNFERENCIA - largo}`}
                strokeDashoffset={offset}
                // El arco arranca a las doce y no a las tres, que es de donde
                // sale por defecto y no es donde nadie empieza a leer.
                transform="rotate(-90 80 80)"
              />
            )
          })}
        </svg>

        <ul className={estilos.leyenda}>
          {tajadas.map((tajada) => (
            <li key={tajada.clase}>
              <span
                className={estilos.muestra}
                style={{ background: colorClase(tajada.clase) }}
                aria-hidden="true"
              />
              <b>{pct1(tajada.peso)}</b>
              <span className={estilos.nombre}>{tajada.clase}</span>
            </li>
          ))}
        </ul>
      </div>
    </figure>
  )
}
