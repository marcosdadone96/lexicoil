/* German function words — never save/index as learnable vocabulary */
const NEVER_INDEX = new Set([
  'ihren', 'ihre', 'ihr', 'ihrem', 'ihrer', 'seinen', 'seine', 'sein', 'seinem', 'seiner',
  'anderen', 'andere', 'anderem', 'anderer', 'unseren', 'unsere', 'euren', 'eure',
  'viele', 'viel', 'meisten', 'meist', 'einfach', 'manchmal', 'oft', 'selten',
  'etwas', 'nichts', 'alles', 'jeder', 'jede', 'jedes', 'dieser', 'diese', 'dieses',
  'der', 'die', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'einer', 'eines', 'einem',
  'und', 'oder', 'aber', 'nicht', 'auch', 'mit', 'von', 'zu', 'auf', 'in', 'an', 'für',
  'bei', 'nach', 'vor', 'über', 'unter', 'durch', 'als', 'wenn', 'weil', 'dass', 'ob',
  'so', 'noch', 'nur', 'schon', 'sehr', 'mehr', 'man', 'ich', 'du', 'er', 'sie', 'es', 'wir',
  'alle', 'ohne', 'dich', 'sich', 'wie', 'zum', 'zur', 'nie',
  'jedem', 'jeden', 'jede', 'jeder', 'dieses', 'dieser', 'diese',
]);

function normFnWord(s) {
  return String(s || '')
    .trim()
    .normalize('NFC')
    .toLowerCase();
}

function isFunctionWord(word) {
  const low = normFnWord(word);
  return low.length > 0 && NEVER_INDEX.has(low);
}

if (typeof module !== 'undefined') module.exports = { NEVER_INDEX, isFunctionWord, normFnWord };
if (typeof window !== 'undefined') window.FunctionWords = { NEVER_INDEX, isFunctionWord, normFnWord };
