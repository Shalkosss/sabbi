-- ============================================================================
--  Sabbi — los retornos de los fondos dejan de ser una hoja de calculo
--
--  El libro `Macro_Base_Retornos_Master_Funds` tenia la hoja `Distributivos`
--  con un fondo cada tres columnas — retorno total, ganancia de capital,
--  distribucion — y un bloque de formulas por fondo repetido a mano cuarenta
--  veces. Cada mes alguien pegaba una fila y arrastraba los rangos; cuando el
--  arrastre se quedaba corto, la ventana se calculaba con un mes de menos y
--  nadie se enteraba. La hoja `Ranking Fondos` estaba llena de `#NUM!` por
--  exactamente eso.
--
--  Aca hay dos cosas que alguien llena — el fondo y su observacion del mes — y
--  ninguna formula. Todo lo demas lo calcula `packages/core/src/retornos`, que
--  reproduce la hoja al bit contra el caso ORENT.
--
--  Que NO se guarda: nada derivado. Ni el retorno de 1Y, ni la desviacion, ni
--  el Sharpe, ni la apertura entre capital y distribucion. Una metrica
--  guardada es una metrica que se desincroniza el dia que se corrige un NAV
--  viejo, y corregir un NAV viejo es la operacion mas comun de todas.
-- ============================================================================

-- ── La taxonomia de los fondos ──────────────────────────────────────────────
-- Tabla propia, y no `clases_activo`.
--
-- `clases_activo` son las seis clases macro del motor: con esas reparte el
-- benchmark y contra esas se arma la propuesta. El universo de fondos se
-- ordena por otra cosa — Private Debt, Private Equity, VC, Infrastructure,
-- Real Estate, Hedge Funds —, que es como estaban las hojas del libro y como
-- la mesa compara. Son dos taxonomias con proposito distinto y la misma
-- palabra.
--
-- Colgar los fondos de `clases_activo` obligaba a meter «Hedge Funds» en la
-- lista con la que el motor reparte patrimonio. Ese es el bug v37.25b — dos
-- criterios en paralelo bajo un nombre — y la regla 3 del proyecto existe por
-- el. Se separan a proposito y ningun codigo las mezcla.

create table if not exists fondos_clases (
  nombre text primary key,
  orden  int  not null default 100
);

insert into fondos_clases (nombre, orden) values
  ('Private Debt',   10),
  ('Private Equity', 20),
  ('Venture Capital',30),
  ('Infrastructure', 40),
  ('Real Estate',    50),
  ('Hedge Funds',    60)
on conflict (nombre) do nothing;

comment on table fondos_clases is
  'Como se agrupa el universo de fondos que la mesa sigue. NO es '
  '`clases_activo`: esa es la taxonomia con la que el motor reparte '
  'patrimonio. Mezclarlas es el bug v37.25b.';

-- ── El fondo ────────────────────────────────────────────────────────────────
-- No es un producto del catalogo. `products` son las 24 cosas que la mesa
-- ofrece; esto son los ~40 fondos que la mesa *mira*, competencia incluida.
-- Meterlos en `products` habria puesto a BlackRock en el menu de un cliente.

create table if not exists fondos (
  id                serial primary key,
  nombre            text not null unique,
  asset_class       text not null references fondos_clases on update cascade,
  -- Mes de inception segun el manager, `AAAA-MM`. Puede ser anterior a la
  -- primera observacion: es dato del fondo, no de la serie.
  inception         text check (inception ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  -- Retorno objetivo de corto plazo que publica el manager, como fraccion.
  guidance_cp       numeric,
  domicilio         text,
  -- Dar de baja un fondo no borra su historia: la serie sigue siendo el
  -- comparativo contra el que se mide todo lo demas.
  activo            boolean not null default true,
  creado_en         timestamptz not null default now(),
  creado_por        uuid references advisors,
  actualizado_en    timestamptz not null default now()
);

create index if not exists fondos_clase on fondos (asset_class);

comment on table fondos is
  'Los fondos que la mesa sigue, propios y de la competencia. Distinto de '
  '`products`: aca entra lo que se compara, no lo que se ofrece.';

comment on column fondos.inception is
  'Mes que declara el manager. La hoja lo tenia en la fila 2 y no siempre '
  'coincide con el primer mes de la serie — ORENT declara 2022-09 y su primer '
  'retorno publicado es de 2022-10.';

-- ── La observacion del mes ──────────────────────────────────────────────────
-- Dos numeros por fondo por mes, y son independientes: ninguno se deriva del
-- otro. Ver el comentario de `retorno_total`.

create table if not exists fondos_observaciones (
  fondo_id      int  not null references fondos on delete cascade,
  -- Primer dia del mes como texto `AAAA-MM`, que es la convencion de la hoja.
  -- Como texto y no como date: el dia no significa nada, y una `date` invita a
  -- que dos cargas distintas escriban el 1 y el 31 del mismo mes.
  mes           text not null check (mes ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  nav           numeric check (nav > 0),
  retorno_total numeric,
  creado_en     timestamptz not null default now(),
  creado_por    uuid references advisors,
  primary key (fondo_id, mes)
);

create index if not exists fondos_obs_mes on fondos_observaciones (mes);

comment on column fondos_observaciones.retorno_total is
  'Retorno del mes con distribuciones reinvertidas, como fraccion, tal como lo '
  'publica el manager. Es la serie sobre la que se calcula TODO. No se deriva '
  'del NAV: en un fondo distributivo el NAV se mueve poco y el retorno vive en '
  'la distribucion — ORENT cerro 2024 con el NAV plano y 7.65% de retorno.';

comment on column fondos_observaciones.nav is
  'Valor cuota publicado. Solo produce la ganancia de capital; la distribucion '
  'sale por diferencia contra el retorno total. Puede faltar sin invalidar el '
  'mes: sin NAV se pierde la apertura, no el retorno.';

-- ── El Treasury 10Y ─────────────────────────────────────────────────────────
-- Serie mensual, una fila por mes, global a todos los fondos.

create table if not exists treasury_10y (
  mes        text primary key check (mes ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  -- Yield de cierre del ultimo dia habil del mes, como fraccion.
  cierre     numeric not null,
  creado_en  timestamptz not null default now(),
  creado_por uuid references advisors
);

comment on table treasury_10y is
  'Cierre del Treasury 10Y del ultimo dia de cada mes. Hoy se carga a mano y '
  'se muestra; el Sharpe NO lo usa — usa el escalar de `retornos_parametros`. '
  'La serie se acumula desde ahora para poder migrar a un risk-free por '
  'ventana sin tener que reconstruir la historia despues.';

-- ── Los parametros del calculo ──────────────────────────────────────────────
-- Una sola fila. Existe para que el risk-free no sea una constante adentro de
-- un `.ts`: la hoja lo tenia clavado en `$R$141` y moverlo requeria abrir el
-- archivo. Es la regla 2 del proyecto aplicada a este modulo.

create table if not exists retornos_parametros (
  id               boolean primary key default true check (id),
  -- El escalar que la hoja tenia en `$R$141`. Mismo valor para toda ventana y
  -- todo fondo, que es como la mesa publico sus numeros hasta hoy.
  risk_free        numeric not null default 0.04475,
  actualizado_en   timestamptz not null default now(),
  actualizado_por  uuid references advisors
);

insert into retornos_parametros (id) values (true) on conflict (id) do nothing;

comment on table retornos_parametros is
  'Fila unica. El `check (id)` sobre un boolean garantiza que no haya una '
  'segunda: dos filas de parametros es dos verdades sobre el mismo Sharpe.';

-- ── Quien ve y quien escribe ────────────────────────────────────────────────
-- Leer, cualquier asesor: el comparativo de fondos es material de mesa y no
-- tiene un dueno.
--
-- Escribir, tambien: es el mismo argumento con el que la 0012 abrio el
-- catalogo. La carga es mensual y repetitiva, y un permiso que obliga a
-- pedirle a un admin que teclee cuarenta NAV no protege la serie — hace que
-- la serie se siga llevando en el Excel, que es exactamente de donde estamos
-- tratando de sacarla. `creado_por` deja el rastro de quien cargo cada mes.
--
-- La excepcion es `retornos_parametros`. El risk-free no se carga, se decide:
-- cambiarlo mueve el Sharpe de los cuarenta fondos a la vez y no hay forma de
-- notarlo mirando una pantalla. Eso si queda en admin.

alter table fondos                enable row level security;
alter table fondos_clases         enable row level security;
alter table fondos_observaciones  enable row level security;
alter table treasury_10y          enable row level security;
alter table retornos_parametros   enable row level security;

drop policy if exists leer_todos on fondos;
drop policy if exists leer_todos on fondos_clases;
drop policy if exists leer_todos on fondos_observaciones;
drop policy if exists leer_todos on treasury_10y;
drop policy if exists leer_todos on retornos_parametros;

create policy leer_todos on fondos               for select to authenticated using (true);
create policy leer_todos on fondos_clases        for select to authenticated using (true);
create policy leer_todos on fondos_observaciones for select to authenticated using (true);
create policy leer_todos on treasury_10y         for select to authenticated using (true);
create policy leer_todos on retornos_parametros  for select to authenticated using (true);

-- Idempotente, por la misma razon que la 0012: esta cadena ya se corrio a
-- medias alguna vez y un `create policy` sobre una que existe la traba entera.
drop policy if exists escribir_la_mesa on fondos;
drop policy if exists escribir_la_mesa on fondos_clases;
drop policy if exists escribir_la_mesa on fondos_observaciones;
drop policy if exists escribir_la_mesa on treasury_10y;
drop policy if exists solo_admin on retornos_parametros;

create policy escribir_la_mesa on fondos               for all to authenticated using (true) with check (true);
create policy escribir_la_mesa on fondos_clases        for all to authenticated using (true) with check (true);
create policy escribir_la_mesa on fondos_observaciones for all to authenticated using (true) with check (true);
create policy escribir_la_mesa on treasury_10y         for all to authenticated using (true) with check (true);

create policy solo_admin on retornos_parametros
  for all to authenticated using (es_admin()) with check (es_admin());
