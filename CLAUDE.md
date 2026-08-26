# Cómo trabajar en este repositorio

Sabbi convierte la ficha patrimonial de un cliente en una propuesta de
portafolio y en dos presentaciones. El README cuenta el producto entero; esto es
lo que hay que tener presente antes de escribir una línea.

## Las siete reglas

No se negocian. Cada una tiene detrás un bug que ya costó caro; el README los
nombra con su número de versión.

1. **El motor es una función pura.** Vive en `packages/core`. Sin red, sin DOM,
   sin Supabase, sin reloj. Misma entrada, misma salida, siempre.
2. **Una sola fuente de verdad de configuración.** Un número de negocio dentro
   de un `.tsx` es un error, y desde que la macro se edita en la web tampoco
   puede estar dentro de un `.ts` del motor: los pesos y los umbrales viajan
   como argumento.
3. **Una sola función `claseDe(posición)`**, la misma para el motor y para la
   UI. Dos criterios en paralelo produjeron el bug v37.25b.
4. **Neteo solo contra el menú real de cada clase.** El catálogo tiene 319
   productos y solo 24 son ofrecibles.
5. **Golden tests desde el día uno.** El caso Ana Tumi es regresión permanente.
   Si el resultado se mueve, se explica por qué en el commit.
6. **Ningún dato vacío pasa en silencio.** `camposFaltantes()` define qué es una
   posición completa.
7. **No inventar lo que los datos no sostienen.** Un retorno que no está en el
   catálogo viaja como `null` y la vista lo dice.

## Dónde vive cada cosa

```
apps/web/              Next.js. UI delgada, sin reglas de negocio
packages/core/         el motor puro: dominio, reglas y propuesta
packages/config/       schema Zod, benchmarks y validación de la macro
packages/io/           parsers de ficha y de catálogo
packages/export/       Excel y los dos decks de PowerPoint
supabase/migrations/   el esquema, en orden
tools/                 scripts sueltos de mantenimiento
```

## Comandos

```bash
npm ci                 # instalar
npm test               # Vitest, incluye los golden tests del motor
npm run typecheck      # TypeScript estricto sobre todos los paquetes
npm run lint           # ESLint: lo que el typecheck no ve
npm run revisar-deck   # estado de las 22 láminas del deck réplica
npm run migrar         # aplica las migraciones pendientes de supabase/
npm run dev            # servidor de desarrollo
```

Los tres primeros tienen que pasar antes de cada commit. La cobertura tiene
umbrales configurados en `vitest.config.ts` y bajarlos no es una solución.

## Lo que ya está hecho y conviene no reinventar

- **La macro se edita en la web** (`/macro`) y manda en todo lo que se calcula.
  Cada guardado es una versión nueva con su autor y su nota; nada se sobreescribe.
- **La ficha se trabaja de a dos.** Cursores, presencia y cambios en vivo entre
  dos asesores sobre la misma ficha. `apps/web/lib/tiempo-real.ts` tiene la
  regla que lo sostiene: lo que llega de afuera nunca pisa lo que se está
  escribiendo acá. El README lo cuenta entero en «La misma ficha, dos asesores».
- **La biblioteca y las versiones** (`/propuestas`). Un borrador se recalcula en
  cada lectura; una publicada sale de su snapshot y no se mueve nunca más.
  Publicar es el único momento en que esta herramienta escribe una cifra.

## Cómo se escribe acá

El código, los nombres y los comentarios están en castellano, igual que los
mensajes de commit: en minúscula y contando qué gana quien usa la app, no qué
archivo se tocó. «feat: la propuesta baja a Excel, que es donde la mesa la
trabaja» es el tono. Los comentarios explican por qué algo es así, no repiten lo
que el código ya dice.

Los tests van junto al código que prueban, en `__tests__/`. Un cambio de
comportamiento sin test no está terminado.

## Lo que nunca entra al repositorio

Las fichas, propuestas y decks de referencia traen nombres, patrimonios y
tenencias reales de clientes. `reference/` está en `.gitignore` y ahí se queda.
La Ley 29733 expone a Sabbi a sanción de Indecopi si esa información se filtra,
y este repositorio es público. Antes de commitear cualquier archivo derivado de
un caso real, verifica que no arrastre nombres, montos ni instituciones.

Tampoco entran claves: ni las de Supabase ni ninguna otra. Van en `.env.local`,
que también está ignorado.

## Dos personas, o dos sesiones, sobre el mismo repositorio

Acá se trabaja desde dos cuentas y dos máquinas, y las dos sesiones de Claude no
se hablan entre ellas. Nunca lo van a hacer: no hay canal entre una y otra. Lo
único que comparten es este repositorio, así que la coordinación tiene que estar
escrita en él o no existe. Cuando dos sesiones hacen el mismo trabajo dos veces,
la causa siempre es la misma: ninguna miró qué había antes de empezar.

**Antes de escribir una línea.** El hook de arranque imprime las ramas remotas y
los pull requests abiertos, con su fecha. Léelo. Si no lo tienes a mano:

```bash
git fetch --prune origin
git branch -r --sort=-committerdate --format='%(refname:short)  %(committerdate:relative)'
```

Si ya hay una rama o un pull request sobre lo que te acaban de pedir, no
empieces de cero: continúa ese trabajo, o dilo y elige otra cosa. Una rama de
hace dos días con un commit no es basura, es alguien a mitad de camino.

**Empuja la rama al primer commit, no al último.** La rama en el remoto es lo
único que le avisa a la otra máquina que ese trabajo está tomado, y avisar al
final no avisa nada. `git push -u origin <rama>` en cuanto haya algo que
empujar, aunque falte la mitad.

**Un trabajo, una rama, un pull request.** Las ramas `claude/*` son de un solo
trabajo: se abren, se mergean y se borran. Retomar una vieja es traerle `master`
y terminarla, nunca abrir otra en paralelo con lo mismo adentro.

**La cola compartida es `.github/AGENDA.md`.** Es lo que el turno de noche toma
de a un punto, y sirve igual para dos personas despiertas: el primero sin marcar
es el próximo. Un punto que ya está en un pull request abierto no se vuelve a
tomar.

**Lo que no se resuelve solo va escrito.** Una decisión que le toca a la mesa
—qué instrumento implementa el oro, si la regla de flujos se enciende sola— no
la tomes: déjala en «Pendientes con el equipo», al final del README, y sigue.
Ahí la ve la otra sesión, y la mesa.

## Trabajo automático

`.github/workflows/` tiene los turnos automáticos: Claude contesta cuando lo
nombran, toma los issues que se le asignan y avanza de noche con la agenda de
`.github/AGENDA.md`. `.github/AUTOMATIZACION.md` explica cómo está armado y qué
hacer cuando algo no arranca.

Si trabajas dentro de uno de esos turnos: un pull request hace una cosa entera.
Cuando algo depende de una decisión de la mesa —qué instrumento implementa el
oro, si la regla de flujos se enciende sola— no la tomes tú: déjala escrita
como pendiente y sigue con lo siguiente.
