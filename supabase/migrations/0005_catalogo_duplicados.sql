-- ============================================================================
--  Sabbi — la cola de nombres repetidos del catalogo
--
--  El catalogo trae el mismo producto escrito de dos maneras, y a veces con
--  dos retornos distintos: «iShares Core MSCI EM IMI UCITS ETF» esta cargado
--  al 7-9% y al 6.5-9.5%, y el fondo Edifica figura con guion y con raya.
--
--  El emparejador de la propuesta no elige entre los dos: elegir seria
--  inventar la cifra que va impresa en el documento que el cliente firma, asi
--  que el instrumento se queda sin retorno y la vista lo dice en su nota de
--  cobertura. Esta vista es la otra mitad de esa decision: la lista de lo que
--  la mesa tiene que resolver para que esa celda deje de estar vacia.
-- ============================================================================

create or replace view productos_duplicados as
  with normalizados as (
    select id,
           nombre,
           clase,
           ret_min,
           ret_max,
           origen,
           trim(lower(regexp_replace(nombre, '[^a-zA-Z0-9]+', ' ', 'g'))) as clave
    from products
  )
  select clave,
         count(*)                                   as veces,
         array_agg(id order by nombre)              as ids,
         array_agg(nombre order by nombre)          as nombres,
         array_agg(coalesce(clase, '—') order by nombre) as clases,
         -- Lo que decide si la propuesta puede leer el producto. Que a una de
         -- las copias le falte el retorno no es conflicto: el emparejador se
         -- queda con la que tiene el dato. Conflicto es que las dos lo tengan
         -- y no coincidan, porque ahi no hay forma de elegir sin inventar.
         count(distinct (ret_min, ret_max)) filter (where ret_min is not null) > 1
           as retornos_en_conflicto
  from normalizados
  group by clave
  having count(*) > 1;

comment on view productos_duplicados is
  'Productos cargados mas de una vez con el mismo nombre. Los que marcan '
  'retornos_en_conflicto dejan al instrumento sin retorno en la propuesta: hay '
  'que unificarlos o borrar el sobrante.';
