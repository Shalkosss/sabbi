-- ============================================================================
--  Sabbi — la agenda de entregas
--
--  Subir la ficha abre un compromiso: cuatro dias habiles hasta que el cliente
--  recibe su propuesta, con el portafolio al primer dia, el PPT al segundo y
--  la revision de la mesa al tercero. Esas cinco fechas no se guardan: se
--  calculan sobre `fichas.created_at` y el calendario laboral peruano, que es
--  la unica forma de que no se separen de la realidad el dia que alguien sube
--  una ficha un viernes por la noche.
--
--  Lo que si hace falta guardar es lo otro: si el hito ya se cumplio. Sin eso
--  la agenda solo puede decir que fecha toca, nunca que va tarde, y una agenda
--  que no distingue lo hecho de lo pendiente no sirve para levantar el telefono
--  el jueves por la tarde.
--
--  La fila existe cuando el hito esta cumplido. Desmarcar borra la fila en vez
--  de escribir un `false`: un booleano nulable obliga a distinguir tres
--  estados donde solo hay dos, y la fecha de cumplimiento no tendria sentido en
--  dos de ellos.
-- ============================================================================

create table if not exists agenda_hitos (
  ficha_id  uuid not null references fichas on delete cascade,
  -- El dia cero no esta en la lista: la ficha esta subida o no esta, y eso ya
  -- lo dice `fichas`. Marcarlo a mano seria una segunda verdad sobre el mismo
  -- hecho.
  hito      text not null check (hito in ('portafolio', 'ppt', 'revision', 'entrega')),
  hecho_at  timestamptz not null default now(),
  hecho_por uuid references advisors on delete set null,

  primary key (ficha_id, hito)
);

comment on table agenda_hitos is
  'Los hitos cumplidos de la ruta de una ficha. Las fechas no se guardan: se '
  'calculan a cuatro dias habiles de la subida. Aca solo vive lo que ya se hizo.';

alter table agenda_hitos enable row level security;

-- La agenda es del equipo: cualquier asesor la ve entera, como la biblioteca
-- de fichas y propuestas. Marcar es distinto — es afirmar que un trabajo esta
-- hecho — y por eso sigue la misma regla que la ficha: su dueno o un admin.
create policy leer_todos on agenda_hitos
  for select to authenticated using (true);

create policy escribir_de_mi_ficha on agenda_hitos
  for all to authenticated
  using (exists (select 1 from fichas f
                 where f.id = ficha_id and (f.created_by = advisor_actual() or es_admin())))
  with check (exists (select 1 from fichas f
                      where f.id = ficha_id and (f.created_by = advisor_actual() or es_admin())));

create index if not exists agenda_hitos_por_ficha on agenda_hitos (ficha_id);
