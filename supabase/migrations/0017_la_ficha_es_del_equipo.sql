-- ============================================================================
--  Sabbi — la ficha es del equipo, no de quien la subió
--
--  La 0014 publicó `ficha_positions` por Realtime para que dos asesores
--  trabajen la misma ficha y se vean los cursores. Faltaba lo obvio: las
--  políticas de escritura seguían pidiendo ser el creador de la ficha, así que
--  esa función no se podía usar entre dos asesores. Uno miraba y el otro
--  escribía, o había que hacer admin al segundo — que es dar acceso a la macro
--  y al catálogo para poder corregir un NAV.
--
--  Escribir pasa a pedir lo mismo que ya pedía leer, con una condición más:
--  tener ficha en `advisors`. No es `true`. Un usuario de Supabase Auth sin esa
--  fila puede existir —los crea Sabbi a mano y la fila se agrega después— y no
--  tiene por qué poder tocar el patrimonio de un cliente mientras tanto.
--
--  Lo que NO se abre, y conviene dejarlo escrito para que nadie lo "arregle"
--  por simetría más adelante:
--
--    - `advisors`, `products` y `config_versions` siguen siendo de admin. Dar
--      de alta a una persona y calibrar el modelo no son parte del trabajo
--      diario sobre una ficha.
--    - El trigger `no_editar_publicada` sigue en pie: una propuesta publicada
--      se versiona, no se sobreescribe, y eso vale para todos.
--
--  Queda registro de quién hizo qué: `created_by` no cambia de dueño cuando
--  otro asesor edita, y la bitácora sigue anotando cada override.
-- ============================================================================

-- ── Las cuatro tablas que se tocan al revisar una ficha ──────────────────────
-- Corregir una posición escribe en `ficha_positions`; cambiar el perfil escribe
-- en `proposals` y en `clients`. Abrir una sola de las tres deja el guardado
-- fallando a mitad de camino, que es peor que no abrir ninguna.

drop policy if exists escribir_ficha on fichas;
create policy escribir_ficha on fichas for all to authenticated
  using (advisor_actual() is not null)
  with check (advisor_actual() is not null);

drop policy if exists escribir_posiciones on ficha_positions;
create policy escribir_posiciones on ficha_positions for all to authenticated
  using (advisor_actual() is not null)
  with check (advisor_actual() is not null);

drop policy if exists escribir_clientes on clients;
create policy escribir_clientes on clients for all to authenticated
  using (advisor_actual() is not null)
  with check (advisor_actual() is not null);

drop policy if exists escribir_propia on proposals;
create policy escribir_equipo on proposals for all to authenticated
  using (advisor_actual() is not null)
  with check (advisor_actual() is not null);

/*
 * Las tres tablas que cuelgan de una propuesta pasan por esta función, así que
 * se cambia acá y no política por política. Sigue existiendo con el mismo
 * nombre y la misma firma: las políticas de la 0001 la llaman tal cual.
 *
 * Ya no comprueba de quién es la propuesta. El `proposal_id` tiene clave
 * foránea, así que una propuesta inexistente sigue rebotando; lo que se deja
 * de exigir es ser su dueño.
 */
create or replace function puede_escribir_propuesta(p_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select advisor_actual() is not null;
$$;

comment on table fichas is
  'La ficha patrimonial de un cliente. La edita cualquier asesor con fila en '
  '`advisors`, no solo quien la subió: se trabaja de a dos y Realtime está '
  'publicado para eso. `created_by` conserva quién la cargó.';
