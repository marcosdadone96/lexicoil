#!/usr/bin/env python3
"""Offline German capitalization gate — double-pass spaCy + noun lexicon."""

from __future__ import annotations

import io
import json
import re
import sys
from pathlib import Path

if hasattr(sys.stdin, "buffer"):
    sys.stdin = io.TextIOWrapper(sys.stdin.buffer, encoding="utf-8")
if hasattr(sys.stdout, "buffer"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

try:
    import spacy
except ImportError:
    print(json.dumps({"ok": False, "error": "spacy_not_installed", "findings": []}))
    sys.exit(0)

MODEL = "de_core_news_sm"
NLP = None
LEXICON: set[str] = set()

ROOT = Path(__file__).resolve().parent
LEXICON_PATH = ROOT / "lib" / "data" / "german-noun-lexicon.json"
SUPPLEMENT_PATH = ROOT / "lib" / "data" / "german-noun-supplement.json"

ARTICLE_LIKE = {
    "der", "die", "das", "dem", "den", "des",
    "ein", "eine", "einem", "einen", "einer", "eines",
    "kein", "keine", "keinem", "keiner", "keines", "keinen",
    "mein", "meine", "meinen", "meinem", "meiner", "meines",
    "dein", "deine", "deinen", "deinem", "deiner", "deines",
    "sein", "seine", "seinen", "seinem", "seiner", "seines",
    "ihr", "ihre", "ihren", "ihrem", "ihrer", "ihres",
    "unser", "unsere", "unseren", "unserem", "unserer", "unseres",
    "euer", "eure", "euren", "eurem", "eurer", "eures",
    "im", "am", "beim", "zum", "zur", "vom", "ins", "ans",
    "dieses", "diese", "diesem", "diesen", "jenes", "jene", "jenem", "jenen",
    "welches", "welche", "welchem", "welchen",
}

PREPOSITIONS = {
    "in", "an", "auf", "für", "fuer", "mit", "bei", "nach", "vor", "über", "ueber",
    "unter", "aus", "von", "zu", "durch", "gegen", "ohne", "um",
}

FUNCTION_WORDS = {
    "muss", "müsste", "müssen", "musste", "mussten",
    "kann", "könnte", "können", "konnte", "konnten",
    "soll", "sollte", "sollen", "sollten",
    "will", "wollte", "wollen", "wollten",
    "darf", "dürfte", "dürfen", "durfte", "durften",
    "außer", "ausser", "sehr", "oft", "noch", "schon", "auch", "nur", "nicht", "immer",
    "wieder", "dann", "dort", "hier", "heute", "gestern",
    "draußen", "draussen", "oben", "unten",
    "ist", "sind", "war", "waren", "wird", "werden", "hat", "haben", "bin", "bist",
    "als", "wenn", "weil", "dass", "damit", "ob", "und", "oder", "aber",
}

MODALS = {
    "kann", "könnte", "können", "konnte", "konnten",
    "muss", "müsste", "müssen", "musste", "mussten",
    "soll", "sollte", "sollen", "sollten",
    "will", "wollte", "wollen", "wollten",
    "darf", "dürfte", "dürfen", "durfte", "durften",
    "mag", "möchte", "möchten",
}

SUBJECT_PRONOUNS = {"ich", "du", "er", "sie", "es", "wir", "ihr", "man"}

HOMOGRAPH_VERBS = {
    "spielen", "berichten", "folgen", "stellen", "glauben", "arbeiten", "essen",
    "wissen", "zahlen", "erfolgen", "verursachen", "posten", "kosten", "kochen",
    "lesen", "fahren", "lernen", "treffen", "fragen", "stärken", "staerken",
}

HOMOGRAPH_ADJECTIVES = {
    "viele", "vielen", "vielem", "vieler", "ganzen", "ganzer", "ganzes", "bessere",
    "besseren", "öffentlicher", "öffentliche", "öffentlichen", "deutlich", "deutliche",
    "digitalen", "digitaler", "digitale", "speziellen", "spezieller",
}

ADV_AFTER_ZU = {"spät", "spat"}  # zu Hause is a fixed phrase — do not flag

CLAUSE_CONJUNCTIONS = {
    "dass", "daß", "weil", "wenn", "ob", "damit", "als", "obwohl", "falls", "indem",
    "sodass", "sofern", "während", "waerend",
}

SENTENCE_BREAK = {".", "!", "?", ":", ";", "…", "–", "—"}

NOMINAL_SUFFIXES = (
    "ung", "heit", "keit", "schaft", "tion", "tät", "nis", "tum", "chen", "lein",
    "schaden", "schäden", "aktivitäten", "aktivitaeten", "geräte", "geraete",
    "inhalte", "mittel", "wege", "städte", "staedte", "gebühr", "gebuehr",
)

REGIME_PROSE = "PROSE"
REGIME_TELEGRAPHIC = "TELEGRAPHIC_AD"
REGIME_TITLE = "TITLE_HEADING"


class _RuleProfile:
    __slots__ = ("verb_census", "adj_before_noun", "lexicon_nn")

    def __init__(self, verb_census=True, adj_before_noun=True, lexicon_nn=True):
        self.verb_census = verb_census
        self.adj_before_noun = adj_before_noun
        self.lexicon_nn = lexicon_nn


REGIME_PROFILES = {
    REGIME_PROSE: _RuleProfile(True, True, True),
    REGIME_TELEGRAPHIC: _RuleProfile(False, False, False),
    REGIME_TITLE: _RuleProfile(False, True, False),
}


def normalize_regime(regime: str) -> str:
    r = str(regime or REGIME_PROSE).strip()
    if r in REGIME_PROFILES:
        return r
    return REGIME_PROSE


def is_camelcase_brand(tok) -> bool:
    return bool(re.match(r"^[A-ZÄÖÜ][a-zäöüß]+[A-Z]", tok.text))


def telegraphic_structural_context(text: str) -> bool:
    body = text or ""
    if "—" in body:
        return True
    if re.search(r"^[A-Z]\)\s", body):
        return True
    if re.search(r"\b[A-ZÄÖÜ][a-zäöüß]+[A-Z]\S*", body):
        return True
    if re.search(r"\)\s*[A-ZÄÖÜ]", body):
        return True
    if re.search(r"\b(Mo|Di|Mi|Do|Fr|Sa|So)\s+\d", body):
        return True
    if re.search(r"\d+\s*[-–]\s*\d+\s*Uhr", body):
        return True
    if body.count(",") >= 2 and len(body) < 200 and not re.search(r"[.!?]$", body.strip()):
        return True
    return False


def has_telegraphic_verbal_homograph_context(token) -> bool:
    prev = prev_token(token)
    if not prev:
        return False
    pl = prev.text.lower()
    if pl in SUBJECT_PRONOUNS or prev.text == "Sie":
        return True
    if pl in MODALS:
        return True
    return False


def is_telegraphic_nominal_compound(token, text: str) -> bool:
    """Structural nominal list compound in telegraphic ads — no word whitelist."""
    prev = prev_token(token)
    if not prev:
        return False
    struct = telegraphic_structural_context(text)

    if prev.text == ")":
        return True

    if is_camelcase_brand(prev):
        return True

    if is_adj_tag(prev.tag_) or prev.pos_ == "ADJ":
        return struct

    if is_adv_tag(prev.tag_) or prev.pos_ == "ADV":
        if not has_telegraphic_verbal_homograph_context(token):
            return True

    if struct and (
        is_noun_tag(prev.tag_)
        or prev.pos_ in {"NOUN", "PROPN"}
    ):
        return True

    return False


def refine_regime(text: str, field: str, regime: str, doc) -> tuple[str, list[str]]:
    """Optional Python-side refinement when Node sends TELEGRAPHIC_AD."""
    signals: list[str] = []
    regime = normalize_regime(regime)
    if regime != REGIME_TELEGRAPHIC:
        return regime, signals
    if telegraphic_structural_context(text or ""):
        return regime, signals
    finite = sum(1 for t in doc if is_finite_verb(t))
    if finite >= 2:
        signals.append("refine:finite_verbs>=2")
        return REGIME_PROSE, signals
    return regime, signals


def load_nlp():
    global NLP
    if NLP is not None:
        return NLP
    try:
        NLP = spacy.load(MODEL)
    except OSError:
        return None
    return NLP


def load_lexicon():
    global LEXICON
    if LEXICON:
        return LEXICON
    words = set()
    if LEXICON_PATH.exists():
        with LEXICON_PATH.open(encoding="utf-8") as fh:
            words.update(w.lower() for w in json.load(fh))
    if SUPPLEMENT_PATH.exists():
        with SUPPLEMENT_PATH.open(encoding="utf-8") as fh:
            words.update(w.lower() for w in json.load(fh))
    LEXICON = words
    return LEXICON


def in_lexicon(word: str) -> bool:
    return word.lower() in load_lexicon()


def has_nominal_suffix(word: str) -> bool:
    lw = word.lower()
    return any(lw.endswith(s) for s in NOMINAL_SUFFIXES)


def compound_lexicon_match(word: str) -> bool:
    lw = word.lower()
    if in_lexicon(lw) or has_nominal_suffix(lw):
        return True
    for i in range(1, len(lw)):
        suffix = lw[i:]
        if len(suffix) >= 4 and in_lexicon(suffix):
            return True
        if len(suffix) >= 5 and has_nominal_suffix(suffix):
            return True
    return False


def is_noun_tag(tag: str) -> bool:
    return tag == "NN"


def is_verb_tag(tag: str) -> bool:
    return tag.startswith("VV") or tag in {"VMFIN", "VAFIN", "VMINF", "VAINF", "VVINF", "VVIZU"}


def is_adj_tag(tag: str) -> bool:
    return tag.startswith("AD") or tag in {"ADJA", "ADJD", "PIAT", "PIOT"}


def is_adv_tag(tag: str) -> bool:
    return tag.startswith("ADV") or tag == "ADV"


def is_clause_start(token) -> bool:
    if token.i == 0:
        return True
    prev = token.doc[token.i - 1]
    if prev.text in {".", "!", "?", ":", ";", "…", "–", "—"}:
        return True
    if token.is_sent_start and not prev.is_alpha:
        return True
    # spaCy mis-splits sentences after nouns (e.g. "Zeitungen Spielen")
    if token.is_sent_start and prev.is_alpha:
        return False
    return False


def in_quotes(text: str, start: int, end: int) -> bool:
    before = text[:start]
    pairs = [("„", "“"), ("«", "»"), ("‚", "’"), ('"', '"'), ("'", "'")]
    for o, c in pairs:
        if before.count(o) > before.count(c):
            return True
    if before.count('"') % 2 == 1 or before.count("'") % 2 == 1:
        return True
    return False


def context_snippet(doc, token, radius=4) -> str:
    start = max(0, token.i - radius)
    end = min(len(doc), token.i + radius + 1)
    return doc[start:end].text


def token_at_char(doc, char_idx):
    for tok in doc:
        if tok.idx <= char_idx < tok.idx + len(tok.text):
            return tok
    return None


def lowered_token_tag(nlp, text: str, token):
    lower_word = token.text[0].lower() + token.text[1:]
    variant = text[: token.idx] + lower_word + text[token.idx + len(token.text) :]
    doc_lo = nlp(variant)
    return token_at_char(doc_lo, token.idx)


def prev_token(token):
    return token.doc[token.i - 1] if token.i > 0 else None


def next_token(token):
    return token.doc[token.i + 1] if token.i + 1 < len(token.doc) else None


def prev_is_article_like(token) -> bool:
    prev = prev_token(token)
    if not prev:
        return False
    return prev.text.lower() in ARTICLE_LIKE or prev.tag_.startswith("ART")


def prev_is_adjective(token) -> bool:
    prev = prev_token(token)
    if not prev:
        return False
    pl = prev.text.lower()
    return is_adj_tag(prev.tag_) or prev.pos_ == "ADJ" or pl in HOMOGRAPH_ADJECTIVES


def prev_is_adverb(token) -> bool:
    prev = prev_token(token)
    if not prev:
        return False
    return is_adv_tag(prev.tag_) or prev.pos_ == "ADV"


def prev_is_zu(token) -> bool:
    prev = prev_token(token)
    return bool(prev and prev.text.lower() == "zu")


def prev_is_preposition(token) -> bool:
    prev = prev_token(token)
    if not prev:
        return False
    return prev.text.lower() in PREPOSITIONS or prev.tag_ in {"APPR", "APPO", "PREL"}


def prev_is_modal_or_pronoun(token) -> bool:
    prev = prev_token(token)
    if not prev:
        return False
    pl = prev.text.lower()
    if pl in MODALS or pl in SUBJECT_PRONOUNS:
        return True
    if prev.text == "Sie":
        return True
    return False


def after_plural_noun_subject(token) -> bool:
    prev = prev_token(token)
    if not prev or not prev.text[0].isupper():
        return False
    if prev.tag_ in {"NN", "NE"} or prev.pos_ in {"NOUN", "PROPN"}:
        return True
    pl = prev.text.lower()
    return in_lexicon(pl) and pl not in HOMOGRAPH_VERBS


def is_v2_verb_position(token) -> bool:
    if token.i != 1:
        return False
    prev = prev_token(token)
    if not prev:
        return False
    if prev_is_preposition(token):
        return False
    return True


def is_adjective_between_nouns(token) -> bool:
    prev = prev_token(token)
    nxt = next_token(token)
    if not prev or not nxt:
        return False
    prev_n = is_noun_tag(prev.tag_) or prev.pos_ == "NOUN"
    nxt_n = is_noun_tag(nxt.tag_) or nxt.pos_ == "NOUN"
    cur_adj = is_adj_tag(token.tag_) or token.pos_ == "ADJ" or token.text.lower() in HOMOGRAPH_ADJECTIVES
    return prev_n and nxt_n and cur_adj


def is_noun_after_adjective(token) -> bool:
    prev = prev_token(token)
    if not prev:
        return False
    if prev.pos_ == "ADV" or is_adv_tag(prev.tag_):
        return False
    if not (is_adj_tag(prev.tag_) or prev.pos_ == "ADJ" or prev.text.lower() in HOMOGRAPH_ADJECTIVES):
        return False
    return is_noun_tag(token.tag_) or (token.pos_ == "NOUN" and in_lexicon(token.text))


def is_adjective_before_following_noun(token) -> bool:
    nxt = next_token(token)
    if not nxt:
        return False
    cur_adj = is_adj_tag(token.tag_) or token.pos_ == "ADJ" or token.text.lower() in HOMOGRAPH_ADJECTIVES
    nxt_noun = is_noun_tag(nxt.tag_) or nxt.pos_ == "NOUN"
    return cur_adj and nxt_noun


def is_substantivized_after_article(token) -> bool:
    if not prev_is_article_like(token):
        return False
    if is_adjective_before_following_noun(token):
        return False
    lw = token.text.lower()
    if lw in HOMOGRAPH_ADJECTIVES:
        return False
    return True


def legitimate_proper_noun_capital(token) -> bool:
    lw = token.text.lower()
    if prev_is_zu(token) and lw in ADV_AFTER_ZU:
        return False
    if is_noun_after_adjective(token):
        return True
    if is_noun_tag(token.tag_) and in_lexicon(token.text) and prev_is_preposition(token):
        if lw in HOMOGRAPH_VERBS or lw in ADV_AFTER_ZU:
            return False
        return True
    if is_noun_tag(token.tag_) and in_lexicon(token.text) and prev_is_article_like(token):
        return True
    return False


def _next_alpha_index(doc, idx: int, limit: int) -> int | None:
    for j in range(idx, limit):
        if doc[j].is_alpha:
            return j
    return None


def clause_bounds(token) -> tuple[int, int]:
    """Token index range [start, end) for the sub-clause containing token."""
    doc = token.doc
    sent_start = token.sent.start
    sent_end = token.sent.end

    for i in range(token.i - 1, sent_start - 1, -1):
        t = doc[i]
        if t.text.lower() == "was" and (t.tag_.startswith("PW") or t.pos_ == "PRON"):
            start = i + 1
            end = sent_end
            for j in range(token.i + 1, sent_end):
                if doc[j].text in {".", ",", ";"}:
                    end = j
                    break
            return start, end

    start = sent_start
    for i in range(token.i - 1, sent_start - 1, -1):
        t = doc[i]
        if t.text in SENTENCE_BREAK:
            start = i + 1
            break
        if t.text == ",":
            j = _next_alpha_index(doc, i + 1, token.i + 1)
            if j is not None and doc[j].text.lower() in CLAUSE_CONJUNCTIONS:
                start = j + 1
                break

    end = sent_end
    for i in range(token.i + 1, sent_end):
        if doc[i].text != ",":
            continue
        j = _next_alpha_index(doc, i + 1, sent_end)
        if j is not None and doc[j].text.lower() in CLAUSE_CONJUNCTIONS:
            end = i
            break

    return start, end


def is_finite_verb(tok) -> bool:
    if tok.pos_ not in {"VERB", "AUX"}:
        return False
    morph = tok.morph.get("VerbForm")
    if morph:
        return "Fin" in morph
    return tok.tag_ in {"VVFIN", "VAFIN", "VMFIN", "VVIMP"}


def count_finite_verbs_in_clause(token, exclude_idx: int) -> int:
    doc = token.doc
    start, end = clause_bounds(token)
    total = 0
    for i in range(start, end):
        if i == exclude_idx:
            continue
        if not is_finite_verb(doc[i]):
            continue
        if i > exclude_idx and _is_und_coordinated_with(doc, exclude_idx, i):
            continue
        total += 1
    return total


def _is_und_coordinated_with(doc, candidate_idx: int, verb_idx: int) -> bool:
    for i in range(candidate_idx + 1, verb_idx):
        if doc[i].text.lower() == "und":
            return True
    return False


def is_quantifier_adjective_error(token) -> bool:
    lw = token.text.lower()
    if lw not in {"viele", "vielen", "vielem", "vieler"}:
        return False
    nxt = next_token(token)
    if not nxt:
        return False
    if is_adj_tag(nxt.tag_) or is_noun_tag(nxt.tag_) or nxt.pos_ in {"ADJ", "NOUN"}:
        return True
    nxt2 = next_token(nxt)
    return bool(nxt2 and (is_noun_tag(nxt2.tag_) or nxt2.pos_ == "NOUN"))


def clause_has_modal(token) -> bool:
    start, end = clause_bounds(token)
    for i in range(start, end):
        if token.doc[i].text.lower() in MODALS:
            return True
    return False


def is_clause_final_position(token) -> bool:
    start, end = clause_bounds(token)
    last_alpha = None
    for i in range(start, end):
        if token.doc[i].is_alpha:
            last_alpha = i
    return last_alpha == token.i


def double_pass_is_verb_discrepancy(token, nlp, text: str) -> bool:
    lo = lowered_token_tag(nlp, text, token)
    if not lo:
        return False
    return is_verb_tag(lo.tag_) or lo.pos_ in {"VERB", "AUX"}


def should_flag_prose_strict_homograph(token, nlp, text: str, regime: str) -> dict | None:
    """Token-level homograph — PROSE/TITLE unchanged; TELEGRAPHIC uses structural guards."""
    if regime == REGIME_TELEGRAPHIC:
        if is_telegraphic_nominal_compound(token, text):
            return None
        if not has_telegraphic_verbal_homograph_context(token):
            lw = token.text.lower()
            dp = double_pass_is_verb_discrepancy(token, nlp, text)
            if lw not in HOMOGRAPH_VERBS and not (dp and prev_is_modal_or_pronoun(token)):
                return None
        return should_flag_homograph_verb_capital(token, nlp, text, "prose_strict_homograph")

    reason = "verb_census_no_finite" if regime == REGIME_PROSE else "prose_strict_homograph"
    return should_flag_homograph_verb_capital(token, nlp, text, reason)


def should_flag_homograph_verb_capital(token, nlp, text: str, reason: str) -> dict | None:
    """Verb census: flag homograph only if clause lacks another finite verb (modal+final exception)."""
    lw = token.text.lower()
    pos_verb = token.pos_ in {"VERB", "AUX"} and (lw in HOMOGRAPH_VERBS or is_verb_tag(token.tag_))
    double_pass = double_pass_is_verb_discrepancy(token, nlp, text) and (
        lw in HOMOGRAPH_VERBS
        or is_noun_tag(token.tag_)
        or token.pos_ in {"NOUN", "PROPN", "VERB", "AUX"}
    )
    if not pos_verb and not double_pass:
        return None

    finite_others = count_finite_verbs_in_clause(token, token.i)
    if finite_others >= 1:
        if clause_has_modal(token) and is_clause_final_position(token):
            return _finding(token, "wrong_capitalized", "high", "modal_final_infinitive")
        return None

    verb_context = (
        prev_is_modal_or_pronoun(token)
        or after_plural_noun_subject(token)
        or is_v2_verb_position(token)
        or prev_is_adverb(token)
    )
    if not verb_context and token.pos_ not in {"VERB", "AUX"}:
        return None
    return _finding(token, "wrong_capitalized", "high", reason)


def double_pass_verb_or_adj(token, nlp, text: str) -> bool:
    lo = lowered_token_tag(nlp, text, token)
    if not lo:
        return False
    orig_tag, lo_tag = token.tag_, lo.tag_
    orig_pos, lo_pos = token.pos_, lo.pos_
    orig_nounish = is_noun_tag(orig_tag) or orig_pos in {"NOUN", "PROPN"}
    if is_verb_tag(lo_tag) or lo_pos in {"VERB", "AUX"}:
        return orig_nounish or token.pos_ in {"VERB", "AUX"} or token.text.lower() in HOMOGRAPH_VERBS
    if is_adj_tag(lo_tag) or lo_pos == "ADJ":
        return token.text[0].isupper() and (is_adj_tag(orig_tag) or token.text.lower() in HOMOGRAPH_ADJECTIVES)
    if is_adv_tag(lo_tag) or lo_pos == "ADV":
        return token.text[0].isupper()
    return False


def likely_noun_object_after_modal(token) -> bool:
    prev = prev_token(token)
    if not prev or prev.text.lower() not in MODALS:
        return False
    if token.text[0].isupper():
        return False
    if not in_lexicon(token.text.lower()):
        return False
    for j in range(token.i + 1, min(token.i + 5, len(token.doc))):
        if token.doc[j].text.lower() in {"für", "fuer", "die", "der", "das", "dem", "den", "des"}:
            return True
    return False


# ── PROSE guards v6.1-B (PROSE only; TELEGRAPHIC/TITLE unchanged) ─────────────

def prose_has_predication_in_clause(token, exclude_idx: int | None = None) -> bool:
    """Finite verb or modal in the same sub-clause (B1)."""
    start, end = clause_bounds(token)
    ex = token.i if exclude_idx is None else exclude_idx
    for i in range(start, end):
        if i == ex:
            continue
        t = token.doc[i]
        if is_finite_verb(t):
            return True
        if t.text.lower() in MODALS:
            return True
    return False


def prose_is_time_range_preposition(token) -> bool:
    if token.tag_ not in {"APPR", "APPO", "PREL"} and token.pos_ != "ADP":
        return False
    start, end = clause_bounds(token)
    return bool(re.search(r"\d", token.doc[start:end].text))


def prose_skip_lexicon_finding(token, regime: str) -> bool:
    """B1: skip lexicon_override paths when token is a verbal/pronominal use (PROSE only)."""
    if normalize_regime(regime) != REGIME_PROSE:
        return False
    lw = token.text.lower()
    if lw in HOMOGRAPH_VERBS:
        return False

    if prose_is_time_range_preposition(token):
        return True

    prev = prev_token(token)
    prev_l = prev.text.lower() if prev else ""

    # Pronoun after für/fuer: „Für viele ist…“
    if prev_l in {"für", "fuer"} and (token.pos_ == "PRON" or token.tag_.startswith("PI")):
        return prose_has_predication_in_clause(token)

    # After adjective: only skip clear infinitives; keep lexicon nouns (geräten, etc.)
    if prev_is_adjective(token) and in_lexicon(lw):
        return False

    if prev_is_adjective(token) and is_verb_tag(token.tag_) and token.tag_ in {"VVINF", "VVIZU"}:
        return prose_has_predication_in_clause(token)

    # Infinitive after adverb (buchen, laufen, suchen, machen in complement)
    if prev_is_adverb(token) and is_verb_tag(token.tag_) and token.tag_ in {"VVINF", "VVIZU"}:
        return prose_has_predication_in_clause(token)

    if prev_l in {"unter", "welchen"} and token.tag_.startswith("PW"):
        return prose_has_predication_in_clause(token)

    return False


def prose_is_zu_spaet_sein_idiom(token) -> bool:
    """B4: „zu Spät ist/war/…“ — adverbial idiom, not a caps error."""
    for j in range(token.i + 1, min(token.i + 6, len(token.doc))):
        t = token.doc[j]
        if not t.is_alpha:
            continue
        tl = t.text.lower()
        if tl in {"ist", "sind", "war", "waren", "wäre", "waere", "ware", "bin", "bist", "seid"}:
            return True
        if t.lemma_.lower() == "sein" and t.pos_ in {"AUX", "VERB"}:
            return True
        if t.pos_ in {"VERB", "AUX"} and tl not in {"ist", "sind", "war", "waren"}:
            return False
    return False


def prose_is_predicative_sicher(token) -> bool:
    """B5: „Informationen Sicher sind“ — predicative, not adverb capitalization error."""
    prev = prev_token(token)
    if not prev or not (is_noun_tag(prev.tag_) or prev.pos_ in {"NOUN", "PROPN"}):
        return False
    for j in range(token.i + 1, min(token.i + 5, len(token.doc))):
        t = token.doc[j]
        if not t.is_alpha:
            continue
        tl = t.text.lower()
        if tl in {"sind", "ist", "war", "waren", "wäre", "waere", "ware"}:
            return True
        if t.lemma_.lower() == "sein" and t.pos_ in {"AUX", "VERB"}:
            return True
        break
    return False


QUANTIFIER_ADJ_LEMMAS = frozenset(
    {"viele", "vielen", "vielem", "vieler", "ganzen", "ganzes", "ganze", "ganzer"}
)


def prose_g1_skip_adj_before_noun(token, regime: str) -> bool:
    """G1: skip substantivized ADJA before following noun (PROSE, adj_before_noun path only)."""
    if normalize_regime(regime) != REGIME_PROSE:
        return False
    if not is_adjective_before_following_noun(token):
        return False
    if is_quantifier_adjective_error(token):
        return False
    if token.text.lower() in QUANTIFIER_ADJ_LEMMAS:
        return False
    if token.tag_ == "PIAT":
        return False
    if token.tag_ != "ADJA":
        return False
    prev = prev_token(token)
    if prev and prev.pos_ == "NOUN":
        return False
    return True


def prose_g2_skip_piat_determiner_adj_before_noun(token, regime: str) -> bool:
    """G2: skip PIAT after ART when following NOUN is object (oa/og), not subject (PROSE, adj_before_noun)."""
    if normalize_regime(regime) != REGIME_PROSE:
        return False
    if token.tag_ != "PIAT":
        return False
    if token.text.lower() not in {"viele", "vielen", "vielem", "vieler"}:
        return False
    if not is_adjective_before_following_noun(token):
        return False
    prev = prev_token(token)
    if not prev or prev.tag_ != "ART":
        return False
    if prev.text.lower() not in {"die", "der", "das", "den", "dem", "des"}:
        return False
    nxt = next_token(token)
    if not nxt or not (is_noun_tag(nxt.tag_) or nxt.pos_ == "NOUN"):
        return False
    if nxt.dep_ == "sb":
        return False
    if nxt.dep_ in {"oa", "og"}:
        return True
    return False


def should_flag_wrong_capitalized(token, nlp, text: str, field: str, regime: str = REGIME_PROSE) -> dict | None:
    if field and field.endswith(".title"):
        return None
    if token.text == "Sie":
        return None
    if not token.text or not token.text[0].isupper():
        return None
    if is_clause_start(token):
        return None
    if in_quotes(text, token.idx, token.idx + len(token.text)):
        return None
    if legitimate_proper_noun_capital(token):
        return None
    if is_substantivized_after_article(token):
        return None

    lw = token.text.lower()
    if lw in FUNCTION_WORDS:
        return None

    profile = REGIME_PROFILES[normalize_regime(regime)]

    verb_context = (
        prev_is_modal_or_pronoun(token)
        or after_plural_noun_subject(token)
        or is_v2_verb_position(token)
    )

    homograph = should_flag_prose_strict_homograph(token, nlp, text, regime)
    if homograph:
        return homograph

    if profile.adj_before_noun and is_adjective_before_following_noun(token) and token.text[0].isupper():
        if not prose_g1_skip_adj_before_noun(token, regime):
            if not prose_g2_skip_piat_determiner_adj_before_noun(token, regime):
                return _finding(token, "wrong_capitalized", "high", "adj_before_noun")

    if is_quantifier_adjective_error(token) and token.text[0].isupper():
        if not prose_g2_skip_piat_determiner_adj_before_noun(token, regime):
            return _finding(token, "wrong_capitalized", "high", "quantifier_capitalized")

    if prev_is_preposition(token) and token.text[0].isupper():
        if is_adj_tag(token.tag_) or token.tag_ in {"PIAT", "PIOT"} or lw in HOMOGRAPH_ADJECTIVES:
            if not prose_g1_skip_adj_before_noun(token, regime):
                return _finding(token, "wrong_capitalized", "high", "adj_after_prep")

    if double_pass_verb_or_adj(token, nlp, text) and not double_pass_is_verb_discrepancy(token, nlp, text):
        if is_adj_tag(token.tag_) or lw in HOMOGRAPH_ADJECTIVES:
            if prev_is_preposition(token):
                if not prose_g1_skip_adj_before_noun(token, regime):
                    return _finding(token, "wrong_capitalized", "high", "double_pass_after_prep")

    if prev_is_zu(token) and lw in ADV_AFTER_ZU:
        if normalize_regime(regime) == REGIME_PROSE and prose_is_zu_spaet_sein_idiom(token):
            pass
        else:
            return _finding(token, "wrong_capitalized", "high", "zu_adv_capitalized")

    if prev_is_adverb(token) and lw in HOMOGRAPH_VERBS and token.text[0].isupper():
        if double_pass_verb_or_adj(token, nlp, text) or is_verb_tag(token.tag_):
            return _finding(token, "wrong_capitalized", "high", "adv_before_verb")

    if lw in {"morgens", "abends", "spät", "spat", "oft"} and prev_is_modal_or_pronoun(token):
        return _finding(token, "wrong_capitalized", "high", "adv_after_pronoun")

    if is_adv_tag(token.tag_) and token.text[0].isupper() and (prev_is_modal_or_pronoun(token) or verb_context):
        if normalize_regime(regime) == REGIME_PROSE and lw == "sicher" and prose_is_predicative_sicher(token):
            pass
        else:
            return _finding(token, "wrong_capitalized", "high", "adv_capitalized")

    return None


def _noun_lowercase_finding(token, text: str, field: str, regime: str = REGIME_PROSE) -> dict | None:
    if field and field.endswith(".title"):
        return None
    if token.text[0].isupper() or is_clause_start(token):
        return None
    if in_quotes(text, token.idx, token.idx + len(token.text)):
        return None
    lw = token.text.lower()
    if lw in FUNCTION_WORDS:
        return None

    if prev_is_zu(token):
        return None

    if is_adj_tag(token.tag_) and not is_noun_tag(token.tag_):
        return None

    if is_verb_tag(token.tag_) and not in_lexicon(lw):
        return None

    if likely_noun_object_after_modal(token):
        return _finding(token, "noun_lowercase", "high", "modal_noun_object")

    lexicon_hit = compound_lexicon_match(token.text)
    if not lexicon_hit:
        return None

    if is_noun_tag(token.tag_):
        return _finding(token, "noun_lowercase", "high", "lexicon_nn")

    if prev_is_adjective(token) or prev_is_preposition(token):
        if lexicon_hit and lw not in HOMOGRAPH_VERBS:
            if prose_skip_lexicon_finding(token, regime):
                return None
            return _finding(token, "noun_lowercase", "high", "lexicon_override_tag")

    if prev_is_adjective(token) and lexicon_hit and in_lexicon(lw):
        if prose_skip_lexicon_finding(token, regime):
            return None
        return _finding(token, "noun_lowercase", "high", "lexicon_after_adj")

    return None


def should_flag_noun_lowercase(
    token,
    text: str,
    field: str,
    regime: str = REGIME_PROSE,
    observations: list | None = None,
) -> dict | None:
    finding = _noun_lowercase_finding(token, text, field, regime)
    if not finding:
        return None
    profile = REGIME_PROFILES[normalize_regime(regime)]
    if profile.lexicon_nn:
        return finding
    if observations is not None:
        obs = dict(finding)
        obs["observation"] = True
        obs["relaxed"] = True
        obs["regime"] = regime
        observations.append(obs)
    return None


def _finding(token, ftype, confidence, reason):
    prev = prev_token(token)
    return {
        "type": ftype,
        "word": token.text,
        "pos": token.pos_,
        "tag": token.tag_,
        "confidence": confidence,
        "reason": reason,
        "context": context_snippet(token.doc, token),
        "prevWord": prev.text if prev else "",
        "prevPos": prev.pos_ if prev else "",
        "prevTag": prev.tag_ if prev else "",
    }


def analyze_text(
    text: str,
    text_index: int,
    field: str = "",
    regime: str = REGIME_PROSE,
    observations: list | None = None,
):
    nlp = load_nlp()
    if nlp is None:
        return [], observations or []
    doc = nlp(text or "")
    regime, _refine = refine_regime(text, field, regime, doc)
    findings = []
    obs = observations if observations is not None else []
    seen = set()
    for tok in doc:
        if not tok.is_alpha:
            continue
        wrong = should_flag_wrong_capitalized(tok, nlp, text, field, regime)
        if wrong:
            key = (wrong["type"], wrong["word"], tok.idx)
            if key not in seen:
                seen.add(key)
                out = dict(wrong)
                out["textIndex"] = text_index
                out["regime"] = regime
                findings.append(out)
            continue
        noun = should_flag_noun_lowercase(tok, text, field, regime, obs)
        if noun:
            key = (noun["type"], noun["word"], tok.idx)
            if key not in seen:
                seen.add(key)
                out = dict(noun)
                out["textIndex"] = text_index
                out["regime"] = regime
                findings.append(out)
    return findings, obs


def main():
    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError as exc:
        print(json.dumps({"ok": False, "error": f"invalid_json: {exc}", "findings": []}))
        return

    if load_nlp() is None:
        print(json.dumps({"ok": False, "error": "model_not_installed", "findings": []}))
        return
    load_lexicon()

    findings = []
    observations = []
    items = payload.get("items")
    if isinstance(items, list) and items:
        for item in items:
            text = str(item.get("text") or "")
            field = str(item.get("field") or "")
            regime = normalize_regime(item.get("regime") or REGIME_PROSE)
            item_id = item.get("id")
            item_obs: list = []
            item_findings, _ = analyze_text(text, 0, field, regime, item_obs)
            for f in item_findings:
                out = dict(f)
                out["textIndex"] = 0
                out["field"] = field
                if item_id is not None:
                    out["id"] = item_id
                findings.append(out)
            for o in item_obs:
                out = dict(o)
                out["textIndex"] = 0
                out["field"] = field
                if item_id is not None:
                    out["id"] = item_id
                observations.append(out)
        print(json.dumps({"ok": True, "findings": findings, "observations": observations}, ensure_ascii=False))
        return

    texts = payload.get("texts") or []
    fields = payload.get("fields") or []
    regimes = payload.get("regimes") or []
    for i, text in enumerate(texts):
        field = fields[i] if i < len(fields) else ""
        regime = normalize_regime(regimes[i] if i < len(regimes) else REGIME_PROSE)
        batch_findings, batch_obs = analyze_text(str(text or ""), i, field, regime)
        findings.extend(batch_findings)
        observations.extend(batch_obs)
    print(json.dumps({"ok": True, "findings": findings, "observations": observations}, ensure_ascii=False))


if __name__ == "__main__":
    main()
