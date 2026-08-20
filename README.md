# Sabbi — Plataforma de Plan Patrimonial

Aplicación interna para los asesores de Sabbi. Convierte la ficha patrimonial de
un cliente en una propuesta de portafolio y en dos presentaciones, y lo deja todo
en una biblioteca compartida del equipo.

```
ficha .xlsx  →  revisión y decisión  →  motor  →  propuesta  →  2 decks
```

Subir la ficha es el único paso obligatorio: la app cataloga los productos que
trae, propone qué se conserva y qué se vende, y deja la propuesta calculada. El
asesor corrige excepciones, no llena casillas.

Reemplaza dos herramientas: un HTML monolítico de 10,863 líneas y la macro
`Benchmark Sabbi` en VBA.

## Reglas del proyecto

1. **El motor es una función pura.** Vive en `packages/core`. Sin red, sin DOM,
   sin Supabase, sin reloj. Misma entrada, misma salida, siempre.
2. **Una sola fuente de verdad de configuración.** Un número de negocio dentro de
   un `.tsx` es un error.
3. **Una sola función `claseDe(posición)`**, usada por el motor y por la UI. Dos
   criterios en paralelo produjeron el bug v37.25b.
4. **Neteo solo contra el menú real de cada clase.** El catálogo tiene 319
   productos y solo 24 son ofrecibles. Confundirlos produjo el bug v37.25, en el
   que 2.3 MM conservados se volvieron invisibles para el motor.
5. **Golden tests desde el día uno.** El caso Ana Tumi es regresión permanente.
6. **Ningún dato vacío pasa en silencio.** `camposFaltantes()` define qué es una
   posición completa; con esa lista la revisión marca cada fila y la propuesta
   se bloquea. Lo que el catálogo ya sabe se completa solo; lo que nadie sabe se
   pide.
7. **No inventar lo que los datos no sostienen.** Un retorno que no está en el
   catálogo viaja como `null` y la vista lo dice en su nota de cobertura. Ante
   dos productos con el mismo nombre y distinto retorno, el emparejador se
   abstiene en vez de elegir.

## Estructura

```
apps/web/              Next.js. UI delgada, sin reglas de negocio
packages/
  core/                MOTOR PURO
    domain/            tipos: Perfil, Segmento, ClaseModelo, Posición, Piso
    rules/             reparto, cascada, privados, club, otros, residuales
    propuesta/         las siete secciones y las dos miradas del cliente
  config/              schema Zod y carga de configuración
  io/                  parsers de ficha
  export/
    xlsx/              propuesta
    src/pptx/rediseno/ el deck que se genera desde la propuesta
    src/pptx/replica/  motor de la plantilla y mapa de lo que falta
    pptx/replica/      plantilla tokenizada del deck de referencia
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

### Las siete clases

La hoja `Allocation detallado` trae Club Deals y Otros como bloques de primer
nivel, no como familias dentro de Mercados Privados, y desde la configuración v4
el motor las trata así:

| Clase | Qué entra | Mínimo |
|---|---|---|
| Mercados Públicos — Fijo | ETFs de bonos | 20,000 por ETF; abajo, Flip - Panda Zen |
| Mercados Públicos — Variable | ETFs de acciones | 20,000 por ETF; abajo, Flip - Cobra achorada |
| Mercados Privados | FM RE Infra, FM PC, FM PE VC, Fondo Oportunidad | 50,000 por fondo mutuo; el Fondo Oportunidad no tiene |
| Club Deals | Edifica Clase A o B; Fondo Estratégico con flujos | 10,000 |
| Otros | BTC (IBIT) y Oro | 10,000 |
| Inmobiliario Directo | el inmueble propio o TBD | la clase se disuelve bajo 500,000 de ticket |
| Cash | Sura Ultracash Dólares | — |

Partir la clase en tres no mueve un centavo del bloque: el solver es
proporcional y el caso Ana Tumi se reproduce al centavo. Lo que cambia es dónde
vive el neteo — ahora lo hace el solver de pisos, clase por clase, en vez de la
rutina de familias.

Lo que no llega a su mínimo no imprime una línea inejecutable: Club Deals y
Otros por debajo de 10,000 pasan al Fondo Oportunidad, que no tiene mínimo, y un
aviso lo deja escrito.

Los pisos vienen de dos fuentes que el motor trata igual: posiciones que el
cliente conserva y restricciones que pone el asesor. Por eso "el cliente quiere
quedarse con esta casa aunque el modelo pida menos" no necesita código aparte.

### Los ajustes del asesor

Un piso solo empuja hacia arriba. La mesa pide también lo contrario —
"Inmobiliario Directo va en 60,000 aunque el modelo diga 70,000, y el resto lo
repartes" — y eso es un ajuste: clava el objetivo de una clase, o la saca del
cálculo, y la clase sale del reparto para que el solver prorratee lo que sobra
entre las que quedan libres. Es el mismo camino que el motor ya usaba con el
dinero de una clase cerrada.

Tres palancas, todas sobre el portafolio objetivo y ninguna sobre la ficha:

| Palanca | Qué hace | Dónde vive |
|---|---|---|
| Agregar un activo | suma una línea al objetivo y clava esa parte del ticket | `proposal_restrictions` |
| Fijar una clase | la clase recibe exactamente ese monto | `proposal_class_adjustments` |
| Sacar una clase | la clase recibe cero y su peso se reparte | `proposal_class_adjustments` |

Ninguna inventa dinero: el patrimonio sigue siendo el de la ficha y el objetivo
sigue cuadrando contra él. El único límite es el piso — fijar por debajo de lo
que el cliente ya tiene en esa clase pediría vender, y vender se marca en la
ficha. El motor clava en el piso y lo escribe en un aviso con las dos cifras.

Sacar una **posición** del cálculo es otra cosa y vive en la ficha: el toggle
"fuera del cálculo" de cada fila, que es el mismo `es_invertible` con el que
llega un inmueble de uso propio.

Cuando hay ajustes, la propuesta calcula **dos portafolios** con el mismo motor
— el que sale del modelo y el que sale de los ajustes — y los muestra contra la
foto de la ficha en una tercera mirada. Sin esa columna un ajuste no se puede
explicar, solo creer.

Los pesos de benchmark salen de la hoja `Data` del archivo Portfolio Modificado,
a precisión completa. El JSON de configuración trae esos mismos pesos redondeados
a cuatro decimales, y ese redondeo desplaza la base de redistribución en 6,502.88
USD sobre el caso Ana Tumi.

## Los dos decks

El **rediseñado** se arma desde el objeto `Propuesta` y solo desde ahí: portada,
el portafolio de hoy, el antes contra el después, la rentabilidad, el objetivo
instrumento por instrumento —paginado—, los dos portafolios cuando hay ajustes,
el blotter y las notas del cálculo. No hay una segunda implementación de ninguna
suma. Se descarga desde la propuesta y se genera en el momento: un deck guardado
en disco es una copia que envejece sola.

El **réplica** reproduce el deck de referencia lámina por lámina. Hoy salen 4
de sus 22: la portada y las tres estáticas. La maquinaria está hecha —sustituye
tokens, rehace una tabla con tantas filas como el cliente tenga, reparte las
filas en varias láminas duplicando la que haga falta, y devuelve los tokens que
ninguna fuente resolvió en vez de imprimir un `{{token}}` delante de un
cliente—. El mapa de `packages/export/src/pptx/replica/mapa.ts` dice, lámina
por lámina, qué le falta a cada una. Un test lo ata a la plantilla real, así
que no puede envejecer en silencio.

```bash
npm run revisar-deck    # el inventario, lámina por lámina
```

## Estado

| Fase | Alcance | Estado |
|---|---|---|
| 0 | Monorepo, TypeScript estricto, Vitest | hecho |
| 1 | Esquema Supabase, auth, configuración | hecho |
| 2 | Parser de ficha y pantalla de revisión | hecho |
| 3 | Motor `generarPlan()` y golden test | hecho |
| 4 | Vista web de la propuesta | hecho |
| 5 | Export a Excel | |
| 6 | PPT réplica | motor hecho, 4 de 22 láminas; ver abajo |
| 7 | PPT rediseñado | hecho |
| 8 | Biblioteca compartida y versionado | |
| 9 | Asistencia opcional de IA | |

### Pendientes con el equipo

- **IBIT no tiene retorno cargado.** Es el único producto del menú ofrecible al
  que le falta un dato, y por eso la línea de BTC sale sin cifra en propuestas
  reales. `select * from productos_incompletos where urgente` lo lista.
- **El instrumento del oro.** La clase Otros se abre en BTC y Oro, pero el
  catálogo no tiene un producto de oro cargado. Qué vehículo lo implementa
  —GLD, otro ETF, físico— es decisión de la mesa; hasta entonces esa línea
  viaja sin retorno y la vista lo dice en su nota de cobertura.
- **Un producto duplicado con dos retornos.** `iShares Core MSCI EM IMI UCITS
  ETF` está cargado dos veces, al 7–9% y al 6.5–9.5%. El emparejador se
  abstiene, así que el ETF sale sin retorno. La lista completa está en la vista
  `productos_duplicados`.
- **Cinco celdas de la planilla `BD_Productos` para corregir.** Una parte de
  `Sura Fondo de Inversión FIRBI A` dice 200%, que es imposible para una parte
  sola y el importador la descarta avisando. Y cuatro composiciones no cierran
  en 100%: `AFP Habitat - Fondo 3` (96%), las dos clases de
  `Sabbi Dividendos Global` (7%) y `Scotiabank Fondo Mediano Plazo Soles`
  (103.1%). Se guardan igual y quedan en `productos_descuadrados`.
- **56 productos con algún dato faltante.** `productos_incompletos` es la cola
  de trabajo; cada uno es una celda vacía en alguna propuesta.
- **Tipografía.** La marca pide Avenir Next Pro. Sin confirmar la licencia, los
  dos decks usan una genérica; cambiar `TIPOGRAFIA` en `tokenizar.py` y en
  `packages/export/src/pptx/rediseno/marca.ts` es toda la migración.
- **Regla de flujos.** El toggle está implementado y saca a los fondos mutuos de
  Mercados Privados, pero no se enciende solo: la ficha de Ana Tumi declara un
  flujo de 3,000 soles mensuales y encenderlo cambia el portafolio entero. Que
  esa inferencia sea automática o siga siendo del asesor es decisión del equipo.
- **El deck réplica está dibujado a mano y eso decide todo lo demás.** No trae
  ni una parte de gráfico ni un libro incrustado: las barras de la lámina 4 son
  52 formas con su alto escrito en el XML, y los números que se leen encima son
  etiquetas de texto sueltas. Cambiar la etiqueta escribe otro número y deja la
  barra donde estaba. Reproducir esa lámina para otro cliente es recalcular
  geometría, no sustituir texto.

  `npm run revisar-deck` lista las 22 con su estado. En resumen:

  | Estado | Láminas | Qué necesita |
  |---|---|---|
  | lista | 4 | nada, ya salen |
  | decisión | 7 | una decisión de la mesa, no un programador |
  | filas | 9 | ver abajo |
  | geometría | 1 | redibujar barras y línea |
  | parcial | 1 | dos tercios salen; el resto es texto redactado |

  De las nueve de "filas", las tres del anexo (20 a 22) ya tienen la máquina:
  `rehacerTabla` reescribe la tabla con las filas que se le pidan conservando
  el formato, `paginarFilas` las reparte y el renderizador duplica la lámina.
  Solo les falta de dónde salen tres de sus seis columnas —descripción,
  propósito y plazo mínimo—, que no están en el catálogo. Las otras seis
  (11 a 16) no son tablas sino cajas de texto sueltas en una grilla, y ahí hay
  que duplicar y reposicionar cajas una por una.

  Las siete de "decisión" son las que bloquean de verdad, y las tres preguntas
  son: qué determina el arquetipo del cliente y quién escribe su párrafo; cómo
  se calcula el puntaje sobre 10 y sus dos componentes; y qué cuenta como
  sobrecosto de un producto. Con eso respondido, el resto es trabajo mecánico.

  Mientras tanto el deck rediseñado sale entero de lo que el motor ya produce,
  y es el que la app descarga.
