# Sabbi — Plataforma de Plan Patrimonial

Aplicación interna para los asesores de Sabbi. Convierte la ficha patrimonial de
un cliente en una propuesta de portafolio y en dos presentaciones, y lo deja todo
en una biblioteca compartida del equipo.

```
ficha .xlsx  →  revisión y decisión  →  motor  →  propuesta  →  2 decks
```

Reemplaza dos herramientas: un HTML monolítico de 10,863 líneas y la macro
`Benchmark Sabbi` en VBA.

## Reglas del proyecto

1. **El motor es una función pura.** Vive en `packages/core`. Sin red, sin DOM,
   sin Supabase, sin reloj. Misma entrada, misma salida, siempre.
2. **Una sola fuente de verdad de configuración.** Un número de negocio dentro de
   un `.tsx` es un error.
3. **Una sola función `claseDe(posición)`**, usada por el motor y por la UI. Dos
   criterios en paralelo produjeron el bug v37.25b.
4. **Neteo solo contra el menú real de cada clase.** El catálogo tiene 307
   productos y solo 24 son ofrecibles. Confundirlos produjo el bug v37.25, en el
   que 2.3 MM conservados se volvieron invisibles para el motor.
5. **Golden tests desde el día uno.** El caso Ana Tumi es regresión permanente.

## Estructura

```
apps/web/              Next.js. UI delgada, sin reglas de negocio
packages/
  core/                MOTOR PURO
    domain/            tipos: Perfil, Segmento, ClaseModelo, Posición, Piso
    rules/             reparto, cascada, privados, neteo, cuadre
  config/              schema Zod y carga de configuración
  io/                  parsers de ficha
  export/
    xlsx/              propuesta
    pptx/replica/      plantilla real versionada más tokens
    pptx/rediseno/     generación con pptxgenjs
reference/             archivos de entrada — NO se versiona, ver abajo
```

## Datos de clientes

Las fichas, propuestas y decks de referencia traen nombres, patrimonios y
tenencias reales. **No entran al repositorio.** `reference/` y los mapas de
token a valor están en `.gitignore`.

La Ley 29733 de Protección de Datos Personales expone a Sabbi a sanción de
Indecopi si esta información se filtra. Antes de commitear cualquier archivo
derivado de un caso real, verifica que no arrastre nombres, montos ni
instituciones.

## Comandos

```bash
npm install
npm test           # Vitest, incluye los golden tests del motor
npm run typecheck  # TypeScript estricto sobre todos los paquetes
npm run dev        # servidor de desarrollo
```

## El motor

El corazón es un solver de punto fijo con pisos. Reparte el patrimonio entre
clases según el benchmark del perfil; si a una clase le tocaría menos de lo que
ya tiene cubierto, se cierra en ese piso y el resto se redistribuye entre las
demás. Itera hasta converger.

Los pisos vienen de dos fuentes que el motor trata igual: posiciones que el
cliente conserva y restricciones que pone el asesor. Por eso "el cliente quiere
quedarse con esta casa aunque el modelo pida menos" no necesita código aparte.

Los pesos de benchmark salen de la hoja `Data` del archivo Portfolio Modificado,
a precisión completa. El JSON de configuración trae esos mismos pesos redondeados
a cuatro decimales, y ese redondeo desplaza la base de redistribución en 6,502.88
USD sobre el caso Ana Tumi.

## Estado

| Fase | Alcance | Estado |
|---|---|---|
| 0 | Monorepo, TypeScript estricto, Vitest | hecho |
| 1 | Esquema Supabase, auth, configuración | en curso |
| 2 | Parser de ficha y pantalla de revisión | |
| 3 | Motor `generarPlan()` y golden test | reparto por clase hecho |
| 4 | Vista web de la propuesta | |
| 5 | Export a Excel | |
| 6 | PPT réplica | plantilla tokenizada |
| 7 | PPT rediseñado | |
| 8 | Biblioteca compartida y versionado | |
| 9 | Asistencia opcional de IA | |

### Pendientes con el equipo

- **Tipografía.** La marca pide Avenir Next Pro. Sin confirmar la licencia, la
  plantilla usa una genérica; cambiar `TIPOGRAFIA` en `tokenizar.py` y volver a
  correrlo es toda la migración.
- **Regla de flujos.** El §8.4 manda el club a Sabbi Fondo Estratégico cuando el
  cliente necesita flujos. El motor canónico no la implementa. En stand by.
- **Láminas 1 a 8 del deck réplica.** Definir cuáles llevan dato. En stand by.
