# Agenda del turno de noche

La lista de lo que Claude toma cuando corre solo, de a un punto por noche y en
este orden. El primero sin marcar es el próximo.

Reordenar es mover una línea. Para meter algo urgente, ponlo arriba; para
sacarlo del camino, bórralo o mándalo al final. Un punto que ya está en un pull
request abierto no vuelve a tomarse: el turno no arranca mientras haya un
nocturno esperando revisión.

Lo que entra acá tiene que poder terminarse sin preguntarle nada a la mesa. Las
decisiones de negocio viven en «Pendientes con el equipo», al final del README,
y ahí se quedan hasta que el equipo las tome.

## Por hacer

- [ ] **La lámina 4 del deck réplica tiene las barras del cliente de
      referencia.** Los totales y los porcentajes ya salen, pero las doce
      barras conservan el alto del deck original, así que no coinciden con los
      números que tienen encima. Hay que recalcular alto y posición desde la
      propuesta. `npm run revisar-deck` la lista como «geometria».

- [ ] **La lámina 10 sale a medias.** Las tres ventas y las tres compras
      mayores ya se arman; falta el resto del bloque. `npm run revisar-deck` la
      marca como «parcial» y dice qué es lo que queda.

- [ ] **La propuesta no tiene historial.** La fase 8 del README —biblioteca
      compartida y versionado— empieza por poder listar las propuestas
      guardadas de un asesor con su fecha y su versión, y por no pisar la
      anterior cuando se recalcula. Una pantalla de lista y la migración que la
      sostiene alcanzan para un pull request.

- [ ] **Los scripts de `tools/` no tienen ninguna prueba.** `revisar-deck`,
      `revisar-catalogo` y `exportar-benchmark` se corren a mano y nadie se
      entera si se rompen. Cubrir al menos la lectura y el formato de salida de
      uno por noche.

- [ ] **La cobertura de `apps/web` es la más floja del repositorio.** Los
      umbrales de `vitest.config.ts` solo miran `packages/`. Sumar tests de las
      acciones de servidor que hoy no tienen ninguno, empezando por las de
      `apps/web/app/catalogo`.

## Hecho

Cada punto resuelto baja acá con el número de su pull request, para que la
noche siguiente no lo vuelva a tomar.

- [x] **`npm run lint` no corría.** ESLint quedó instalado con config plana, el
      repositorio sin hallazgos y el paso agregado a `verificar.yml`. Entró en
      `master` antes de que esta agenda llegara.
