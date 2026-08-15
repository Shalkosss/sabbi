# AURORA SABBI

Proyecto de análisis estructural con Python.

## Stack

- **Python 3.12** — cálculo científico y análisis estructural
- **Node.js** — herramientas de desarrollo
- **Supabase** — base de datos
- **GitHub CLI** — gestión del repositorio

## Librerías principales

| Librería | Uso |
|---|---|
| numpy, scipy | Cálculo numérico |
| pandas | Análisis de datos |
| matplotlib | Gráficos |
| sympy | Matemática simbólica |
| anastruct | Análisis estructural 2D |
| Pynite (PyNiteFEA) | FEM 3D (pórticos, vigas) |
| openseespy | FEM avanzado (análisis sísmico) |
| supabase | Cliente de base de datos |

## Instalación

```bash
pip install -r requirements.txt
```

## Configuración

Las credenciales van en `.claude/.env.local` (nunca se sube a Git):

```bash
GITHUB_TOKEN=tu_token
SUPABASE_URL=tu_url
SUPABASE_SERVICE_ROLE_KEY=tu_key
```
