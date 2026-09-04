-- ============================================================================
--  Sabbi — cuánto cambia un portafolio clásico cuando se le mete alternativos
--
--  La pantalla nueva contesta una sola pregunta, que es la que el asesor
--  contesta a mano en cada reunión: si el cliente tiene un 60/40 y le metemos
--  20% de alternativos, ¿qué pasa con el retorno, con la volatilidad y con la
--  peor caída? Hasta hoy la respuesta salía de un Excel que nadie versionaba.
--
--  Son tres cosas que alguien llena y ninguna fórmula, igual que en la 0015:
--
--    1. El reparto clásico de cada perfil — el 20/80, el 60/40.
--    2. Las mezclas de alternativos: qué hay adentro de «Multi-Alts».
--    3. Con qué serie se mide cada clase.
--
--  Lo derivado no se guarda. El retorno acumulado, la desviación, el drawdown
--  y la curva los calcula `packages/core/src/allocation` sobre las series de
--  `fondos_observaciones`. Una métrica guardada se desincroniza el día que se
--  corrige un retorno viejo — el mismo argumento de la 0015, y la misma
--  decisión.
--
--  Por qué el punto 3 es una tabla y no un `Record` en el código: hoy falta la
--  serie de renta fija pública, que es la mitad del perfil Conservador, y las
--  de private equity e infraestructura arrancan en 2019 y 2021. El día que
--  alguien cargue el agregado de bonos, esta pantalla lo tiene que poder usar
--  sin que nadie toque el repositorio ni espere un despliegue.
-- ============================================================================

-- ── Las clases con las que se dibuja la torta ───────────────────────────────
-- No son `clases_activo` (las seis del motor) ni `fondos_clases` (las seis del
-- universo de fondos). Son las de la torta del asesor, que incluye las dos
-- públicas — el 60 y el 40 — que en las otras dos taxonomías no existen como
-- tales. Tercera taxonomía y tercer propósito; mezclarlas es el bug v37.25b,
-- así que se nombra aparte y ningún código las cruza.

create table if not exists allocation_clases (
  nombre    text primary key,
  -- Una clase pública entra al reparto base; una alternativa entra al sleeve.
  -- El slider mueve dinero de las primeras a las segundas y de ningún otro
  -- lado, así que la distinción decide el cálculo entero.
  es_publica boolean not null,
  orden     int not null default 100
);

insert into allocation_clases (nombre, es_publica, orden) values
  ('Renta Variable Pública', true,  10),
  ('Renta Fija Pública',     true,  20),
  ('Private Equity',         false, 30),
  ('Private Credit',         false, 40),
  ('Venture Capital',        false, 50),
  ('Infrastructure',         false, 60),
  ('Real Estate',            false, 70),
  ('Hedge Funds',            false, 80)
on conflict (nombre) do nothing;

comment on table allocation_clases is
  'Las clases de la pantalla de Allocation. NO es `clases_activo` (con esas '
  'reparte el motor) ni `fondos_clases` (así se agrupa el universo de fondos). '
  'Esta es la única de las tres que tiene las dos clases públicas separadas, '
  'que es de lo que está hecho un 60/40.';

-- ── 1. El reparto clásico de cada perfil ────────────────────────────────────
-- El 20/80 y el 60/40 de la industria, un peso por perfil y clase pública. Es
-- el punto de partida del que sale la torta de la izquierda.
--
-- En tabla y no en el código por la regla 2 del proyecto: un número de negocio
-- dentro de un `.tsx` es un error, y desde que existe la pantalla de Macro
-- tampoco puede vivir en un `.ts` del motor.

create table if not exists allocation_perfiles (
  perfil         text not null,
  clase          text not null references allocation_clases on update cascade,
  -- Fracción, no porcentaje: 0.6 es el 60. Misma convención que toda la base.
  peso           numeric not null check (peso >= 0 and peso <= 1),
  actualizado_en timestamptz not null default now(),
  actualizado_por uuid references advisors,
  primary key (perfil, clase)
);

insert into allocation_perfiles (perfil, clase, peso) values
  ('Conservador',             'Renta Variable Pública', 0.20),
  ('Conservador',             'Renta Fija Pública',     0.80),
  ('Conservador & Moderado',  'Renta Variable Pública', 0.40),
  ('Conservador & Moderado',  'Renta Fija Pública',     0.60),
  ('Moderado',                'Renta Variable Pública', 0.60),
  ('Moderado',                'Renta Fija Pública',     0.40),
  ('Moderado & Arriesgado',   'Renta Variable Pública', 0.80),
  ('Moderado & Arriesgado',   'Renta Fija Pública',     0.20),
  ('Arriesgado',              'Renta Variable Pública', 1.00),
  ('Arriesgado',              'Renta Fija Pública',     0.00)
on conflict (perfil, clase) do nothing;

comment on table allocation_perfiles is
  'El reparto clásico entre las dos clases públicas para cada uno de los cinco '
  'perfiles Sabbi: el 20/80, el 60/40. Es la torta de la izquierda y la base '
  'sobre la que el slider mete alternativos.';

-- ── 2. Las mezclas de alternativos ──────────────────────────────────────────
-- «Multi-Alts» es un nombre y seis pesos que suman uno. El slider decide
-- cuánto del portafolio va al sleeve; la mezcla decide cómo se reparte adentro.
-- Son dos preguntas distintas y por eso son dos tablas.

create table if not exists allocation_mezclas (
  nombre         text primary key,
  orden          int not null default 100,
  actualizado_en timestamptz not null default now(),
  actualizado_por uuid references advisors
);

create table if not exists allocation_mezclas_pesos (
  mezcla text not null references allocation_mezclas on delete cascade on update cascade,
  clase  text not null references allocation_clases on update cascade,
  peso   numeric not null check (peso >= 0 and peso <= 1),
  primary key (mezcla, clase)
);

insert into allocation_mezclas (nombre, orden) values
  ('Multi-Alts', 10)
on conflict (nombre) do nothing;

insert into allocation_mezclas_pesos (mezcla, clase, peso) values
  ('Multi-Alts', 'Private Credit',  0.40),
  ('Multi-Alts', 'Private Equity',  0.30),
  ('Multi-Alts', 'Real Estate',     0.10),
  ('Multi-Alts', 'Infrastructure',  0.10),
  ('Multi-Alts', 'Hedge Funds',     0.10)
on conflict (mezcla, clase) do nothing;

comment on table allocation_mezclas_pesos is
  'Qué hay adentro de una mezcla de alternativos, como fracción del sleeve — '
  'los pesos suman 1 y no dependen de cuánto se le asigne. Cuánto se le asigna '
  'lo decide el slider de la pantalla y no se guarda: es de la corrida, no del '
  'modelo.';

-- ── 3. Con qué serie se mide cada clase ─────────────────────────────────────
-- Una clase de la torta apunta a una fila de `fondos` marcada `es_referencia`.
-- Es el único puente entre la pantalla y las series ya cargadas.
--
-- La clase puede quedarse sin índice, y esa es la situación de hoy con Renta
-- Fija Pública. No es un error a tapar: un portafolio con una clase sin serie
-- no puede publicar retorno histórico, y la pantalla tiene que decir cuál
-- falta en vez de calcular con un cero y llamarlo dato. Regla 7.

create table if not exists allocation_referencias (
  clase          text primary key references allocation_clases on update cascade,
  fondo_id       int not null references fondos on delete restrict,
  actualizado_en timestamptz not null default now(),
  actualizado_por uuid references advisors
);

-- Se enchufa lo que ya está marcado como referencia y no hay que elegir: una
-- sola fila por clase. Donde hay dos candidatos —los dos índices BDC— o
-- ninguno —renta fija, infraestructura— no se inserta nada y lo elige la mesa
-- desde la pantalla. Adivinar acá es exactamente lo que la regla 7 prohíbe.
insert into allocation_referencias (clase, fondo_id)
select c.nombre, f.id
from allocation_clases c
join fondos f
  on f.es_referencia
 and f.nombre in (
   'S&P 500 IVV (Hedge Funds)',
   'REIT US IYR',
   'S&P BDC Index Total Return',
   'Barclay Hedge Fund Index'
 )
 and case f.nombre
   when 'S&P 500 IVV (Hedge Funds)'   then c.nombre = 'Renta Variable Pública'
   when 'REIT US IYR'                 then c.nombre = 'Real Estate'
   when 'S&P BDC Index Total Return'  then c.nombre = 'Private Credit'
   when 'Barclay Hedge Fund Index'    then c.nombre = 'Hedge Funds'
 end
on conflict (clase) do nothing;

comment on table allocation_referencias is
  'Qué índice mide cada clase de la torta. Una clase sin fila no tiene serie: '
  'el portafolio que la use no publica retorno histórico y la pantalla dice '
  'cuál falta. Es el enchufe que deja cargar el agregado de renta fija sin '
  'tocar el código.';

-- ── Quién toca esto ─────────────────────────────────────────────────────────
-- Lo mismo que la ficha desde la 0017: cualquier asesor con fila en
-- `advisors`. Lo que Max edita, Jaso lo ve. No es `true` — un usuario de Auth
-- sin fila en `advisors` no calibra el modelo mientras espera su alta.

alter table allocation_clases        enable row level security;
alter table allocation_perfiles      enable row level security;
alter table allocation_mezclas       enable row level security;
alter table allocation_mezclas_pesos enable row level security;
alter table allocation_referencias   enable row level security;

drop policy if exists leer_allocation_clases on allocation_clases;
create policy leer_allocation_clases on allocation_clases for select to authenticated
  using (advisor_actual() is not null);

drop policy if exists escribir_allocation_perfiles on allocation_perfiles;
create policy escribir_allocation_perfiles on allocation_perfiles for all to authenticated
  using (advisor_actual() is not null)
  with check (advisor_actual() is not null);

drop policy if exists escribir_allocation_mezclas on allocation_mezclas;
create policy escribir_allocation_mezclas on allocation_mezclas for all to authenticated
  using (advisor_actual() is not null)
  with check (advisor_actual() is not null);

drop policy if exists escribir_allocation_mezclas_pesos on allocation_mezclas_pesos;
create policy escribir_allocation_mezclas_pesos on allocation_mezclas_pesos for all to authenticated
  using (advisor_actual() is not null)
  with check (advisor_actual() is not null);

drop policy if exists escribir_allocation_referencias on allocation_referencias;
create policy escribir_allocation_referencias on allocation_referencias for all to authenticated
  using (advisor_actual() is not null)
  with check (advisor_actual() is not null);
