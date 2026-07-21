# P2 triage — preguntas casi idénticas (2026-07-10)

**Sin regeneración.**

## Hallazgo metodológico (importante)

El check 5b de la auditoría calculaba Jaccard sobre `question + explanation + options`.
En T3 (y algunos Hören) **todas las preguntas comparten el mismo banco de opciones** →
J≥0.85 artificial. De los **47** archivos del audit:

| Métrica | N |
|--------|--:|
| Siguen “fallando” con métrica inflada (opts incluidas) | 47 |
| Fallan con **solo enunciado** (J≥0.85) | **0** |

## Clasificación de los 47 (mejor par por archivo, enunciado solo)

Aunque pocos alcanzan J≥0.85 sin opciones, se clasifica el **par de mayor solapamiento** de cada archivo:

| Clase | Archivos (de 47) |
|-------|-----------------:|
| Estructural T3 / plantilla | **47** |
| Casi-duplicado real | **0** |
| Ambiguo | **0** |

### Ejemplos estructurales (mostrados 8)

- `lesen-t3-auto-we7l2c.json` — mismo marco, entidades distintas (contentJ=0.10) (qOnly J=0.176)
  - A: Der Schüler Jan möchte die Sprache Russlands von Grund auf lernen.
  - B: Herr Sami möchte die arabische Schrift und Sprache erlernen.
- `lesen-t3-auto-x4k027.json` — mismo marco, entidades distintas (contentJ=0.13) (qOnly J=0.211)
  - A: Bei Herrn lang ist ein Bügel der Sehhilfe abgebrochen; sie soll gerichtet werden.
  - B: An Saras Reisegepäck ist eine Rolle abgebrochen, die ersetzt werden soll.
- `lesen-t3-auto-yii0su.json` — mismo marco, entidades distintas (contentJ=0.18) (qOnly J=0.294)
  - A: Lena möchte lernen, eigene Kleidung selbst anzufertigen, und sucht einen Einsteigerkurs.
  - B: Frau Held will warme Mützen selbst herstellen und sucht einen Einsteigerkurs.
- `lesen-t3-auto-yu9vyl.json` — mismo marco, entidades distintas (contentJ=0.00) (qOnly J=0.111)
  - A: Die Studentin Mia kommt mit den Grundlagen der Betriebswirtschaft nicht klar.
  - B: Der Erstsemester Tom braucht Hilfe bei den ersten Rechtsthemen.
- `lesen-t3-auto-zspq8n.json` — mismo marco, entidades distintas (contentJ=0.17) (qOnly J=0.19)
  - A: An Lenas Holzstuhl für die kleine ist ein Bein locker; es soll gerichtet werden.
  - B: Das kleine Laufrad von Bens Sohn hat ein kaputtes Rad, das ersetzt werden soll.
- `lesen-t3-auto-0oquml.json` — mismo marco, entidades distintas (contentJ=0.13) (qOnly J=0.211)
  - A: Bei Herrn lang ist ein Bügel der Sehhilfe abgebrochen; sie soll gerichtet werden.
  - B: An Saras Reisegepäck ist eine Rolle abgebrochen, die ersetzt werden soll.
- `lesen-t3-auto-0ouon0.json` — mismo marco, entidades distintas (contentJ=0.10) (qOnly J=0.176)
  - A: Der Schüler Jan möchte die Sprache Russlands von Grund auf lernen.
  - B: Herr Sami möchte die arabische Schrift und Sprache erlernen.
- `lesen-t3-auto-1g1gfz.json` — mismo marco, entidades distintas (contentJ=0.10) (qOnly J=0.176)
  - A: Der Schüler Jan möchte die Sprache Russlands von Grund auf lernen.
  - B: Herr Sami möchte die arabische Schrift und Sprache erlernen.

### Ejemplos casi-duplicado real (mostrados 0)

_Ninguno._

### Ejemplos ambiguos (mostrados 0)

_Ninguno._


## Pool completo — enunciado solo J≥0.85

| Clase | Archivos |
|-------|--------:|
| Estructural | 0 |
| Real | 0 |
| Ambiguo | 0 |
| **Total** | **0** |

## Recomendación

- Los 47 del audit **no justifican regeneración en masa**: la mayoría es solapamiento de plantilla T3 + falso positivo por opciones compartidas.
- Regenerar solo si, tras este triaje, la clase `real_near_duplicate` en enunciado-only es >0 y se confirma a ojo (0 en los 47; 0 en pool completo con umbral 0.85).

Datos: `POOL-NEAR-DUP-P2-TRIAGE-2026-07-10.json`
