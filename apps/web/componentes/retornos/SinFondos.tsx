/**
 * Lo que se ve cuando la tabla de fondos vuelve vacia.
 *
 * Son dos situaciones distintas que dan las dos cero filas: la base todavia no
 * tiene las tablas del modulo, o las tiene y nadie cargo el primer mes. Se
 * arreglan en lugares distintos — una en el editor SQL de Supabase, la otra en
 * la carga mensual — asi que la pantalla dice cual de las dos es en vez de
 * mandar a buscar.
 */
export function SinFondos({ problema }: { readonly problema: string | null }) {
  if (problema === null) {
    return (
      <p style={{ padding: '28px 26px', color: 'var(--tinta-3)' }}>
        Todavía no hay fondos cargados. Se dan de alta desde la carga mensual.
      </p>
    )
  }

  return (
    <div style={{ padding: '28px 26px', color: 'var(--tinta-3)', maxWidth: 640 }}>
      <p style={{ marginBottom: 10 }}>
        No se pudieron leer los fondos. La base respondió:
      </p>
      <p
        style={{
          marginBottom: 10,
          padding: '10px 12px',
          borderRadius: 6,
          background: 'var(--superficie-alta)',
          border: '1px solid var(--borde-suave)',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          fontSize: 13,
          color: 'var(--tinta-2)',
        }}
      >
        {problema}
      </p>
      <p>
        Si dice que la tabla no existe, faltan correr las migraciones{' '}
        <code>0015_retornos_de_fondos.sql</code> y{' '}
        <code>0016_referencias_y_treasury.sql</code> en el editor SQL de Supabase.
      </p>
    </div>
  )
}
