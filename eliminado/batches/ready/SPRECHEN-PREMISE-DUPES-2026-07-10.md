# Sprechen — duplicados de premisas (SP-2.4)

Fingerprint = premisa T1 normalizada + tema T2 normalizado.
**No se borra nada** — decisión humana de cuál conservar en cada par.

Sets indexados: **27**
Duplicados exactos (mismo fingerprint): **0**

## Pares temáticos reportados en auditoría (revisión humana)

| Tema | Archivos candidatos | Notas |
|------|---------------------|-------|
| Tagesausflug | `sprechen-feste-02` / `sprechen-reise-vorbereitung-01` | misma premisa de excursión |
| Feste und Feiern (T2) | `sprechen-feste-02` / `sprechen-stadtfest-planung-01` | mismo eje T2 |
| Abschiedsfeier | `sprechen-gemini-003` / `sprechen-onlineshopping-01` | fiesta de despedida |
| Kulturfest / Stadtfest organisieren | `sprechen-gemini-001` / `sprechen-stadtfest-planung-01` | planificar fiesta urbana |

## Duplicados exactos (T1+T2)

_Ninguno con fingerprint idéntico (el solapamiento es temático, no byte-idéntico)._
## Solapamientos automáticos (misma premisa T1 **o** mismo tema T2, string-fold)

### t1_premise: `sie mochten mit freunden einen tagesausflug planen besprechen sie folgende punkte`
- `batches/merged/sprechen-reise-vorbereitung-01.json`
- `batches/merged/sprechen-reise-vorbereitung-02.json`

### t2_topic: `reisen und verkehr in meinem heimatland`
- `batches/merged/sprechen-reise-vorbereitung-03.json`
- `batches/merged/sprechen-reise-vorbereitung-04.json`
- `batches/merged/sprechen-reise-vorbereitung-05.json`

