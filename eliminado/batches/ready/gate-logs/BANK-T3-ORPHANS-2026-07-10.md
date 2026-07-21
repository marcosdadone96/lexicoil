# BANK-T3-ORPHANS — diagnóstico (2026-07-10)

Solo lectura. No se modificó el banco.

## Dimensión

| Métrica | Valor |
|---------|------:|
| Preguntas totales banco | 1056 |
| Sin `passageId` (campo ausente) | **602** |
| % del banco | **57.0%** |
| Con `passageId` dangling (apunta a pasaje borrado) | **0** |
| Pasajes T3 en `passages[]` | **0** |

## Forma

- **100%** `module=lesen`, `teil=3`, `type=matching`
- Prefijo de id: `gen-q-3-*`
- **86** grupos (típicamente 7 preguntas/grupo = 1 parte T3)
- Sin `createdAt` / `source` en las filas muestreadas
- Las `options` son textos de anuncios (A/B/C…), no MCQ de pasaje

## Causa probable

Schema T3 = matching a **ads**, no a un pasaje narrativo. Estas filas se ingirieron al banco de preguntas **sin** contenedor en `passages[]` y **sin** rellenar `passageId`. No hay evidencia de pasajes borrados después (dangling = 0).

## ¿Toca contenido publicado?

| Superficie | ¿Algún id de las 602? |
|------------|----------------------:|
| `library/published-exams/de/B1/*` | **0** |
| `data/exams/de_B1.json` (e1 servido) | **0** |

e1 `lesen_3` usa `gen-q-3-vn8ems-1…7` (con `ads` en el snapshot); esos ids **no** están en el banco. Las 602 son pool/backlog T3 no ensamblado en el examen live.

## Prioridad sugerida

Baja / sesión aparte. No bloquea republicación ni calidad del examen servido. Posibles caminos futuros: asociar `partId`/`ads` container, o excluir T3 matching del índice plano `questions.json` cuando no hay pasaje.
