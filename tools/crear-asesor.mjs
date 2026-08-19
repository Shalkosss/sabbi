/**
 * Da de alta un asesor.
 *
 *   node --env-file=.env.local tools/crear-asesor.mjs correo@sabbi.com "Nombre Apellido" [--admin]
 *
 * La app no tiene registro abierto: las cuentas las crea Sabbi. Un asesor son
 * dos cosas — un usuario de Supabase Auth y una fila en `advisors` enlazada
 * por `user_id` — y sin la segunda las politicas RLS no lo dejan escribir
 * nada. Esto crea las dos, en ese orden, y es lo unico en el repo que usa la
 * clave de servicio: la app nunca la toca.
 *
 * La contraseña sale por pantalla una sola vez. Se entrega por un canal que no
 * sea este, y el asesor la cambia al entrar.
 */
import { randomBytes } from 'node:crypto'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const servicio = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !servicio) {
  console.error(
    'Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.\n' +
      '  node --env-file=.env.local tools/crear-asesor.mjs correo "Nombre"',
  )
  process.exit(1)
}

const argumentos = process.argv.slice(2)
const admin = argumentos.includes('--admin')
const [email, nombre] = argumentos.filter((a) => a !== '--admin')

if (!email || !nombre) {
  console.error('Uso: tools/crear-asesor.mjs correo@sabbi.com "Nombre Apellido" [--admin]')
  process.exit(1)
}

/** Legible al dictarla y suficiente para un primer ingreso que se cambia. */
const clave = process.env.CLAVE ?? `sabbi-${randomBytes(9).toString('base64url')}`

const cabeceras = {
  apikey: servicio,
  Authorization: `Bearer ${servicio}`,
  'Content-Type': 'application/json',
}

async function pedir(ruta, opciones) {
  const respuesta = await fetch(`${url}${ruta}`, {
    ...opciones,
    headers: { ...cabeceras, ...opciones.headers },
  })
  const texto = await respuesta.text()
  const cuerpo = texto === '' ? null : JSON.parse(texto)

  if (!respuesta.ok) {
    const detalle = cuerpo?.msg ?? cuerpo?.message ?? cuerpo?.error_description ?? texto
    throw new Error(`${respuesta.status} en ${ruta}: ${detalle}`)
  }
  return cuerpo
}

/** El usuario de Auth. Si ya existe, se reutiliza en vez de fallar. */
async function usuarioDeAuth() {
  try {
    const creado = await pedir('/auth/v1/admin/users', {
      method: 'POST',
      body: JSON.stringify({ email, password: clave, email_confirm: true }),
    })
    console.log(`OK  usuario de Auth creado — contraseña: ${clave}`)
    return creado.id
  } catch (error) {
    if (!/already been registered|already exists/i.test(error.message)) throw error

    const lista = await pedir(`/auth/v1/admin/users?page=1&per_page=200`, { method: 'GET' })
    const existente = lista.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())
    if (existente === undefined) throw error

    console.log('    el usuario de Auth ya existia — se conserva su contraseña')
    return existente.id
  }
}

try {
  const userId = await usuarioDeAuth()

  const yaEsAsesor = await pedir(
    `/rest/v1/advisors?select=id,rol&user_id=eq.${userId}`,
    { method: 'GET' },
  )

  if (yaEsAsesor.length > 0) {
    console.log(`    ya estaba dado de alta como ${yaEsAsesor[0].rol}. Nada que hacer.`)
    process.exit(0)
  }

  const [asesor] = await pedir('/rest/v1/advisors', {
    method: 'POST',
    body: JSON.stringify({
      user_id: userId,
      nombre,
      email,
      rol: admin ? 'admin' : 'asesor',
    }),
    headers: { ...cabeceras, Prefer: 'return=representation' },
  })

  console.log(`OK  ${nombre} dado de alta como ${asesor.rol}`)
  console.log('\nEntra en /ingresar con ese correo. Cambia la contraseña despues del primer ingreso.')
} catch (error) {
  console.error(`\nFallo: ${error.message}`)
  process.exit(1)
}
