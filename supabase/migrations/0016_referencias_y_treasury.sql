-- ============================================================================
--  Sabbi — dos correcciones que salieron de leer el libro entero
--
--  La 0015 se escribio contra una sola hoja (`Distributivos`, catorce fondos)
--  y contra un solo caso verificado (ORENT). Al importar el libro completo
--  aparecio la hoja `Retornos`: setenta columnas, cuatro mil cuatrocientas
--  observaciones y el bloque de metricas que la macro venia escribiendo debajo
--  de cada una. Contrastar el motor contra esas ~760 celdas — con
--  `npm run revisar-retornos` — dejo dos cosas a la vista.
-- ============================================================================

-- ── 1. El risk-free no era un escalar ───────────────────────────────────────
-- La 0015 decia que la hoja tenia el risk-free clavado en `$R$141` y que valia
-- 0.04475 para todos los fondos y todas las ventanas. Era falso.
--
-- Despejando la tasa de las 260 celdas de Sharpe que la macro dejo escritas
-- (`sharpe = (retorno - rf) / desviacion`, con retorno y desviacion ya
-- verificados contra el motor), las 260 dan la fila «Treasury 10Y» del mes en
-- que **termina esa columna**. Sin una excepcion. 0.04475 es junio, y parecia
-- un escalar solo porque junio es el mes en que cierra la mayoria.
--
-- Es ademas lo correcto. Un fondo que reporta trimestral cierra en marzo y el
-- resto en junio; medir a los dos contra la tasa de junio le cobra al primero
-- tres meses de curva que su serie no vivio.
--
-- La tabla `treasury_10y` ya existe y ya tiene la forma que hace falta: una
-- fila por mes fechada. Lo que cambia es que deja de ser informativa y pasa a
-- alimentar el Sharpe. `retornos_parametros.risk_free` queda como respaldo:
-- mientras el Treasury se cargue a mano, el mes recien cerrado va a estar
-- vacio la primera semana, y sin respaldo el Sharpe de los cuarenta fondos
-- desapareceria de la pantalla cada vez que eso pasa.

comment on table treasury_10y is
  'Cierre del Treasury 10Y del ultimo dia de cada mes, como fraccion. Es el '
  'risk-free del Sharpe: cada fondo usa el del mes en que termina su serie, '
  'que es lo que hacia la hoja en sus 260 celdas de Sharpe. Un mes que falta '
  'cae al respaldo de `retornos_parametros.risk_free`.';

comment on column retornos_parametros.risk_free is
  'Respaldo para el Sharpe cuando `treasury_10y` no tiene el mes de corte de '
  'un fondo. NO es la tasa habitual: la habitual sale de la serie. Tocarlo '
  'solo mueve a los fondos cuyo ultimo mes todavia no se cargo.';

-- Un yield de 4.4% se escribe 0.044. Escribirlo 4.4 pasaba sin ruido y movia
-- el Sharpe de la tabla entera dos ordenes de magnitud; ahora no entra.
alter table treasury_10y drop constraint if exists treasury_10y_cierre_fraccion;
alter table treasury_10y add constraint treasury_10y_cierre_fraccion
  check (cierre > -0.01 and cierre < 0.5);

-- ── 2. Los indices no son fondos ────────────────────────────────────────────
-- La hoja le daba a cada benchmark una columna identica a la de un fondo: el
-- S&P 500 bajo Private Equity, el HYG bajo Private Debt, el IYR bajo Real
-- Estate, los indices BDC, el Barclay Hedge Fund Index. Con su serie y su
-- bloque de metricas.
--
-- Eso hacia que el `LARGE()` de `Ranking Fondos` los ordenara junto al resto.
-- «El mejor Sharpe de Private Equity: S&P 500 IVV» es una respuesta falsa a
-- una pregunta razonable: el indice no esta a la venta. Con la marca, los
-- comparativos los excluyen y el grafico de riesgo-retorno los sigue
-- dibujando, que es donde la referencia sirve.

alter table fondos add column if not exists es_referencia boolean not null default false;

create index if not exists fondos_comparables on fondos (asset_class) where not es_referencia;

comment on column fondos.es_referencia is
  'La fila es un indice de mercado, no un fondo que se pueda comprar. Entra a '
  'la tabla maestra y al grafico riesgo-retorno; queda fuera de los rankings, '
  'de los extremos por clase y de los promedios.';
