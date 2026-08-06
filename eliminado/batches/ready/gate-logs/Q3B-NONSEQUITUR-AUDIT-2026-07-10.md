# Q3-B non_sequitur human audit — 2026-07-10

Barrido: 134 files · 62 `naturalness/non_sequitur` · muestra **20** (variedad por celda).
Sin gasto LLM adicional — solo revisión del informe ya generado.

**Nota de cobertura:** en los 62 no hay Hören T1 ni Sprechen (0 findings). La muestra cubre Hören T2/T3/T4, Lesen T1–T5, Schreiben.

## Veredicto

**FP de la muestra: 13/20 = 65%** (REAL 7/20 = 35%).

Umbral de calibración (>30–40% FP) **superado**.  
→ **NO entregar los 62 non_sequitur tal cual para corrección manual.**  
→ Hace falta ajuste de prompt (v1.3) antes de confiar en ese eje.

Los otros 4 ejes (85 findings) **sí** se entregan para corrección manual (ver lista depurada abajo), con una nota de control ligera sobre `fabricated_quote`.

## Clasificación de la muestra (20)

| # | Archivo | Fragmento | Clase | Por qué |
|---|---------|-----------|-------|---------|
| 1 | horen-t2-017 | Zugang… Hürden minimiert werden | **REAL** | Predicado roto (fixture) |
| 2 | lesen-t2-055 | Programm … eingetreten | **REAL** | Verbo incorrecto (fixture; eje debería ser lexicon) |
| 3 | lesen-t2-055 | Gärtnern im freien Stress | **REAL** | Sintaxis rota (fixture) |
| 4 | horen-t4-012 | Marketing wichtiger als Produkt | **FP** | Matiz legítimo de debate T4; Amina responde al punto |
| 5 | horen-t4-010 | Bekanntheit erlangt haben | **FP** | Frase floja, no salto temático; mal eje |
| 6 | horen-t4-011 | führt … zu einer Reklamation | **FP** | Consecuencia lógica en debate (viernes sin servicio) |
| 7 | horen-t4-013 | nach einem Resümee gefragt | **FP** | Pregunta de estructura discursiva T4 válida |
| 8 | lesen-t3-ma7vt8 | Spanisch … verbessern | **FP** | Alemán correcto; juez inventa error (eco T3) |
| 9 | lesen-t3-yulvio | Kästchen defekt | **FP** | Circunlocución B1 típica T3, no non_sequitur |
| 10 | lesen-t3-zspq8n | für die kleine | **REAL** | SN incompleto / agramatical |
| 11 | lesen-t1-136 | topicTag Technik | **FP** | Prompt prohíbe marcar topicTag |
| 12 | lesen-t1-119 | mein Alter Wohnort | **FP*** | Error de mayúscula real, pero **no** non_sequitur |
| 13 | lesen-t5-015 | Ruhezeit ganztägig von 13–15 | **REAL** | Contradicción ganztägig vs franja |
| 14 | lesen-t5-015 | Verwaltung in München | **REAL** | Ciudad ajena en Hausordnung genérica |
| 15 | lesen-t5-053 | Schwimmbad und Fitnessbereich | **FP** | MCQ T5 multi-área normal |
| 16 | schreiben-010 | Transport zu seinem Haus | **REAL** | Bullet invertido / confuso vs oferta del vecino |
| 17 | horen-t2-016 | Das eigene Home | **FP*** | Anglicismo → forced_vocab; hay hilo temático |
| 18 | lesen-t4-016 | Klimawandel und Naturschutz | **FP** | Marco introductorio legítimo de foro T4 |
| 19 | horen-t2-005 | Vorräte an Ausreden | **FP*** | Colocación rara → lexicon, no salto |
| 20 | lesen-t1-099 | keine Warteliste | **FP** | Cierre persuasivo de blog T1, no ruptura |

\*FP del **eje** non_sequitur; puede haber error real en otro eje.

**Resumen muestra:** REAL **7** (35%) · FP **13** (65%).

## Patrones de FP a atacar en prompt v1.3

1. **Hören/Lesen T4 (debate):** contraargumentos, frases de transición y preguntas sobre el Moderador/Resümee se marcan como non_sequitur.
2. **Lesen T3:** alucinaciones léxicas o rechazo de circunlocución B1 (`Kästchen`) en situaciones.
3. **Mal eje:** caps (`Alter Wohnort`), colocaciones (`Vorräte`), anglicismos (`Home`), `topicTag` → etiquetados non_sequitur.
4. **Lesen T5:** preguntas MCQ que unen dos secciones del reglamento.
5. **Lesen T1 prosa personal:** saltos narrativos leves (Warteliste, vecinos) tratados como ruptura.

### Ajuste propuesto (v1.3) — solo diseño, no aplicar aún

Añadir a naturalness/non_sequitur:

- T4: no marcar desacuerdos entre invitados, ni preguntas sobre quién resume / cierra.
- T3: no marcar circunlocución B1 ni situaciones correct=0; no inventar “verbos inexistentes”.
- No usar non_sequitur para mayúsculas, topicTag, anglicismos sueltos o colocaciones (van a lexicon/forced_vocab/otro gate).
- T5: preguntas que abarcan dos apartados del mismo reglamento = OK.
- T1: digresiones breves de blog personal ≠ non_sequitur salvo contradicción o agramaticalidad clara.

## Otros 4 ejes — ¿muestra de control?

| Eje | n | ¿Control extra? |
|-----|---|-----------------|
| wrong_lexeme | 35 | No obligatorio — fixtures previos OK |
| register_break | 26 | Opcional ligero (puede solapar con caps) |
| forced_vocab | 16 | No obligatorio |
| fabricated_quote | 8 | **Sí, control ligero:** varios son REAL (p.ej. t3-003 «probieren», t5-036 hora); 1–2 de T4 sobre “el Moderador resume…” merecen ojo humano al corregir |

## Lista accionable (depurada)

Ver `Q3B-ACTIONABLE-FINDINGS-2026-07-10.json` / `.md`:

- **non_sequitur:** solo los **7 REAL** confirmados en muestra (+ hold del resto).
- **otros 4 ejes:** los **85** findings completos del barrido.
