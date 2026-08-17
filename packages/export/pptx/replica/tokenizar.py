"""
Tokeniza el deck de referencia y produce la plantilla del PPT replica.

Entrada : reference/Presentation_Fernando Pastor Final.pptx
Salidas : template.pptx        plantilla con {{tokens}} en lugar de los datos
          token-map.json       token -> valor original, para trazabilidad
          revision.md          reporte para que Sabbi valide la tokenizacion

Reglas de clasificacion
  DATOS    el parrafo completo es un valor del cliente  -> se reemplaza entero
  MIXTO    el valor viene embebido en una frase          -> se reemplaza el tramo
  ESTATICO andamiaje de diseno (ejes, numerales, ejemplo tributario) -> intacto

Un token nunca puede quedar partido en varios runs: cuando el parrafo se
tokeniza entero, los runs se colapsan en uno solo conservando el formato del
primero. Es la causa mas comun de plantillas que no sustituyen.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

from lxml import etree
from pptx import Presentation

RAIZ = Path(__file__).resolve().parents[4]
ORIGEN = RAIZ / "reference" / "Presentation_Fernando Pastor Final.pptx"
DESTINO = Path(__file__).resolve().parent

# PENDIENTE: la marca pide Avenir Next Pro. Queda en stand by hasta confirmar
# la licencia; sin ella, una maquina que no tenga la fuente descuadra el deck.
# Mientras tanto se usa una generica universal. Cambiar esta constante y volver
# a correr el script es todo lo que hace falta para migrar.
TIPOGRAFIA_MARCA = "Avenir Next Pro"
TIPOGRAFIA = "Arial"

# --- patrones de valor -------------------------------------------------------
MONEDA = r"(?:US\$|USD|S/\.?|\$)\s?-?[\d][\d.,]*\s?(?:MM|M|k|mil|millones)?"
PORCENTAJE = r"-?\d+(?:[.,]\d+)?\s?%"
RANGO_PCT = rf"{PORCENTAJE}\s?[–\-—]\s?{PORCENTAJE}|\d+(?:[.,]\d+)?\s?[–\-—]\s?{PORCENTAJE}"
RANGO_MONEDA = rf"{MONEDA}\s?[–\-—]\s?{MONEDA}"
TRANSICION = rf"(?:{MONEDA}|{PORCENTAJE})\s?(?:→|->)\s?(?:{MONEDA}|{PORCENTAJE})"
FECHA = r"\d{1,2}/\d{1,2}/\d{2,4}"
SCORE = r"\b\d{1,2}\s?/\s?10\b"
MILES = r"\b\d{1,3}(?:[.,]\d{3})+\b"  # 136,153 sin simbolo de moneda
CONTEO = r"\by\s+\d+\s+m[áa]s\b"  # "y 6 más"

# el orden importa: lo compuesto antes que lo simple
VALOR = re.compile(
    rf"({TRANSICION}|{RANGO_MONEDA}|{RANGO_PCT}|{FECHA}|{SCORE}|{MONEDA}"
    rf"|{PORCENTAJE}|{CONTEO}|{MILES})",
    re.IGNORECASE,
)

# "(lámina 3 de 6)" -> contador de paginacion, no un dato mas
PAGINACION = re.compile(r"l[áa]mina\s+(\d+)\s+de\s+(\d+)", re.IGNORECASE)

# laminas paginadas: patrimonio antes/despues y anexo
SLIDES_PATRIMONIO = range(11, 17)
SLIDES_ANEXO = range(20, 23)

# Etiquetas fijas del diseno. Todo lo que NO este aqui, en una lamina de datos,
# se considera dato del cliente y se tokeniza. La regla se inclina a sobre-
# tokenizar: dejar un nombre o una tenencia real dentro de la plantilla filtra
# informacion de un cliente a todas las propuestas que se generen despues.
ENCABEZADOS = {
    # portada y navegacion
    "asesoría patrimonial",
    "informe patrimonial",
    "plan de acción",
    "anexo",
    # tablas patrimonio y anexo
    "antes",
    "después",
    "despues",
    "producto por producto, qué se mantiene y qué se cambia.",
    "¿en qué exactamente va mi dinero?",
    "cada instrumento tiene un propósito claro dentro del portafolio.",
    "instrumento",
    "descripción",
    "monto",
    "retorno",
    "propósito",
    "plazo mínimo",
    # perfil
    "tu perfil como inversionista",
    "objetivo principal",
    "perfil de riesgo",
    "experiencia",
    "involucramiento",
    "flujo mensual",
    "usd/ mes necesario",
    "con este horizonte de perfil, ¿cómo está parado tu portafolio hoy?",
    # diagnostico
    "diagnóstico general",
    "diagnóstico",
    "cómo están combinados tus activos",
    "qué tan expuesto estas a shocks",
    "así está parado tu dinero hoy",
    "patrimonio total",
    "invertido",
    "perfil",
    # comisiones
    "¿cuánto estás pagando hoy en comisiones?",
    "total anual",
    "usd/año",
    "incluído igv",
    "referencia basada en fees publicados. no incluye costos implícitos.",
    # focos
    "focos de mejora",
    # plan y rentabilidad
    "rentabilidad",
    "hoy",
    "con el plan",
    "objetivo",
    "equivale a",
    "al año",
    "diferencia anual",
    "flujo estimado",
    "mismo patrimonio, mejor composición",
    "rentas, dividendos y cupones",
    "sin vender lo que funciona. sin cambios drásticos.",
    "tu plan: que mover, cuánto y a dónde",
    "a dónde va",
    "cifras estimadas por sabbi. no constituyen garantía de rentabilidad futura.",
}

# --- andamiaje que NO se toca ------------------------------------------------
EJES = {"0%", "10%", "20%", "30%", "40%", "50%", "60%", "70%", "80%", "90%", "100%"}
NUMERAL = re.compile(r"^\s*0?[1-9]\s*$")
TRAMO = re.compile(r"^\s*(?:Mes\s*\d+|M\d+)\s*$", re.IGNORECASE)

# laminas cuyo contenido es discurso fijo de marca, no dato de cliente
SLIDES_ESTATICAS = {2, 18, 19}


def es_estatico(slide_no: int, texto: str, protegido: bool) -> bool:
    t = texto.strip()
    if not t:
        return True
    if slide_no in SLIDES_ESTATICAS:
        return True
    if NUMERAL.match(t) or TRAMO.match(t):
        return True
    return protegido


def detectar_ejes(slide) -> set[tuple[int, int]]:
    """Marca las etiquetas de eje de un grafico dibujado con shapes.

    Un eje es una serie de porcentajes redondos, cada uno en su propio shape,
    que forma una progresion aritmetica: 0% 10% 20% 30%... Son andamiaje de
    diseno y deben quedar fuera de la plantilla; los porcentajes de las barras,
    que si son dato, no forman progresion.
    """
    candidatos = []
    for shape in slide.shapes:
        if not shape.has_text_frame or shape.left is None:
            continue
        for indice, parrafo in enumerate(shape.text_frame.paragraphs):
            t = "".join(r.text for r in parrafo.runs).strip()
            if t in EJES:
                # clave estable (shape, parrafo): ni los objetos de python-pptx
                # ni los proxies de lxml conservan su id() entre accesos
                clave = (shape.shape_id, indice)
                candidatos.append((int(t.rstrip("%")), shape.left, shape.top, clave))
    if len(candidatos) < 4:
        return set()

    protegidos: set[tuple[int, int]] = set()
    # Una escala se dibuja alineada: misma columna (eje vertical) o misma fila.
    # Se agrupa por saltos, no por cubos fijos: las etiquetas del eje quedan a
    # decimas de milimetro entre si, mientras las barras estan a centimetros.
    SALTO = 200_000  # EMU, ~0.22 pulgadas
    for eje in (1, 2):
        ordenados = sorted(candidatos, key=lambda c: c[eje])
        grupo = [ordenados[0]]
        for anterior, actual in zip(ordenados, ordenados[1:]):
            if actual[eje] - anterior[eje] > SALTO:
                _marcar_si_es_escala(grupo, protegidos)
                grupo = []
            grupo.append(actual)
        _marcar_si_es_escala(grupo, protegidos)
    return protegidos


def _marcar_si_es_escala(grupo: list, protegidos: set[tuple[int, int]]) -> None:
    """Una escala tiene al menos 4 valores distintos en progresion aritmetica."""
    if len(grupo) < 4:
        return
    valores = sorted({c[0] for c in grupo})
    if len(valores) < 4:
        return
    paso = valores[1] - valores[0]
    if paso > 0 and all(b - a == paso for a, b in zip(valores, valores[1:])):
        protegidos.update(c[3] for c in grupo)


class Tokenizador:
    def __init__(self) -> None:
        self.mapa: dict[str, str] = {}
        self.filas: list[dict] = []
        self._usados: set[str] = set()

    def nombre(self, slide_no: int, base: str) -> str:
        raiz = f"s{slide_no:02d}.{base}"
        if raiz not in self._usados:
            self._usados.add(raiz)
            return raiz
        n = 2
        while f"{raiz}{n}" in self._usados:
            n += 1
        self._usados.add(f"{raiz}{n}")
        return f"{raiz}{n}"

    @staticmethod
    def clase(valor: str) -> str:
        v = valor.lower()
        if "→" in valor or "->" in valor:
            return "delta"
        if re.search(r"^\s*y\s+\d+\s+m", v):
            return "conteo"
        if re.search(r"\d/\s?10", v):
            return "score"
        if re.match(r"^\d{1,2}/\d{1,2}/", v):
            return "fecha"
        if "%" in v:
            return "pct"
        if not re.search(r"\d", v):
            return "nombre"
        return "monto"

    def registrar(self, slide_no: int, valor: str, contexto: str, modo: str) -> str:
        token = self.nombre(slide_no, self.clase(valor))
        self.mapa[token] = valor
        self.filas.append(
            {
                "slide": slide_no,
                "token": token,
                "valor": valor,
                "modo": modo,
                "contexto": contexto[:80],
            }
        )
        return "{{" + token + "}}"


def colapsar(parrafo, texto: str) -> None:
    """Deja el parrafo con un unico run, conservando el formato del primero."""
    runs = parrafo.runs
    if not runs:
        return
    primero = runs[0]
    primero.text = texto
    for r in runs[1:]:
        r._r.getparent().remove(r._r)


def procesar_parrafo(parrafo, slide_no: int, tok: Tokenizador, protegido: bool) -> None:
    texto = "".join(r.text for r in parrafo.runs)
    if not texto.strip():
        return
    if es_estatico(slide_no, texto, protegido):
        return

    # contador de paginacion: "(lámina 3 de 6)" -> dos tokens fijos, sin numerar
    if PAGINACION.search(texto):
        nuevo = PAGINACION.sub("lámina {{pag.n}} de {{pag.total}}", texto)
        tok.filas.append(
            {
                "slide": slide_no,
                "token": "pag.n / pag.total",
                "valor": PAGINACION.search(texto).group(0),
                "modo": "paginacion",
                "contexto": texto[:80],
            }
        )
        tok.mapa.setdefault("pag.n", "N")
        tok.mapa.setdefault("pag.total", "M")
        colapsar(parrafo, nuevo)
        return

    encontrados = VALOR.findall(texto)

    # Sin cifras, pero tampoco es una etiqueta del diseno: es texto del cliente
    # (su nombre, una tenencia, un hallazgo). Viaja entero como un token.
    if not encontrados:
        if texto.strip().lower() not in ENCABEZADOS:
            marca = tok.registrar(slide_no, texto.strip(), texto, "nombre")
            colapsar(parrafo, marca)
        return

    # el parrafo completo es un valor -> token unico, runs colapsados
    if texto.strip() == encontrados[0].strip() and len(encontrados) == 1:
        marca = tok.registrar(slide_no, texto.strip(), texto, "completo")
        colapsar(parrafo, marca)
        return

    # Si al quitar los valores queda una frase, el parrafo es descriptivo
    # (nombre de instrumento, titular) y viaja entero como un solo token.
    # Trocearlo parte cifras que son parte del nombre: "terreno (2,500 m2)".
    residuo = VALOR.sub(" ", texto)
    palabras = [p for p in re.findall(r"[^\W\d_]{2,}", residuo, re.UNICODE)]
    if len(palabras) >= 4:
        marca = tok.registrar(slide_no, texto.strip(), texto, "frase")
        colapsar(parrafo, marca)
        return

    # etiqueta corta mas valor -> se conserva la etiqueta, se tokeniza el valor
    nuevo = texto
    for valor in encontrados:
        marca = tok.registrar(slide_no, valor.strip(), texto, "embebido")
        nuevo = nuevo.replace(valor, marca, 1)
    colapsar(parrafo, nuevo)


NS = "{http://schemas.openxmlformats.org/drawingml/2006/main}"

# DrawingML exige un orden de hijos dentro de rPr. `latin` va despues de los
# rellenos y efectos, y antes de estos. Insertarlo en posicion cero produce un
# XML que PowerPoint marca como danado.
POSTERIORES = (f"{NS}sym", f"{NS}hlinkClick", f"{NS}hlinkMouseOver", f"{NS}rtl", f"{NS}extLst")


def _fijar_familia(rpr) -> None:
    for hijo in list(rpr):
        if hijo.tag in (f"{NS}latin", f"{NS}ea", f"{NS}cs"):
            rpr.remove(hijo)
    latin = rpr.makeelement(f"{NS}latin", {"typeface": TIPOGRAFIA})
    destino = len(rpr)
    for i, hijo in enumerate(rpr):
        if hijo.tag in POSTERIORES:
            destino = i
            break
    rpr.insert(destino, latin)


def unificar_tipografia(prs: Presentation) -> int:
    """Fuerza una sola familia en todo el deck, incluidas tablas y el tema."""
    tocados = 0
    objetivo = (f"{NS}rPr", f"{NS}defRPr", f"{NS}endParaRPr")

    def pintar(elemento) -> None:
        nonlocal tocados
        # se materializa la lista: mutar el arbol durante .iter() saltea nodos
        for rpr in [e for e in elemento.iter() if e.tag in objetivo]:
            _fijar_familia(rpr)
            tocados += 1

    for slide in prs.slides:
        pintar(slide._element)
    for master in prs.slide_masters:
        pintar(master._element)
        for layout in master.slide_layouts:
            pintar(layout._element)
        for rel in master.part.rels.values():
            if not rel.reltype.endswith("/theme"):
                continue
            # el tema es un Part plano: hay que parsear y reescribir el blob
            parte = rel.target_part
            raiz = etree.fromstring(parte.blob)
            for etiqueta in ("majorFont", "minorFont"):
                for fuente in raiz.iter(f"{NS}{etiqueta}"):
                    for hijo in fuente.findall(f"{NS}latin"):
                        hijo.set("typeface", TIPOGRAFIA)
                        tocados += 1
            parte._blob = etree.tostring(
                raiz, xml_declaration=True, encoding="UTF-8", standalone=True
            )
    return tocados


def limpiar_notas(prs: Presentation) -> int:
    """Vacia las notas de orador.

    Las del deck original traen supuestos de retorno del portafolio concreto.
    Una plantilla no las necesita y arrastrarlas filtra datos del cliente a
    todas las propuestas que se generen despues.
    """
    borradas = 0
    for slide in prs.slides:
        if not slide.has_notes_slide:
            continue
        marco = slide.notes_slide.notes_text_frame
        if marco is not None and marco.text.strip():
            marco.text = ""
            borradas += 1
    return borradas


def anonimizar_propiedades(prs: Presentation) -> None:
    """Deja las propiedades del documento sin rastro de autor ni cliente."""
    props = prs.core_properties
    props.author = "Sabbi"
    props.last_modified_by = "Sabbi"
    props.title = "Plantilla Informe Patrimonial"
    props.subject = ""
    props.comments = ""
    props.keywords = ""
    props.category = ""


def main() -> None:
    prs = Presentation(str(ORIGEN))
    tok = Tokenizador()

    for i, slide in enumerate(prs.slides, 1):
        ejes = detectar_ejes(slide)
        for shape in slide.shapes:
            if shape.has_text_frame:
                for indice, parrafo in enumerate(shape.text_frame.paragraphs):
                    protegido = (shape.shape_id, indice) in ejes
                    procesar_parrafo(parrafo, i, tok, protegido)
            if shape.has_table:
                for fila in shape.table.rows:
                    for celda in fila.cells:
                        for parrafo in celda.text_frame.paragraphs:
                            procesar_parrafo(parrafo, i, tok, False)

    runs_tocados = unificar_tipografia(prs)
    notas = limpiar_notas(prs)
    anonimizar_propiedades(prs)
    prs.save(str(DESTINO / "template.pptx"))

    (DESTINO / "token-map.json").write_text(
        json.dumps(tok.mapa, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    lineas = [
        "# Revisión de la plantilla del PPT réplica",
        "",
        f"Generada desde `{ORIGEN.name}`.",
        "",
        f"- Tokens creados: **{len(tok.mapa)}**",
        f"- Tipografía unificada a **{TIPOGRAFIA}** en {runs_tocados} definiciones de formato",
        f"- Láminas tratadas como estáticas: {sorted(SLIDES_ESTATICAS)}",
        f"- Notas de orador eliminadas: {notas}",
        "- Propiedades del documento anonimizadas",
        "",
        "> Los archivos `token-map.json` y `revision.md` contienen los valores ",
        "> reales del cliente de origen. No se versionan y no deben salir del ",
        "> equipo.",
        "",
        "Revisa que cada token corresponda a un dato del cliente y no a un ",
        "elemento de diseño. Si alguno sobra, bórralo del `.pptx` y vuelve a ",
        "escribir el texto original.",
        "",
        "| Lámina | Token | Valor original | Modo | Contexto |",
        "|---|---|---|---|---|",
    ]
    for f in tok.filas:
        ctx = f["contexto"].replace("|", "\\|")
        lineas.append(
            f'| {f["slide"]} | `{{{{{f["token"]}}}}}` | {f["valor"]} | {f["modo"]} | {ctx} |'
        )
    (DESTINO / "revision.md").write_text("\n".join(lineas) + "\n", encoding="utf-8")

    print(f"tokens={len(tok.mapa)}  runs_formato={runs_tocados}  notas_borradas={notas}")
    print(f"escrito: {DESTINO / 'template.pptx'}")


if __name__ == "__main__":
    main()
