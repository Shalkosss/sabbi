-- ============================================================================
--  Sabbi — esquema inicial
--
--  Se guarda todo, no solo lo que se ve en pantalla: quien armo la propuesta,
--  con que configuracion se calculo, que edito el asesor a mano y por que. La
--  generacion de Excel y de los decks lee de aqui, nunca de memoria.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ── Identidad ───────────────────────────────────────────────────────────────

create table advisors (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users on delete set null unique,
  nombre      text not null,
  email       text not null unique,
  rol         text not null default 'asesor' check (rol in ('asesor', 'admin')),
  created_at  timestamptz not null default now()
);

comment on table advisors is 'Asesores de Sabbi. Un admin puede escribir sobre propuestas ajenas.';

create table clients (
  id               uuid primary key default gen_random_uuid(),
  nombre           text not null,
  documento        text,
  email            text,
  perfil_riesgo    text check (perfil_riesgo in (
                     'Conservador', 'Conservador & Moderado', 'Moderado',
                     'Moderado & Arriesgado', 'Arriesgado')),
  segmento         text check (segmento in ('lt500', 'gte500')),
  horizonte        text,
  flujo_actual_pen numeric,
  flujo_retiro_pen numeric,
  necesita_flujos  boolean not null default false,
  us_person        boolean not null default false,
  advisor_id       uuid references advisors on delete set null,
  notas            text,
  created_at       timestamptz not null default now()
);

-- ── Ficha patrimonial ───────────────────────────────────────────────────────

create table fichas (
  id                   uuid primary key default gen_random_uuid(),
  client_id            uuid not null references clients on delete cascade,
  archivo_path         text,
  archivo_nombre       text,
  hoja                 text,
  parse_warnings       jsonb not null default '[]',
  patrimonio_total_usd numeric,
  fx_pen_usd           numeric not null default 3.4 check (fx_pen_usd > 0),
  created_by           uuid references advisors on delete set null,
  created_at           timestamptz not null default now()
);

create table ficha_positions (
  id                  uuid primary key default gen_random_uuid(),
  ficha_id            uuid not null references fichas on delete cascade,
  orden               int,
  origen              text not null check (origen in ('financiero', 'inmueble', 'deuda')),
  institucion_producto text not null,

  -- Tres niveles distintos. Mezclarlos produjo el bug v37.25b: el motor
  -- contaba el dinero en una clase y la tabla lo mostraba en otra.
  tipo_ficha          text,   -- valor crudo del desplegable de la ficha
  asset_class         text,   -- taxonomia granular que ve el cliente
  clase_modelo        text check (clase_modelo in ('fijo','variable','privados','inm','cash')),

  producto_id         text,
  moneda              text check (moneda in ('PEN', 'USD')),
  plaza               text not null default 'Perú' check (plaza in ('Perú', 'Offshore')),
  pertenencia         text,
  pct_pertenencia     numeric not null default 1 check (pct_pertenencia > 0 and pct_pertenencia <= 1),
  valor_usd           numeric not null check (valor_usd >= 0),
  valor_original      numeric,
  rendimiento_est     numeric,
  fee_pct             numeric,

  -- solo inmuebles
  pais                text,
  alquiler_mensual_usd numeric,
  uso                 text check (uso in ('Renta', 'Uso propio')),

  -- Uso propio no participa de ningun calculo. No es lo mismo que valor cero:
  -- tampoco entra al denominador de los pesos.
  es_invertible       boolean not null default true,

  cta                 text not null default 'sin_marcar'
                        check (cta in ('conservar','venta_total','venta_parcial','sin_marcar')),
  monto_venta_parcial numeric not null default 0 check (monto_venta_parcial >= 0),
  nota                text,
  editado_manualmente boolean not null default false,
  updated_at          timestamptz not null default now(),

  constraint venta_parcial_no_supera_posicion
    check (cta <> 'venta_parcial' or monto_venta_parcial <= valor_usd)
);

create index on ficha_positions (ficha_id, orden);

-- ── Catalogo y configuracion ────────────────────────────────────────────────

create table config_versions (
  id         uuid primary key default gen_random_uuid(),
  version    int not null unique,
  payload    jsonb not null,
  nota       text,
  activa     boolean not null default false,
  created_at timestamptz not null default now()
);

-- Solo una version activa a la vez.
create unique index una_config_activa on config_versions (activa) where activa;

comment on column config_versions.payload is
  'Configuracion completa. La version 3 lleva los benchmarks a precision plena '
  'extraidos de la hoja Data; la 2 los traia redondeados a cuatro decimales y '
  'ese redondeo desplaza la base de redistribucion 6,502.88 USD.';

create table products (
  id                   text primary key,
  nombre               text not null,
  clase                text check (clase in ('fijo','variable','privados','inm','cash')),
  familia              text check (familia in ('club','otros','oportunidad','')),
  ret_min              numeric,
  ret_max              numeric,
  dist_min             numeric,
  dist_max             numeric,
  dist_frecuencia      text,
  plazo                text,
  proposito            text,
  descripcion          text,
  comision_pct         numeric,
  comision_incluye_igv boolean,
  moneda               text,
  gestor               text,
  administrador        text,
  foco_geo             text,
  subyacentes          text,
  min_ticket           numeric,

  -- Los dos flags que se confunden. `ofrecer` define el menu neteable de la
  -- clase: netear contra el catalogo completo produjo el bug v37.25, en el que
  -- 2.3 MM conservados quedaron invisibles para el motor.
  ofrecer              boolean not null default false,
  reconocible          boolean not null default false,

  nota                 text,
  config_version       int
);

create index on products (clase) where ofrecer;

create table asset_class_map (
  id             uuid primary key default gen_random_uuid(),
  patron         text not null,
  tipo_ficha     text,
  asset_class    text not null,
  clase_modelo   text not null check (clase_modelo in ('fijo','variable','privados','inm','cash')),
  prioridad      int not null default 100,
  creado_por     uuid references advisors on delete set null,
  auto_detectado boolean not null default false,
  created_at     timestamptz not null default now()
);

comment on column asset_class_map.auto_detectado is
  'Lo creo el sistema al ver una clase nueva. Se muestra destacado para que el '
  'asesor confirme el mapeo; nunca se manda a un cajon "Otros" en silencio.';

-- ── Propuesta ───────────────────────────────────────────────────────────────

create table proposals (
  id                         uuid primary key default gen_random_uuid(),
  client_id                  uuid not null references clients on delete restrict,
  ficha_id                   uuid references fichas on delete set null,
  advisor_id                 uuid references advisors on delete set null,
  titulo                     text,
  mandato                    text,
  perfil                     text,
  segmento                   text check (segmento in ('lt500', 'gte500')),
  patrimonio_financiero_usd  numeric,
  patrimonio_uso_propio_usd  numeric,
  dinero_disponible_usd      numeric,

  institucional              boolean,
  -- El motor canonico no usa el umbral como compuerta: siempre abre el split
  -- en fondos FM y estampa la nota. El control queda del lado del asesor.
  institucional_override     text not null default 'auto' check (institucional_override in ('auto','si','no')),

  toggle_inm_seccion_propia  boolean not null default true,
  fx                         numeric not null default 3.4 check (fx > 0),
  colchon_liquidez_pen       numeric not null default 0,
  ret_esperado_min           numeric,
  ret_esperado_max           numeric,
  flujo_anual_estimado_usd   numeric,
  config_version             int,
  engine_version             text,
  estado                     text not null default 'borrador' check (estado in ('borrador','publicada')),
  version                    int not null default 1,
  reemplaza_a                uuid references proposals on delete set null,
  xlsx_path                  text,
  pptx_replica_path          text,
  pptx_rediseno_path         text,
  snapshot                   jsonb,
  created_at                 timestamptz not null default now(),
  published_at               timestamptz
);

create index on proposals (client_id, created_at desc);
create index on proposals (advisor_id);

comment on column proposals.snapshot is
  'Entrada y salida completas del motor. Permite reconstruir la propuesta aunque '
  'el catalogo o los benchmarks cambien despues.';

-- Restricciones del asesor. Un item del catalogo o una tenencia libre
-- ("Acciones MSFT 30k") clavada en un monto. El motor las trata igual que una
-- posicion conservada: son pisos que clavan una clase.
create table proposal_restrictions (
  id          uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references proposals on delete cascade,
  nombre      text not null,
  monto_usd   numeric not null check (monto_usd > 0),
  clase       text not null check (clase in ('fijo','variable','privados','inm','cash')),
  -- Null cuando es una tenencia libre que no esta en el catalogo. Cubre clase
  -- pero no netea producto.
  producto_id text references products on delete set null,
  nota        text,
  orden       int,
  created_by  uuid references advisors on delete set null,
  created_at  timestamptz not null default now()
);

create index on proposal_restrictions (proposal_id, orden);

create table proposal_targets (
  id                      uuid primary key default gen_random_uuid(),
  proposal_id             uuid not null references proposals on delete cascade,
  bloque                  text not null,
  nivel                   text not null check (nivel in ('clase', 'producto')),
  instrumento             text not null,
  producto_id             text,
  origen                  text check (origen in ('conservado', 'nuevo')),
  usd                     numeric not null,
  peso                    numeric,
  peso_modelo_puro        numeric,
  retorno_total_esp       numeric,
  retorno_distributivo_esp numeric,
  distribucion_anual      numeric,
  moneda                  text,
  orden                   int
);

create index on proposal_targets (proposal_id, orden);

create table blotter_lines (
  id          uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references proposals on delete cascade,
  lado        text not null check (lado in ('venta', 'compra')),
  instrumento text not null,
  producto_id text,
  bloque      text,
  accion      text,
  usd         numeric not null,
  orden       int
);

create index on blotter_lines (proposal_id, lado, orden);

create table audit_log (
  id          bigserial primary key,
  proposal_id uuid references proposals on delete cascade,
  advisor_id  uuid references advisors on delete set null,
  accion      text not null,
  detalle     jsonb,
  created_at  timestamptz not null default now()
);

create index on audit_log (proposal_id, created_at desc);

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- La biblioteca es compartida a proposito: cualquier asesor autenticado LEE
-- todo. Escribir solo puede el dueno de la propuesta o un admin.

alter table advisors              enable row level security;
alter table clients               enable row level security;
alter table fichas                enable row level security;
alter table ficha_positions       enable row level security;
alter table config_versions       enable row level security;
alter table products              enable row level security;
alter table asset_class_map       enable row level security;
alter table proposals             enable row level security;
alter table proposal_restrictions enable row level security;
alter table proposal_targets      enable row level security;
alter table blotter_lines         enable row level security;
alter table audit_log             enable row level security;

create or replace function es_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from advisors
    where user_id = auth.uid() and rol = 'admin'
  );
$$;

create or replace function advisor_actual() returns uuid
language sql stable security definer set search_path = public as $$
  select id from advisors where user_id = auth.uid();
$$;

create or replace function puede_escribir_propuesta(p_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select es_admin() or exists (
    select 1 from proposals
    where id = p_id and advisor_id = advisor_actual()
  );
$$;

-- Lectura para toda la organizacion.
create policy leer_todos on advisors              for select to authenticated using (true);
create policy leer_todos on clients               for select to authenticated using (true);
create policy leer_todos on fichas                for select to authenticated using (true);
create policy leer_todos on ficha_positions       for select to authenticated using (true);
create policy leer_todos on config_versions       for select to authenticated using (true);
create policy leer_todos on products              for select to authenticated using (true);
create policy leer_todos on asset_class_map       for select to authenticated using (true);
create policy leer_todos on proposals             for select to authenticated using (true);
create policy leer_todos on proposal_restrictions for select to authenticated using (true);
create policy leer_todos on proposal_targets      for select to authenticated using (true);
create policy leer_todos on blotter_lines         for select to authenticated using (true);
create policy leer_todos on audit_log             for select to authenticated using (true);

-- Escritura sobre la propuesta: dueno o admin.
create policy escribir_propia on proposals for all to authenticated
  using (advisor_id = advisor_actual() or es_admin())
  with check (advisor_id = advisor_actual() or es_admin());

-- Una propuesta publicada no se sobreescribe: se crea una version nueva.
create or replace function bloquear_edicion_publicada() returns trigger
language plpgsql as $$
begin
  if old.estado = 'publicada' and not es_admin() then
    raise exception
      'La propuesta % ya esta publicada. Genera una version nueva en lugar de editarla.', old.id;
  end if;
  return new;
end;
$$;

create trigger no_editar_publicada
  before update on proposals
  for each row execute function bloquear_edicion_publicada();

do $$
declare t text;
begin
  foreach t in array array['proposal_restrictions','proposal_targets','blotter_lines'] loop
    execute format($f$
      create policy escribir_de_mi_propuesta on %I for all to authenticated
        using (puede_escribir_propuesta(proposal_id))
        with check (puede_escribir_propuesta(proposal_id));
    $f$, t);
  end loop;
end $$;

create policy escribir_ficha on fichas for all to authenticated
  using (created_by = advisor_actual() or es_admin())
  with check (created_by = advisor_actual() or es_admin());

create policy escribir_posiciones on ficha_positions for all to authenticated
  using (exists (select 1 from fichas f
                 where f.id = ficha_id and (f.created_by = advisor_actual() or es_admin())))
  with check (exists (select 1 from fichas f
                      where f.id = ficha_id and (f.created_by = advisor_actual() or es_admin())));

create policy escribir_clientes on clients for all to authenticated
  using (advisor_id = advisor_actual() or es_admin())
  with check (advisor_id = advisor_actual() or es_admin());

-- Solo admin toca la configuracion y el catalogo.
create policy solo_admin on config_versions for all to authenticated
  using (es_admin()) with check (es_admin());
create policy solo_admin on products for all to authenticated
  using (es_admin()) with check (es_admin());
create policy solo_admin on advisors for all to authenticated
  using (es_admin()) with check (es_admin());

-- La taxonomia la extiende cualquier asesor: es parte de su trabajo diario.
create policy escribir_taxonomia on asset_class_map for all to authenticated
  using (true) with check (true);

-- La bitacora se escribe, nunca se corrige.
create policy insertar_bitacora on audit_log for insert to authenticated with check (true);

-- ── Storage ─────────────────────────────────────────────────────────────────
-- Privados los tres. La descarga va siempre por URL firmada con expiracion:
-- estos objetos contienen patrimonios y tenencias de personas reales.

insert into storage.buckets (id, name, public) values
  ('fichas-raw',      'fichas-raw',      false),
  ('propuestas-xlsx', 'propuestas-xlsx', false),
  ('decks',           'decks',           false)
on conflict (id) do nothing;

create policy leer_objetos on storage.objects for select to authenticated
  using (bucket_id in ('fichas-raw', 'propuestas-xlsx', 'decks'));

create policy escribir_objetos on storage.objects for insert to authenticated
  with check (bucket_id in ('fichas-raw', 'propuestas-xlsx', 'decks'));
