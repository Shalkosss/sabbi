import type { Lado } from '../../lib/allocation'
import { usdCorto } from '../../lib/formato'
import estilos from './Curva.module.css'

/**
 * Las dos curvas de crecimiento, una encima de la otra.
 *
 * Es lo que la tabla no puede decir: dos portafolios pueden terminar en el
 * mismo número habiendo pasado por lugares muy distintos, y la diferencia
 * entre ellos casi nunca está en el final sino en 2020 y en 2022.
 *
 * Comparten eje: dos escalas distintas harían que la curva de abajo pareciera
 * la de arriba. El eje arranca en cero por la misma razón — un eje recortado
 * convierte una diferencia de cuatro puntos en un abismo visual.
 */
export function Curva({
  base,
  conAlternativos,
  monto,
}: {
  readonly base: Lado
  readonly conAlternativos: Lado
  readonly monto: number
}) {
  const series = [base, conAlternativos].filter((lado) => lado.curva.length > 0)
  if (series.length === 0) return null

  const ANCHO = 720
  const ALTO = 240
  const IZQ = 56
  const ABAJO = 24

  // Ambas curvas se dibujan sobre el eje de la más larga, que es la del
  // clásico cuando el sleeve acorta la ventana. Los meses que una no tiene
  // quedan sin trazo en vez de estirarse hasta el borde.
  const meses = [...new Set(series.flatMap((s) => s.curva.map((p) => p.mes)))].sort()
  const techo = Math.max(...series.flatMap((s) => s.curva.map((p) => p.valor)))
  const paso = escalon(techo)
  const tope = Math.ceil(techo / paso) * paso

  const x = (mes: string) =>
    IZQ + (meses.indexOf(mes) / Math.max(meses.length - 1, 1)) * (ANCHO - IZQ - 8)
  const y = (valor: number) => (ALTO - ABAJO) * (1 - valor / tope)

  const marcas: number[] = []
  for (let v = 0; v <= tope + 1e-9; v += paso) marcas.push(v)

  // Un año por etiqueta, y solo los que entran: con doce años y una etiqueta
  // por año en 720px se pisan, así que se saltean de a uno cuando hace falta.
  const anios = [...new Set(meses.map((m) => m.slice(0, 4)))]
  const cadaCuantos = Math.ceil(anios.length / 12)

  return (
    <figure className={estilos.bloque}>
      <figcaption className={estilos.titulo}>Crecimiento de {usdCorto(monto)}</figcaption>

      <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} className={estilos.lienzo} role="img"
        aria-label={`Crecimiento de ${usdCorto(monto)} para ${series.map((s) => s.nombre).join(' y ')}`}>
        {marcas.map((valor) => (
          <g key={valor}>
            <line x1={IZQ} x2={ANCHO - 8} y1={y(valor)} y2={y(valor)} className={estilos.guia} />
            <text x={IZQ - 8} y={y(valor) + 4} className={estilos.cifra} textAnchor="end">
              {usdCorto(valor)}
            </text>
          </g>
        ))}

        {anios.map((anio, i) => {
          if (i % cadaCuantos !== 0) return null
          const primero = meses.find((m) => m.startsWith(anio))
          if (primero === undefined) return null

          return (
            <text key={anio} x={x(primero)} y={ALTO - 6} className={estilos.cifra} textAnchor="middle">
              {anio}
            </text>
          )
        })}

        {series.map((lado, i) => (
          <path
            key={lado.nombre}
            d={lado.curva
              .map((p, j) => `${j === 0 ? 'M' : 'L'}${x(p.mes)} ${y(p.valor)}`)
              .join(' ')}
            fill="none"
            className={i === 0 ? estilos.trazoBase : estilos.trazoAlt}
          />
        ))}
      </svg>

      <ul className={estilos.leyenda}>
        {series.map((lado, i) => (
          <li key={lado.nombre}>
            <span
              className={`${estilos.muestra} ${i === 0 ? estilos.muestraBase : estilos.muestraAlt}`}
              aria-hidden="true"
            />
            {lado.nombre}
          </li>
        ))}
      </ul>
    </figure>
  )
}

/**
 * El paso del eje: 1, 2 o 5 por potencia de diez.
 *
 * Cinco o seis marcas es lo que se lee sin contar. Un paso «bonito» se elige
 * así y no dividiendo el techo en partes iguales, que produce ejes con marcas
 * en 137,428.
 */
function escalon(techo: number): number {
  const bruto = techo / 4
  const magnitud = 10 ** Math.floor(Math.log10(Math.max(bruto, 1)))
  const normalizado = bruto / magnitud

  if (normalizado <= 1) return magnitud
  if (normalizado <= 2) return 2 * magnitud
  if (normalizado <= 5) return 5 * magnitud
  return 10 * magnitud
}
