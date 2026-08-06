#!/usr/bin/env python3
"""Fast G1 simulation against v6.1-B baseline report."""
from __future__ import annotations

import importlib.util
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

spec = importlib.util.spec_from_file_location("pos_caps", ROOT / "scripts/pos-caps-check.py")
pc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pc)

GT = json.loads((ROOT / "scripts/lib/__tests__/germanCapsGate.groundtruth.json").read_text(encoding="utf-8"))
BASELINE = json.loads((ROOT / "batches/ready/german-caps-gate-report-v6.1-B.json").read_text(encoding="utf-8"))
READY = ROOT / "batches/ready/lesen"

SUBST_LEMMAS = {"junge", "deutschen", "freie", "hamburger", "yogalehrer"}


def prose_g1_skip(token, regime: str) -> tuple[bool, str]:
    if pc.normalize_regime(regime) != pc.REGIME_PROSE:
        return False, "not_prose"
    if not pc.is_adjective_before_following_noun(token):
        return False, "not_adj_before_noun_pattern"
    if pc.is_quantifier_adjective_error(token):
        return False, "block_quantifier"
    lw = token.text.lower()
    if lw in {"viele", "vielen", "vielem", "vieler", "ganzen", "ganzes", "ganze", "ganzer"}:
        return False, "block_quantifier_lemma"
    if token.tag_ == "PIAT":
        return False, "block_piat"
    if token.tag_ != "ADJA":
        return False, "not_adja"
    prev = pc.prev_token(token)
    if prev and prev.pos_ == "NOUN":
        return False, "block_noun_prev_genitive_chain"
    return True, (
        "G1: tag=ADJA, PIAT/quantifier blocked, prev.pos≠NOUN, "
        "is_adjective_before_following_noun → substantivized modifier"
    )


def load_texts():
    cache = {}
    for path in sorted(READY.glob("*.json")):
        if path.name.startswith("."):
            continue
        batch = json.loads(path.read_text(encoding="utf-8"))
        for p in batch.get("passages") or []:
            if p.get("text"):
                cache[(path.name, "passages.text", p["text"][:80])] = p["text"]
        for q in batch.get("questions") or []:
            for k, field in [
                ("question", "questions.question"),
                ("signText", "questions.signText"),
                ("explanation", "questions.explanation"),
                ("statement", "questions.statement"),
            ]:
                if q.get(k):
                    cache[(path.name, field, q[k][:80])] = q[k]
            for opt in q.get("options") or []:
                s = opt if isinstance(opt, str) else opt.get("text")
                if s:
                    cache[(path.name, "questions.options", s[:80])] = s
    return cache


def resolve_text(file, field, context, word, texts_by_file):
    for path in sorted(READY.glob(file)):
        batch = json.loads(path.read_text(encoding="utf-8"))
        candidates = []
        if field == "passages.text":
            for p in batch.get("passages") or []:
                if p.get("text") and word in p["text"]:
                    candidates.append(p["text"])
        elif field.startswith("questions."):
            sub = field.split(".", 1)[1]
            for q in batch.get("questions") or []:
                if sub == "options":
                    for opt in q.get("options") or []:
                        s = opt if isinstance(opt, str) else opt.get("text")
                        if s and word in s:
                            candidates.append(s)
                elif q.get(sub) and word in q[sub]:
                    candidates.append(q[sub])
        for t in candidates:
            if context and context.strip()[:40] in t:
                return t
        if len(candidates) == 1:
            return candidates[0]
        if candidates:
            return candidates[0]
    return context or ""


def batch_regimes(unique_items):
    payload = json.dumps([{"key": k, **v} for k, v in unique_items.items()], ensure_ascii=False)
    r = subprocess.run(
        ["node", str(ROOT / "scripts/_batch-regimes.mjs")],
        input=payload,
        cwd=ROOT,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    regimes = {}
    for line in r.stdout.splitlines():
        if not line.strip():
            continue
        o = json.loads(line)
        regimes[o["key"]] = o["regime"]
    return regimes


def flatten_baseline():
    rows = []
    for file, arr in BASELINE.get("byFile", {}).items():
        for f in arr:
            rows.append({**f, "file": file})
    return rows


def find_token(doc, word, context):
    matches = [t for t in doc if t.text == word or t.text.lower() == word.lower()]
    if len(matches) == 1:
        return matches[0]
    for t in matches:
        snip = pc.context_snippet(doc, t)
        if context and context.strip()[:30] in snip:
            return t
    return matches[0] if matches else None


def analyze_text_g1(text, field, file, regime):
    nlp = pc.load_nlp()
    doc = nlp(text)
    regime, _ = pc.refine_regime(text, field, regime, doc)
    findings = []
    for tok in doc:
        if not tok.is_alpha:
            continue
        wrong = pc.should_flag_wrong_capitalized(tok, nlp, text, field, regime)
        if not wrong:
            continue
        skip, _ = prose_g1_skip(tok, regime)
        if wrong.get("reason") == "adj_before_noun" and skip:
            continue
        findings.append({**wrong, "word": tok.text, "regime": regime})
    return findings


def gt_text(spec):
    if spec.get("text"):
        return spec["text"], spec.get("field", "passages.text"), spec.get("file", "synthetic.json")
    pool = ROOT / "batches/generated" if spec.get("pool") == "generated" else READY
    path = pool / spec["file"]
    batch = json.loads(path.read_text(encoding="utf-8"))
    if spec["field"] == "passages.text":
        idx = spec.get("passageIndex", 0)
        return batch["passages"][idx]["text"], spec["field"], spec["file"]
    if spec["field"] == "questions.options":
        for q in batch.get("questions") or []:
            for opt in q.get("options") or []:
                s = opt if isinstance(opt, str) else opt.get("text")
                if s and spec["token"] in s:
                    return s, spec["field"], spec["file"]
    if spec["field"] == "questions.question":
        for q in batch.get("questions") or []:
            if spec["token"] in (q.get("question") or ""):
                return q["question"], spec["field"], spec["file"]
    if spec["field"] == "questions.explanation":
        for q in batch.get("questions") or []:
            if spec["token"] in (q.get("explanation") or ""):
                return q["explanation"], spec["field"], spec["file"]
    if spec["field"] == "questions.signText":
        for q in batch.get("questions") or []:
            if spec["token"] in (q.get("signText") or ""):
                return q["signText"], spec["field"], spec["file"]
    return None, None, None


def main():
    pc.load_lexicon()
    nlp = pc.load_nlp()
    baseline_rows = flatten_baseline()
    print(f"Baseline report: {len(baseline_rows)} findings (expected {BASELINE.get('totalFindings')})")

    unique = {}
    for f in baseline_rows:
        text = resolve_text(f["file"], f["field"], f.get("context", ""), f["word"], {})
        key = f"{f['file']}|{f['field']}|{hash(text)}"
        unique[key] = {"file": f["file"], "field": f["field"], "text": text}

    regimes = batch_regimes(unique)

    eliminated = []
    kept = []
    for f in baseline_rows:
        text = resolve_text(f["file"], f["field"], f.get("context", ""), f["word"], {})
        key = f"{f['file']}|{f['field']}|{hash(text)}"
        regime = regimes.get(key, pc.REGIME_PROSE)
        doc = nlp(text)
        regime, _ = pc.refine_regime(text, f["field"], regime, doc)
        tok = find_token(doc, f["word"], f.get("context", ""))
        if not tok:
            kept.append(f)
            continue
        wrong = pc.should_flag_wrong_capitalized(tok, nlp, text, f["field"], regime)
        if not wrong or wrong.get("reason") != "adj_before_noun":
            kept.append(f)
            continue
        skip, g1_reason = prose_g1_skip(tok, regime)
        if skip:
            prev = pc.prev_token(tok)
            nxt = pc.next_token(tok)
            eliminated.append({
                "token": tok.text,
                "file": f["file"],
                "field": f["field"],
                "regime": regime,
                "reason": f.get("reason"),
                "sentence": tok.sent.text.strip(),
                "full_text": text,
                "context": f.get("context", ""),
                "pos": tok.pos_,
                "tag": tok.tag_,
                "prev": {"word": prev.text if prev else "", "pos": prev.pos_ if prev else "", "tag": prev.tag_ if prev else ""},
                "next": {"word": nxt.text if nxt else "", "pos": nxt.pos_ if nxt else "", "tag": nxt.tag_ if nxt else ""},
                "dep": tok.dep_,
                "head": tok.head.text,
                "g1_reason": g1_reason,
                "structure_group": "ADJ sustantivado + NOUN" if tok.text.lower() in SUBST_LEMMAS else "other",
            })
        else:
            kept.append(f)

    # MUST_CATCH
    gt_items = []
    for spec in GT["MUST_CATCH"]:
        text, field, file = gt_text(spec)
        if not text:
            continue
        k = f"gt|{spec['id']}"
        gt_items.append((k, text, field, file, spec))

    gt_unique = {k: {"file": file, "field": field, "text": text} for k, text, field, file, _ in gt_items}
    gt_regimes = batch_regimes(gt_unique)

    catch_affected = []
    catch_ok = 0
    for k, text, field, file, spec in gt_items:
        regime = gt_regimes.get(k, pc.REGIME_PROSE)
        before = analyze_text_g1(text, field, file, regime)
        hit_before = any(x["word"].lower() == spec["token"].lower() for x in before) or any(
            pc.should_flag_wrong_capitalized(t, nlp, text, field, regime)
            and (t.text.lower() == spec["token"].lower())
            for t in nlp(text)
            if t.is_alpha
        )
        # proper check
        doc = nlp(text)
        regime, _ = pc.refine_regime(text, field, regime, doc)
        found_before = False
        found_after = False
        for tok in doc:
            if tok.text.lower() != spec["token"].lower():
                continue
            wrong = pc.should_flag_wrong_capitalized(tok, nlp, text, field, regime)
            if wrong:
                found_before = True
                skip, _ = prose_g1_skip(tok, regime)
                if wrong.get("reason") == "adj_before_noun" and skip:
                    pass
                else:
                    found_after = True
        if found_before and not found_after:
            catch_affected.append({**spec, "regime": regime})
        elif found_after:
            catch_ok += 1

    # MUST_NOT_FLAG
    mn_affected = []
    mn_ok = 0
    for spec in GT["MUST_NOT_FLAG"]:
        text, field, file = gt_text(spec)
        regime = batch_regimes({f"mn|{spec['id']}": {"file": file, "field": field, "text": text}})[f"mn|{spec['id']}"]
        doc = nlp(text)
        regime, _ = pc.refine_regime(text, field, regime, doc)
        flags_before = []
        flags_after = []
        for tok in doc:
            if not tok.is_alpha:
                continue
            wrong = pc.should_flag_wrong_capitalized(tok, nlp, text, field, regime)
            if not wrong:
                continue
            flags_before.append(wrong)
            skip, _ = prose_g1_skip(tok, regime)
            if wrong.get("reason") == "adj_before_noun" and skip:
                continue
            flags_after.append(wrong)
        if flags_before:
            if not flags_after:
                mn_affected.append({**spec, "note": "all_findings_removed_by_g1", "before": flags_before})
            elif len(flags_after) < len(flags_before):
                mn_affected.append({**spec, "before_n": len(flags_before), "after_n": len(flags_after)})
        else:
            mn_ok += 1

    substant = [e for e in eliminated if e["token"].lower() in SUBST_LEMMAS]
    extra = [e for e in eliminated if e not in substant]

    report = {
        "simulation": "G1_only_v6.1-B_baseline",
        "g1_definition": {
            "scope": "PROSE only, reason=adj_before_noun only",
            "skip_when": [
                "tag_ == ADJA",
                "NOT PIAT",
                "NOT is_quantifier_adjective_error",
                "NOT quantifier lemmas (viele/vielen/ganzen/...)",
                "prev.pos != NOUN",
            ],
        },
        "baseline_total": len(baseline_rows),
        "after_g1_total": len(kept),
        "eliminated_count": len(eliminated),
        "substantivized_fp_eliminated": len(substant),
        "expected_substantivized": 14,
        "extra_eliminated": extra,
        "must_catch_affected_count": len(catch_affected),
        "must_catch_affected": catch_affected,
        "must_not_flag_affected_count": len(mn_affected),
        "must_not_flag_affected": [{k: v for k, v in x.items() if k != "before"} for x in mn_affected],
        "eliminated": eliminated,
        "remaining_adj_before_noun": [f for f in kept if f.get("reason") == "adj_before_noun"],
    }

    out_json = ROOT / "batches/ready/g1-simulation-diff-v6.1-B.json"
    out_md = ROOT / "batches/ready/g1-simulation-diff-v6.1-B.md"
    out_json.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    lines = [
        "# Simulación G1 — pool v6.1-B",
        "",
        f"- **Baseline:** {len(baseline_rows)} findings",
        f"- **Tras G1:** {len(kept)} findings (−{len(eliminated)})",
        f"- **MUST_CATCH afectados:** {len(catch_affected)} (objetivo: 0)",
        f"- **MUST_NOT_FLAG afectados:** {len(mn_affected)}",
        f"- **Grupo sustantivado eliminado:** {len(substant)}/14",
        "",
    ]
    if extra:
        lines.append(f"- **Extra eliminados (fuera del grupo 14):** {len(extra)}")
        for e in extra:
            lines.append(f"  - `{e['token']}` en `{e['file']}` / `{e['field']}` ({e.get('reason')})")
        lines.append("")

    lines.append("## 14 findings sustantivados eliminados por G1")
    lines.append("")
    for i, e in enumerate(substant, 1):
        lines += [
            f"### {i}. `{e['token']}` — `{e['file']}` / `{e['field']}`",
            f"- **Frase:** {e['sentence']}",
            f"- **POS/tag:** {e['pos']}/{e['tag']}",
            f"- **Prev:** {e['prev']['word']} ({e['prev']['pos']}/{e['prev']['tag']})",
            f"- **Next:** {e['next']['word']} ({e['next']['pos']}/{e['next']['tag']})",
            f"- **dep/head:** {e['dep']} → {e['head']}",
            f"- **G1 motivo:** {e['g1_reason']}",
            "",
        ]

    out_md.write_text("\n".join(lines), encoding="utf-8")
    print(f"Baseline: {len(baseline_rows)} → After G1: {len(kept)} (eliminated {len(eliminated)})")
    print(f"MUST_CATCH affected: {len(catch_affected)}")
    print(f"MUST_NOT_FLAG affected: {len(mn_affected)}")
    print(f"Substantivized: {len(substant)}/14, extra: {len(extra)}")
    print(f"Written: {out_json}")
    print(f"Written: {out_md}")


if __name__ == "__main__":
    main()
