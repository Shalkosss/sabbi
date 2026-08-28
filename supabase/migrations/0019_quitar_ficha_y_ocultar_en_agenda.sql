-- ============================================================================
--  Sabbi — la ficha se puede quitar, o solo esconder de la agenda
--
--  Dos gestos distintos que se pedian confundidos en el mismo boton:
--
--  1. Quitar la ficha entera. El cliente no era, la carga fue de prueba, o
--     hay una duplicada. Se borra: se van las posiciones, los hitos de
--     agenda y las propuestas en borrador que colgaban de ella. Una propuesta
--     publicada la protege — eso salio al cliente y no se tira sin dejar
--     rastro—; hay que despublicarla antes o quitar la ficha desde admin.
--
--  2. Ocultar la ficha del calendario, sin perderla. Esta cerrada, pausada,
--     o simplemente ya no tiene sentido que ocupe un carril en la agenda de
--     esta semana. La ficha sigue existiendo, sigue en Fichas, y se puede
--     traer de vuelta al calendario apretando «mostrar» en la misma tarjeta.
--
--  El flag `oculta_en_agenda` es lo que separa los dos gestos. Con `false`
--  —el defecto— la ficha aparece en la agenda como siempre. Con `true`
--  desaparece del calendario y de la lista de rutas, pero no del resto de la
--  app. Es asimetrico a proposito: quitar de la agenda no toca la ficha,
--  quitar la ficha si borra su presencia en la agenda porque la ficha ya no
--  existe para calcularle una ruta.
-- ============================================================================

alter table fichas
  add column if not exists oculta_en_agenda boolean not null default false;

comment on column fichas.oculta_en_agenda is
  'Cuando true, la ficha no aparece en el calendario ni en la lista de rutas '
  'de /agenda. No afecta a /fichas ni a las propuestas: es solo un filtro de '
  'presentacion, reversible desde la misma tarjeta de la agenda.';

-- Un indice parcial evita recorrer las fichas ocultas al pintar la agenda,
-- que es la unica lectura que se pega contra este filtro varias veces al dia.
create index if not exists fichas_visibles_en_agenda
  on fichas (created_at desc)
  where oculta_en_agenda = false;
