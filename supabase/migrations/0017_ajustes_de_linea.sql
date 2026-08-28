-- ============================================================================
--  Sabbi — los montos que el asesor clava instrumento por instrumento
--
--  La tercera palanca del portafolio objetivo, y la mas fina de las tres.
--  `proposal_class_adjustments` decide cuanto vale una clase; esta decide como
--  se reparte adentro: «de los 94,691 de Renta Fija, 50,000 en el Treasury
--  7-10y y el resto donde caiga».
--
--  El total de la clase no se mueve — eso lo sigue decidiendo el benchmark
--  corregido por los ajustes de clase — asi que estas filas nunca pueden
--  descuadrar la propuesta contra el patrimonio. Ver `fijarLineas` en el motor.
--
--  Se guarda por (propuesta, clase, instrumento) y no por producto: una linea
--  del plan puede no ser un producto del catalogo —el inmobiliario TBD, el
--  cash, un fondo que el motor nombra solo— y el nombre impreso es la unica
--  clave que las dos puntas comparten. Es la misma decision que tomo
--  `proposal_line_notes`.
--
--  La clase va en la clave porque el mismo nombre puede salir en dos clases
--  distintas: el oro aparece en Otros y podria aparecer en otra. Sin ella, un
--  ajuste sobre uno moveria al otro.
-- ============================================================================

create table if not exists proposal_line_adjustments (
  proposal_id uuid not null references proposals on delete cascade,
  clase       text not null,
  instrumento text not null,
  monto_usd   numeric(18, 2) not null default 0 check (monto_usd >= 0),
  created_by  uuid references advisors on delete set null,
  updated_at  timestamptz not null default now(),

  primary key (proposal_id, clase, instrumento)
);

comment on table proposal_line_adjustments is
  'Montos que el asesor clava instrumento por instrumento dentro de una clase. '
  'No mueven el total de la clase: reparten lo que esa clase ya tiene.';

comment on column proposal_line_adjustments.instrumento is
  'El nombre con el que el motor imprime la linea. No hay product_id porque una '
  'linea puede no ser un producto del catalogo.';

alter table proposal_line_adjustments enable row level security;

-- `drop` antes de `create`: las politicas se escribieron a medias alguna vez y
-- un `create policy` sobre una que ya existe traba la migracion entera.
drop policy if exists leer_todos on proposal_line_adjustments;
drop policy if exists escribir_de_mi_propuesta on proposal_line_adjustments;

create policy leer_todos on proposal_line_adjustments
  for select to authenticated using (true);

create policy escribir_de_mi_propuesta on proposal_line_adjustments
  for all to authenticated
  using (puede_escribir_propuesta(proposal_id))
  with check (puede_escribir_propuesta(proposal_id));
