-- ============================================================================
--  Sabbi — las dos columnas del anexo que solo el asesor puede llenar
--
--  El deck replica abre cada instrumento del portafolio objetivo en seis
--  columnas. Tres salen del motor y del catalogo — instrumento, monto, retorno
--  esperado —, una del catalogo tambien: el plazo minimo. Las otras dos, que
--  es el instrumento y para que esta en el portafolio, las escribe una persona.
--
--  No son datos derivados y no hay de donde sacarlos: dependen del cliente y de
--  la conversacion que el asesor tuvo con el. Se guardan por propuesta y por
--  nombre de instrumento, que es como el motor las nombra e imprime.
-- ============================================================================

create table if not exists proposal_line_notes (
  proposal_id uuid not null references proposals on delete cascade,
  -- El nombre que el motor imprime en la linea. No hay `product_id` porque una
  -- linea puede no ser un producto del catalogo — el inmobiliario TBD, el cash.
  instrumento text not null,
  descripcion text not null default '',
  proposito   text not null default '',
  created_by  uuid references advisors on delete set null,
  updated_at  timestamptz not null default now(),

  primary key (proposal_id, instrumento)
);

comment on table proposal_line_notes is
  'Lo que el asesor escribe de cada linea del portafolio objetivo: que es el '
  'instrumento y para que esta. Las dos columnas del anexo del deck que ningun '
  'dato puede llenar.';

alter table proposal_line_notes enable row level security;

create policy leer_todos on proposal_line_notes
  for select to authenticated using (true);

create policy escribir_de_mi_propuesta on proposal_line_notes
  for all to authenticated
  using (puede_escribir_propuesta(proposal_id))
  with check (puede_escribir_propuesta(proposal_id));
