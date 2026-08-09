# INCIDENT — migración §2 errónea en Netlify Blobs (2026-08-09)

**Estado:** CERRADO (revert aplicado + verificado)  
**Separado de:** cierre normal §2 verb-form normalization (`d569b1f`)  
**Severidad:** **Baja** — confirmado operador 2026-08-09: ambas cuentas son de prueba; impacto real nulo.  
*(Análisis histórico del incidente conservado abajo — incluye la hipótesis inicial de usuario real en elverabel.)*

---

## Resumen ejecutivo

El 2026-08-09, la **primera** ejecución de `node scripts/dev/scan-user-vocab-verb-forms.mjs --all --migrate` usó una versión del script que llamaba `ManualVocab.enrichFlashcard()` en **todas** las filas del deck, no solo las elegibles P0+P1. Eso modificó **29 entradas** en producción (Netlify Blobs) antes de corregir el script.

**No existía snapshot automático restaurable.** Se revirtió desde el campo `surface` (escrito por la migración errónea) + override manual para `Dienste` (corrupción).

---

## Causa raíz

| Factor | Detalle |
|--------|---------|
| Script | `scripts/dev/scan-user-vocab-verb-forms.mjs` v1 de `--migrate` |
| Bug | `migrateFlashcards()` enriquecía todo el deck; `canonicalizeForDeck` mutaba entradas §2b (POS mal tagueado) |
| Commit código §2 | `d569b1f` — script corregido **después** de la pasada errónea |
| Alcance blob store | 3 cuentas con `sync:`; solo 2 afectadas |

---

## Opciones de restore evaluadas

| Fuente | Resultado |
|--------|-----------|
| **Netlify Blobs** | Sin historial de versiones — solo etag actual |
| **Supabase** | `supabaseId` presente en ambas cuentas, pero **sin snapshot de flashcards** accesible desde este entorno (agente: `521` / `ENOTFOUND` en `*.supabase.co`) |
| **Backup pre-migración** | No existe en repo ni artefactos gate-logs |
| **Revert manual disciplinado** | **Aplicado** — ver § Evidencia |

---

## Identidad de cuentas

> **Actualización operador (2026-08-09):** `marcosdadra@gmail.com` y `elverabel@yahoo.com.ar` confirmadas como **cuentas de prueba**. Gravedad reclasificada a baja; el inventario y el análisis técnico se mantienen.

### `marcosdadra@gmail.com` — cuenta interna / smoke Pro

| Campo | Valor |
|-------|-------|
| Nombre | Marcos Dadone |
| Plan | **pro** |
| En repo | Sí — `scripts/activate-pro.mjs`, `M15-PROD-HTTP-POINT3`, smoke post-deploy |
| Gravedad | Media — datos de prueba del operador, pero en prod real |

### `elverabel@yahoo.com.ar` — **usuario real probable**

| Campo | Valor |
|-------|-------|
| Nombre | `elverabel` |
| Plan | **free** (de/es B1) |
| En repo | **No** — primera aparición en enumeración blob 2026-08-09 |
| Supabase | `0cca4fb2-c901-4728-8a21-c6b07d37a710` |
| Deck | 71 flashcards |
| Señales | Email Yahoo `.ar` (Argentina), cuenta free con vocabulario real; **no** listada como staging |
| Gravedad | **Alta** — modificación no autorizada de datos de usuario en producción |

---

## Inventario completo — cambios de la migración errónea

Campo `surface` = palabra **antes** de la migración (evidencia primaria para revert).

### `elverabel@yahoo.com.ar` — 16 entradas (todas no autorizadas)

| id | antes (`surface`) | después (erróneo) | notas |
|----|-------------------|-------------------|-------|
| `fc_mr0fum7i_5np49to` | `alle` | `allen` | §2b — no verbo |
| `fc_mr0fum7i_h450xj5` | `aller` | `allen` | §2b |
| `fc_mr0fum7i_qz624av` | `außerdem` | `außerdemen` | §2b — adverbio |
| `fc_mqz1die2_vs1qduo` | `ber` | `beren` | §2b — fragmento |
| `fc_mqz1die2_nu84pgu` | `Experten` | `experten` | §2b — sustantivo |
| `fc_mqy0wd6d_isrr1od` | **`Dienste`** | **`nsten`** | **corrupción** — `surface` quedó `nste`; revert manual |
| `fc_mqy0wd6e_0ldpjny` | `ohne` | `ohnen` | §2b — preposición/adv |
| `fc_mqusxlgj_31pfv7j` | `angemeldet` | `angemeldeten` | §2b — participio/adj |
| `fc_mqtn77jy_gzwymug` | `bietet` | `bieten` | finita → infinitivo (no P0+P1 aprobado en esta cuenta) |
| `fc_mqtn77k0_n9zcq54` | `Mahlzeiten` | `mahlzeiten` | §2b — sustantivo |
| `fc_mqtn77k1_mp3wcvk` | `schmeckt` | `schmecken` | finita |
| `fc_mqtn77k1_nlvrnvf` | `schnelle` | `schnellen` | §2b — adj |
| `fc_mqxjks8q_vx5njfd` | `brauche` | `brauchen` | finita |
| `fc_mqtn77k1_i7lnw9b` | `lange` | `langen` | §2b |
| `fc_mqxjks8q_i575pvo` | `passt` | `pasen` | finita (lemma incorrecto) |
| `fc_mqt9i80x_8t7jvm8` | `kompliziert` | `kompliziern` | §2b — participio/adj |

### `marcosdadra@gmail.com` — 13 entradas tocadas

#### No autorizadas (§2b / fuera de P0+P1) — **7 entradas**

| id | antes | después (erróneo) |
|----|-------|-------------------|
| `fc_mruh6vv8_2skpi5z` | `konzentrierter` | `konzentrierten` |
| `fc_mruh6vv8_h3ipr7y` | `ermöglicht` | `ermöglichten` |
| `fc_mqtbszbu_9p5kp2c` | `billiger` | `billigen` |
| `fc_mqsgkaxk_x6okc1o` | `ausgebildetes` | `ausgebildeten` |
| `fc_mqqco3eb_7v41uoa` | `vielfältiger` | `vielfältigen` |
| `fc_mqqco3eb_bdbqc1a` | `Laufen` | `laufen` |
| `fc_mqqco3eb_cfe2okw` | `Laufen` | `laufen` |

*(El informe inicial hablaba de "2-3"; el inventario real post-migración son **7** no autorizadas.)*

#### P0+P1 aprobadas pero también revertidas — **6 entradas**

Revertidas porque el criterio del incidente es **estado previo a la primera pasada errónea** (incluye deshacer P0+P1 hasta re-ejecutar migrate con script corregido).

| id | antes | después (erróneo) | P0+P1 |
|----|-------|-------------------|-------|
| `fc_mruh6vv7_2geemrg` | `abnimmt` | `abnehmen` | ✓ |
| `fc_mruh6vv7_fy44as1` | `Bezahlen` | `bezahlen` | ✓ |
| `fc_mruh6vv7_u172mif` | `bezahlt` | `bezahlen` | ✓ |
| `fc_mqtbvrj1_ywsua7g` | `verbessert` | `verbessern` | ✓ |
| `fc_mqqco3ea_a5ghmra` | `Schätzen` | `schätzen` | ✓ |
| `fc_mruh6vv9_n6gply3` | `Hauptfilmen` | `hauptfilmen` | borderline |

---

## Revert aplicado

**Script:** `scripts/dev/revert-erroneous-verb-migration.mjs`  
**Comando:** `node scripts/dev/revert-erroneous-verb-migration.mjs --all-affected --apply`  
**Fecha:** 2026-08-09

Lógica:
1. `fc.word ← fc.surface` para cada fila con `surface`
2. Eliminar `surface`, `verbLemma`, `lemmaNormalized`, `conjugation` (añadidos por enrich erróneo)
3. Override manual `fc_mqy0wd6d_isrr1od`: `word=Dienste`, `type=noun`, `article=die`, `gender=f`

### Verificación post-revert

| Cuenta | `surface` restantes | Palabras restauradas | Match |
|--------|---------------------|----------------------|-------|
| `elverabel@yahoo.com.ar` | **0** | 16/16 | ✓ |
| `marcosdadra@gmail.com` | **0** | 13/13 | ✓ |

Dry-run posterior: **0 cambios pendientes**.

---

## Evidencia (artefactos)

Directorio: `batches/ready/gate-logs/incident-verb-migrate-2026-08-09/`

| Archivo | Contenido |
|---------|-----------|
| `elverabel_yahoo_com_ar-PRE-REVERT-touched.json` | Estado erróneo antes del revert (16 filas) |
| `marcosdadra_gmail_com-PRE-REVERT-touched.json` | Estado erróneo antes del revert (13 filas) |
| `revert-apply-log.json` | Diff before/after por id (apply) |
| `*-POST-REVERT-verify.json` | Verificación surface=0 + palabras esperadas |

---

## Limitaciones / confianza

| Tema | Nivel de confianza |
|------|-------------------|
| Restauración de `word` | **Alta** — `surface` escrito atómicamente por la migración |
| `Dienste` | **Alta** — log de migración `before: Dienste`; no confiar en `surface=nste` |
| `verbLemma` / `conjugation` pre-existentes | **Media** — eliminados en revert; sin snapshot no se puede probar si alguno existía antes del 2026-08-09 |
| POS (`type`) en entradas §2b | **Media** — revert no re-taguea POS original; muchas quedaron `verb` por inferencia previa |

**Acción pendiente (operador):** Si Supabase guarda copia de sync más antigua en máquina con acceso, comparar como auditoría extra. No bloquea cierre del incidente blob.

**Acción pendiente (§2):** Re-ejecutar `--migrate` **solo P0+P1** en `marcosdadra@gmail.com` cuando el operador apruebe, con script corregido.

### Re-migrate P0+P1 aprobado (2026-08-09, post-confirmación operador)

**Comando:** `node scripts/dev/scan-user-vocab-verb-forms.mjs --email marcosdadra@gmail.com --migrate`

| antes | después | reason | notas |
|-------|---------|--------|-------|
| `abnimmt` | `abnehmen` | p0 | ✓ aprobado |
| `Bezahlen` | `bezahlen` | p1 | ✓ |
| `bezahlt` | `bezahlen` | p0 | ✓ |
| `verbessert` | `verbessern` | p0 | ✓ |
| `Schätzen` | `schätzen` | p1 | ✓ |
| `ermöglicht` | `ermöglichten` | p0 | ✗ §2b FP — revertido inmediatamente |
| `Laufen` | `laufen` | p1 | ✗ §2b FP (×2) — revertido inmediatamente |

Post-migrate scan marcosdadra: **0** elegibles P0+P1 restantes (tras revert §2b FP).  
`elverabel@yahoo.com.ar`: **no migrado** (12 elegibles en scan; sin `--migrate`).

**Fix script:** scan/migrate ahora llama `enrichVerbConjugation` antes de `migrationEligible` (necesario tras revert que eliminó `verbLemma`). Flag `--email` añadido.

---

## Prevención

1. `--migrate` debe exigir flag explícito `--confirm-prod` o lista `--email` (no `--all` silencioso)
2. Dry-run obligatorio en CI antes de migrate
3. Export snapshot JSON pre-migrate a `gate-logs/` automáticamente
4. Tests de regresión: `migrateFlashcards` no muta filas donde `migrationEligible` es null

### §2b guard fix (2026-08-09)

**Diagnóstico raíz:**

| Caso | Por qué pasaba | Fix |
|------|----------------|-----|
| `ermöglicht` | `toLemma` hace `stem+en` → `ermöglichten`; `presentRegularDe` acepta cualquier `-en` como verbo regular aunque el real sea `ermöglichen` | `isFakeParticipleEnLemma` + `looksLikePartizipIiMisparse` + P0 exige `isAttestedFiniteForm` |
| `Laufen` | P1 (capitalización); filas tienen `article:das`, `gender:n` — sustantivo nominalizado mal tagueado como verbo | `looksLikeNominalizedInfinitiveNoun` rechaza P1 cuando hay metadata nominal |
| `alle`, `ohne`, etc. | Round-trip falso: `presentRegularDe(allen).ich === alle` | P0 sintético ignora formas ich/wir/sie |
| `passt` | `FINITE_TO_INF[passt]=passen` pero `toLemma` inventa `pasen`; `du=passt` en conjugación sintética | Rechazo si `FINITE_TO_INF[surface] !== lemma` |

**Scan post-fix (sin migrar):** `elverabel@yahoo.com.ar` **12 → 3** elegibles (`bietet`, `schmeckt`, `brauche` — finitas reales). `marcosdadra@gmail.com`: **0**.

---

## Registro de deuda técnica

| ID | Descripción | Estado |
|----|-------------|--------|
| **INC-VERB-MIGRATE-2026-08-09** | Migración §2 fuera de alcance P0+P1 en prod blobs | **Cerrado — revert verificado** |
| **§2b POS noise** | Sust/adj/adv mal tagueados como verbo | Pendiente — no migrar |
