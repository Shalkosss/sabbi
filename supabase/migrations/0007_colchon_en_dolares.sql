-- ============================================================================
--  Sabbi — el colchon de liquidez se llama por la moneda que guarda
--
--  La columna se llamaba `colchon_liquidez_pen` y siempre guardo dolares: la
--  pantalla escribe `colchonLiquidezUsd` y el motor lo suma al ticket, que es
--  en dolares. El sistema es consistente de punta a punta, asi que no hay
--  ninguna cifra mal — lo que hay es un nombre que le esta mintiendo al
--  proximo que lea la tabla, y que tarde o temprano hace que alguien divida
--  por el tipo de cambio "para arreglarlo".
--
--  Renombrar es barato hoy y caro despues.
-- ============================================================================

alter table proposals rename column colchon_liquidez_pen to colchon_liquidez_usd;

comment on column proposals.colchon_liquidez_usd is
  'Efectivo que la propuesta reserva, en dolares. Entra al motor como una '
  'restriccion sobre cash: clava ese monto dentro del ticket.';
