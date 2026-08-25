-- ============================================================================
--  Sabbi — la macro la calibra quien la usa, no solo un admin
--
--  La 0010 dejo la macro escribible solo por admin, con el argumento de que un
--  umbral mal puesto no rompe una propuesta sino todas. El argumento sigue
--  siendo cierto; lo que estaba mal era la conclusion. Quien calibra el modelo
--  es la mesa —los analistas— y dejarlos pidiendole a un admin cada cambio
--  convierte una prueba de dos minutos en un tramite, que es exactamente como
--  se vuelve a terminar calibrando en una hoja aparte.
--
--  Lo que protege el modelo no es el candado sino el rastro: cada guardado
--  escribe una version nueva con su autor, su fecha y su nota, y ninguna se
--  sobreescribe. Volver atras es activar la anterior.
--
--  El catalogo y `config_versions` siguen siendo de admin: eso no cambia aca.
-- ============================================================================

drop policy if exists solo_admin on macro_versions;

-- Cualquier asesor con ficha en `advisors`. La condicion no es "estar
-- autenticado" sino "ser alguien": un usuario de Auth sin fila de asesor no
-- tiene a quien atribuirle la version, y una macro sin autor no se puede
-- explicar despues.
create policy escribir_los_asesores on macro_versions
  for all to authenticated
  using (advisor_actual() is not null)
  with check (advisor_actual() is not null);

comment on table macro_versions is
  'La macro del portafolio: pesos de benchmark y umbrales del motor. Una sola '
  'activa; el resto es historia con autor y fecha. La escribe cualquier asesor '
  '— lo que la protege es que nada se sobreescribe.';
