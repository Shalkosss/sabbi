-- ============================================================================
--  Sabbi — la ficha se trabaja de a dos
--
--  Hoy dos asesores en la misma ficha se pisan sin enterarse: cada pantalla
--  guarda contra la base y ninguna vuelve a leer, asi que el que refresque
--  ultimo se lleva la sorpresa. Con Realtime, lo que uno escribe aparece en la
--  pantalla del otro; y con presencia, cada uno ve donde esta el cursor del
--  otro antes de meter la mano en la misma fila.
--
--  Realtime respeta RLS: un asesor solo recibe los cambios de las filas que ya
--  podria leer con un `select`. No hay que abrir nada mas de lo que la 0002
--  abrio, y esta migracion no toca ninguna politica.
--
--  `replica identity full` hace que el UPDATE viaje con la fila entera y no
--  solo con la clave. Sin eso el payload llega con los campos que cambiaron y
--  nulls en el resto, y la pantalla del otro asesor borraria lo que no vino en
--  ese cambio. Cuesta un poco mas de WAL por escritura; una ficha tiene
--  decenas de filas, no millones.
-- ============================================================================

alter table ficha_positions replica identity full;
alter table proposals       replica identity full;

-- `add table` falla si la tabla ya esta en la publicacion, y esta migracion
-- tiene que poder correrse dos veces sin romperse.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'ficha_positions'
  ) then
    alter publication supabase_realtime add table ficha_positions;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'proposals'
  ) then
    alter publication supabase_realtime add table proposals;
  end if;
end $$;

comment on table ficha_positions is
  'Las posiciones de una ficha. Se publican por Realtime: dos asesores en la '
  'misma ficha ven los cambios del otro sin recargar. RLS sigue mandando — '
  'nadie recibe una fila que no podria leer.';
