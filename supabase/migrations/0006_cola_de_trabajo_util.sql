-- ============================================================================
--  Sabbi — que la cola de trabajo del catalogo sea corta
--
--  La 0004 metio `liquidez` entre los datos que un producto necesita, y esa
--  columna nunca se importo: los 308 productos salian como incompletos. Una
--  lista donde esta todo no es una lista de trabajo, es ruido — nadie la abre
--  dos veces.
--
--  El criterio pasa a ser el que de verdad rompe una propuesta: sin clase el
--  motor no sabe donde poner el dinero, y sin retorno la vista de rentabilidad
--  muestra una celda vacia. Con eso la cola baja de 308 a 62, que es trabajo
--  que alguien puede terminar.
-- ============================================================================

-- `create or replace` no deja cambiar las columnas de una vista; la 0004 la
-- dejo con otro orden, asi que hay que borrarla antes.
drop view if exists productos_incompletos;

create view productos_incompletos as
  select p.id,
         p.nombre,
         p.clase,
         p.origen,
         p.creado_por,
         p.actualizado_en,
         array_remove(array[
           case when p.clase   is null then 'clase'   end,
           case when p.moneda  is null then 'moneda'  end,
           case when p.ret_min is null then 'ret_min' end,
           case when p.ret_max is null then 'ret_max' end
         ], null) as faltan,
         -- Un producto del menu ofrecible sin retorno sale impreso en cada
         -- propuesta que lo toque: esos van primero.
         p.ofrecer as urgente
  from products p
  where p.clase is null
     or p.moneda is null
     or p.ret_min is null
     or p.ret_max is null;

comment on view productos_incompletos is
  'Productos a los que les falta un dato que la propuesta necesita: la clase '
  'para colocar el dinero y el retorno para la vista de rentabilidad. Los '
  'marcados urgente estan en el menu ofrecible y salen en propuestas reales.';
