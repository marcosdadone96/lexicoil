# e1 L2 topic_mismatch — veredicto (2026-07-10)

## Pasaje marcado

- **Celda:** lesen_2 · partId `lesen-t2-gemini-064`
- **Pasaje 1 (q1–q3):** `gen-l2-f5dd2b2c-1` · tag backfill `Gesundheit`
- **Pasaje 2 (q4–q6):** `gen-l2-f5dd2b2c-2` · tag `Ernährung` (no es el finding)

### Título + texto completo (pasaje 1)

**Bewegung für ein gesundes Leben**

> Viele Menschen wissen, dass Bewegung gut für die Gesundheit ist. Schon ein kurzer Spaziergang am Tag kann viel helfen. Ärzte sagen, dass regelmäßige Bewegung das Herz stärkt und den Körper fit hält. Es ist auch gut für die Stimmung. Wenn man sich bewegt, ist man eher glücklich und weniger gestresst. Viele Städte starten Kampagnen, um Bewohner zu mehr Sport zu motivieren. Zum Beispiel gibt es Programme für gemeinsame Spaziergänge im Park. Eine neue Studie zeigte, dass Menschen, die täglich 30 Minuten gehen, weniger oft krank sind. Das Immunsystem braucht diese Aktivität. Auch die Arbeit in einer Bibliothek kann manchmal Bewegung erfordern, wenn man Bücher holt oder Regale einräumt. Es muss nicht immer ein Fitnessstudio sein. Treppen steigen statt Aufzug fahren ist auch eine gute Idee. Der öffentliche Diskurs über die Wichtigkeit von Bewegung wird immer lauter. Viele Familien machen am Wochenende Ausflüge in die Natur. Das ist gut für alle. Eine Umfrage unter älteren Menschen zeigte, dass sie sich durch tägliche Spaziergänge viel besser fühlen. Sie haben weniger Schmerzen und schlafen besser. Auch für Kinder ist es wichtig, draußen zu spielen und sich zu bewegen.

## Veredicto

**`Gesundheit` es correcto.** El texto trata salud vía movimiento (Gesundheit, Ärzte, Herz, Immunsystem, krank, Schmerzen, schlafen). El detector prioriza keywords de Freizeit/Sport (Spaziergang, Park, Ausflüge, spielen) → score Freizeit 3 / Sport 2 / Gesundheit 1.

El `tag_unsupported` del escaneo post-republish fue **artefacto**: `scanServed` lee `part.text` (vacío en T2 servido); el cuerpo está en `passages[]`. Con texto real: mismatch Freizeit vs Gesundheit, no ausencia de tema.

## Acción

Ninguna. Caso conocido de baja señal léxica (mismo criterio que `online` en G2). Documentado en [`INDEX.md`](../INDEX.md) § content topic / Q4.
