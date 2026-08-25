-- ============================================================================
--  Sabbi — la venta que llega con dueño, y el catalogo en manos de la mesa
--
--  Dos cambios que vienen del mismo lugar: lo que la mesa decide con el
--  cliente tiene que poder escribirse sin pedirle permiso a nadie.
--
--  1. Venta condicionada. El cliente vende un inmueble y ya decidio que la
--     mitad va al Fondo Estrategico. Hasta hoy eso solo se podia marcar como
--     venta total, y entonces el benchmark repartia esa mitad entre las siete
--     clases: la instruccion del cliente desaparecia dentro del prorrateo sin
--     que nadie lo notara. Ahora el reparto viaja con la posicion.
--
--  2. El catalogo. Un asesor ya podia dar de alta el producto que su ficha
--     traia, pero no completarlo del todo ni ofrecerlo. Como el alta de un
--     activo en el portafolio objetivo ahora crea el producto —con su
--     rentabilidad y su distribucion, que son las dos cifras sin las cuales la
--     linea sale muda en la propuesta—, ese limite dejaba el flujo a medias.
-- ============================================================================

-- ── 1. El reparto de una venta condicionada ─────────────────────────────────

alter table ficha_positions
  add column if not exists destinos jsonb not null default '[]'::jsonb;

comment on column ficha_positions.destinos is
  'Reparto de una venta condicionada: [{id, pct, clase, productoId, nombre}]. '
  'Los pct son fracciones de 0 a 1 sobre el valor de la posicion y suman 1. '
  'Vacio en cualquier otra decision.';

-- Fracciones y no montos a proposito: el asesor decide en mitades y tercios, y
-- un monto tecleado a mano queda viejo en cuanto se corrige la valuacion del
-- inmueble. Que sumen 1 lo validan el motor y la pantalla, que pueden decir
-- cual posicion esta mal; un check aca solo podria decir que algo lo esta.
alter table ficha_positions
  drop constraint if exists destinos_es_lista;
alter table ficha_positions
  add constraint destinos_es_lista check (jsonb_typeof(destinos) = 'array');

-- La decision nueva entra al check. Sin esto la escritura falla del lado del
-- servidor con un mensaje de Postgres que no le sirve a nadie.
alter table ficha_positions
  drop constraint if exists ficha_positions_cta_check;
alter table ficha_positions
  add constraint ficha_positions_cta_check
    check (cta in ('conservar','venta_total','venta_parcial','venta_condicionada','sin_marcar'));

-- ── 2. El catalogo lo escribe la mesa ───────────────────────────────────────

-- El argumento es el mismo que abrio la macro en la 0011: un permiso que
-- obliga a pedirle a otro que teclee un numero no protege el catalogo, hace
-- que el producto se anote en una hoja suelta. La diferencia —y hay que
-- decirla— es que el catalogo no tiene historial de versiones como la macro:
-- aca un cambio pisa al anterior. Por eso la columna `origen` sigue separando
-- lo que vino del catalogo oficial de lo que dio de alta una ficha.
drop policy if exists solo_admin on products;
drop policy if exists alta_desde_ficha on products;
drop policy if exists completar_desde_ficha on products;

-- Idempotente a proposito: esta migracion se corrio a medias en al menos una
-- base y volvia a fallar en el `create`, dejando la cadena entera trabada.
-- Soltar antes de crear deja el mismo estado final y se puede repetir.
drop policy if exists escribir_la_mesa on products;
drop policy if exists escribir_la_mesa on clases_activo;
drop policy if exists escribir_la_mesa on subyacentes;
drop policy if exists escribir_la_mesa on regiones;
drop policy if exists escribir_la_mesa on gestores;
drop policy if exists escribir_la_mesa on administradores;
drop policy if exists escribir_la_mesa on producto_foco_geografico;
drop policy if exists escribir_la_mesa on producto_clase_activo;
drop policy if exists escribir_la_mesa on producto_subyacente;

create policy escribir_la_mesa on products
  for all to authenticated
  using (true) with check (true);

-- Las tablas de composicion viajan con el producto: un alta escribe su clase
-- de activo, su foco geografico y sus subyacentes en la misma operacion. Si
-- quedaran de admin, el alta fallaria a la mitad y dejaria un producto sin
-- composicion, que es peor que no tenerlo.
drop policy if exists solo_admin on clases_activo;
drop policy if exists solo_admin on subyacentes;
drop policy if exists solo_admin on regiones;
drop policy if exists solo_admin on gestores;
drop policy if exists solo_admin on administradores;
drop policy if exists solo_admin on producto_foco_geografico;
drop policy if exists solo_admin on producto_clase_activo;
drop policy if exists solo_admin on producto_subyacente;

create policy escribir_la_mesa on clases_activo            for all to authenticated using (true) with check (true);
create policy escribir_la_mesa on subyacentes              for all to authenticated using (true) with check (true);
create policy escribir_la_mesa on regiones                 for all to authenticated using (true) with check (true);
create policy escribir_la_mesa on gestores                 for all to authenticated using (true) with check (true);
create policy escribir_la_mesa on administradores          for all to authenticated using (true) with check (true);
create policy escribir_la_mesa on producto_foco_geografico for all to authenticated using (true) with check (true);
create policy escribir_la_mesa on producto_clase_activo    for all to authenticated using (true) with check (true);
create policy escribir_la_mesa on producto_subyacente      for all to authenticated using (true) with check (true);

comment on table products is
  'El catalogo de productos. Lo escribe cualquier asesor con sesion; `origen` '
  'separa lo que vino del catalogo oficial de lo que dio de alta una ficha.';
