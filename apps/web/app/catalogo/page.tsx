import { Marco } from '../../componentes/Marco'
import { SinAsesor } from '../../componentes/SinAsesor'
import { Catalogo } from '../../componentes/catalogo/Catalogo'
import { idsDescuadrados, listarCatalogo, listasDeValidacion } from '../../lib/datos/catalogo'
import { asesorActual } from '../../lib/supabase/servidor'

/**
 * El catálogo de productos.
 *
 * Es la BD que la mesa mantenía en una planilla de once hojas. Acá se ve
 * entera y se carga desde un solo formulario, con listas en vez de campos de
 * texto: la composición se guarda contra claves foráneas, así que un nombre
 * inventado no llegaría a guardarse.
 *
 * Editar es de admin, igual que en el resto del catálogo — un producto mal
 * cargado sale en la propuesta de todos los asesores.
 */
export default async function Pagina() {
  const asesor = await asesorActual()
  if (asesor === null) return <SinAsesor />

  const [productos, listas, descuadrados] = await Promise.all([
    listarCatalogo(),
    listasDeValidacion(),
    idsDescuadrados(),
  ])

  return (
    <Marco asesor={asesor} activo="catalogo" migas={[{ texto: 'Catálogo' }]}>
      <Catalogo
        productos={productos}
        listas={listas}
        descuadrados={[...descuadrados]}
        puedeEditar={asesor.rol === 'admin'}
      />
    </Marco>
  )
}
