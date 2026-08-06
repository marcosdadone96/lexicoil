#!/usr/bin/env python3
"""Simulate G2 PIAT determiner guard on G1.1 pool — no pipeline changes."""
from __future__ import annotations

import importlib.util
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

spec = importlib.util.spec_from_file_location("pc", ROOT / "scripts/pos-caps-check.py")
pc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pc)

GT = json.loads((ROOT / "scripts/lib/__tests__/germanCapsGate.groundtruth.json").read_text(encoding="utf-8"))
REPORT = json.loads((ROOT / "batches/ready/german-caps-gate-report-v6.1-B-G1.1.json").read_text(encoding="utf-8"))
READY = ROOT / "batches/ready/lesen"

PROTECTED = {
    ("lesen-t2-gemini-060.json", "passages.text", "viele"): "Viele Kinder",
    ("lesen-t2-gemini-089.json", "passages.text", "vielen"): "Vielen Städten",
    ("lesen-t1-gemini-174.json", "questions.question", "vielen"): "Vielen Medieninhalte",
    ("lesen-t5-gemini-061.json", "questions.options", "ganzen"): "Ganzen Tag",
}


def prose_g2_skip_piat_determiner(token, regime: str) -> tuple[bool, str]:
    """G2 candidate: skip PIAT after ART when following NOUN is object (oa/og), not subject (sb)."""
    if pc.normalize_regime(regime) != pc.REGIME_PROSE:
        return False, "not_prose"
    if token.tag_ != "PIAT":
        return False, "not_piat"
    if token.text.lower() not in {"viele", "vielen", "vielem", "vieler"}:
        return False, "not_viele_lemma"
    if not pc.is_adjective_before_following_noun(token):
        return False, "not_adj_before_noun_pattern"
    prev = pc.prev_token(token)
    if not prev or prev.tag_ != "ART":
        return False, "prev_not_art"
    if prev.text.lower() not in {"die", "der", "das", "den", "dem", "des"}:
        return False, "prev_not_def_art"
    nxt = pc.next_token(token)
    if not nxt or not (pc.is_noun_tag(nxt.tag_) or nxt.pos_ == "NOUN"):
        return False, "no_following_noun"
    if nxt.dep_ == "sb":
        return False, "block_subject_np_sb"
    if nxt.dep_ in {"oa", "og"}:
        return True, f"G2: ART+PIAT+ NOUN(dep={nxt.dep_}) object NP determiner"
    return False, "no_object_dep"


def resolve_text(file: str, field: str, word: str, context: str) -> str:
    batch = json.loads((READY / file).read_text(encoding="utf-8"))
    candidates = []
    if field == "passages.text":
        for p in batch.get("passages") or []:
            if p.get("text") and word in p["text"]:
                candidates.append(p["text"])
    else:
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
        if context and context.strip()[:35] in t:
            return t
    return candidates[0] if candidates else context


def node_regime(text: str, field: str, file: str) -> str:
    r = subprocess.run(
        ["node", "-e", f"""
import {{ classifyTextRegime }} from './scripts/lib/textRegime.mjs';
console.log(classifyTextRegime({{ text: {json.dumps(text)}, field: {json.dumps(field)}, file: {json.dumps(file)} }}).regime);
"""],
        cwd=ROOT,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    return r.stdout.strip() if r.returncode == 0 else pc.REGIME_PROSE


def flatten(report):
    rows = []
    for file, arr in report.get("byFile", {}).items():
        for f in arr:
            rows.append({**f, "file": file})
    return rows


def match_gt(spec, findings):
    for f in findings:
        if f.get("type") != spec.get("type", "wrong_capitalized"):
            continue
        if f["word"].lower() != spec["token"].lower():
            continue
        if spec.get("file") and f.get("file") != spec["file"]:
            continue
        if spec.get("field") and f.get("field") != spec["field"]:
            continue
        return f
    return None


def gt_text(spec):
    if spec.get("text"):
        return spec["text"], spec.get("field", "passages.text"), spec.get("file", "synthetic.json")
    pool = ROOT / "batches/generated" if spec.get("pool") == "generated" else READY
    batch = json.loads((pool / spec["file"]).read_text(encoding="utf-8"))
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


def analyze_piat_findings():
    pc.load_lexicon()
    nlp = pc.load_nlp()
    rows = flatten(REPORT)
    adj = [f for f in rows if f.get("reason") == "adj_before_noun"]
    piat_related = []
    for f in adj:
        text = resolve_text(f["file"], f["field"], f["word"], f.get("context", ""))
        regime = node_regime(text, f["field"], f["file"])
        doc = nlp(text)
        regime, _ = pc.refine_regime(text, f["field"], regime, doc)
        tok = next((t for t in doc if t.text == f["word"]), None)
        if not tok:
            tok = next((t for t in doc if t.text.lower() == f["word"].lower()), None)
        if not tok:
            continue
        prev = pc.prev_token(tok)
        nxt = pc.next_token(tok)
        g2, g2_reason = prose_g2_skip_piat_determiner(tok, regime)
        key = (f["file"], f["field"], f["word"].lower())
        protected = key in PROTECTED or any(
            c["file"] == f["file"] and c["field"] == f["field"] and c["token"].lower() == f["word"].lower()
            for c in GT["MUST_CATCH"]
        )
        piat_related.append({
            **f,
            "sentence": tok.sent.text.strip(),
            "regime": regime,
            "pos": tok.pos_,
            "tag": tok.tag_,
            "dep": tok.dep_,
            "head": tok.head.text,
            "head_pos": tok.head.pos_,
            "prev": {"word": prev.text if prev else "", "pos": prev.pos_ if prev else "", "tag": prev.tag_ if prev else ""},
            "next": {"word": nxt.text if nxt else "", "pos": nxt.pos_ if nxt else "", "tag": nxt.tag_ if nxt else "", "dep": nxt.dep_ if nxt else ""},
            "g2_skip": g2,
            "g2_reason": g2_reason,
            "protected_must_catch": protected,
            "verdict": "fp_clear" if g2 and not protected else ("real_error" if protected else "keep_or_other"),
        })
    return piat_related, adj


def check_must_catch_after_g2(nlp):
    affected = []
    ok = 0
    for spec in GT["MUST_CATCH"]:
        text, field, file = gt_text(spec)
        if not text:
            continue
        regime = node_regime(text, field, file)
        doc = nlp(text)
        regime, _ = pc.refine_regime(text, field, regime, doc)
        found_before = False
        found_after = False
        for tok in doc:
            if tok.text.lower() != spec["token"].lower():
                continue
            wrong = pc.should_flag_wrong_capitalized(tok, nlp, text, field, regime)
            if not wrong:
                continue
            found_before = True
            skip_g1 = wrong.get("reason") == "adj_before_noun" and pc.prose_g1_skip_adj_before_noun(tok, regime)
            skip_g2 = wrong.get("reason") == "adj_before_noun" and prose_g2_skip_piat_determiner(tok, regime)[0]
            if skip_g1 or skip_g2:
                if spec["token"].lower() in {"viele", "vielen", "ganzen"}:
                    affected.append({**spec, "reason": wrong.get("reason"), "g1": skip_g1, "g2": skip_g2})
                continue
            found_after = True
        if found_after:
            ok += 1
        elif found_before and spec["token"].lower() in {"viele", "vielen", "ganzen"}:
            if not any(a["id"] == spec["id"] for a in affected):
                affected.append({**spec, "note": "eliminated"})
    return affected, ok


def main():
    pc.load_lexicon()
    nlp = pc.load_nlp()
    piat_rows, all_adj = analyze_piat_findings()
    catch_affected, _ = check_must_catch_after_g2(nlp)

    baseline_total = REPORT["totalFindings"]
    elim = [r for r in piat_rows if r["g2_skip"]]
    kept_adj = [r for r in piat_rows if not r["g2_skip"]]

    report = {
        "baseline_g1_1_total": baseline_total,
        "adj_before_noun_total": len(all_adj),
        "piat_adj_before_noun_analyzed": len(piat_rows),
        "g2_would_eliminate": len(elim),
        "after_g2_expected_total": baseline_total - len(elim),
        "must_catch_affected": catch_affected,
        "must_catch_affected_count": len(catch_affected),
        "eliminated_by_g2": elim,
        "adj_before_noun_kept": kept_adj,
        "all_adj_before_noun": all_adj,
    }

    out = ROOT / "batches/ready/g2-simulation-G1.1.json"
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"Pool G1.1: {baseline_total} findings")
    print(f"adj_before_noun: {len(all_adj)}")
    print(f"G2 would eliminate: {len(elim)} → expected {baseline_total - len(elim)}")
    print(f"MUST_CATCH affected: {len(catch_affected)}")
    for e in elim:
        print(f"  ELIM  {e['word']}  {e['file']}  {e['g2_reason']}")
    for r in piat_rows:
        if r["tag"] == "PIAT" or r["word"].lower() in {"viele", "vielen", "ganzen"}:
            print(f"  PIAT  {r['word']:8}  skip={r['g2_skip']:5}  protected={r['protected_must_catch']}  {r['file']}")
    print(f"Written: {out}")


if __name__ == "__main__":
    main()
