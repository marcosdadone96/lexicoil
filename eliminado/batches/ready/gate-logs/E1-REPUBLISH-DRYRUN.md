# e1 republication dry-run (from bank AUD-4/4b)

**Fecha:** 2026-07-10T09:09:41.123Z
**Assembled:** `assembled-exam-b1-e1.json`
**Seed overlay:** `batches\ready\gate-logs\e1-republish-seed-overlay.json` (12 parts)

## Copia literal ≥4 vs e1

Ninguno de los 6 casos de opción correcta calcada está en e1 → **no hay reparación de copia en esta republicación**.

## publish-exam --dry-run --local-only

✓ Capture OK (0 missing parts). Preview abajo / en stdout de la corrida.

```
=== publish-exam DRY-RUN ===
  from:    assembled-exam-b1-e1.json
  examId:  official-de-B1-e1  slot=1
  seed:    library\reusable-seed\de_B1.json
  overlay: batches\ready\gate-logs\e1-republish-seed-overlay.json (12 records)
  store:   local-seed-only

=== published_exam shape (preview) ===

{
  "examId": "official-de-B1-e1",
  "slot": 1,
  "title": "Official B1 Exam 1",
  "status": "live",
  "manifestVersion": 1,
  "publishedAt": "2026-07-10T09:09:41.104Z",
  "partCount": 12,
  "parts": [
    {
      "cell": "lesen_1",
      "partId": "lesen-t1-gemini-154",
      "contentHash": "fc9bf3488fb9"
    },
    {
      "cell": "lesen_2",
      "partId": "lesen-t2-gemini-064",
      "contentHash": "361d68345765"
    },
    {
      "cell": "lesen_3",
      "partId": "lesen-t3-auto-001",
      "contentHash": "269ae3caf631"
    },
    {
      "cell": "lesen_4",
      "partId": "lesen-t4-gemini-004",
      "contentHash": "29f85e0f0e4e"
    },
    {
      "cell": "lesen_5",
      "partId": "lesen-t5-gemini-016",
      "contentHash": "cc8169b7296f"
    },
    {
      "cell": "horen_1",
      "partId": "horen-t1-gemini-001",
      "contentHash": "fd1cd3eb9ded"
    },
    {
      "cell": "horen_2",
      "partId": "horen-t2-gemini-003",
      "contentHash": "773a4cea4f36"
    },
    {
      "cell": "horen_3",
      "partId": "horen-t3-gemini-002",
      "contentHash": "e494df7324e6"
    },
    {
      "cell": "horen_4",
      "partId": "gen-h4-010",
      "contentHash": "cf41a94f60b9"
    },
    {
      "cell": "schreiben_1",
      "partId": "snap-de-B1-e00-schreiben-t1-71d171b091300532",
      "contentHash": "d361bf288198"
    },
    {
      "cell": "schreiben_2",
      "partId": "snap-de-B1-e00-schreiben-t2-6d54d88459fd91d1",
      "contentHash": "0f6d5bb90139"
    },
    {
      "cell": "schreiben_3",
      "partId": "snap-de-B1-e00-schreiben-t3-d0735e9120b7efd8",
      "contentHash": "02f951c97b4c"
    }
  ]
}

--- parts: partId + contentHash (full hash in doc) ---

  lesen_1         lesen-t1-gemini-154
                  hash=fc9bf3488fb936af901d0e51affd8754715000d40e7cc9adceb49409bc9cbd78  (local-seed)
  lesen_2         lesen-t2-gemini-064
                  hash=361d68345765e644f9c6045b9f8bb9c8841e04c254b1b25c0421029caf18f199  (local-seed)
  lesen_3         lesen-t3-auto-001
                  hash=269ae3caf63118ca0ffbaa0b05a7b36b5f905f2c68794c45ba8e74b3c351a307  (local-seed)
  lesen_4         lesen-t4-gemini-004
                  hash=29f85e0f0e4ed3d8aad7752e802f948ba2258ad49f9225f6ad7a387ac44e72b8  (local-seed)
  lesen_5         lesen-t5-gemini-016
                  hash=cc8169b7296f54024fcd45bfe62ce895bdd268ec30ba50e8ea562fd86f18a9aa  (local-seed)
  horen_1         horen-t1-gemini-001
                  hash=fd1cd3eb9ded3cb1a3b82d01ffd212b8007fee0fa09ae916c1d66a47c9422de9  (local-seed)
  horen_2         horen-t2-gemini-003
                  hash=773a4cea4f367999127943ef11a9f440481809162fde12c96d49f7a8aa2074be  (local-seed)
  horen_3         horen-t3-gemini-002
                  hash=e494df7324e600b970506cefb139f42092d34c72a6aeda851541f32b7a0e5f6d  (local-seed)
  horen_4         gen-h4-010
                  hash=cf41a94f60b90d59a108c4eeb197c23db7e53d7dcf5cec638d3a1f0a9abea064  (local-seed)
  schreiben_1     snap-de-B1-e00-schreiben-t1-71d171b091300532
                  hash=d361bf288198f907b1a40851e18f9b4498a95b628be7ab9596c7a087b0283138  (local-seed)
  schreiben_2     snap-de-B1-e00-schreiben-t2-6d54d88459fd91d1
                  hash=0f6d5bb901392f719b220b3c2a4776bd5fceb5fa9d5307b19a0173a9c5bc4309  (local-seed)
  schreiben_3     snap-de-B1-e00-schreiben-t3-d0735e9120b7efd8
                  hash=02f951c97b4c14dd912f2001e5706ed5ddc5ed20489dcae72a341460edfa5ae5  (local-seed)

--- example part entry (lesen_3 only, snapshot truncated) ---

{
  "cell": "lesen_3",
  "partId": "lesen-t3-auto-001",
  "contentHash": "269ae3caf63118ca0ffbaa0b05a7b36b5f905f2c68794c45ba8e74b3c351a307",
  "snapshot": {
    "id": "lesen-t3-auto-001",
    "lang": "d

```

## contentHash diffs (publicado → overlay banco)

| Cell | partId | old | new | changed |
|---|---|---|---|---|
| lesen_1 | `lesen-t1-gemini-154` | `67b5fedee3d9` | `fc9bf3488fb9` | YES |
| lesen_2 | `lesen-t2-gemini-064` | `90ace7b22034` | `361d68345765` | YES |
| lesen_3 | `lesen-t3-auto-001` | `269ae3caf631` | `269ae3caf631` | no |
| lesen_4 | `lesen-t4-gemini-004` | `29f85e0f0e4e` | `29f85e0f0e4e` | no |
| lesen_5 | `lesen-t5-gemini-016` | `7c961fc0ea42` | `cc8169b7296f` | YES |
| horen_1 | `horen-t1-gemini-001` | `cf15773dd45d` | `fd1cd3eb9ded` | YES |
| horen_2 | `horen-t2-gemini-003` | `773a4cea4f36` | `773a4cea4f36` | no |
| horen_3 | `horen-t3-gemini-002` | `e494df7324e6` | `e494df7324e6` | no |
| horen_4 | `gen-h4-010` | `cf41a94f60b9` | `cf41a94f60b9` | no |
| schreiben_1 | `snap-de-B1-e00-schreiben-t1-71d171b091300532` | `d361bf288198` | `d361bf288198` | no |
| schreiben_2 | `snap-de-B1-e00-schreiben-t2-6d54d88459fd91d1` | `0f6d5bb90139` | `0f6d5bb90139` | no |
| schreiben_3 | `snap-de-B1-e00-schreiben-t3-d0735e9120b7efd8` | `02f951c97b4c` | `02f951c97b4c` | no |

**Celdas con hash distinto:** 4
- lesen_1: passage.text:gen-l1-61b004a3, passage.topicTag:gen-l1-61b004a3, q.topicTags:gen-q-1-61b004a3-1, q.topicTags:gen-q-1-61b004a3-5, q.topicTags:gen-q-1-61b004a3-4, q.topicTags:gen-q-1-61b004a3-2, q.topicTags:gen-q-1-61b004a3-6, q.topicTags:gen-q-1-61b004a3-3
- lesen_2: passage.text:gen-l2-f5dd2b2c-1, passage.topicTag:gen-l2-f5dd2b2c-1, q.topicTags:gen-q-2-f5dd2b2c-1, q.topicTags:gen-q-2-f5dd2b2c-2, q.topicTags:gen-q-2-f5dd2b2c-3, q.topicTags:gen-q-2-f5dd2b2c-4, q.topicTags:gen-q-2-f5dd2b2c-5, q.topicTags:gen-q-2-f5dd2b2c-6
- lesen_5: passage.text:gen-l5-772fcef4, passage.topicTag:gen-l5-772fcef4, q.topicTags:gen-q-5-772fcef4-1, q.topicTags:gen-q-5-772fcef4-2, q.topicTags:gen-q-5-772fcef4-3, q.topicTags:gen-q-5-772fcef4-4
- horen_1: passage.topicTag:gen-p-h1-eac46715-s1, q.topicTags:gen-q-h1-eac46715-s1-q1, q.topicTags:gen-q-h1-eac46715-s1-q2, q.topicTags:gen-q-h1-eac46715-s2-q1, q.topicTags:gen-q-h1-eac46715-s2-q2, q.topicTags:gen-q-h1-eac46715-s3-q1, q.topicTags:gen-q-h1-eac46715-s3-q2, q.topicTags:gen-q-h1-eac46715-s4-q1

## Diff publicado vs banco (Lesen)

| Cell | partId | passageId | pub ** | bank ** | textsEqual | wouldChange |
|---|---|---|---|---|---|---|
| lesen_1 | `lesen-t1-gemini-154` | `gen-l1-61b004a3` | false | false | false | true |
| lesen_2 | `lesen-t2-gemini-064` | `gen-l2-f5dd2b2c-1` | false | false | false | true |
| lesen_3 | `lesen-t3-auto-001` | `—` | — | — | no matching bank passage | false |
| lesen_4 | `lesen-t4-gemini-004` | `—` | — | — | no matching bank passage | false |
| lesen_5 | `lesen-t5-gemini-016` | `gen-l5-772fcef4` | true | false | false | true |

**Partes Lesen que cambiarían:** 3
- lesen_1 (`gen-l1-61b004a3`): diff@402: pub «unternehmen wir oft Ausflüge in die Natur. Letzt» → bank «Unternehmen wir oft Ausflüge in die Natur. Letzt»
- lesen_2 (`gen-l2-f5dd2b2c-1`): diff@799: pub «Öffentliche Diskurs über die Wichtigkeit von Bew» → bank «öffentliche Diskurs über die Wichtigkeit von Bew»
- lesen_5 (`gen-l5-772fcef4`): AUD-4: quitar `**` del snapshot publicado

## Sync batches locales desde banco

- lesen_1 `lesen-t1-gemini-154` → batches\generated\lesen-t1-gemini-154.json (fields updated: 0)
- lesen_2 `lesen-t2-gemini-064` → batches\generated\lesen-t2-gemini-064.json (fields updated: 0)
- lesen_3 `lesen-t3-auto-001` → NO LOCAL BATCH (fields updated: 0)
- lesen_4 `lesen-t4-gemini-004` → batches\generated\lesen-t4-gemini-004.json (fields updated: 0)
- lesen_5 `lesen-t5-gemini-016` → batches\generated\lesen-t5-gemini-016.json (fields updated: 0)

## Cómo aplicar (cuando confirmes)

```bash
node scripts/publish-exam.mjs --from assembled-exam-b1-e1.json --apply --yes --local-only --seed-overlay batches/ready/gate-logs/e1-republish-seed-overlay.json
node scripts/sync-published-to-served.mjs --lang de --level B1 --apply
```

**Esta corrida NO ejecutó publish --apply ni sync-to-served.**
