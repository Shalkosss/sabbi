-- ============================================================================
--  Sabbi — lo que se publica y lo que se avisa
--
--  La 0014 publico dos tablas: `ficha_positions`, que es la que se edita celda
--  por celda, y `proposals`, pensando en que los parametros viajaran igual.
--  No viajan asi, y esta migracion saca `proposals` de la publicacion.
--
--  El motivo es que los parametros no estan solos. Lo que el asesor le hace al
--  portafolio objetivo vive en tres tablas —`proposals`, los activos agregados
--  en `proposal_restrictions` y los montos clavados en
--  `proposal_class_adjustments`— y las dos ultimas se agregan y se borran. Un
--  `delete` de Postgres viaja por Realtime sin pasar por RLS: llevaria el
--  nombre y el monto de la fila borrada a cualquiera suscrito a la tabla, que
--  es justo lo que la 0002 cerro. Publicar unas si y otras no dejaria la mitad
--  de los cambios sin llegar, que es peor que no tener tiempo real: nadie
--  desconfia de una pantalla que no se mueve, todos confian en una que se
--  mueve a medias.
--
--  Asi que por el canal no viaja el dato sino el aviso. Quien guarda manda una
--  palabra por `broadcast` —que no toca la base— y quien la recibe vuelve a
--  leer por el servidor con su propia sesion y sus propias politicas. Cuesta
--  un viaje al servidor por cambio ajeno; son cambios de asesor, no de tecla.
--
--  Las posiciones siguen publicadas y siguen llegando fila por fila: son la
--  unica cosa compartida que se edita muchas veces por minuto, no se agregan
--  ni se borran mientras se revisa, y releer la ficha entera por cada tecla
--  del otro asesor seria un viaje al servidor por tecla.
-- ============================================================================

do $$
begin
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'proposals'
  ) then
    alter publication supabase_realtime drop table proposals;
  end if;
end $$;

-- `replica identity full` solo hace falta para lo que se publica: en una tabla
-- que no viaja por Realtime es WAL de mas en cada escritura.
alter table proposals replica identity default;

comment on table proposals is
  'La propuesta y sus parametros. No se publica por Realtime: los cambios del '
  'objetivo se avisan por broadcast y cada pantalla los vuelve a leer por el '
  'servidor, donde RLS sigue mandando incluso en los borrados.';
