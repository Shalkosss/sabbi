-- ============================================================================
--  Sabbi — el asesor puede mover el portafolio objetivo, no solo la ficha
--
--  Hasta ahora la unica palanca sobre el objetivo era el piso: una posicion
--  conservada o una restriccion empujan una clase hacia arriba, nunca hacia
--  abajo. Faltaba lo que la mesa pide todo el tiempo: "Inmobiliario Directo va
--  en 60,000 aunque el modelo diga 70,000, y el resto lo repartes".
--
--  Un ajuste clava el objetivo de una clase — o la saca del calculo — y el
--  solver prorratea el resto entre las que quedan libres. El limite es el
--  piso: bajar de lo que el cliente ya tiene ahi obliga a vender, y vender se
--  marca en la ficha.
--
--  Las restricciones ya tenian tabla desde el esquema inicial y nadie las
--  escribia todavia; con este cambio empiezan a usarse para lo que fueron
--  pensadas: agregar un activo al portafolio objetivo.
-- ============================================================================

create table if not exists proposal_class_adjustments (
  proposal_id uuid not null references proposals on delete cascade,
  clase       text not null
                check (clase in ('fijo','variable','privados','club','otros','inm','cash')),
  modo        text not null check (modo in ('fijar', 'excluir')),
  -- `excluir` no lo mira: la clase va a cero pase lo que pase.
  monto_usd   numeric not null default 0 check (monto_usd >= 0),
  nota        text,
  created_by  uuid references advisors on delete set null,
  updated_at  timestamptz not null default now(),

  -- Un ajuste por clase. Dos serian dos verdades a la vez sobre el mismo
  -- numero, y la pantalla no tendria cual mostrar.
  primary key (proposal_id, clase)
);

comment on table proposal_class_adjustments is
  'Montos que el asesor clava por clase sobre el portafolio objetivo. Es la '
  'unica palanca del motor que empuja hacia abajo: un piso solo sube.';

comment on column proposal_class_adjustments.modo is
  'fijar: la clase recibe exactamente monto_usd. excluir: recibe cero. En los '
  'dos casos sale del reparto y lo que sobra se prorratea entre las demas.';

alter table proposal_class_adjustments enable row level security;

create policy leer_todos on proposal_class_adjustments
  for select to authenticated using (true);

create policy escribir_de_mi_propuesta on proposal_class_adjustments
  for all to authenticated
  using (puede_escribir_propuesta(proposal_id))
  with check (puede_escribir_propuesta(proposal_id));

-- Un activo agregado nace vacio: el asesor escribe primero el nombre y despues
-- el monto. Con `monto_usd > 0` la fila no se podia guardar hasta terminar de
-- teclear, y el autoguardado rebotaba en silencio. El motor ya ignora las
-- restricciones en cero, asi que cero es un estado valido y transitorio.
alter table proposal_restrictions
  drop constraint if exists proposal_restrictions_monto_usd_check;
alter table proposal_restrictions
  add constraint proposal_restrictions_monto_usd_check check (monto_usd >= 0);
