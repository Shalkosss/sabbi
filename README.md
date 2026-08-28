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
`Benchmark Sabbi - Macros v4` en VBA, que es el modelo que el motor reproduce.

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
  lib/agenda.ts        días hábiles, feriados peruanos y la ruta de una ficha
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
| Mercados Públicos — Fijo | ETFs de bonos | el ticket mínimo por ETF; abajo, Flip Panda |
| Mercados Públicos — Variable | ETFs de acciones | el ticket mínimo por ETF; abajo, Flip Cobra |
| Mercados Privados | FM RE Infra, FM PC, FM PE VC, Fondo Oportunidad | 25,000 el fondo; 50,000 por subfondo |
| Club Deals | Edifica Clase A o B; Fondo Estratégico con flujos | 5,000 |
| Otros | BTC (IBIT) y Oro | el ticket mínimo |
| Inmobiliario Directo | el inmueble propio o TBD | 100,000 de ticket, salvo que el cliente acceda |
| Cash | Sura Ultracash Dólares | va blindado: no cede al prorrateo |

Partir la clase en tres no mueve un centavo del bloque: el solver es
proporcional y el caso Ana Tumi se reproduce al centavo. Lo que cambia es dónde
vive el neteo — ahora lo hace el solver de pisos, clase por clase, en vez de la
rutina de familias.

Lo que no llega a su mínimo no imprime una línea inejecutable. La clase Otros
que no alcanza el ticket deja de existir y su peso se suma a Mercados Privados.
Y el bloque privado tiene su propia cascada, con una válvula que sorprende: si
el dinero no alcanza ni para el Fondo Oportunidad ni para un club deal, **vuelve
a Mercados Públicos** en vez de quedarse parado en una clase que no lo puede
colocar. Cada decisión de esas deja su aviso escrito.

Dos reglas más que no se ven en ninguna tabla y mueven mucho. El perfil
Conservador pierde cinco puntos porcentuales de Cash —16.4730% pasa a
11.4730%— repartidos pro-rata entre las otras cinco clases; es la única
corrección por perfil del modelo. Y Cash va blindado: conserva su peso y no
entra en la base del prorrateo, así que una posición conservada en otra clase no
le puede quitar liquidez al cliente.

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

Las tres se tocan desde el propio portafolio objetivo, que es donde se ve el
efecto: el monto de una clase se clava en su fila, y debajo del último
instrumento de cada bloque hay un `+` para sumar un producto ahí mismo. Vienen
apagadas —la tuerca de la cabecera las abre— porque un portafolio calculado se
lee muchas más veces de las que se toca. Un cambio no borra el plan: lo marca
viejo, y **Actualizar** lo vuelve a cuadrar.

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

La propuesta se abre en las dos fotos juntas —hoy y el objetivo, fila contra
fila— y a la derecha del objetivo va lo único que no describe un portafolio
sino el camino entre los dos: cuánto comprar o vender en cada clase. Es la
columna que se pinta, y el color no juzga: dice la dirección, y la intensidad
del fondo dice el tamaño del movimiento contra el mayor del plan.

Los pesos de benchmark salen de la hoja `Data` del archivo Portfolio Modificado,
a precisión completa. Redondearlos a cuatro decimales desplaza la base de
redistribución en 6,502.88 USD sobre el caso Ana Tumi, y por eso el editor de la
macro solo reescribe las celdas que alguien tocó.

### Sobre el caso Ana Tumi

`Propuesta Ana Tumi.xlsx` salió de la macro **v8**, y el motor corre la **v4**:
cambian la cascada de ETFs, los mínimos de Mercados Privados y el umbral del
inmobiliario. Las cifras ya no coinciden, y eso no es una regresión — es que el
modelo cambió. Los tests del motor fijan dos cosas distintas: los **invariantes**
(el total cierra, cada clase vale lo que suman sus líneas, ninguna línea plena
queda bajo el ticket) y las **reglas de la v4**, cada una por su efecto.

## La macro

`/macro` es el modelo Sabbi escrito en un solo sitio, y es lo que se edita
cuando hay que calibrarlo. Dos mitades:

- **Los pesos.** Cuánto le toca a cada una de las siete clases en cada perfil.
  Los instrumentos de una clase se mueven con ella: subirla no cambia qué parte
  se lleva cada uno, cambia cuánto es esa parte. Por eso la pantalla edita las
  clases y no los treinta y cinco pesos sueltos — el reparto interno se conserva
  solo, y al guardar se multiplica por el peso de la clase, que es como lo
  guarda la hoja.
- **Los umbrales.** Los diecinueve números que convierten ese reparto en líneas
  ejecutables, ordenados como los aplica el motor: el ticket mínimo de ETF y los
  dos que cada motor de mercados públicos puede tener propio, las tolerancias de
  la cascada de Renta Fija, el núcleo y el rescate de Renta Variable, el umbral
  del inmobiliario y a dónde va su capital cuando se disuelve, el mínimo por
  subfondo, el de Club Deals con su frontera Edifica A/B, los dos de Otros —el
  de la clase y el de cada línea— y a dónde cae el dinero que no llegó a
  ninguno.

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
guardar otra vez. No hay política de `delete`: la historia no se borra, y desde
la `0018` no hay un rango que pudiera saltarse eso.

Todo lo que la pantalla muestra se puede editar. Una pantalla que mezcla lo
editable con lo que solo se lee obliga a probar cada celda para saber cuál es
cuál.

Lo que no se toca no se reescribe. Los pesos de la hoja `Data` llegan con
dieciséis dígitos y redondearlos a cuatro decimales desplaza la base de
redistribución en 6,502.88 USD sobre el caso Ana Tumi; el editor marca cada
celda editada y solo esas viajan.

Si la base no tiene ninguna macro guardada —o la que tiene no valida contra
`macroSchema`— el motor corre con la de fábrica, que es la v4 de pesos con la
v8 de umbrales, y la pantalla lo dice. Nunca se calcula con media macro.

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

## La agenda de entregas

Subir la ficha no solo abre una propuesta: abre un compromiso. `/agenda` es ese
compromiso puesto sobre el mes — cuatro días hábiles desde la subida, con el
portafolio al primero, el PPT al segundo y la revisión de la mesa al tercero.

**Nadie teclea una fecha.** Las cinco salen de `fichas.created_at` y del
calendario laboral peruano, feriados incluidos, y Jueves y Viernes Santo se
calculan cada año en vez de venir en una lista que envejece. Una agenda que se
llena a mano es una segunda verdad sobre lo mismo, y se separa de la primera el
día que alguien sube una ficha un viernes por la noche.

Lo único que se guarda es lo contrario: si el hito ya se cumplió, en
`agenda_hitos` (migración `0015`). Sin eso la agenda puede decir qué fecha toca
pero nunca que algo va tarde, que es justo para lo que se abre el jueves por la
tarde. La fila existe cuando el hito está cumplido; desmarcar la borra. Marcar
sigue la regla de la ficha, que desde la `0018` es la de toda la casa: la toca
cualquier asesor dado de alta.

La pantalla tiene dos mitades con trabajos distintos, y esa división es lo que
la hizo legible. La primera versión ponía los cinco hitos como píldoras sueltas
sobre el mes: ocho clientes eran cuarenta etiquetas y no se leía ni quién ni
cuándo.

**El calendario contesta cuándo.** Una barra por cliente, del día que llegó su
ficha al cuarto día hábil, y nada más. Tres cosas la sostienen:

- **El color es del cliente, no del hito.** Los hitos son siempre los mismos
  cinco; lo que cambia entre dos barras vecinas es de quién son. El tono sale de
  un hash del id de la ficha, pero no se queda ahí: dos rutas que se cruzan en
  el calendario nunca comparten color — se reparte como se colorea un mapa, y
  solo se repite cuando la paleta de siete se agota. Ninguno de los siete es
  rojo: ese color ya dice «vencida» y no puede decir además «Fernando».
- **La certeza se dibuja.** La barra se solidifica con los días: lo vivido va
  firme y lo que falta se disuelve hacia la entrega, que es exactamente lo que
  vale una fecha tentativa. La difusión toca el relleno, nunca la tinta — una
  fecha borrosa no se puede leer. El borde derecho marca la entrega aunque la
  barra llegue difusa: es lo único que se le prometió al cliente.
- **Vencida es que se pasó la entrega**, no que falte marcar un hito interno.
  Nadie marca el portafolio el mismo minuto que lo termina, y una agenda donde
  todo sale en rojo el segundo día no dice nada.

**«En ruta» contesta qué falta.** Las rutas abiertas agrupadas por urgencia
—vencidas, entrega hoy, esta semana, más adelante—, cada una con su cinta de
cinco nodos; abierta, con los cinco hitos, su fecha y su casilla. Es donde se
marca lo cumplido y donde está el enlace a la ficha. Lo que une las dos mitades
es el color y el encendido: apoyar el puntero sobre una barra levanta su
tarjeta, y al revés.

El cálculo de días hábiles vive en `apps/web/lib/agenda.ts` y es puro —`hoy`
entra como argumento, resuelto una sola vez en el servidor: si lo mirara el
navegador, el calendario del servidor y el del cliente podrían no coincidir—.
Sus tests fijan lo que un error de un día costaría caro: que el fin de semana no
cuente, que Fiestas Patrias corra la entrega, y que una ficha subida un sábado
empiece a contar el lunes.

## Quién ve y quién edita

Una regla, y una sola:

**Todos los asesores tienen el mismo rango.** Cualquiera con fila en `advisors`
lee y edita todo el trabajo de la mesa — fichas, posiciones, clientes,
propuestas, agenda, catálogo, macro y configuración. Sabbi son cinco personas
del mismo nivel; no hay «mis fichas» y «las de otro», ni un permiso que haya que
pedirle a alguien de adentro.

Queda **una** frontera, y no es de rango:

> Una cuenta de Supabase Auth **sin** fila en `advisors` no escribe nada.

Las cuentas las crea Sabbi a mano y la fila llega después, así que ese hueco
existe de verdad: una cuenta a medio dar de alta no tiene por qué tocar el
patrimonio de un cliente. Es la diferencia entre estar en la mesa y no estar
todavía.

`advisors.rol` sigue existiendo y ya no decide nada: es el título en el
organigrama. Si algún día vuelve a hacer falta una frontera, que se agregue
explícita y con su motivo, no heredada.

### Lo que esto costó descubrir

El producto nació con la partición `asesor` / `admin` y con la biblioteca
privada para escribir, y las dos ideas envejecieron mal contra cómo trabaja la
mesa. Tres correcciones, en orden:

1. La 0014 publicó `ficha_positions` por Realtime para que dos asesores vieran
   los cursores del otro sobre la misma ficha. Las políticas de escritura
   seguían pidiendo ser el creador: la función existía y no se podía usar.
2. La **0017** abrió la ficha —y el cliente, y la propuesta— al equipo. Abrir
   una sola de esas tablas deja el guardado fallando a mitad de camino: cambiar
   el perfil escribe en `proposals` **y** en `clients`.
3. La **0018** quitó lo que quedaba. Sobre todo el trigger
   `no_editar_publicada`, que congelaba una propuesta publicada para todos
   menos un admin: la intención era que lo ya enviado al cliente no cambiara
   sin rastro, y el efecto era que dos personas no podían terminar el mismo
   documento.

```bash
DBPASS='...' node tools/probar-rls.mjs   # las políticas, con cuatro usuarios de prueba
```

Corre contra la base real dentro de una transacción que siempre se revierte, y
comprueba las dos mitades: que un asesor pueda corregir la ficha de otro, tocar
el catálogo y editar una propuesta ya publicada, y que una cuenta sin dar de
alta no pueda nada de eso.

### Cuando algo no llega en vivo

Los cursores y los cambios viajan por **dos canales separados**. Los cursores
son `broadcast` y no dependen de nada del servidor; los cambios son
`postgres_changes` y sí — la tabla tiene que estar en la publicación
`supabase_realtime`, que es lo que hace la migración 0014.

Estaban en el mismo canal, y esa era la trampa: si el servidor rechazaba la
suscripción a los cambios, el canal entero quedaba en error y se llevaba puestos
los cursores, que no necesitan la base para nada. Peor, fallaba en silencio —
una pantalla sin cursores se ve igual esté rota o esté sola.

Ahora la barra de la ficha lo dice: **«Sin conexión en vivo»** si no hay canal,
**«Cursores sí, cambios no»** si falta publicar la tabla. Para lo segundo:

```bash
npm run migrar -- --dry    # dice si 0014 está aplicada
```

## Los retornos de fondos

Un módulo aparte del motor de propuestas: mide los productos del menú, no los
portafolios de los clientes. Es la hoja `Distributivos` sin las fórmulas —
sesenta fondos, cien meses, treinta y pico de métricas por fondo.

**Nada derivado se guarda.** La base tiene dos cosas: el fondo y su observación
mensual —NAV y retorno total—. Todas las métricas se calculan al leer, en
`packages/core/src/retornos`. Por eso corregir un NAV de hace seis meses arregla
las treinta columnas de esa fila sin ningún recálculo manual, y por eso un
`insert` de un retorno de 1Y en `acciones.ts` sería un bug: esa cifra se
desincroniza el día que alguien toque la serie vieja, que es la operación más
común de todas.

Cuatro vistas, cada una con una pregunta:

| Vista | Contesta | Se edita |
|---|---|---|
| **Tabla maestra** | cuánto rindió cada fondo, en todas las ventanas | no |
| **Matriz** | qué pasó en noviembre, y qué mes falta cargar | sí, celda por celda |
| **Comparativos** | cuál es el mejor de su clase y cuál paga el riesgo | no |
| **Cargar un mes** | el mes recién cerrado, fondo por fondo | sí, un mes entero |

La **matriz** es la hoja tal como se veía —meses bajando, fondos al costado— y
es donde el módulo se cargó de verdad: flechas para moverse, Enter para bajar,
Ctrl+S para guardar y un bloque pegado desde Excel que cae donde está el
cursor. Guarda solo las celdas que cambiaron de número, no las que alguien
recorrió. La columna del mes trae su mediana y cuántos fondos tienen ese mes,
que es el número que dice si falta algo.

Cualquier fila de la tabla maestra **abre el fondo**: su curva de crecimiento
compuesto, cuánto llegó a perder contra su máximo y cuánto tardó en
recuperarlo, y la grilla de año por mes —la de toda la vida— editable ahí
mismo. Una tabla de métricas no puede distinguir dos fondos con el mismo 12%
anualizado a 3Y; la curva sí, y es la primera pregunta que hace un cliente
cuando ve un número bueno.

**El retorno se teclea en porcentaje**, en las tres pantallas que lo piden:
0.83 es 0.83%, igual que en el reporte del manager. La conversión a la fracción
que guarda la base vive en un solo lugar (`lib/retornos-celda.ts`). La primera
versión pedía `0.0083` y ese salto es el error más caro del módulo — un cero de
menos convierte un mes normal en un +83% que envenena las treinta métricas del
fondo y no se nota hasta que el ranking sale raro.

Dos detalles del cálculo que no son evidentes y están medidos contra el Excel:
el Sharpe de cada fondo usa el **Treasury 10Y del mes en que termina su serie**,
no una tasa común a la tabla —un fondo que reporta trimestral cierra en marzo y
el resto en junio—, y los índices de mercado se muestran para comparar pero no
entran a los rankings: «el mejor Sharpe de Private Equity: S&P 500» es una
respuesta falsa a una pregunta razonable.

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
ve. Hoy hay nueve completas: la portada, las tres estáticas, el gráfico del
patrimonio de hoy, el anexo, el antes y después producto por producto, qué
cambia y la rentabilidad. Las tres últimas se paginan solas — tantas láminas
como el cliente necesite. El resto espera lo que dice el mapa, y son las que el
flujo de n8n ya arma por su cuenta.

Una advertencia sobre las que salen en blanco: el texto se vacía, pero lo que
está **dibujado** no. Es lo que pasaba con la lámina 4 —sus barras son formas
con el alto escrito en el XML, no un gráfico con datos detrás— y por eso esa se
redibuja en vez de rellenarse: `grafico.ts` les da a las seis barras el alto que
les toca, mueve sus etiquetas encima y rotula el eje con el escalón que haga
falta para que la clase más grande entre en la lámina. La segunda serie, la del
portafolio objetivo, no se puede mapear —la sección 3 clasifica por asset class
y la 6 por clase del modelo— así que se borra entera en vez de quedar dibujada:
la curva de un desconocido al lado de las barras ya corregidas de este cliente
se leería como si fuera suya. La maquinaria está hecha —sustituye
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
| 6 | PPT réplica | motor hecho, 9 de 22 láminas; ver abajo |
| 7 | PPT rediseñado | hecho |
| 8 | Biblioteca compartida y versionado | |
| — | Agenda de entregas: 4 días hábiles desde la ficha | hecho |
| — | Retornos de fondos: tabla, matriz editable, curva y comparativos | hecho |
| — | Permisos planos: todos los asesores, el mismo rango | hecho |
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
  barra donde estaba, así que esa lámina se redibuja: seis barras y sus seis
  etiquetas, con el eje rotulado según el escalón que necesite el cliente. Las
  constantes están medidas sobre el deck que Sabbi entrega —la línea del cero
  está en 4,584,700 EMU y cada escalón del eje mide 508,000— y un test las ata
  a la plantilla real, así que redibujar la lámina rompe el test en vez de
  correr las barras en silencio.

  `npm run revisar-deck` lista las 22 con su estado. En resumen:

  | Estado | Láminas | Qué necesita |
  |---|---|---|
  | lista | 9 | nada, ya salen |
  | paginada | 7 | nada: son páginas del anexo o del antes y después |
  | decision | 5 | una decisión de la mesa, no un programador |
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
