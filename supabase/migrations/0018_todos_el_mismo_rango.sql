-- ============================================================================
--  Sabbi — todos los asesores tienen el mismo rango
--
--  La 0017 abrió la ficha al equipo y dejó a medias la idea: el resto del
--  producto seguía partido entre `asesor` y `admin`, y esa frontera no
--  describe a Sabbi. Son cinco personas del mismo nivel; pedirle permiso a
--  «un admin» para marcar un hito o corregir un producto del catálogo es
--  pedirse permiso a uno mismo con pasos de más.
--
--  Y una de esas reglas costaba trabajo de verdad: una propuesta publicada no
--  se podía editar salvo por un admin. La intención era buena —que lo que ya
--  se le mandó al cliente no cambie sin dejar rastro— pero en una mesa donde
--  todos publican, lo que producía era que dos personas no pudieran terminar
--  el mismo documento.
--
--  Lo que queda en pie, porque no es una diferencia de rango:
--
--    Una cuenta de Supabase Auth SIN fila en `advisors` no escribe nada.
--
--  Las cuentas las crea Sabbi a mano y la fila llega después, así que ese
--  hueco existe de verdad y una cuenta a medio dar de alta no tiene por qué
--  tocar el patrimonio de un cliente. Es la frontera entre estar en la mesa y
--  no estar todavía, no entre dos rangos dentro de la mesa.
--
--  `advisors.rol` y `es_admin()` se conservan: la columna sigue diciendo quién
--  es qué en el organigrama y borrarla obligaría a tocar el alta de asesores.
--  Lo que cambia es que ya no decide nada. Si algún día vuelve a hacer falta
--  una frontera, que se agregue explícita y con su motivo, no heredada de acá.
-- ============================================================================

-- ── La propuesta publicada se puede seguir trabajando ────────────────────────
-- El trigger entero, no una excepción más: mientras exista, cualquiera que
-- publique deja el documento congelado para el resto de la mesa.
drop trigger if exists no_editar_publicada on proposals;
drop function if exists bloquear_edicion_publicada();

-- ── Lo que era «solo admin» pasa a ser de cualquier asesor ───────────────────
-- En un bucle y no doce políticas escritas a mano: son la misma regla, y doce
-- copias es como una queda distinta de las otras sin que nadie lo note.
do $$
declare t text;
begin
  foreach t in array array[
    'advisors',
    'config_versions',
    'products',
    'clases_activo',
    'subyacentes',
    'regiones',
    'gestores',
    'administradores',
    'producto_foco_geografico',
    'producto_clase_activo',
    'producto_subyacente',
    'retornos_parametros'
  ] loop
    execute format('drop policy if exists solo_admin on %I', t);
    execute format($f$
      create policy escribir_los_asesores on %I for all to authenticated
        using (advisor_actual() is not null)
        with check (advisor_actual() is not null);
    $f$, t);
  end loop;
end $$;

-- ── Marcar un hito de la agenda ──────────────────────────────────────────────
-- Era del dueño de la ficha o de un admin. Si la ficha la trabaja cualquiera
-- desde la 0017, decir que ese trabajo está hecho también.
drop policy if exists escribir_de_mi_ficha on agenda_hitos;
create policy escribir_los_asesores on agenda_hitos for all to authenticated
  using (advisor_actual() is not null)
  with check (advisor_actual() is not null);

/*
 * ── Las tablas de retornos, al mismo criterio ───────────────────────────────
 *
 * Estas iban al revés: `using (true)`, o sea que una cuenta de Auth sin dar de
 * alta podía reescribir la serie de un fondo. No es lo que nadie quiso — es
 * que se escribieron antes de que la frontera estuviera clara. Se ajustan
 * ahora que hay una sola regla, y no le quita permiso a nadie real: quien no
 * tiene fila en `advisors` ni siquiera pasa de la pantalla de ingreso.
 */
do $$
declare t text;
begin
  foreach t in array array['fondos', 'fondos_clases', 'fondos_observaciones', 'treasury_10y'] loop
    execute format('drop policy if exists escribir_la_mesa on %I', t);
    execute format($f$
      create policy escribir_los_asesores on %I for all to authenticated
        using (advisor_actual() is not null)
        with check (advisor_actual() is not null);
    $f$, t);
  end loop;
end $$;

comment on column advisors.rol is
  'Título en el organigrama. Ya no decide permisos: desde la 0018 todos los '
  'asesores escriben lo mismo. La única frontera es tener fila en esta tabla.';
