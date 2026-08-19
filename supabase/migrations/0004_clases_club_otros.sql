-- ============================================================================
--  Sabbi — Club Deals y Otros dejan de vivir dentro de Mercados Privados
--
--  La hoja Allocation detallado trae Club Deals y Otros (Oro y BTC) como
--  bloques de primer nivel del benchmark, no como familias internas. La config
--  v4 y el motor ya reparten en siete clases; esta migracion ensancha los
--  checks, recoloca los datos que ya existen y prepara el catalogo para los
--  productos que nacen de una ficha.
-- ============================================================================

-- ── Las siete clases del motor ──────────────────────────────────────────────

alter table ficha_positions drop constraint if exists ficha_positions_clase_modelo_check;
alter table ficha_positions add constraint ficha_positions_clase_modelo_check
  check (clase_modelo in ('fijo','variable','privados','club','otros','inm','cash'));

alter table products drop constraint if exists products_clase_check;
alter table products add constraint products_clase_check
  check (clase in ('fijo','variable','privados','club','otros','inm','cash'));

alter table asset_class_map drop constraint if exists asset_class_map_clase_modelo_check;
alter table asset_class_map add constraint asset_class_map_clase_modelo_check
  check (clase_modelo in ('fijo','variable','privados','club','otros','inm','cash'));

alter table proposal_restrictions drop constraint if exists proposal_restrictions_clase_check;
alter table proposal_restrictions add constraint proposal_restrictions_clase_check
  check (clase in ('fijo','variable','privados','club','otros','inm','cash'));

-- ── Recolocar lo que ya existe ──────────────────────────────────────────────
-- La columna `familia` ya decia quien era quien dentro de privados; ahora esa
-- distincion es la clase. La familia queda en pie para lectura historica.

update products set clase = 'club'  where familia = 'club'  and clase = 'privados';
update products set clase = 'otros' where familia = 'otros' and clase = 'privados';

update ficha_positions set clase_modelo = 'club'
 where clase_modelo = 'privados'
   and (asset_class = 'Club Deals Real Estate'
        or institucion_producto ~* '(edifica|club deal|cds-fed|fondo estrat)');

update ficha_positions set clase_modelo = 'otros'
 where clase_modelo in ('privados', 'cash')
   and institucion_producto ~* '(ibit|bitcoin|\mbtc\M|ethereum|cripto|\moro\M|lingote|\mxau\M)'
   and institucion_producto !~* 'tesoro';

update asset_class_map set clase_modelo = 'club'
 where clase_modelo = 'privados'
   and lower(patron) in ('edifica', 'club deal', 'cds-fed', 'fondo estrategico');

-- Las reglas nuevas de la clase Otros. Espejan SEED_TAXONOMIA; el seed usa
-- "where not exists (patron)" asi que insertarlas aca no duplica nada.
insert into asset_class_map (patron, tipo_ficha, asset_class, clase_modelo, prioridad)
select v.patron, null, v.asset_class, 'otros', v.prioridad
from (values
  ('ibit',     'Criptomonedas', 10),
  ('bitcoin',  'Criptomonedas', 10),
  ('btc',      'Criptomonedas', 12),
  ('ethereum', 'Criptomonedas', 12),
  ('cripto',   'Criptomonedas', 12),
  ('oro',      'Oro',           25),
  ('xau',      'Oro',           25),
  ('lingote',  'Oro',           25)
) as v(patron, asset_class, prioridad)
where not exists (select 1 from asset_class_map m where m.patron = v.patron);

-- "tesoro" contiene "oro": la regla de bonos escuda a la del metal.
insert into asset_class_map (patron, tipo_ficha, asset_class, clase_modelo, prioridad)
select 'tesoro', null, 'Bonos Públicos', 'fijo', 15
where not exists (select 1 from asset_class_map where patron = 'tesoro');

-- ── Productos que nacen de una ficha ────────────────────────────────────────
-- Cuando la ficha trae un producto que el catalogo no conoce, la app lo da de
-- alta al instante con lo poco que la ficha sabe. Queda marcado con su origen
-- y con quien lo creo, y la vista de abajo es la lista de trabajo para
-- completarlo. Un producto de ficha nunca entra al menu ofrecible solo:
-- `ofrecer` lo prende un admin cuando la mesa lo revisa.

alter table products
  add column if not exists origen text not null default 'catalogo'
    check (origen in ('catalogo', 'ficha')),
  add column if not exists creado_por uuid references advisors on delete set null;

comment on column products.origen is
  'catalogo: vino del seed o lo cargo la mesa. ficha: lo dio de alta la app al '
  'encontrarlo en la ficha de un cliente; hay que completarlo.';

-- Cualquier asesor puede dar de alta el producto que su ficha trajo y
-- completar los datos de los que siguen a medio llenar. Lo que vino del
-- catalogo oficial sigue siendo territorio del admin.
drop policy if exists alta_desde_ficha on products;
create policy alta_desde_ficha on products
  for insert to authenticated
  with check (origen = 'ficha' and ofrecer = false);

drop policy if exists completar_desde_ficha on products;
create policy completar_desde_ficha on products
  for update to authenticated
  using (origen = 'ficha')
  with check (origen = 'ficha' and ofrecer = false);

-- ── La lista de trabajo ─────────────────────────────────────────────────────
-- Que le falta a cada producto para poder sostener una propuesta: la clase
-- para el motor, la moneda y el retorno esperado para la vista de
-- rentabilidad. No es una restriccion — la ficha llega como llega — sino la
-- cola de lo que hay que completar.

create or replace view productos_incompletos as
  select p.id,
         p.nombre,
         p.origen,
         p.creado_por,
         p.actualizado_en,
         array_remove(array[
           case when p.clase   is null then 'clase'   end,
           case when p.moneda  is null then 'moneda'  end,
           case when p.ret_min is null then 'ret_min' end,
           case when p.ret_max is null then 'ret_max' end,
           case when p.liquidez is null then 'liquidez' end
         ], null) as faltan
  from products p
  where p.clase is null
     or p.moneda is null
     or p.ret_min is null
     or p.ret_max is null
     or p.liquidez is null;

comment on view productos_incompletos is
  'Productos a los que les falta un dato que la propuesta necesita. Es la '
  'cola de trabajo de la mesa, alimentada por las fichas que suben los asesores.';
