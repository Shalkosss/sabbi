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

- [ ] **La lámina 10 sale a medias.** Las tres ventas y las tres compras
      mayores ya se arman; falta el resto del bloque. `npm run revisar-deck` la
      marca como «parcial» y dice qué es lo que queda.

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

- [x] **La propuesta no tenía historial.** Fase 8: `/propuestas` lista lo que
      el equipo tiene armado, publicar congela las cifras en un snapshot y la
      versión nueva nace borrador apuntando a la anterior.

- [x] **La lámina 4 del deck réplica tenía las barras del cliente de
      referencia.** `grafico.ts` les da a las seis barras el alto que les toca,
      mueve sus etiquetas y rotula el eje con el escalón que haga falta. La
      serie del objetivo se borra en vez de quedar dibujada: no se puede mapear
      contra la sección 6. `revisar-deck` ya no lista ninguna como «geometria».

- [x] **`npm run lint` no corría.** ESLint quedó instalado con config plana, el
      repositorio sin hallazgos y el paso agregado a `verificar.yml`. Entró en
      `master` antes de que esta agenda llegara.
