/**
 * Lesen T5 — repair institution title/intro surfaces (uses titleVariantBank).
 */
import {
  genitiveInstitutionPhrase,
  inferInstitutionGender,
  buildT5TitleCandidates,
} from './titleVariantBank.mjs';

function escapeRe(s) {
  return String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function pickGrammarCorrectT5Title(institutionName, textSubtype, variantProfile = 'standard') {
  const gender = inferInstitutionGender(institutionName, textSubtype);
  const gen = genitiveInstitutionPhrase(institutionName);
  const candidates = buildT5TitleCandidates(textSubtype, institutionName, variantProfile);
  const prefer = (re) => candidates.find((t) => re.test(t));
  if (gender === 'neuter' || gender === 'masculine') {
    return (
      prefer(new RegExp(`des ${escapeRe(gen)}`, 'i')) ||
      prefer(new RegExp(`im ${escapeRe(institutionName)}`, 'i')) ||
      prefer(/des /i) ||
      candidates[0]
    );
  }
  return prefer(new RegExp(`der ${escapeRe(institutionName)}`, 'i')) || candidates[0];
}

export function repairT5InstitutionSurfaces(batch) {
  const seed = batch._t5InstitutionSeed;
  const p0 = batch.passages?.[0];
  if (!seed || !p0) return batch;

  const subtype = batch._t5TextSubtype || batch._t5Subtype || 'park';
  const profile = batch._t5VariantProfile || 'standard';
  const title = pickGrammarCorrectT5Title(seed, subtype, profile);

  let text = String(p0.text || '');
  const gender = inferInstitutionGender(seed, subtype);
  if (gender === 'neuter' || gender === 'masculine') {
    text = text.replace(new RegExp(`\\bin der ${escapeRe(seed)}`, 'gi'), `im ${seed}`);
    text = text.replace(new RegExp(`Willkommen in der ${escapeRe(seed)}`, 'gi'), `Willkommen im ${seed}`);
    const badTitleLine = new RegExp(
      `^(?:Hausordnung|Benutzungsordnung|Nutzungsordnung|Regeln|Ordnung|Richtlinien)\\s+der\\s+${escapeRe(seed)}`,
      'im',
    );
    if (badTitleLine.test(text)) {
      text = text.replace(badTitleLine, title);
    }
  }

  return {
    ...batch,
    _mandatedTitle: title,
    passages: [{ ...p0, title, text }],
  };
}

export function repairWeilClauseVerbOrder(text) {
  let s = String(text || '');
  s = s.replace(
    /\bweil\s+([^.,;]+?)\s+(sind|ist|war|waren|haben|hat)\s+([a-zäöüß][^.,;]*?)([.,])/gi,
    (full, mid, verb, rest, punct) => {
      const m = mid.trim();
      const r = rest.trim();
      if (!m || !r) return full;
      return `weil ${m} ${r} ${verb}${punct}`;
    },
  );
  s = s.replace(/\.\.+/g, '.');
  return s;
}
