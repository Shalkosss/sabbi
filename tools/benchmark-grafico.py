"""
La matriz del benchmark, en un panel por monto.

    npm run exportar-benchmark                      # macro v8
    npm run exportar-benchmark -- --regla alternativos

    python tools/benchmark-grafico.py                       # los cinco perfiles
    python tools/benchmark-grafico.py --perfiles 3          # los tres extremos
    python tools/benchmark-grafico.py --perfiles 2          # conservador vs moderado
    python tools/benchmark-grafico.py benchmark-alternativos.csv --perfiles 3

Un panel por ticket, las clases de activo en el eje X y una línea por perfil.
Leído así, lo que salta es la forma del portafolio: dónde tiene su pico cada
perfil y cómo se mueve ese pico cuando cambia el monto. Un apilado muestra la
composición de una barra; esto muestra el perfil de la curva, que es lo que
hay que comparar cuando se está eligiendo entre dos macros.

Los datos no se simulan. Salen de `benchmark.csv`, que a su vez sale del mismo
motor que corre la web: dos implementaciones de la misma cuenta son dos
respuestas distintas esperando a divergir.

Requiere: pandas, matplotlib, seaborn.
"""

import sys
from pathlib import Path

import matplotlib.pyplot as plt
import matplotlib.ticker as mticker
import pandas as pd
import seaborn as sns

RAIZ = Path(__file__).resolve().parent.parent

# Los cinco del modelo, en orden de riesgo.
TODOS = [
    "Conservador",
    "Conservador & Moderado",
    "Moderado",
    "Moderado & Arriesgado",
    "Arriesgado",
]

# Cuántas líneas mirar a la vez. Cinco es el universo entero; tres son los
# extremos y el medio, que es donde se ve la forma sin que las curvas se
# tapen; dos es la comparación que la mesa hace más seguido.
VISTAS = {
    "5": TODOS,
    "3": ["Conservador", "Moderado", "Arriesgado"],
    "2": ["Conservador", "Moderado"],
}

# El orden del eje X. Es el de la hoja `Allocation detallado`, para que el
# gráfico y la tabla de la web se lean igual.
CLASES = ["inm", "fijo", "variable", "privados", "club", "otros", "cash"]

# Nombres cortos: en un eje X de cinco categorías, «Mercados Públicos — Renta
# Variable» se pisa con el de al lado.
CORTO = {
    "inm": "Inmobiliario",
    "fijo": "Pub-Fijo",
    "variable": "Pub-Var",
    "privados": "Privados",
    "club": "Club Deals",
    "otros": "Otros",
    "cash": "Cash",
}

# El verde de la marca, de más oscuro a más claro. Es una escala y no tres
# colores sueltos porque los perfiles son ordinales: de menos a más riesgo.
COLOR_PERFIL = {
    "Conservador": "#223311",
    "Conservador & Moderado": "#41611C",
    "Moderado": "#79A82D",
    "Moderado & Arriesgado": "#A9DA55",
    "Arriesgado": "#C3ED74",
}

HUESO = "#F4F4ED"
TINTA = "#1C2A0E"
TINTA_TENUE = "#657453"
REJILLA = "#DDDCCF"


# ── Paso 1: los datos ──────────────────────────────────────────────────────


def cargar(ruta: Path) -> pd.DataFrame:
    """El CSV del motor, una fila por instrumento."""
    if not ruta.exists():
        raise SystemExit(
            f"No encuentro {ruta.name}.\nCorré primero:  npm run exportar-benchmark"
        )
    return pd.read_csv(ruta)


def matriz_por_clase(detalle: pd.DataFrame) -> pd.DataFrame:
    """
    Los pesos por clase, agregando los instrumentos de cada una.

    Se agrega acá y no al exportar: el CSV guarda el instrumento porque saber
    qué ETF entró y cuál no es la mitad de lo que hay que mirar cuando el
    ticket es chico, y un agregado no se puede desagregar después.
    """
    pesos = (
        detalle.groupby(["perfil", "ticket_usd", "clase"], as_index=False)["share_total"]
        .sum()
        .pivot(index=["perfil", "ticket_usd"], columns="clase", values="share_total")
        .reindex(columns=CLASES)
        .fillna(0.0)
    )
    return pesos * 100


# ── Paso 2: el gráfico ─────────────────────────────────────────────────────


def dibujar(
    pesos: pd.DataFrame, montos: list[int], perfiles: list[str], salida: Path
) -> None:
    # Una clase que queda en cero en toda la matriz no merece una columna del
    # eje: agregaría una categoría para decir que no hay nada.
    mirados = pesos.loc[perfiles]
    clases = [c for c in CLASES if mirados[c].max() > 0.05]
    etiquetas = [CORTO[c] for c in clases]

    sns.set_theme(style="white", font_scale=0.95)
    plt.rcParams.update(
        {
            "font.family": "DejaVu Sans",
            "figure.facecolor": HUESO,
            "axes.facecolor": HUESO,
            "text.color": TINTA,
            "axes.labelcolor": TINTA_TENUE,
            "xtick.color": TINTA,
            "ytick.color": TINTA_TENUE,
        }
    )

    filas = (len(montos) + 1) // 2
    figura, rejilla = plt.subplots(filas, 2, figsize=(15.5, 5.4 * filas), sharey=True)
    paneles = rejilla.flatten() if len(montos) > 1 else [rejilla]

    techo = min(100, max(10, (int(mirados[clases].to_numpy().max()) // 10 + 2) * 10))

    for panel, monto in zip(paneles, montos):
        for perfil in perfiles:
            altura = [pesos.loc[(perfil, monto), clase] for clase in clases]
            color = COLOR_PERFIL.get(perfil, "#79A82D")

            panel.plot(
                etiquetas,
                altura,
                marker="o",
                markersize=7,
                linewidth=2.1,
                color=color,
                markeredgecolor=HUESO,
                markeredgewidth=1.4,
                label=perfil,
                zorder=3,
                clip_on=False,
            )

        etiquetar(panel, clases, perfiles, pesos, monto, techo)

        panel.set_title(f"Monto: {monto // 1000}k", fontsize=13, color=TINTA_TENUE, pad=14)
        panel.set_ylim(0, techo)
        panel.yaxis.set_major_locator(mticker.MultipleLocator(10))
        panel.grid(axis="y", color=REJILLA, linewidth=0.9, linestyle=(0, (4, 4)), zorder=0)
        panel.set_axisbelow(True)
        for lado in ("top", "right", "left"):
            panel.spines[lado].set_visible(False)
        panel.spines["bottom"].set_color("#7A8770")
        panel.tick_params(axis="x", length=0, pad=8, labelsize=11)
        panel.tick_params(axis="y", length=0, labelsize=10)

    for sobrante in paneles[len(montos) :]:
        sobrante.set_visible(False)

    manijas, textos = paneles[0].get_legend_handles_labels()
    figura.legend(
        manijas,
        textos,
        loc="lower center",
        bbox_to_anchor=(0.5, 0.005),
        ncol=len(textos),
        frameon=False,
        fontsize=11,
        columnspacing=2.6,
        handlelength=1.6,
    )

    figura.tight_layout(rect=(0.01, 0.055, 0.99, 0.99))
    figura.savefig(salida, dpi=200, facecolor=HUESO)
    print(f"\n{salida}")


def etiquetar(panel, clases, perfiles, pesos, monto, techo: float) -> None:
    """
    El número al lado de cada punto.

    Se coloca arriba salvo el más bajo de cada columna, que va abajo porque ahí
    tiene sitio libre. Con una excepción: un valor pegado al cero va arriba
    igual, porque debajo está el nombre de la clase y la etiqueta se le
    escribiría encima.

    Cuando dos perfiles caen casi en el mismo valor, el segundo se levanta para
    no taparse con el primero. Se prefiere eso a esconder una cifra.
    """
    # El alto de una etiqueta, medido en unidades del eje. Se calcula contra el
    # techo y no en pixeles porque el apilado tiene que separarlas en el mismo
    # espacio en el que estan los puntos.
    alto = techo * 0.045

    for x, clase in enumerate(clases):
        columna = sorted(
            (pesos.loc[(perfil, monto), clase] for perfil in perfiles), reverse=True
        )

        # El mas bajo va debajo del punto, si hay lugar entre el y el eje.
        abajo = columna[-1] if len(columna) > 1 and columna[-1] > alto else None
        if abajo is not None:
            panel.annotate(
                f"{abajo:.1f}%",
                (x, abajo),
                textcoords="offset points",
                xytext=(0, -17),
                ha="center",
                fontsize=8.5,
                color=TINTA_TENUE,
                zorder=4,
            )

        # Los demas van arriba, y cada uno se apoya sobre el anterior: dos
        # perfiles que caen casi en el mismo valor tendrian su etiqueta en el
        # mismo lugar, y una taparia a la otra.
        piso = float("-inf")
        for valor in reversed([v for v in columna if v != abajo]):
            y = max(valor + alto * 0.55, piso + alto)
            piso = y
            panel.annotate(
                f"{valor:.1f}%",
                (x, y),
                ha="center",
                va="bottom",
                fontsize=8.5,
                color=TINTA_TENUE,
                zorder=4,
            )


def perfiles_pedidos(argumentos: list[str]) -> list[str]:
    """`--perfiles 5 | 3 | 2`, o una lista de nombres separados por coma."""
    if "--perfiles" not in argumentos:
        return TODOS

    elegido = argumentos[argumentos.index("--perfiles") + 1]
    if elegido in VISTAS:
        return VISTAS[elegido]

    nombres = [n.strip() for n in elegido.split(",") if n.strip()]
    desconocido = next((n for n in nombres if n not in TODOS), None)
    if desconocido is not None:
        raise SystemExit(
            f"No conozco el perfil {desconocido!r}.\n"
            f"Los del modelo son: {', '.join(TODOS)}"
        )
    # Se devuelven en orden de riesgo y no en el que se los escribió: la
    # leyenda tiene que leerse de menos a más.
    return [n for n in TODOS if n in nombres]


def csv_pedido(argumentos: list[str]) -> Path:
    """El primer argumento suelto, salvo que sea el valor de `--perfiles`."""
    valor = (
        argumentos[argumentos.index("--perfiles") + 1]
        if "--perfiles" in argumentos
        else None
    )
    sueltos = [a for a in argumentos if not a.startswith("--") and a != valor]
    return Path(sueltos[0]) if sueltos else RAIZ / "benchmark.csv"


if __name__ == "__main__":
    argumentos = sys.argv[1:]
    ruta = csv_pedido(argumentos)
    perfiles = perfiles_pedidos(argumentos)

    detalle = cargar(ruta)
    pesos = matriz_por_clase(detalle)
    montos = sorted(detalle["ticket_usd"].unique())

    print(f"\nPesos por clase (%) — {len(perfiles)} perfiles\n")
    print(pesos.loc[perfiles].round(1).to_string())

    dibujar(pesos, montos, perfiles, ruta.with_suffix(".png"))
