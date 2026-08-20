"""
La matriz del benchmark, en un gráfico de columnas apiladas al 100%.

    npm run exportar-benchmark      # saca benchmark.csv del motor
    python tools/benchmark-grafico.py

Un panel por perfil, los montos en el eje X y la composición del portafolio en
el Y. Es la forma de ver de un vistazo lo que la tabla dice fila por fila: cómo
se mueve la asignación cuando cambia el ticket, y en qué punto una clase
aparece o desaparece.

Los datos no se simulan. Salen de `benchmark.csv`, que a su vez sale del mismo
motor que corre la web: dos implementaciones de la misma cuenta son dos
respuestas distintas esperando a divergir. Si la mesa cambia los pesos, se
vuelve a exportar y el gráfico cambia solo.

Requiere: pandas, matplotlib, seaborn.
"""

from pathlib import Path

import matplotlib.pyplot as plt
import matplotlib.ticker as mticker
from matplotlib.patches import Patch
import pandas as pd
import seaborn as sns

RAIZ = Path(__file__).resolve().parent.parent
ENTRADA = RAIZ / "benchmark.csv"
SALIDA = RAIZ / "benchmark.png"

# Los tres que pidió la mesa. Poner los cinco es agregarlos a esta lista: el
# resto del script no sabe cuántos son.
PERFILES = ["Conservador", "Moderado", "Arriesgado"]

# El orden de apilado, de abajo hacia arriba. Es el mismo de la hoja
# `Allocation detallado`, para que el gráfico y la tabla se lean igual.
CLASES = ["inm", "fijo", "variable", "privados", "club", "otros", "cash"]

# Los colores de la aplicación, no unos nuevos: el mismo verde de Renta Fija en
# la web, en el deck y acá. Un color que significa dos cosas distintas según
# dónde se mire es peor que no tener color.
COLOR = {
    "inm": "#3F3585",
    "fijo": "#41611C",
    "variable": "#6D9425",
    "privados": "#584AA0",
    "club": "#6A5CC0",
    "otros": "#9A7A2C",
    "cash": "#7A8770",
}

NOMBRE = {
    "inm": "Inmobiliario Directo",
    "fijo": "Mercados Públicos — Fijo",
    "variable": "Mercados Públicos — Variable",
    "privados": "Mercados Privados",
    "club": "Club Deals",
    "otros": "Otros (Oro y BTC)",
    "cash": "Cash",
}

HUESO = "#F4F4ED"
TINTA = "#1C2A0E"
TINTA_TENUE = "#657453"


# ── Paso 1: los datos ──────────────────────────────────────────────────────


def cargar() -> pd.DataFrame:
    """El CSV del motor, una fila por instrumento."""
    if not ENTRADA.exists():
        raise SystemExit(
            f"No encuentro {ENTRADA.name}.\n"
            "Corré primero:  npm run exportar-benchmark"
        )
    return pd.read_csv(ENTRADA)


def matriz_por_clase(detalle: pd.DataFrame) -> pd.DataFrame:
    """
    Los pesos por clase, agregando los instrumentos de cada una.

    Se agrega acá y no al exportar: el CSV guarda el instrumento porque saber
    qué ETF entró y cuál no es la mitad de lo que hay que mirar cuando el
    ticket es chico, y un agregado no se puede desagregar después.
    """
    porcentajes = (
        detalle.groupby(["perfil", "ticket_usd", "clase"], as_index=False)["share_total"]
        .sum()
        .pivot(index=["perfil", "ticket_usd"], columns="clase", values="share_total")
        .reindex(columns=CLASES)
        .fillna(0.0)
    )
    return porcentajes * 100


# ── Paso 2: el gráfico ─────────────────────────────────────────────────────


def dibujar(pesos: pd.DataFrame, detalle: pd.DataFrame) -> None:
    sns.set_theme(style="white", font_scale=0.95)
    plt.rcParams.update(
        {
            "font.family": "DejaVu Sans",
            "figure.facecolor": HUESO,
            "axes.facecolor": HUESO,
            "text.color": TINTA,
            "axes.labelcolor": TINTA_TENUE,
            "xtick.color": TINTA_TENUE,
            "ytick.color": TINTA_TENUE,
        }
    )

    figura, paneles = plt.subplots(
        1, len(PERFILES), figsize=(4.6 * len(PERFILES), 6.2), sharey=True
    )
    if len(PERFILES) == 1:
        paneles = [paneles]

    montos = sorted(detalle["ticket_usd"].unique())
    etiquetas = [f"{m // 1000}k" for m in montos]
    presentes: list[str] = []

    for panel, perfil in zip(paneles, PERFILES):
        base = pd.Series(0.0, index=montos)

        for clase in CLASES:
            try:
                altura = pesos.loc[perfil].reindex(montos)[clase].fillna(0.0)
            except KeyError:
                continue
            if altura.sum() <= 0.05:
                # Una clase que no abre en ningún monto de este perfil no entra
                # a la leyenda: ocuparía una línea para decir que no hay nada.
                continue

            panel.bar(
                etiquetas,
                altura.values,
                bottom=base.values,
                width=0.62,
                color=COLOR[clase],
                edgecolor=HUESO,
                linewidth=1.2,
                label="_nolegend_",
                zorder=3,
            )

            # El porcentaje adentro del segmento, cuando hay lugar. Debajo del
            # 6% el número no entra y estorba más de lo que informa.
            for x, (alto, desde) in enumerate(zip(altura.values, base.values)):
                if alto >= 6:
                    panel.text(
                        x,
                        desde + alto / 2,
                        f"{alto:.0f}%",
                        ha="center",
                        va="center",
                        fontsize=8.5,
                        color="white",
                        fontweight="600",
                        zorder=4,
                    )

            if clase not in presentes:
                presentes.append(clase)
            base = base + altura.fillna(0.0)

        panel.set_title(perfil, fontsize=12.5, fontweight="bold", pad=12, color=TINTA)
        panel.set_ylim(0, 100)
        panel.set_xlabel("Ticket de inversión (USD)", fontsize=9.5, labelpad=9)
        panel.yaxis.set_major_formatter(mticker.PercentFormatter())
        panel.grid(axis="y", color="#DDDCCF", linewidth=0.8, zorder=0)
        panel.set_axisbelow(True)
        for lado in ("top", "right", "left"):
            panel.spines[lado].set_visible(False)
        panel.spines["bottom"].set_color("#CFCDBC")
        panel.tick_params(length=0)

    paneles[0].set_ylabel("Asignación del portafolio", fontsize=9.5, labelpad=10)

    figura.suptitle(
        "Cómo cambia el portafolio según el ticket y el perfil",
        fontsize=15.5,
        fontweight="bold",
        x=0.055,
        y=0.975,
        ha="left",
        color=TINTA,
    )
    figura.text(
        0.055,
        0.925,
        "El modelo Sabbi corrido en vacío: sin ficha, sin posiciones conservadas "
        "y con un ticket mínimo de ETF de USD 20,000.",
        fontsize=9.5,
        ha="left",
        color=TINTA_TENUE,
    )

    # La leyenda va afuera y en una sola fila abajo: a la derecha se come el
    # ancho del tercer panel, que es donde estan las columnas mas divididas.
    #
    # Se arma en el orden del apilado y no en el de aparicion: una leyenda que
    # dice Cash antes que Club Deals obliga a buscar cada color en la barra.
    parches = [
        Patch(facecolor=COLOR[clase], label=NOMBRE[clase])
        for clase in CLASES
        if clase in presentes
    ]

    figura.legend(
        handles=parches,
        loc="lower center",
        bbox_to_anchor=(0.5, -0.005),
        ncol=min(len(parches), 5),
        frameon=False,
        fontsize=9.5,
        handlelength=1.1,
        handleheight=1.1,
        columnspacing=1.8,
    )

    figura.tight_layout(rect=(0.02, 0.075, 0.98, 0.90))
    figura.savefig(SALIDA, dpi=200, facecolor=HUESO)
    print(f"\n{SALIDA}")


def resumen(detalle: pd.DataFrame) -> None:
    """El detalle por instrumento, que el gráfico agrega y conviene poder leer."""
    print("\nInstrumentos por corrida\n")
    for perfil in PERFILES:
        for monto in sorted(detalle["ticket_usd"].unique()):
            filas = detalle[(detalle["perfil"] == perfil) & (detalle["ticket_usd"] == monto)]
            print(f"  {perfil} · {monto // 1000}k")
            for _, fila in filas.sort_values("usd", ascending=False).iterrows():
                print(
                    f"      {fila['share_total'] * 100:5.1f}%  "
                    f"{fila['usd']:>10,.0f}  {fila['instrumento']}"
                )
            print()


if __name__ == "__main__":
    detalle = cargar()
    pesos = matriz_por_clase(detalle)

    print("\nPesos por clase (%)\n")
    print(pesos.round(1).to_string())

    dibujar(pesos, detalle)
    resumen(detalle)
