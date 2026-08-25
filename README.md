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
   un `.tsx` es un error. Desde la pantalla de Macro, tampoco puede estar dentro
   de un `.ts` del motor: los pesos y los umbrales viajan como argumento.
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
                       y `reglas.ts`, la macro: los diecinueve umbrales del motor
    rules/             reparto, cascada, privados, club, otros, residuales
    propuesta/         las siete secciones y las dos miradas del cliente
  config/              schema Zod y carga de configuración; `macro.ts` valida
                       la macro entera — pesos y umbrales — que entra y sale
  io/                  parsers de ficha
  export/
    xlsx/              propuesta — sin construir todavía
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

## La macro

`/macro` es el modelo Sabbi escrito en un solo sitio, y es lo que se edita
cuando hay que calibrarlo. Dos mitades:

- **Los pesos.** Cuánto le toca a cada una de las siete clases en cada perfil.
  Los instrumentos de una clase se mueven con ella: subirla no cambia qué parte
  se lleva cada uno, cambia cuánto es esa parte. Por eso la pantalla edita las
  clases y no los treinta y cinco pesos sueltos — el reparto interno se conserva
  solo, y al guardar se multiplica por el peso de la clase, que es como lo
  guarda la hoja.
- **Los umbrales.** Los veinticinco campos que convierten ese reparto en líneas
  ejecutables, ordenados como los aplica el motor: el ticket mínimo de ETF y los
  dos que cada motor de mercados públicos puede tener propio, el recorte de cash
  del perfil conservador, con qué algoritmo se reparte cada clase de mercados
  públicos y las tolerancias de cada uno, el umbral del inmobiliario y a dónde
  va su capital cuando se disuelve, cómo se reparten Privados y Club Deals con
  sus dos mínimos y cómo se miden los subfondos, la frontera Edifica A/B, los
  dos de Otros —el de la clase y el de cada línea— y a dónde cae el dinero que
  no llegó a ninguno.

  Cinco de esos campos no son números sino elecciones entre algoritmos: la macro
  no solo calibra el motor, también decide cuál corre.

Vivían como un JSON versionado y doce constantes de módulo repartidas por
`packages/core/src/rules/`. Ahora son un argumento: `generarPlan` recibe
`reglas` y sin ellas corre la v8, que es la que fija el golden test. Los tres
caminos que producen cifras —la propuesta en pantalla, la matriz del benchmark
y los dos decks— leen la macro activa con `macroActiva()` y no tienen otra
fuente, así que guardar una versión cambia todo lo que se calcule después.

Guardar no sobreescribe: escribe una versión nueva en `macro_versions` y la
activa. Una cifra que salió en la propuesta de un cliente se explica por la
macro con la que se calculó, y esa explicación tiene que seguir estando el mes
que viene.

La edita cualquier asesor con sesión (migración `0011`). El catálogo también,
desde la `0012`, por el mismo argumento — con la diferencia, que conviene
decir, de que el catálogo no tiene historial de versiones: ahí un cambio pisa
al anterior. Empezó siendo de admin
por un argumento cierto —un umbral mal puesto no rompe una propuesta, las rompe
todas— que sin embargo no protege el modelo: un permiso que obliga a pedirle a
otro que teclee un número hace que la calibración se haga en una hoja suelta que
después nadie puede auditar. Lo que la protege es que nada se sobreescribe:
cada guardado queda con su autor, su fecha y su nota, y volver a la anterior es
guardar otra vez. No hay política de `delete`: la historia no se borra ni siendo
admin.

Todo lo que la pantalla muestra se puede editar. Una pantalla que mezcla lo
editable con lo que solo se lee obliga a probar cada celda para saber cuál es
cuál.

Lo que no se toca no se reescribe. Los pesos de la hoja `Data` llegan con
dieciséis dígitos y redondearlos a cuatro decimales desplaza la base de
redistribución en 6,502.88 USD sobre el caso Ana Tumi; el editor marca cada
celda editada y solo esas viajan.

Si la base no tiene ninguna macro guardada —o la que tiene no valida contra
`macroSchema`— el motor corre con la de fábrica, que es la **Benchmark Sabbi
v4** entera: sus pesos y sus reglas. La pantalla lo dice. Nunca se calcula con
media macro.

### La v4 contra la v8

`REGLAS_V8` sigue en el motor porque es la que reproduce el caso Ana Tumi al
centavo, y es la que corre cuando `generarPlan` no recibe macro. `REGLAS_V4` es
la de fábrica del producto y difiere en seis decisiones, cada una expuesta como
un campo editable para poder volver atrás sin desplegar:

| Decisión | v8 | v4 |
| --- | --- | --- |
| Cash del perfil Conservador | intacto | cede 5 puntos a las demás clases |
| El inmobiliario se ejecuta desde | 500,000 | 100,000 |
| Cuando se disuelve, su capital | se prorratea entre las cinco | va a Renta Fija y Variable |
| Privados y Club Deals | cada uno con su peso | comparten monto, por tramos (25,000 / 5,000) |
| Los subfondos | todo o nada | uno por uno, y el que abre se lleva lo del que no |
| Renta Fija y Renta Variable | cascada y núcleo-satélites | los dos con poda pro rata |

Una macro ya guardada gana sobre la de fábrica, así que adoptar la v4 en una
base que ya tiene la suya es abrir `/macro`, **Cargar la de fábrica** y guardar.
Los campos que llegaron después de la v8 entran con `default` en el esquema, y
hay un test que lo fija: un payload con la forma vieja sigue validando y sigue
calculando exactamente igual que antes.

## Las decisiones sobre una posición

Cada posición de la ficha lleva una decisión: conservar, vender, vender parte,
**venta condicionada** o sin marcar. Las cuatro primeras deciden cuánto dinero
se libera; la venta condicionada decide además a dónde va.

El caso viene de la mesa y es literal: el cliente vende su inmueble y ya
decidió que la mitad va al Fondo Estratégico. Marcarlo como venta total
mandaría esa mitad al pozo común y el benchmark la repartiría entre las siete
clases — la instrucción del cliente desaparecería dentro del prorrateo sin que
nadie lo note. Con la venta condicionada, cada destino clava su parte donde el
cliente la pidió, por el mismo mecanismo de pisos con el que ya funcionan las
restricciones.

Se reparte en porcentajes y no en montos porque así es como se decide —«la
mitad»— y porque un monto tecleado a mano queda viejo en cuanto alguien
corrige la valuación del inmueble. El reparto tiene que sumar 100%: si no
suma, la pantalla lo dice y el motor se niega a calcular, porque un reparto
que cierra en 70% deja el 30% sin dueño.

## El portafolio objetivo

Dos palancas sobre lo que el modelo propone, en la pantalla de ficha. Un
**ajuste de clase** fija una clase en un monto o la saca del cálculo. Un
**activo agregado** suma una línea que el modelo no propone y clava ese monto
dentro del ticket: no agranda el patrimonio, sale del mismo dinero.

Un activo agregado se da de alta en el catálogo con su rentabilidad y su
distribución. No es una comodidad: la sección 6 empareja las líneas contra
`products`, y una línea sin producto imprime dos celdas vacías donde van el
retorno y lo que distribuye — y una celda vacía en una tabla de retornos se
lee como un cero. Entra como `origen = 'ficha'` y sin `ofrecer`, así que no se
cuela en el menú neteable de su clase (confundir esas dos listas produjo el
bug v37.25) y queda en la cola de productos incompletos.

## El Excel

Es el documento de trabajo de la mesa: el que se anota, se filtra y se manda
por correo. Reproduce el libro que se venía armando a mano — una sola hoja con
las siete secciones apiladas, de la foto actual al blotter — y sale del mismo
objeto `Propuesta` que pinta la pantalla y arma los dos decks.

**Sin una sola fórmula.** Una celda con `=SUMA(...)` sería una cuenta que el
motor ya hizo, escrita otra vez y libre de divergir en cuanto alguien inserte
una fila. Lo que va son los totales y los dos cuadres: que la sección 7 diga
que compras menos ventas da cero es lo que hace que la propuesta se pueda
publicar, y esa cifra tiene que viajar con el archivo. El pie deja escrito con
qué macro se calculó.

El escritor de `.xlsx` está a mano, como el lector de `@sabbi/io` del otro
lado: un xlsx es un zip con XML adentro y hacen falta seis partes. Se valida
leyéndolo con el lector del propio repo — si el archivo que sale no se puede
volver a leer, no es un xlsx, y comparar bytes del zip no lo notaría.

Se descarga desde la propuesta y se genera en el momento, por la misma razón
que los decks: un archivo guardado en disco es una copia que envejece sola.

## Los dos decks

El **rediseñado** se arma desde el objeto `Propuesta` y solo desde ahí: portada,
el portafolio de hoy, el antes contra el después, la rentabilidad, el objetivo
instrumento por instrumento —paginado—, los dos portafolios cuando hay ajustes,
el blotter y las notas del cálculo. No hay una segunda implementación de ninguna
suma. Se descarga desde la propuesta y se genera en el momento: un deck guardado
en disco es una copia que envejece sola.

El **réplica** reproduce el deck de referencia lámina por lámina. Salen todas,
y las que todavía no tienen de dónde sacar su dato salen con las celdas en
blanco: un hueco se llena a mano antes de una reunión, una lámina ausente no se
ve. Hoy hay ocho completas: la portada, las tres estáticas, el anexo, el antes y
después producto por producto, qué cambia y la rentabilidad. Las tres últimas
se paginan solas — tantas láminas como el cliente necesite. El resto espera lo
que dice el mapa, y son las que el flujo de n8n ya arma por su cuenta.

Una advertencia sobre las que salen en blanco: el texto se vacía, pero lo que
está **dibujado** no. La lámina 4 conserva las barras del cliente de referencia
porque son formas con su alto en el XML, no un gráfico con datos detrás. Sin la
etiqueta encima no dice una cifra falsa, pero la proporción que muestra no es la
del cliente que se está atendiendo. La maquinaria está hecha —sustituye
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
| 5 | Export a Excel | hecho |
| 6 | PPT réplica | motor hecho, 8 de 22 láminas; ver abajo |
| 7 | PPT rediseñado | hecho |
| 8 | Biblioteca compartida y versionado | |
| 9 | Asistencia opcional de IA | |
| — | Macro editable, versionada y con historial | hecho |

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
  | lista | 8 | nada, ya salen |
  | paginada | 7 | nada: son páginas del anexo o del antes y después |
  | decision | 5 | una decisión de la mesa, no un programador |
  | geometría | 1 | redibujar barras y línea |
  | parcial | 1 | dos tercios salen; el resto es texto redactado |

  El anexo ya sale entero: `rehacerTabla` reescribe la tabla con una fila por
  instrumento conservando el formato, `paginarFilas` las reparte y el
  renderizador duplica la lámina tantas veces como haga falta. De sus seis
  columnas, instrumento y monto los pone el motor, retorno y plazo mínimo salen
  del catálogo, y descripción y propósito los escribe el asesor en la propuesta
  —son las dos que ningún dato puede llenar—.

  Las de "antes y después" tampoco son tablas sino cajas de texto sueltas en
  una grilla, y ahí el clonado va por otro camino: quien dibujó el deck les
  puso nombre —`Row Nombre`, `Card Header Cambio`, `Subtotal A Val`— y ese
  nombre viaja en el XML, así que cada forma se puede encontrar y usar de molde.
  La geometría de la tarjeta está medida sobre el deck que Sabbi entrega, no
  aproximada: una tarjeta de una fila mide 1,524,000 EMU y cada fila de más
  suma 342,900.

  Las siete de "decisión" son las que bloquean de verdad, y las tres preguntas
  son: qué determina el arquetipo del cliente y quién escribe su párrafo; cómo
  se calcula el puntaje sobre 10 y sus dos componentes; y qué cuenta como
  sobrecosto de un producto. Con eso respondido, el resto es trabajo mecánico.

  Mientras tanto el deck rediseñado sale entero de lo que el motor ya produce,
  y es el que la app descarga.
