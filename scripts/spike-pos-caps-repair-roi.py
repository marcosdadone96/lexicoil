#!/usr/bin/env python3
"""Spike ROI: mechanical repair simulation on holdout (single spaCy load)."""
from __future__ import annotations

import importlib.util
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HOLDOUT = ROOT / "batches/ready/lesen"
DRYRUN = ROOT / "batches/ready/PHASE1-G2-DRYRUN.json"
OUT_JSON = ROOT / "batches/ready/gate-logs/spike-pos-caps-repair-roi.json"
OUT_MD = ROOT / "batches/ready/gate-logs/SPIKE-POS-CAPS-REPAIR-ROI.md"

PURE = {
    "adj_before_noun", "quantifier_capitalized", "adj_after_prep", "adv_capitalized",
    "adv_after_pronoun", "zu_adv_capitalized", "lexicon_nn", "modal_noun_object",
    "lexicon_after_adj", "lexicon_override_tag", "double_pass_after_prep", "adv_before_verb",
}
RISKY = {"verb_census_no_finite", "prose_strict_homograph", "modal_final_infinitive"}


def load_pc():
    spec = importlib.util.spec_from_file_location("pc", ROOT / "scripts/pos-caps-check.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    mod.load_nlp()
    mod.load_lexicon()
    return mod


def collect_strings(batch: dict) -> list[tuple[str, str]]:
    out = []
    for pi, p in enumerate(batch.get("passages") or []):
        if isinstance(p.get("text"), str):
            out.append((f"passages[{pi}].text", p["text"]))
        if isinstance(p.get("title"), str):
            out.append((f"passages[{pi}].title", p["title"]))
        for ai, ad in enumerate(p.get("ads") or []):
            if isinstance(ad, str):
                out.append((f"passages[{pi}].ads[{ai}]", ad))
    for qi, q in enumerate(batch.get("questions") or []):
        for key in ("question", "signText", "explanation", "statement"):
            if isinstance(q.get(key), str):
                out.append((f"questions[{qi}].{key}", q[key]))
        for oi, opt in enumerate(q.get("options") or []):
            t = opt if isinstance(opt, str) else opt.get("text")
            if isinstance(t, str):
                out.append((f"questions[{qi}].options[{oi}]", t))
    return out


def analyze_fields(pc, fields: list[tuple[str, str]], file: str, regime: str = "PROSE"):
    findings = []
    for ti, (field, text) in enumerate(fields):
        fs, _ = pc.analyze_text(text, ti, field, regime)
        for f in fs:
            f = dict(f)
            f["file"] = file
            f["field"] = field
            findings.append(f)
    return findings


def mechanical_fix(text: str, finding: dict) -> str:
    word = finding["word"]
    ftype = finding["type"]
    target = word[0].lower() + word[1:] if ftype == "wrong_capitalized" else word[0].upper() + word[1:]
    if word == target:
        return text
    ctx = finding.get("context") or ""
    idx = text.find(ctx)
    if idx >= 0 and word in ctx:
        abs_i = idx + ctx.index(word)
        return text[:abs_i] + target + text[abs_i + len(word):]
    m = re.search(r"(?<![A-Za-zÄÖÜäöüß-])" + re.escape(word) + r"(?![A-Za-zÄÖÜäöüß-])", text)
    if not m:
        return text
    return text[: m.start()] + target + text[m.end() :]


def apply_mech_to_fields(fields: list[tuple[str, str]], findings: list[dict]) -> list[tuple[str, str]]:
    by_field: dict[str, list[dict]] = {}
    for f in findings:
        by_field.setdefault(f["field"], []).append(f)
    out = []
    for field, text in fields:
        t = text
        for f in by_field.get(field, []):
            t = mechanical_fix(t, f)
        out.append((field, t))
    return out


def fkey(f: dict) -> str:
    return f"{f['file']}::{f['field']}::{f['word']}::{f['reason']}"


def classify(reason: str) -> str:
    if reason in PURE:
        return "repair-by-type"
    if reason in RISKY:
        return "repair-by-type-risky"
    return "needs-review"


def main():
    pc = load_pc()
    dryrun = json.loads(DRYRUN.read_text(encoding="utf-8"))
    files = sorted(p.name for p in HOLDOUT.glob("lesen-t*.json"))

    before: list[dict] = []
    file_fields: dict[str, list[tuple[str, str]]] = {}
    for fn in files:
        batch = json.loads((HOLDOUT / fn).read_text(encoding="utf-8"))
        fields = collect_strings(batch)
        file_fields[fn] = fields
        before.extend(analyze_fields(pc, fields, fn))

    print(f"Before: {len(before)} (ref {dryrun['summary']['beforeFindings']})", file=sys.stderr)

    by_class = {"repair-by-type": 0, "repair-by-type-risky": 0, "needs-review": 0}
    for f in before:
        by_class[classify(f["reason"])] += 1

    after_mech: list[dict] = []
    for fn in files:
        fields = file_fields[fn]
        bf = [x for x in before if x["file"] == fn]
        mfields = apply_mech_to_fields(fields, bf)
        after_mech.extend(analyze_fields(pc, mfields, fn))

    before_set = {fkey(f) for f in before}
    after_mech_set = {fkey(f) for f in after_mech}
    resolved = [f for f in before if fkey(f) not in after_mech_set]
    added = [f for f in after_mech if fkey(f) not in before_set]

    print(f"After mech: {len(after_mech)} resolved={len(resolved)} added={len(added)}", file=sys.stderr)

    # Lists normalize via node — use dryrun ref for after lists
    after_lists_ref = dryrun["summary"]["afterFindings"]
    lists_resolved = len(before) - after_lists_ref

    report = {
        "generatedAt": __import__("datetime").datetime.utcnow().isoformat() + "Z",
        "holdoutFiles": len(files),
        "dryrunRef": dryrun["summary"],
        "classification": {
            **by_class,
            "purePct": round(1000 * by_class["repair-by-type"] / len(before)) / 10,
            "riskyPct": round(1000 * by_class["repair-by-type-risky"] / len(before)) / 10,
            "mechanicalCandidatePct": round(1000 * (by_class["repair-by-type"] + by_class["repair-by-type-risky"]) / len(before)) / 10,
            "byReasonBefore": dryrun["summary"]["beforeByReason"],
        },
        "mechanicalSimulation": {
            "before": len(before),
            "after": len(after_mech),
            "resolved": len(resolved),
            "resolvedPct": round(1000 * len(resolved) / len(before)) / 10,
            "added": len(added),
            "addedSample": added[:15],
            "unresolvedSample": after_mech[:20],
        },
        "listsNormalize": {
            "afterRef": after_lists_ref,
            "resolvedRef": lists_resolved,
            "resolvedPctRef": round(1000 * lists_resolved / len(before)) / 10,
            "deltaMechVsLists": len(after_mech) - after_lists_ref,
        },
    }

    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")

    md = f"""# Spike ROI — pos-caps repair mecánico

**Fecha:** {report['generatedAt']}
**Corpus:** {len(files)} archivos holdout
**Método:** simulación Python (misma lógica G2, repair mecánico token-a-token)

## 1. Clasificación on-paper

| Clase | N | % |
|---|---:|---:|
| repair-by-type (puro) | {by_class['repair-by-type']} | {report['classification']['purePct']}% |
| repair-by-type-risky | {by_class['repair-by-type-risky']} | {report['classification']['riskyPct']}% |
| **Total candidatos mecánicos** | **{by_class['repair-by-type'] + by_class['repair-by-type-risky']}** | **{report['classification']['mechanicalCandidatePct']}%** |

## 2. Simulación

| Estrategia | Tras fix | Resueltos | addedFindings |
|---|---:|---:|---:|
| Baseline | {len(before)} | 0 | 0 |
| Repair mecánico naive | {len(after_mech)} | {len(resolved)} ({report['mechanicalSimulation']['resolvedPct']}%) | {len(added)} |
| Lists normalize (dryrun ref) | {after_lists_ref} | {lists_resolved} ({report['listsNormalize']['resolvedPctRef']}%) | 3 net new in dryrun |

**Delta mecánico vs lists:** {report['listsNormalize']['deltaMechVsLists']} findings restantes.
"""
    OUT_MD.write_text(md, encoding="utf-8")
    print(f"Wrote {OUT_MD}", file=sys.stderr)
    print(json.dumps(report["mechanicalSimulation"], indent=2))
    print(json.dumps(report["classification"], indent=2))


if __name__ == "__main__":
    main()
