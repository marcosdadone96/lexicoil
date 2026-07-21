# NOTES.md — Frontend markdown rendering

## passage.text in the exam UI

**Conclusion: markdown is NOT rendered.** Passage text is shown as **plain text** with HTML escaped. Sequences like `**Öffnungszeiten:**` appear literally to the user (this matches Q3-A `markdown_leak` findings on T5).

### Evidence in this bundle

1. **`js/ui/exam/examRunner.js`** (renderLesenPart):
   - Inserts passage via `wrapW(part.text, ...)` inside `<div class="readable-text">`.
   - No markdown parser (marked, markdown-it, etc.).

2. **`js/ui/vocabulary/tooltip.js`** (`wrapW`):
   - Calls `sanitizeExamText(text)` then `wrapLineW` / `formatReadableText`.
   - Vocab highlighting wraps words in `<span class="vocab-word">`; does not interpret `**`.

3. **`js/ui/exam/examGeneration.js`** (`sanitizeExamText`):
   - Strips HTML tags: `.replace(/<\/?[^>]+>/g, '')`
   - Converts `<br>` to newlines.
   - Does **not** strip or convert markdown syntax (`**`, `-` lists, `#` headers).

### Implication for fixes

- T5 `**Section:**` headers should be **removed or converted to plain German** at generation/normalization time, not left for the UI to render.
- Newlines in passage text are preserved (dialogue formatting via `formatReadableText`).

### Not included

- No standalone product doc previously described this behavior; this NOTES.md is the first explicit write-up.
- Confirm manually in browser if UX changed since this snapshot.
