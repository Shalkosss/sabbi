-- ============================================================================
--  Sabbi — la propuesta publicada se congela, y la biblioteca la encuentra
--
--  Hasta hoy nada estaba calculado: cada lectura vuelve a correr el motor, y
--  por eso una propuesta abierta ayer se recalcula hoy con la macro nueva. Eso
--  es lo que la mesa quiere mientras la propuesta se trabaja — es el modelo el
--  que cambio — y es exactamente lo que no puede pasar despues de mandarsela a
--  un cliente. La cifra que alguien tiene impresa no se mueve.
--
--  Publicar es ese corte. Escribe el `snapshot` que ya estaba previsto desde el
--  esquema inicial —la propuesta entera mas la macro y el motor con los que se
--  calculo— y a partir de ahi la propuesta se lee de ahi, no del motor. Con eso
--  se vuelve a pintar la pantalla, el Excel y los dos decks aunque la ficha, el
--  catalogo y la macro ya no existan como estaban.
--
--  Lo que sigue despues no es editar: es una version nueva, que nace borrador,
--  apunta a la anterior con `reemplaza_a` y se recalcula como cualquier otra.
--  La cadena entera queda legible: quien publico que, cuando y con que macro.
--
--  La biblioteca ya era compartida desde el dia uno — `leer_todos` sobre
--  proposals — pero no habia pantalla que la mostrara ni forma de distinguir un
--  borrador de lo que salio hacia un cliente. Estas dos columnas son las que la
--  lista necesita para decirlo sin abrir cada propuesta.
-- ============================================================================

alter table proposals add column if not exists macro_version int;
alter table proposals add column if not exists published_by uuid
  references advisors on delete set null;

comment on column proposals.macro_version is
  'Version de la macro con la que se congelaron las cifras. Null cuando se '
  'calculo con la de fabrica, o cuando la propuesta todavia es borrador. El '
  'payload entero de esa macro viaja dentro del snapshot; esta columna es para '
  'poder listar y filtrar sin abrirlo.';

-- Dos propuestas de la misma ficha no pueden llamarse v2. El numero es como la
-- mesa se refiere a ellas por correo — «la v2 de Ana» — y dos cosas con ese
-- nombre serian dos respuestas a la misma pregunta.
create unique index if not exists una_version_por_ficha
  on proposals (ficha_id, version) where ficha_id is not null;

-- La biblioteca ordena por fecha y separa lo publicado del borrador.
create index if not exists propuestas_por_estado on proposals (estado, created_at desc);

-- ── Publicar exige snapshot ─────────────────────────────────────────────────
-- Una propuesta marcada como publicada sin snapshot es lo peor de los dos
-- mundos: no se puede editar y tampoco se puede reconstruir. Se rechaza en la
-- base y no solo en la aplicacion, porque la garantia tiene que valer tambien
-- para lo que entre por SQL.

create or replace function exigir_snapshot_al_publicar() returns trigger
language plpgsql as $$
begin
  if new.estado = 'publicada' and new.snapshot is null then
    raise exception
      'La propuesta % no se puede publicar sin snapshot: sin el, sus cifras no '
      'se pueden reconstruir cuando cambie el catalogo o la macro.', new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists snapshot_al_publicar on proposals;
create trigger snapshot_al_publicar
  before insert or update on proposals
  for each row execute function exigir_snapshot_al_publicar();

-- ── El snapshot no se reescribe ─────────────────────────────────────────────
-- El trigger que ya existia deja editar una propuesta publicada si quien lo
-- hace es admin — una valvula para corregir un titulo o un mandato mal escrito.
-- Esa valvula no puede alcanzar a las cifras: reescribir el snapshot cambiaria
-- en silencio lo que un cliente ya tiene impreso. Para eso esta la version
-- nueva, que deja las dos a la vista.

create or replace function bloquear_edicion_publicada() returns trigger
language plpgsql as $$
begin
  if old.estado = 'publicada' and new.snapshot is distinct from old.snapshot then
    raise exception
      'El snapshot de la propuesta % ya esta publicado y no se reescribe. '
      'Genera una version nueva.', old.id;
  end if;

  if old.estado = 'publicada' and not es_admin() then
    raise exception
      'La propuesta % ya esta publicada. Genera una version nueva en lugar de editarla.', old.id;
  end if;

  return new;
end;
$$;

-- ── Lo que cuelga de la propuesta se congela con ella ───────────────────────
-- Las restricciones, los ajustes de clase y las anotaciones de linea no son
-- decoracion: entran al calculo y salen impresas en el anexo del deck. Si
-- siguieran siendo editables despues de publicar, la propuesta congelada y sus
-- insumos dirian cosas distintas y no habria forma de saber cual se mando.
--
-- Aca no hay valvula de admin, y es a proposito: la valvula existe para
-- corregir un texto de la cabecera, no para mover una cifra.

create or replace function puede_escribir_propuesta(p_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from proposals
    where id = p_id
      and estado <> 'publicada'
      and (advisor_id = advisor_actual() or es_admin())
  );
$$;

comment on function puede_escribir_propuesta(uuid) is
  'Dueno o admin, y solo mientras la propuesta sea borrador. Publicada no se '
  'toca ni por arriba ni por los costados: se genera una version nueva.';
