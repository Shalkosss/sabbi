-- ============================================================================
--  Sabbi — la BD de productos deja de ser una planilla
--
--  El libro de origen tenia once hojas para una sola tabla. La composicion de
--  cada producto vivia como texto libre en una celda — «Peru 75%, Emergentes
--  ex-Peru 15%, Latam ex-Peru 10%» — y por eso no se podia validar, ni filtrar,
--  ni sumar. Los scores de gestor y administrador se llenaban aparte, a mano,
--  en una hoja que ya iba por su segunda copia desactualizada.
--
--  Aca queda una sola cosa que alguien llena: el producto. Todo lo demas son
--  listas que lo validan y tablas internas que se enganchan solas por nombre.
-- ============================================================================

-- ── Listas de validacion ────────────────────────────────────────────────────
-- Existen para que la pantalla ofrezca una lista y no un campo de texto. Son
-- chicas y estables; la clave primaria es el propio nombre, que es lo que se
-- lee en la interfaz y lo que hace legible cualquier consulta.

create table if not exists clases_activo (
  nombre text primary key,
  orden  int  not null default 100
);

comment on table clases_activo is
  'Las seis clases macro. La hoja de origen escribia «Imobiliario Directo»; '
  'el nombre se corrigio al importar.';

create table if not exists subyacentes (
  nombre            text primary key,
  clase_activo      text not null references clases_activo on update cascade,
  -- Puntaje de la mesa, de 0 a 10. Es el que ordena un portafolio por calidad.
  score_performance numeric check (score_performance between 0 and 10)
);

create index if not exists subyacentes_clase on subyacentes (clase_activo);

create table if not exists regiones (
  nombre        text primary key,
  -- Peso de la region en el benchmark geografico, como fraccion.
  benchmark_pct numeric check (benchmark_pct between 0 and 1),
  orden         int not null default 100
);

-- ── Base interna: quien gestiona y quien administra ─────────────────────────
-- Antes se llenaba dos veces: una en el producto y otra en la hoja de ranking.
-- Ahora el producto apunta aca y el score viaja solo.

create table if not exists gestores (
  nombre text primary key,
  score  numeric check (score between 0 and 10),
  nota   text
);

create table if not exists administradores (
  nombre text primary key,
  score  numeric check (score between 0 and 10),
  nota   text
);

comment on column gestores.score is
  'Riesgo de gestor, 0 a 10. Sale de la columna que la hoja de origen rotulaba '
  '«SCORE AJUSTADO KERU - USAR ESTE»; la copia de al lado se descarto.';

-- ── El producto ─────────────────────────────────────────────────────────────
-- `products` ya existia y el motor la usa. Se le agregan las columnas que solo
-- tenia la planilla, en vez de abrir una segunda tabla de productos: dos
-- catalogos que alguien tiene que mantener sincronizados es exactamente el
-- problema del que venimos.

alter table products
  add column if not exists liquidez         text,
  add column if not exists es_producto_sabbi boolean not null default false,
  add column if not exists subido_a_circle   boolean not null default false,
  add column if not exists notas_internas    text,
  add column if not exists actualizado_en    timestamptz not null default now();

-- Las cuatro que usa la mesa. `Alta`, `Media` y `Baja` eran otra escala mezclada
-- en la misma columna y se tradujeron al horizonte equivalente.
alter table products
  drop constraint if exists products_liquidez_check;
alter table products
  add constraint products_liquidez_check
    check (liquidez is null or liquidez in ('Inmediata', 'Corto plazo', 'Mediano plazo', 'Largo plazo'));

-- Gestor y administrador dejan de ser texto suelto y pasan a apuntar a la base
-- interna. Se hace sin `not null` porque la planilla trae un puñado sin dato, y
-- perder el producto entero por eso seria peor.
--
-- Las columnas viejas `gestor` y `administrador` quedan en pie mientras el seed
-- del catalogo original las siga escribiendo. Nadie las teclea: el importador
-- llena las dos con el mismo valor. Cuando el seed pase a usar las nuevas, se
-- borran.
alter table products
  add column if not exists gestor_nombre        text references gestores        on update cascade,
  add column if not exists administrador_nombre text references administradores on update cascade;

create index if not exists products_gestor on products (gestor_nombre);
create index if not exists products_administrador on products (administrador_nombre);

-- ── La composicion, en filas ────────────────────────────────────────────────
-- Una fila por parte. La clave primaria compuesta impide que el mismo producto
-- tenga dos veces la misma region, que es lo que pasaba cuando la celda decia
-- «Efectivo 15%» y mas adelante «Otros 0.72%»: dos escrituras de la misma clase.

create table if not exists producto_foco_geografico (
  producto_id text not null references products on delete cascade,
  region      text not null references regiones on update cascade,
  pct         numeric not null check (pct > 0 and pct <= 1),
  primary key (producto_id, region)
);

create table if not exists producto_clase_activo (
  producto_id  text not null references products on delete cascade,
  clase_activo text not null references clases_activo on update cascade,
  pct          numeric not null check (pct > 0 and pct <= 1),
  primary key (producto_id, clase_activo)
);

create table if not exists producto_subyacente (
  producto_id text not null references products on delete cascade,
  subyacente  text not null references subyacentes on update cascade,
  pct         numeric not null check (pct > 0 and pct <= 1),
  primary key (producto_id, subyacente)
);

-- ── Que composiciones no cierran ────────────────────────────────────────────
-- No es una restriccion: la planilla llega con filas que suman 96% o 200% y
-- rechazarlas seria perder el producto. Es una vista para poder arreglarlas.

create or replace view productos_descuadrados as
  with sumas as (
    select p.id,
           p.nombre,
           coalesce((select sum(pct) from producto_foco_geografico g where g.producto_id = p.id), 0) as foco,
           coalesce((select sum(pct) from producto_clase_activo    c where c.producto_id = p.id), 0) as clase,
           coalesce((select sum(pct) from producto_subyacente      s where s.producto_id = p.id), 0) as subyacente
    from products p
  )
  select id, nombre, foco, clase, subyacente
  from sumas
  where (foco       > 0 and abs(foco - 1)       > 0.015)
     or (clase      > 0 and abs(clase - 1)      > 0.015)
     or (subyacente > 0 and abs(subyacente - 1) > 0.015);

comment on view productos_descuadrados is
  'Productos cuya composicion no suma 100%. Es la lista de trabajo de la mesa, '
  'no un error del sistema.';

-- ── Vista de trabajo ────────────────────────────────────────────────────────
-- El producto con todo lo que cuelga de el, para no armar seis consultas en la
-- pantalla del catalogo.

create or replace view catalogo_productos as
  select p.id,
         p.nombre,
         p.clase,
         p.familia,
         p.moneda,
         p.liquidez,
         p.comision_pct,
         p.ret_min,
         p.ret_max,
         p.dist_min,
         p.dist_max,
         p.dist_frecuencia,
         p.min_ticket,
         p.ofrecer,
         p.reconocible,
         p.es_producto_sabbi,
         p.subido_a_circle,
         p.gestor_nombre,
         g.score as gestor_score,
         p.administrador_nombre,
         a.score as administrador_score,
         p.notas_internas,
         p.actualizado_en,
         coalesce((select jsonb_agg(jsonb_build_object('nombre', f.region, 'pct', f.pct) order by f.pct desc)
                   from producto_foco_geografico f where f.producto_id = p.id), '[]'::jsonb) as foco_geografico,
         coalesce((select jsonb_agg(jsonb_build_object('nombre', c.clase_activo, 'pct', c.pct) order by c.pct desc)
                   from producto_clase_activo c where c.producto_id = p.id), '[]'::jsonb) as clase_activo,
         coalesce((select jsonb_agg(jsonb_build_object('nombre', s.subyacente, 'pct', s.pct) order by s.pct desc)
                   from producto_subyacente s where s.producto_id = p.id), '[]'::jsonb) as subyacentes
  from products p
  left join gestores        g on g.nombre = p.gestor_nombre
  left join administradores a on a.nombre = p.administrador_nombre;

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Mismo criterio que el resto del catalogo: lo lee toda la organizacion y lo
-- escribe el admin. Un producto mal cargado sale en la propuesta de todos.

alter table clases_activo            enable row level security;
alter table subyacentes              enable row level security;
alter table regiones                 enable row level security;
alter table gestores                 enable row level security;
alter table administradores          enable row level security;
alter table producto_foco_geografico enable row level security;
alter table producto_clase_activo    enable row level security;
alter table producto_subyacente      enable row level security;

drop policy if exists leer_todos on clases_activo;
drop policy if exists leer_todos on subyacentes;
drop policy if exists leer_todos on regiones;
drop policy if exists leer_todos on gestores;
drop policy if exists leer_todos on administradores;
drop policy if exists leer_todos on producto_foco_geografico;
drop policy if exists leer_todos on producto_clase_activo;
drop policy if exists leer_todos on producto_subyacente;

create policy leer_todos on clases_activo            for select to authenticated using (true);
create policy leer_todos on subyacentes              for select to authenticated using (true);
create policy leer_todos on regiones                 for select to authenticated using (true);
create policy leer_todos on gestores                 for select to authenticated using (true);
create policy leer_todos on administradores          for select to authenticated using (true);
create policy leer_todos on producto_foco_geografico for select to authenticated using (true);
create policy leer_todos on producto_clase_activo    for select to authenticated using (true);
create policy leer_todos on producto_subyacente      for select to authenticated using (true);

drop policy if exists solo_admin on clases_activo;
drop policy if exists solo_admin on subyacentes;
drop policy if exists solo_admin on regiones;
drop policy if exists solo_admin on gestores;
drop policy if exists solo_admin on administradores;
drop policy if exists solo_admin on producto_foco_geografico;
drop policy if exists solo_admin on producto_clase_activo;
drop policy if exists solo_admin on producto_subyacente;

create policy solo_admin on clases_activo            for all to authenticated using (es_admin()) with check (es_admin());
create policy solo_admin on subyacentes              for all to authenticated using (es_admin()) with check (es_admin());
create policy solo_admin on regiones                 for all to authenticated using (es_admin()) with check (es_admin());
create policy solo_admin on gestores                 for all to authenticated using (es_admin()) with check (es_admin());
create policy solo_admin on administradores          for all to authenticated using (es_admin()) with check (es_admin());
create policy solo_admin on producto_foco_geografico for all to authenticated using (es_admin()) with check (es_admin());
create policy solo_admin on producto_clase_activo    for all to authenticated using (es_admin()) with check (es_admin());
create policy solo_admin on producto_subyacente      for all to authenticated using (es_admin()) with check (es_admin());
