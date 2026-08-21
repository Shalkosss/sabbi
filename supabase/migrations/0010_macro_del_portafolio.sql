-- ============================================================================
--  Sabbi — la macro del portafolio deja de estar escrita en el codigo
--
--  Hasta hoy el modelo vivia partido en dos sitios que nadie de la mesa podia
--  tocar: un JSON versionado con los pesos de benchmark y una constante de
--  modulo por cada umbral — el minimo de Club Deals, la frontera Edifica A/B,
--  el ticket de ETF, el umbral de los 500,000 del inmobiliario. Calibrar el
--  modelo era abrir siete archivos y desplegar.
--
--  Aca la macro es un dato. Cada guardado escribe una version nueva y la
--  activa; la anterior queda entera, con quien la guardo y por que. El motor
--  lee la activa y con eso corren las tres salidas — la propuesta en pantalla,
--  la matriz del benchmark y los dos decks —, que no tienen otra fuente.
--
--  No se edita en su sitio a proposito. Un portafolio de un cliente real se
--  explica por la macro con la que se calculo, y una macro que se sobreescribe
--  deja esa explicacion sin respaldo.
-- ============================================================================

create table if not exists macro_versions (
  id         uuid primary key default gen_random_uuid(),
  -- Version de negocio, no del codigo. Sube de a uno con cada guardado.
  version    int not null unique,
  -- La macro entera: { version, nota, pesos, reglas }. La valida `macroSchema`
  -- antes de escribirse y otra vez al leerse; lo que no valida no llega al
  -- motor, que cae en la de fabrica.
  payload    jsonb not null,
  nota       text not null default '',
  activa     boolean not null default false,
  created_by uuid references advisors on delete set null,
  created_at timestamptz not null default now()
);

comment on table macro_versions is
  'La macro del portafolio: pesos de benchmark y umbrales del motor. Una sola '
  'activa; el resto es historia con autor y fecha.';

comment on column macro_versions.payload is
  'Objeto completo validado por macroSchema de @sabbi/config. Guardar una '
  'macro a medias no existe: o entra entera, o el motor usa la de fabrica.';

-- Una sola macro activa a la vez. Es la misma garantia que ya tiene
-- `config_versions`, y por la misma razon: dos activas serian dos modelos.
create unique index if not exists una_macro_activa on macro_versions (activa) where activa;

alter table macro_versions enable row level security;

-- La lee cualquier asesor autenticado: sin ella no se puede calcular nada, y
-- la pantalla de Macro es tambien la documentacion del modelo.
create policy leer_todos on macro_versions
  for select to authenticated using (true);

-- La escribe solo un admin, igual que el catalogo y la configuracion. Un
-- umbral mal puesto no rompe una propuesta: las rompe todas.
create policy solo_admin on macro_versions
  for all to authenticated
  using (es_admin()) with check (es_admin());
