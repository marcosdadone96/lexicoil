/**
 * DWDS HTML heuristics for separable (trennbar) German verbs.
 * Used by verify-separable-dwds.mjs and offline fixture tests.
 */
export function classifyDwdsHtml(lemma, html) {
  const h = String(html || '');
  const low = lemma.toLowerCase();
  const reasons = [];

  if (/Seite nicht gefunden|kein Eintrag|nicht gefunden/i.test(h) && h.length < 5000) {
    return { status: 'not_found', reasons: ['DWDS 404/empty'], separable: false };
  }

  if (/Grammatik\s*Adjektiv/i.test(h) || /class="[^"]*dwdswb-ft-wortart[^"]*"[^>]*>\s*Adjektiv/i.test(h)) {
    reasons.push('DWDS Wortart Adjektiv');
    return { status: 'discard', reasons, separable: false };
  }

  if (/untrennbar/i.test(h) && !/trennbar/i.test(h.replace(/untrennbar/gi, ''))) {
    reasons.push('DWDS mentions untrennbar without trennbar');
  }

  const prefixes = [
    'herunter', 'zurück', 'zusammen', 'fort', 'ab', 'an', 'auf', 'aus', 'ein', 'mit', 'vor', 'zu',
    'nach', 'bei', 'weg', 'los', 'her', 'hin', 'über', 'unter', 'um',
  ].sort((a, b) => b.length - a.length);

  let pref = prefixes.find((p) => low.startsWith(p) && low.length > p.length + 2);
  if (low === 'anerkennen') pref = 'an';

  let sepHit = /trennbar/i.test(h) && !/untrennbar/i.test(h);

  // Grammatik line: «lädt herunter, lud herunter, hat heruntergeladen»
  const grammatikSplit = h.match(
    /Grammatik\s*Verb[^·]*·[^·]*?\b([a-zäöüß]+)\s+(herunter|zurück|zusammen|fort|ab|an|auf|aus|ein|mit|vor|zu|nach|bei|weg|los|her|hin|um)\b/i,
  );
  if (grammatikSplit) {
    sepHit = true;
    reasons.push(`DWDS Grammatik split: ${grammatikSplit[1]} … ${grammatikSplit[2]}`);
  }

  if (pref) {
    const particleAtEnd = new RegExp(
      `\\b[a-zäöüß]+(?:t|te|ten|st|et)?\\s+(?:sich\\s+)?${pref}\\b`,
      'i',
    );
    const partizipGe = new RegExp(`\\b${pref}ge[a-zäöüß]+\\b`, 'i');
    const zuInf = new RegExp(`\\b${pref}zu[a-zäöüß]+\\b`, 'i');
    if (particleAtEnd.test(h) || partizipGe.test(h) || zuInf.test(h)) {
      sepHit = true;
      reasons.push('split finite / ge-participle / zu-infinitive pattern');
    }
  }

  if (low === 'abhängen') {
    sepHit = true;
    reasons.push('dual accent; B1 separable sense accepted (hängt … ab)');
  }
  if (low === 'anerkennen') {
    sepHit = true;
    reasons.push('anerkennen: erkennt … an (trennbar)');
  }

  if (sepHit) return { status: 'accept', reasons, separable: true };

  if (/Grammatik\s*Verb/i.test(h) || />Verb</i.test(h)) {
    return {
      status: 'review',
      reasons: reasons.length ? reasons : ['verb page but weak split evidence'],
      separable: false,
    };
  }

  return { status: 'review', reasons: reasons.length ? reasons : ['unclear'], separable: false };
}
