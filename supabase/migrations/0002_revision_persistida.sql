-- ============================================================================
--  Sabbi — la revision deja de vivir en memoria del navegador
--
--  El esquema inicial guardaba la ficha y sus posiciones, pero perdia tres
--  cosas al recargar: que filas descarto el parser, el portafolio modelo que
--  algunas fichas traen pegado a la derecha, y que celdas corrigio una persona.
--  Sin ellas, volver a abrir una ficha no devuelve la misma pantalla.
-- ============================================================================

-- Filas que el parser dejo fuera y bloque de portafolio modelo. Los dos son
-- informativos — no entran en ningun calculo — pero se muestran en pantalla.
alter table fichas
  add column if not exists ignoradas jsonb not null default '[]'::jsonb,
  add column if not exists modelo    jsonb;

-- Lo que el cliente escribio sobre sus flujos es texto libre — «si, 5,000 al
-- mes» — y no entra en las columnas numericas del cliente. Se guarda como lo
-- escribio, junto a la ficha que lo declaro.
alter table fichas
  add column if not exists flujo_actual text,
  add column if not exists flujo_retiro text;

-- Que campos toco el asesor. El booleano `editado_manualmente` dice que hubo
-- correccion; esto dice donde, que es lo que la tabla marca con un punto.
alter table ficha_positions
  add column if not exists campos_editados text[] not null default '{}';

-- Ticket minimo de ETF: entra al motor y cambia el resultado, asi que no puede
-- volver al default en cada carga. Sale de la propia ficha cuando la trae.
alter table proposals
  add column if not exists ticket_minimo_etf_usd numeric not null default 20000
    check (ticket_minimo_etf_usd > 0);
