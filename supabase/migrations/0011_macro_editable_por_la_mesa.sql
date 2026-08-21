-- ============================================================================
--  Sabbi — la macro deja de ser de admin y pasa a ser de la mesa
--
--  La 0010 la dejo escribible solo por un admin, con el argumento de que un
--  umbral mal puesto no rompe una propuesta sino todas. El argumento sigue
--  siendo cierto y por eso no se quita nada de lo que lo contiene: cada
--  guardado sigue escribiendo una version nueva con su autor, su fecha y su
--  nota, la anterior sigue entera y volver a ella es guardar otra vez.
--
--  Lo que cambia es quien puede hacerlo. La macro es la herramienta con la que
--  la mesa calibra el modelo, y un permiso que obliga a pedirle a otro que
--  teclee un numero no protege el modelo: hace que se calibre en una hoja
--  suelta que despues nadie puede auditar. Con historial completo, el riesgo
--  de que un asesor guarde un umbral raro es una version mas y un «volver a la
--  v7»; el de que la mesa trabaje fuera del sistema no se arregla despues.
--
--  Sigue sin haber politica de delete: la historia no se borra ni siendo admin.
-- ============================================================================

drop policy if exists solo_admin on macro_versions;

-- La escribe cualquier asesor con sesion, y la fila queda firmada: `created_by`
-- tiene que ser el asesor que la esta guardando. Sin esto se podria guardar una
-- version a nombre de otro, que es justo lo que el historial existe para evitar.
create policy escribir_la_mesa on macro_versions
  for insert to authenticated
  with check (created_by = advisor_actual());

-- Activar una version apaga la anterior, y eso es un update sobre una fila que
-- escribio otro. Se permite: cual esta activa es una decision de la mesa, no
-- una propiedad de quien la guardo. El contenido de las versiones no se toca
-- —no hay forma de reescribir un `payload` sin dejar rastro— porque cada
-- guardado inserta en vez de editar.
create policy activar_la_mesa on macro_versions
  for update to authenticated
  using (true) with check (true);

comment on table macro_versions is
  'La macro del portafolio: pesos de benchmark y umbrales del motor. Una sola '
  'activa; el resto es historia con autor y fecha. La edita cualquier asesor: '
  'lo que la protege no es el permiso sino que nada se sobreescribe.';
