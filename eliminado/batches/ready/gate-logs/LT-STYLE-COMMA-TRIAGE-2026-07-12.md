# LanguageTool style/comma backlog triage — 2026-07-12

**Source:** `batches/ready/gate-logs/languagetool-audit-2026-07-11.json`  
(audit of 134 pool files, `generatedAt: 2026-07-11T12:37:27.378Z`)

**Target rules:** `KOMMA_*`, `FEHLERHAFTES_KOMMA_ALLG`, `COMPOUND_INFINITIV_RULE`, `ART_ADJ_SOL`, `DE_AGREEMENT`, `GERMAN_WORD_REPEAT_BEGINNING_RULE`

**Count:** 11 matches (matches the ~9–12 backlog estimate)

---

## Cases

### 1. FIX — `horen-t2-gemini-019.json` · `KOMMA_ZWISCHEN_HAUPT_UND_NEBENSATZ_2`

- **Context:** `Hallo zusammen, schön dass Sie einschalten.`
- **LT:** → `schön, dass`
- **Verdict:** Real error. `dass`-clause after `schön` needs the comma.
- **Before:** `schön dass Sie einschalten`
- **After:** `schön, dass Sie einschalten`
- **Re-LT:** 0 matches on passage (target rules and overall).

### 2. LEAVE — `horen-t3-gemini-003.json` · `DE_AGREEMENT`

- **Context:** `Ich habe einen digitalen Detox gemacht.`
- **LT:** → `einem` / `eines digitalen Detox`
- **Verdict:** False positive. Accusative after `habe … gemacht` is required; LT’s dative/genitive suggestions are syntactically wrong. Gender of loanword *Detox* is unstable; masculine `einen digitalen` is an accepted reading.

### 3. LEAVE — `horen-t3-gemini-003.json` · `FEHLERHAFTES_KOMMA_ALLG`

- **Context:** `Lena: Klar, im Alltag ist es schwer.`
- **LT:** remove comma after `Klar`
- **Verdict:** Style FP. Comma after discourse particle `Klar` (= yes/sure) is standard, same class as `Ja, …` / `Nein, …`.

### 4. LEAVE — `horen-t3-gemini-003.json` · `ART_ADJ_SOL`

- **Context:** `Vielleicht mache ich das nächstes Wochenende.`
- **LT:** → `das nächste Wochenende` (treats `das` as article)
- **Verdict:** Parse FP. Here `das` = demonstrative object (“do that”), `nächstes Wochenende` = bare time adverbial. That reading is grammatical; forcing weak inflection after article would change the structure.

### 5. LEAVE — `horen-t4-gemini-008.json` · `KOMMA_VOR_UND_ODER`

- **Context:** `… Frau Dr. Hannah Schneider, eine Familienforscherin, und Herrn Erik Weber, …`
- **LT:** remove comma before `und`
- **Verdict:** FP on apposition. Closing comma of the apposition is required; it only happens to sit before coordinating `und`.

### 6. LEAVE — `lesen-t1-gemini-075.json` · `COMPOUND_INFINITIV_RULE`

- **Context:** `das Auto stehen zu lassen`
- **LT:** → `stehenzulassen`
- **Verdict:** Optional orthography. Spaced `stehen zu lassen` is allowed and clearer for B1; not a hard error.

### 7. LEAVE — `lesen-t1-gemini-081.json` · `COMPOUND_INFINITIV_RULE`

- **Context:** `um den Kopf frei zu bekommen`
- **LT:** → `freizubekommen`
- **Verdict:** Style. Predicative `frei` + `bekommen` is fine; closed infinitive is optional preference.

### 8. LEAVE — `lesen-t1-gemini-086.json` · `COMPOUND_INFINITIV_RULE`

- **Context:** `den Kopf … frei zu bekommen`
- **LT:** → `freizubekommen`
- **Verdict:** Same as #7 — leave.

### 9. LEAVE — `lesen-t1-gemini-090.json` · `GERMAN_WORD_REPEAT_BEGINNING_RULE`

- **Context:** consecutive sentences starting with `Ich` near the end of a first-person blog.
- **Verdict:** Style only. Natural B1 diary/blog voice; rewriting for variety is not a grammar fix.

### 10. LEAVE — `lesen-t1-gemini-119.json` · `GERMAN_WORD_REPEAT_BEGINNING_RULE`

- **Context:** `Ich kann … / Ich habe … / Ich freue mich …`
- **Verdict:** Same as #9 — leave.

### 11. LEAVE — `lesen-t1-gemini-137.json` · `GERMAN_WORD_REPEAT_BEGINNING_RULE`

- **Context:** three adjacent `Ich habe …` sentences.
- **Verdict:** Same as #9 — leave.

---

## Summary of actions

| Action | Files |
|---|---|
| Corrected | `horen-t2-gemini-019.json` (1 comma) |
| Left unchanged | 10 other matches across 6 files |

**Machine extract:** `batches/ready/gate-logs/_lt-style-comma-extract-2026-07-12.json`
