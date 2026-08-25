-- ============================================================================
--  Sabbi — si el cliente accede a Inmobiliario Directo lo dice el asesor
--
--  La macro v4 pregunta algo que hasta ahora el motor decidia solo: si el
--  cliente puede tomar Inmobiliario Directo. Si accede, la clase se queda con
--  su peso sin importar el ticket. Si no accede, su benchmark se reparte — y a
--  donde depende del monto: hasta el umbral va a Mercados Publicos, por encima
--  a Mercados Privados con un tercio al club deal.
--
--  Es la celda C5 de la hoja Portafolio, y es una decision del caso, no del
--  modelo: dos clientes con el mismo perfil y el mismo ticket pueden
--  contestarla distinto. Por eso vive en la propuesta y no en la macro.
--
--  No confundir con `toggle_inm_seccion_propia`, que es otra pregunta: esa
--  dice si los inmuebles que el cliente YA TIENE cuentan como patrimonio
--  financiero; esta dice si el modelo le puede proponer inmobiliario NUEVO.
--
--  Arranca en `false`, que es lo que el motor hace por defecto y el caso mas
--  frecuente: un inmueble conservado salva la clase por su cuenta, sin que
--  nadie tenga que marcar nada.
-- ============================================================================

alter table proposals
  add column if not exists accede_inmobiliario boolean not null default false;

comment on column proposals.accede_inmobiliario is
  'Celda C5 de la hoja: el cliente puede tomar Inmobiliario Directo. En true '
  'la clase conserva su peso sin importar el ticket; en false se reparte segun '
  'el umbral de la macro. Una posicion conservada en la clase la salva igual.';
