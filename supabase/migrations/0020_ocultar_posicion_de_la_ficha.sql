-- ============================================================================
--  Sabbi — una posicion se puede quitar de la ficha sin borrarla
--
--  «Quitar del calculo» ya existe: se marca la cuenta (venta, conservar) y el
--  motor decide. Pero la fila sigue ahi, ocupando la tabla, aunque no aporte
--  nada — una linea de ruido en una ficha de ochenta.
--
--  `oculta` es el otro gesto: sacar la fila de la vista. No entra al calculo y
--  no se dibuja, pero no se pierde: queda guardada y se restaura desde la misma
--  pantalla. Es una decision de presentacion —limpiar lo que no se mira— con
--  respaldo, no un borrado. Para borrar de verdad esta quitar la ficha entera.
--
--  Por defecto `false`: nada cambia para las fichas que ya existen.
-- ============================================================================

alter table ficha_positions
  add column if not exists oculta boolean not null default false;

comment on column ficha_positions.oculta is
  'Cuando true, la posicion no se muestra en la revision ni entra al calculo. '
  'No es un borrado: la fila sigue en la base y se restaura desde la pantalla.';
