# Claude trabajando solo

Este repositorio tiene cinco turnos automáticos. Cuatro son de Claude y uno es
el CI que los vigila. La idea es simple: dejas un issue asignado antes de
dormir y a la mañana hay un pull request esperando, aunque tu computadora haya
estado apagada toda la noche.

| Workflow | Cuándo corre | Qué hace |
|---|---|---|
| `ci.yml` | cada push y cada pull request | typecheck, tests y build |
| `claude.yml` | cuando escribes `@claude` en un issue, un comentario o una revisión | contesta o hace el cambio ahí mismo |
| `claude-issue.yml` | cuando te asignas un issue o le pones la etiqueta `claude` | lo implementa entero y abre el pull request |
| `claude-nocturno.yml` | de lunes a viernes, 1 de la mañana en Lima | toma el primer punto de `AGENDA.md` y abre el pull request |
| `claude-review.yml` | cada pull request | lo revisa y comenta los hallazgos en el diff |

## Lo que falta hacer una vez

GitHub corre los workflows tal como están en la rama por defecto, no en la rama
donde se escribieron. Mientras estos archivos vivan en una rama aparte, no se
dispara nada: el primer paso es mergearlos a `master`.

Después quedan tres cosas, las tres con permisos de administrador y ninguna
automatizable desde acá.

**1. Instalar la app de Claude.** Entra a
[github.com/apps/claude](https://github.com/apps/claude), instálala y dale
acceso a este repositorio. Con eso Claude puede leer el código, comentar y
empujar ramas.

**2. Guardar la credencial.** En *Settings → Secrets and variables → Actions*,
botón *New repository secret*. Va una sola de las dos:

- `CLAUDE_CODE_OAUTH_TOKEN` si quieres que las corridas consuman tu suscripción
  de Claude. El token se genera corriendo `claude setup-token` en tu máquina.
- `ANTHROPIC_API_KEY` si prefieres pagarlas por API, con una clave de
  [console.anthropic.com](https://console.anthropic.com).

Los workflows piden las dos y usan la que encuentren, así que no hace falta
tocar ningún archivo: guardas una y listo.

**3. Dejar que Actions abra pull requests.** En *Settings → Actions → General →
Workflow permissions*, marca **Allow GitHub Actions to create and approve pull
requests**. Sin ese permiso Claude hace todo el trabajo, empuja la rama y falla
en el último paso con `GitHub Actions is not permitted to create or approve
pull requests`.

Opcional: crear la etiqueta `claude` en *Issues → Labels*. Sirve para disparar
a Claude sin asignarte el issue. Asignártelo funciona igual y no necesita
ninguna etiqueta.

Para probar que quedó bien, comenta `@claude ¿qué hace el solver cuando una
clase no llega a su mínimo?` en cualquier issue. Si contesta, está andando.

## El día a día

**Pedirle algo puntual.** Escribe `@claude` con lo que necesitas en un
comentario de un issue o de un pull request. Contesta ahí mismo y, si el pedido
es un cambio, lo commitea.

**Dejarle una tarea para la noche.** Abre un issue con la plantilla *Tarea*,
completa el criterio de aceptación y asígnatelo. La asignación dispara la
corrida en el momento, así que si quieres que trabaje de noche, asígnatelo de
noche. Claude va dejando un comentario en el issue con lo que hace, y al
terminar el pull request queda enlazado.

Para que reintente el mismo issue, quítate la asignación y vuelve a asignártelo.

**Dejar que avance solo.** `AGENDA.md` es la cola del turno de noche: el primer
punto sin marcar es el que toma. Reordenar es mover una línea. Si no quieres que
avance esta semana, vacía la lista o desactiva el workflow desde la pestaña
*Actions*.

El turno de noche no arranca si ya hay un pull request nocturno esperando
revisión. Dos propuestas automáticas sin revisar valen menos que una, y además
te ahorra la corrida.

## Lo que va a costar

Cada corrida gasta minutos de Actions y tokens del modelo. En un repositorio
público los minutos son gratis, así que lo único que se paga es el modelo, y
depende de qué credencial hayas guardado en el paso 2.

Para gastar menos:

- Issues concretos, con criterio de aceptación. Un issue vago le hace dar
  vueltas y cada vuelta se paga.
- `AGENDA.md` corta y ordenada por lo que de verdad importa.
- Si una semana no vas a revisar nada, desactiva el nocturno. Un pull request
  que nadie mira costó igual.
- El tope de turnos de cada corrida está en `--max-turns`, dentro de cada
  workflow. Bajarlo achica el gasto y también lo que Claude alcanza a terminar.

## Cuando algo no arranca

**Claude no contesta a `@claude`.** Fíjate que la app esté instalada, que el
secreto exista y que quien escribió el comentario tenga permiso de escritura en
el repositorio. La acción ignora a cualquier otro, a propósito.

**El pull request nunca aparece.** Casi siempre es el permiso del paso 3. La
bitácora de la corrida, en la pestaña *Actions*, lo dice en el último paso.

**El CI no corre sobre un pull request nocturno.** Es esperable: GitHub no
dispara workflows por cosas hechas con el token de Actions. Por eso el turno de
noche corre el typecheck y los tests dentro de su propia corrida y escribe el
resultado en el cuerpo del pull request. Si fallan, el pull request queda como
borrador.

**El nocturno dejó de correr.** GitHub apaga los cron de los repositorios
públicos después de 60 días sin actividad. Cualquier commit lo vuelve a
encender. También puedes dispararlo a mano desde *Actions → Claude de noche →
Run workflow*, y ahí mismo escribirle un encargo distinto al de la agenda.

**Una corrida se niega a arrancar diciendo que el actor es un bot.** Pasa con
el cron cuando la última persona que tocó la línea del `cron` no queda
registrada como humana. Edita esa línea tú mismo, aunque sea para cambiarle un
minuto, y vuelve a correr.

## Los límites que conviene tener presentes

Claude no mergea nada. Abre pull requests y los deja esperando: la decisión de
qué entra a `master` sigue siendo tuya.

El repositorio es público. Los prompts de los workflows se lo repiten en cada
corrida, pero vale la pena mirarlo en el diff: nada de `reference/`, ni
nombres, montos o instituciones de clientes reales.

Los pull requests que vienen de un fork no reciben los secretos, así que ahí no
hay revisión automática. Es una decisión de GitHub y está bien que sea así.
