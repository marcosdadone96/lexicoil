// ═══════════════════════════════════════════
// VOCAB TOOLTIP
// ═══════════════════════════════════════════
// C-1 fix: tooltip receives AI/pool-sourced data — escape before innerHTML
function _ttEsc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
const TT=document.getElementById('VT');let ttTimer=null;let _vocabActiveCk='';let _vocabHoverSpan=null;let _vocabDelegateBound=false;let _vocabMoveRaf=0;let _vocabHoverTimer=null;let _vocabFetchCtrl=null;let _vocabFetchTimer=null;let _vocabFetchCk='';let _vocabFetchPromise=null;
function _trLang(){return typeof translationLang==='function'?translationLang():(typeof resolveVocabUiLang==='function'?resolveVocabUiLang():(S.vocabLang||'en'));}
function abortVocabFetch(){if(_vocabFetchTimer){clearTimeout(_vocabFetchTimer);_vocabFetchTimer=null;}if(_vocabFetchCtrl){try{_vocabFetchCtrl.abort();}catch(_){}_vocabFetchCtrl=null;}_vocabFetchCk='';_vocabFetchPromise=null;}
/** Reject MyMemory spam URLs / non-gloss payloads in tooltip display + cache. */
function isJunkVocabTranslation(raw){
  const t=String(raw||'').trim();
  if(!t)return true;
  if(/MYMEMORY WARNING|QUOTA EXCEEDED|YOU USED ALL/i.test(t))return true;
  if(/^https?:\/\//i.test(t))return true;
  if(/\bhttps?:\/\//i.test(t))return true;
  if(/\b[\w.-]+\.(com|net|org|io|info)\b/i.test(t)&&/\/|www\./i.test(t))return true;
  if(/<[^>]+>/.test(t))return true;
  return false;
}
function vocabTranslationOf(data,lang){
  if(!data)return'';
  const code=String(lang||'en').toLowerCase().slice(0,2);
  const isEnDef=S.subject==='en'&&code==='en';
  const tk=isEnDef?'definition_en':'translation_'+code;
  let v=String(data[tk]||'').trim();
  if(!v&&code==='en')v=String(data.translation_en||data.definition_en||data.translation||'').trim();
  return v;
}
function purgeJunkVocabCacheEntry(ck){
  const data=S.vocabCache?.[ck];
  if(!data)return;
  if(isJunkVocabTranslation(vocabTranslationOf(data,_trLang())))delete S.vocabCache[ck];
}
const WORD_RE=/\b([A-Za-zÀ-ÖØ-öø-ÿÄÖÜäöüß]{2,})\b/gu;
function decodeVocabToken(raw){try{return decodeURIComponent(String(raw||''));}catch(_){return String(raw||'');}}
function setVocabActiveSpan(span){
  clearVocabActiveSpan();
  _vocabHoverSpan=span||null;
  if(!span)return;
  span.classList.add('vocab-active');
  // Bidirectional highlight: mate span of a split separable shares data-vocab-pair-id
  const pairId=span.dataset?.vocabPairId;
  if(pairId){
    const sel=typeof CSS!=='undefined'&&CSS.escape?CSS.escape(pairId):pairId.replace(/"/g,'');
    document.querySelectorAll(`.vocab-word[data-vocab-pair-id="${sel}"]`).forEach(el=>{
      el.classList.add('vocab-active');
    });
  }
}
function clearVocabActiveSpan(){
  document.querySelectorAll('.vocab-word.vocab-active').forEach(el=>el.classList.remove('vocab-active'));
  _vocabHoverSpan=null;
}
function vocabWordAtPoint(x,y){
  const stack=document.elementsFromPoint?.(x,y)||[];
  for(const el of stack){
    if(el?.closest?.('#VT .vt-interactive'))continue;
    const span=el?.closest?.('.vocab-word');
    if(span?.dataset?.vocab)return span;
  }
  return null;
}
function scheduleVocabHover(e){
  if(isOfficialMode())return;
  const x=e.clientX,y=e.clientY;
  cancelAnimationFrame(_vocabMoveRaf);
  _vocabMoveRaf=requestAnimationFrame(()=>{
    const span=vocabWordAtPoint(x,y);
    if(span){
      clearTimeout(ttTimer);
      clearTimeout(_vocabHoverTimer);
      if(span===_vocabHoverSpan&&TT.classList.contains('show')){posTT(e,span);return;}
      _vocabHoverTimer=setTimeout(()=>showVocabFromSpan(e,span),50);
      return;
    }
    if(!e.target?.closest?.('#VT .vt-interactive'))hideVocab();
  });
}
function vocabMissMessage(reason){
  if(reason==='invalid_api_key')return'Gemini rejected the API key used by netlify dev. If the project is linked to Netlify, the dashboard key overrides .env — update GEMINI_API_KEY in Netlify (Site settings → Environment variables) to match your working .env key, then restart netlify dev.';
  if(reason==='no_api_key')return'Translation service not configured. Add GEMINI_API_KEY to .env and restart netlify dev.';
  if(reason==='quota')return'Daily translation quota reached. Try again tomorrow or switch GEMINI_MODEL to gemini-2.5-flash-lite.';
  if(reason==='timeout')return'Translation timed out. Click the word to save it and try again.';
  if(reason==='network')return'Network error while translating. Check your connection and try again.';
  if(reason==='junk_translation')return'Translation source returned invalid data. Try another language or save the word manually.';
  return'Translation unavailable right now. Click the word to save it to your deck.';
}
function renderVocabMiss(word,reason){
  TT.innerHTML=`<div class="vt-word">${esc(word)}</div><div class="vt-loading" style="color:var(--text-secondary);line-height:1.5">${esc(vocabMissMessage(reason))}</div>`;
}
function vocabContextForSpan(span){
  if(!span)return'';
  const line=span.closest('.dlg-line')||span.closest('.readable-text');
  // Full clause/passage for reunify — do not truncate here (AI prompt truncates separately)
  return line?String(line.textContent||'').replace(/\s+/g,' ').trim():'';
}
function spanShowSave(span){return span?.dataset?.vocabSave!=='0';}
function spanSec(span){return span?.dataset?.vocabSec||'';}
function isWordSaved(word){
  const lvl=String(S.level||'').toUpperCase();
  return S.flashcards.some(f=>(f.word===word||f.surface===word)&&f.sourceLang===S.subject&&fcSourceLevel(f)===lvl);
}
function flashcardForWord(word){
  const lvl=String(S.level||'').toUpperCase();
  return(S.flashcards||[]).find(f=>(f.word===word||f.surface===word)&&f.sourceLang===S.subject&&fcSourceLevel(f)===lvl);
}
/** Resolve separable / lemma at save time (sentence context from DOM). */
function resolveVocabForSave(word,context){
  if(typeof SeparableResolve!=='undefined'&&SeparableResolve.resolveForSave){
    return SeparableResolve.resolveForSave(word,context||'');
  }
  return{word,surface:word,reunified:false,lemmaUncertain:false};
}
/**
 * Authoritative resolve from a vocab span.
 * Wrap-time data-vocab-lemma (set when pairing succeeds) wins over re-scan —
 * avoids tooltip/save showing «bieten» while «bietet…an» is highlighted.
 */
function resolveVocabFromSpan(span){
  const surface=decodeVocabToken(span?.dataset?.vocab||'');
  const pairId=span?.dataset?.vocabPairId||'';
  const wrapLemma=span?.dataset?.vocabLemma?decodeVocabToken(span.dataset.vocabLemma):'';
  const context=vocabContextForSpan(span);
  const allow=typeof SeparableResolve!=='undefined'?SeparableResolve.SEPARABLE_INFINITIVES:null;
  if(wrapLemma&&(pairId||(allow&&allow.has(wrapLemma)))){
    return{word:wrapLemma,surface:surface||wrapLemma,reunified:true,lemmaUncertain:false,pairId,context};
  }
  const resolved=resolveVocabForSave(surface,context);
  return{
    word:resolved.word||surface,
    surface:resolved.surface||surface,
    reunified:!!resolved.reunified,
    lemmaUncertain:!!resolved.lemmaUncertain,
    pairId,
    context,
  };
}
const VOCAB_POS_CLASSES=['vocab-pos-noun','vocab-pos-verb','vocab-pos-adjective','vocab-pos-adverb','vocab-pos-phrase','vocab-pos-other'];
function resolveVocabPos(word,stored){
  let t=typeof normWordType==='function'?normWordType(stored):'other';
  if((!stored||t==='other')&&typeof ManualVocab!=='undefined'&&ManualVocab.inferPos){
    t=normWordType(ManualVocab.inferPos({word,type:stored,pos:stored},S.subject));
  }
  return t||'other';
}
window.resolveVocabPos=resolveVocabPos;
window.markedWordPosClass=function(word,stored){
  const t=resolveVocabPos(word,stored);
  return t&&t!=='other'?` marked-word--${t}`:'';
};
function vocabPosClassName(pos,word){
  const t=word?resolveVocabPos(word,pos):(typeof normWordType==='function'?normWordType(pos):'other');
  return t?` vocab-pos-${t}`:'';
}
function clearVocabPosClasses(el){
  if(!el)return;
  VOCAB_POS_CLASSES.forEach(c=>el.classList.remove(c));
}
function markVocabSaved(word,pos,pairId){
  const stored=pos||(flashcardForWord(word)?.type||flashcardForWord(word)?.pos||S.vocabCache?.[`${word}_${S.subject}_${_trLang()}`]?.pos||S.vocabCache?.[`${word}_${S.subject}_${_trLang()}`]?.type);
  const posCls=vocabPosClassName(stored,word);
  const apply=(el)=>{
    el.classList.remove('vocab-marked','vocab-marked-official');
    el.classList.add('vocab-saved');
    clearVocabPosClasses(el);
    posCls.trim().split(/\s+/).filter(Boolean).forEach(c=>el.classList.add(c));
  };
  // Separable pairs: ONLY mark the paired spans — never all «an»/«vor»/«mit» in the passage
  if(pairId){
    const sel=typeof CSS!=='undefined'&&CSS.escape?CSS.escape(pairId):String(pairId).replace(/"/g,'');
    document.querySelectorAll(`.vocab-word[data-vocab-pair-id="${sel}"]`).forEach(apply);
    return;
  }
  document.querySelectorAll(`[data-vocab="${encodeURIComponent(word)}"]`).forEach(apply);
}
function unmarkVocabSaved(word,pairId){
  if(pairId){
    const sel=typeof CSS!=='undefined'&&CSS.escape?CSS.escape(pairId):String(pairId).replace(/"/g,'');
    document.querySelectorAll(`.vocab-word[data-vocab-pair-id="${sel}"]`).forEach(el=>{
      el.classList.remove('vocab-saved');
      clearVocabPosClasses(el);
    });
    return;
  }
  document.querySelectorAll(`[data-vocab="${encodeURIComponent(word)}"]`).forEach(el=>{
    el.classList.remove('vocab-saved');
    clearVocabPosClasses(el);
  });
}
function isWordMarked(word){
  const w=String(word||'');
  return(S.activeSession?.markedWords||[]).some(m=>{
    if(!m)return false;
    if(m.word===w)return true;
    if(Array.isArray(m.surfaces)&&m.surfaces.includes(w))return true;
    return false;
  });
}
function markVocabMarked(word,pairId){
  const cls=isOfficialMode()?'vocab-marked-official':'vocab-marked';
  const apply=(el)=>{
    el.classList.remove('vocab-marked','vocab-marked-official','vocab-saved');
    clearVocabPosClasses(el);
    el.classList.add(cls);
  };
  if(pairId){
    const sel=typeof CSS!=='undefined'&&CSS.escape?CSS.escape(pairId):String(pairId).replace(/"/g,'');
    document.querySelectorAll(`.vocab-word[data-vocab-pair-id="${sel}"]`).forEach(apply);
    return;
  }
  document.querySelectorAll(`[data-vocab="${encodeURIComponent(word)}"]`).forEach(apply);
}
function unmarkVocabMarked(word,pairId){
  if(pairId){
    const sel=typeof CSS!=='undefined'&&CSS.escape?CSS.escape(pairId):String(pairId).replace(/"/g,'');
    document.querySelectorAll(`.vocab-word[data-vocab-pair-id="${sel}"]`).forEach(el=>{
      el.classList.remove('vocab-marked','vocab-marked-official');
    });
    return;
  }
  document.querySelectorAll(`[data-vocab="${encodeURIComponent(word)}"]`).forEach(el=>{
    el.classList.remove('vocab-marked','vocab-marked-official');
  });
}
/** Collect surface forms sharing a separable pair id (root + particle). */
function surfacesForVocabPair(pairId,fallbackWord){
  const out=[];
  const push=(w)=>{if(w&&!out.includes(w))out.push(w);};
  push(fallbackWord);
  if(!pairId)return out;
  const sel=typeof CSS!=='undefined'&&CSS.escape?CSS.escape(pairId):String(pairId).replace(/"/g,'');
  document.querySelectorAll(`.vocab-word[data-vocab-pair-id="${sel}"]`).forEach(el=>{
    push(decodeVocabToken(el.dataset.vocab));
  });
  return out;
}
function markWordOfficial(word,sec,pairId,context,storeLemma){
  if(!S.activeSession)initExamSession('official');
  const pair=pairId||'';
  const surfaces=surfacesForVocabPair(pair,word);
  const alreadyIdx=S.activeSession.markedWords.findIndex(m=>{
    if(!m)return false;
    if(pair&&m.pairId===pair)return true;
    if(m.word===word)return true;
    if(Array.isArray(m.surfaces)&&m.surfaces.some(s=>surfaces.includes(s)))return true;
    return surfaces.includes(m.word);
  });
  if(alreadyIdx>=0){
    const prev=S.activeSession.markedWords[alreadyIdx];
    const prevPair=prev?.pairId||pair;
    const prevSurfaces=Array.isArray(prev?.surfaces)&&prev.surfaces.length
      ?prev.surfaces
      :surfacesForVocabPair(prevPair,prev?.word||word);
    S.activeSession.markedWords.splice(alreadyIdx,1);
    // Also drop any duplicate entries for mate surfaces
    S.activeSession.markedWords=S.activeSession.markedWords.filter(m=>{
      if(!m)return false;
      if(prevPair&&m.pairId===prevPair)return false;
      if(prevSurfaces.includes(m.word))return false;
      if(Array.isArray(m.surfaces)&&m.surfaces.some(s=>prevSurfaces.includes(s)))return false;
      return true;
    });
    prevSurfaces.forEach(s=>unmarkVocabMarked(s,prevPair));
  }else{
    const resolved=storeLemma
      ?{word:storeLemma,reunified:true}
      :resolveVocabForSave(word,context||'');
    const storeWord=resolved.reunified?resolved.word:(storeLemma||word);
    S.activeSession.markedWords.push({
      word:storeWord,
      surface:word,
      surfaces,
      pairId:pair||undefined,
      reunified:!!resolved.reunified||!!storeLemma,
      sec,
      markedAt:Date.now(),
    });
    surfaces.forEach(s=>markVocabMarked(s,pair));
  }
  S.activeSession.updatedAt=Date.now();
  syncOfficialFlight();
}
function vocabClick(e,ew,sec,showSave){
  const span=e?.currentTarget?.classList?.contains('vocab-word')?e.currentTarget:null;
  if(span) return vocabClickFromSpan(e,span);
  e.stopPropagation();
  clearTimeout(ttTimer);
  const word=decodeVocabToken(ew);
  if(isOfficialMode()){markWordOfficial(word,sec,'', '');TT.classList.remove('show');return;}
  showVocab(e,ew,sec,showSave);
  if(showSave&&isPracticeMode())void saveWordQuick(word,vocabContextForSpan(_vocabHoverSpan),_vocabHoverSpan?.dataset?.vocabPairId);
}
function vocabClickFromSpan(e,span){
  e.stopPropagation();
  clearTimeout(ttTimer);
  const resolved=resolveVocabFromSpan(span);
  const word=resolved.surface||decodeVocabToken(span.dataset.vocab);
  const sec=spanSec(span);
  const showSave=spanShowSave(span);
  if(isOfficialMode()){
    markWordOfficial(
      word,
      sec,
      resolved.pairId||'',
      resolved.context,
      resolved.reunified?resolved.word:''
    );
    TT.classList.remove('show');
    return;
  }
  showVocabFromSpan(e,span);
  if(showSave&&isPracticeMode())void saveWordQuickFromSpan(span);
}
function applyGenderToVocabData(data,word,subject){
  if(!data)return data;
  const fc={word:data.word||word,gender:data.gender,article:data.article,type:data.type||data.pos,sourceLang:subject||S.subject};
  if(typeof ManualVocab!=='undefined'&&ManualVocab.enrichFlashcard)ManualVocab.enrichFlashcard(fc,subject||S.subject);
  data.word=fc.word;
  data.gender=fc.gender;
  data.article=fc.article;
  data.type=data.type||fc.type;
  data.pos=data.pos||fc.pos;
  return data;
}
async function applyGenderToVocabDataAsync(data,word,subject){
  if(!data)return data;
  const fc={word:data.word||word,gender:data.gender,article:data.article,type:data.type||data.pos,sourceLang:subject||S.subject};
  if(typeof ManualVocab!=='undefined'&&ManualVocab.enrichGenderAiFallback){
    await ManualVocab.enrichGenderAiFallback(fc,subject||S.subject);
  }else if(typeof ManualVocab!=='undefined'&&ManualVocab.enrichFlashcard){
    ManualVocab.enrichFlashcard(fc,subject||S.subject);
  }
  data.word=fc.word;
  data.gender=fc.gender;
  data.article=fc.article;
  data.type=data.type||fc.type;
  data.pos=data.pos||fc.pos;
  data.genderSource=fc.genderSource;
  return data;
}
async function saveWordQuickFromSpan(span){
  let resolved=resolveVocabFromSpan(span);
  const context=resolved.context||'';
  const needAi=typeof SeparableResolve!=='undefined'&&SeparableResolve.needsAiLemmaFallback
    ?SeparableResolve.needsAiLemmaFallback(resolved,context,S.subject)
    :false;
  if(needAi&&typeof fetchVocabLemma==='function'){
    try{
      const hit=await fetchVocabLemma(resolved.surface,context);
      if(hit?.found&&hit.lemma&&!isJunkVocabTranslation(hit.lemma)){
        resolved={...resolved,word:hit.lemma,reunified:hit.lemma.toLowerCase()!==String(resolved.surface).toLowerCase(),lemmaUncertain:false,aiLemma:true};
      }
    }catch(_){}
  }
  return saveWordQuick(resolved.surface,resolved.context,resolved.pairId,resolved);
}
async function saveWordQuick(word,context,pairId,preResolved){
  const resolved=preResolved&&preResolved.word?preResolved:resolveVocabForSave(word,context);
  const saveWord=resolved.word||word;
  const surface=resolved.surface||word;
  const saveMeta={word:saveWord,surface,reunified:!!resolved.reunified,lemmaUncertain:!!resolved.lemmaUncertain};
  const pair=pairId||resolved.pairId||_vocabHoverSpan?.dataset?.vocabPairId||'';
  if(isWordSaved(saveWord)||isWordSaved(surface)){
    const existing=flashcardForWord(saveWord)||flashcardForWord(surface);
    if(typeof removeSavedWordFromDeck==='function')removeSavedWordFromDeck(existing?.word||saveWord);
    unmarkVocabSaved(surface,pair);
    if(saveWord!==surface)unmarkVocabSaved(saveWord,pair);
    autosaveSession();
    const ck=`${saveWord}_${S.subject}_${_trLang()}`;
    if(S.vocabCache[ck])renderTT(S.vocabCache[ck],saveWord,true);
    return;
  }
  const ck=`${saveWord}_${S.subject}_${_trLang()}`;
  if(S.vocabCache[ck]){
    saveToFCData({...S.vocabCache[ck],...saveMeta,word:saveWord,pairId:pair});
    markVocabSaved(surface,S.vocabCache[ck].type||S.vocabCache[ck].pos,pair);
    autosaveSession();
    return;
  }
  try{await fetchVocab(saveWord,ck,true,true,context,{...saveMeta,pairId:pair});autosaveSession();}catch(_){
    if(!isWordSaved(saveWord)&&!isWordSaved(surface)){
      const meta=await applyGenderToVocabDataAsync({word:saveWord,...saveMeta,pairId:pair},saveWord,S.subject);
      saveToFCData(meta);
      markVocabSaved(surface,meta.type||meta.pos,pair);
    }
  }
}
function showVocab(e,ew,sec,showSave=true){if(isOfficialMode())return;const span=e?.currentTarget?.classList?.contains('vocab-word')?e.currentTarget:null;if(span){showVocabFromSpan(e,span);return;}clearTimeout(ttTimer);const word=decodeVocabToken(ew);if(word.length<2)return;S._vocabShowSave=showSave;clearVocabActiveSpan();posTT(e,null);TT.classList.add('show');const ck=`${word}_${S.subject}_${_trLang()}`;if(S.vocabCache[ck]){renderTT(S.vocabCache[ck],word,showSave);return;}TT.innerHTML=`<div class="vt-word">${esc(word)}</div><div class="vt-loading"><span class="vt-dot"></span><span class="vt-dot"></span><span class="vt-dot"></span> Looking up\u2026</div>`;fetchVocab(word,ck,showSave,false,'');}
async function showVocabFromSpan(e,span){
  if(isOfficialMode()||!span)return;
  clearTimeout(ttTimer);
  clearTimeout(_vocabHoverTimer);
  let resolved=resolveVocabFromSpan(span);
  const surface=resolved.surface||decodeVocabToken(span.dataset.vocab);
  if(surface.length<2&&!(resolved.word||'').length)return;
  setVocabActiveSpan(span);
  const showSave=spanShowSave(span);
  S._vocabShowSave=showSave;
  posTT(e,span);
  TT.classList.add('show');
  const context=resolved.context||vocabContextForSpan(span);
  let lookupWord=resolved.reunified?resolved.word:(resolved.word||surface);
  let reunified=!!resolved.reunified;
  // AI lemma safety net — ONLY when allowlist reunify failed
  const needAi=typeof SeparableResolve!=='undefined'&&SeparableResolve.needsAiLemmaFallback
    ?SeparableResolve.needsAiLemmaFallback(resolved,context,S.subject)
    :false;
  if(needAi&&typeof fetchVocabLemma==='function'){
    TT.innerHTML=`<div class="vt-word">${esc(lookupWord)}</div><div class="vt-loading"><span class="vt-dot"></span><span class="vt-dot"></span><span class="vt-dot"></span> Looking up\u2026</div>`;
    try{
      const hit=await fetchVocabLemma(surface,context);
      if(hit?.found&&hit.lemma&&!isJunkVocabTranslation(hit.lemma)){
        lookupWord=hit.lemma;
        reunified=hit.lemma.toLowerCase()!==surface.toLowerCase();
        resolved={...resolved,word:hit.lemma,reunified,lemmaUncertain:false,aiLemma:true};
      }
    }catch(_){/* keep surface/list lemma */}
  }
  const ck=`${lookupWord}_${S.subject}_${_trLang()}`;
  _vocabActiveCk=ck;
  purgeJunkVocabCacheEntry(ck);
  if(S.vocabCache[ck]){renderTT(S.vocabCache[ck],lookupWord,showSave);return;}
  TT.innerHTML=`<div class="vt-word">${esc(lookupWord)}</div><div class="vt-loading"><span class="vt-dot"></span><span class="vt-dot"></span><span class="vt-dot"></span> Looking up\u2026</div>`;
  const hoverMeta=reunified?{word:lookupWord,surface,reunified:true,lemmaUncertain:false,pairId:resolved.pairId||'',aiLemma:!!resolved.aiLemma}:null;
  fetchVocab(lookupWord,ck,showSave,false,context,hoverMeta);
}
function posTT(e,span){
  const r=span?.getBoundingClientRect?.();
  const vw=window.innerWidth,vh=window.innerHeight;
  const tw=290,th=230;
  let left,top;
  if(r){
    left=r.left+r.width/2-tw/2;
    top=r.top-th-10;
    if(top<8)top=r.bottom+8;
  }else{
    left=(e?.clientX||0)+14;
    top=(e?.clientY||0)-20;
  }
  if(left+tw>vw-16)left=vw-tw-16;
  if(left<8)left=8;
  if(top+th>vh-16)top=Math.max(8,vh-th-16);
  TT.style.left=left+'px';
  TT.style.top=top+'px';
}
function hideVocab(){ttTimer=setTimeout(()=>{TT.classList.remove('show');clearVocabActiveSpan();},350);}
async function fetchVocab(word,ck,showSave=true,autoSave=false,context='',saveMeta=null){
  const reqCk=ck;
  const ctx=String(context||'').trim().slice(0,500);
  const withMeta=(d)=>{
    if(!d||!saveMeta)return d;
    return{...d,...saveMeta,word:saveMeta.word||d.word||word};
  };
  const markSurface=saveMeta?.surface||word;
  const markPair=saveMeta?.pairId||'';
  const finishHit=async(data)=>{
    await applyGenderToVocabDataAsync(data,word,S.subject);
    // Keep reunified lemma as display/save word (do not let enrich rename it)
    if(saveMeta?.word)data.word=saveMeta.word;
    else if(data.word&&String(data.word).toLowerCase()!==String(word).toLowerCase()&&saveMeta?.reunified){
      data.word=word;
    }else if(!data.word)data.word=word;
    S.vocabCache[ck]=data;
    if(reqCk!==_vocabActiveCk)return;
    renderTT(data,word,showSave);
    if(autoSave){saveToFCData(withMeta(data));markVocabSaved(markSurface,data.type||data.pos,markPair);}
  };
  // Same cache key already in flight (hover + click save): reuse, do not abort
  if(_vocabFetchCk===reqCk&&_vocabFetchPromise){
    try{
      await _vocabFetchPromise;
      if(S.vocabCache[ck]&&autoSave&&!isWordSaved(word)&&!(saveMeta?.surface&&isWordSaved(saveMeta.surface))){
        saveToFCData(withMeta({...S.vocabCache[ck]}));
        markVocabSaved(markSurface,S.vocabCache[ck].type||S.vocabCache[ck].pos,markPair);
      }else if(S.vocabCache[ck]&&reqCk===_vocabActiveCk){
        renderTT(S.vocabCache[ck],word,showSave);
      }
    }catch(_){}
    return;
  }
  abortVocabFetch();
  _vocabFetchCtrl=typeof AbortController!=='undefined'?new AbortController():null;
  const fetchSignal=_vocabFetchCtrl?.signal;
  if(_vocabFetchCtrl)_vocabFetchTimer=setTimeout(()=>{try{_vocabFetchCtrl?.abort();}catch(_){}},12000);
  _vocabFetchCk=reqCk;
  const run=async()=>{
    try{
      purgeJunkVocabCacheEntry(ck);
      if(S.vocabCache[ck]){
        if(reqCk!==_vocabActiveCk)return;
        renderTT(S.vocabCache[ck],word,showSave);
        if(autoSave){saveToFCData(withMeta({...S.vocabCache[ck]}));markVocabSaved(markSurface,S.vocabCache[ck].type||S.vocabCache[ck].pos,markPair);}
        return;
      }
      let data=null;
      // 1) Local separable gloss FIRST (trusted; never MyMemory/AI for allowlisted lemmas)
      if(typeof SeparableResolve!=='undefined'&&SeparableResolve.localGloss){
        data=SeparableResolve.localGloss(word,_trLang(),S.subject);
      }
      // 2) Deck / library — skip if translation is junk (poisoned prior MyMemory save)
      if(!data&&typeof PracticeDictionary!=='undefined'){
        const dictHit=await PracticeDictionary.lookup(word,S.subject,S.level,_trLang()).catch(()=>null);
        if(dictHit&&!isJunkVocabTranslation(vocabTranslationOf(dictHit,_trLang())))data=dictHit;
      }
      if(data){
        data.type=data.type||data.pos||'verb';
        await finishHit(data);
        return;
      }
      // 3) Remote cache / Gemini — reject junk translations
      let missReason='miss';
      const cacheHit=typeof fetchVocabCache==='function'
        ?await fetchVocabCache(S.subject,_trLang(),word,ctx,fetchSignal)
        :{found:false};
      if(cacheHit?.reason==='aborted')return;
      if(cacheHit?.translation&&!isJunkVocabTranslation(cacheHit.translation)){
        const isEnDef=S.subject==='en'&&_trLang()==='en';
        data={word,type:'verb',pos:'verb',source:cacheHit.source||'cache'};
        if(isEnDef)data.definition_en=cacheHit.translation;
        else data[`translation_${_trLang()}`]=cacheHit.translation;
        await finishHit(data);
        return;
      }
      if(cacheHit?.translation&&isJunkVocabTranslation(cacheHit.translation)){
        missReason='junk_translation';
      }else{
        missReason=cacheHit?.reason||missReason;
      }
      if(reqCk!==_vocabActiveCk)return;
      if(autoSave&&!isWordSaved(word)&&!(saveMeta?.surface&&isWordSaved(saveMeta.surface))){
        const meta=await applyGenderToVocabDataAsync(withMeta({word,type:'',pos:''})||{word,type:'',pos:''},word,S.subject);
        if(saveMeta?.word)meta.word=saveMeta.word;
        saveToFCData(meta);
        markVocabSaved(markSurface,meta.type||meta.pos,markPair);
        renderTT(meta,word,showSave);
        return;
      }
      renderVocabMiss(word,missReason);
    }catch(e){
      if(e?.name==='AbortError')return;
      if(reqCk!==_vocabActiveCk)return;
      renderVocabMiss(word,'network');
    }finally{
      if(_vocabFetchTimer){clearTimeout(_vocabFetchTimer);_vocabFetchTimer=null;}
      if(_vocabFetchCk===reqCk){_vocabFetchCk='';_vocabFetchPromise=null;}
    }
  };
  _vocabFetchPromise=run();
  await _vocabFetchPromise;
}
function renderTT(data,word,showSave=true){
  const isEnDef=S.subject==='en'&&_trLang()==='en';
  const tk=isEnDef?'definition_en':'translation_'+_trLang();
  const exk=`example_${S.subject==='de'?'german':'english'}`,extk=`example_${_trLang()}`;
  let trans=data[tk]||data.translation_en||data.translation_es||data.definition_en||data.translation||'\u2014';
  if(isJunkVocabTranslation(trans)){
    // Never show spam URLs in the translation slot
    const gloss=typeof SeparableResolve!=='undefined'&&SeparableResolve.localGloss
      ?SeparableResolve.localGloss(data.word||word,_trLang(),S.subject)
      :null;
    const rescue=gloss?vocabTranslationOf(gloss,_trLang()):'';
    trans=rescue||'\u2014';
    if(rescue){
      if(isEnDef)data.definition_en=rescue;
      else data[`translation_${_trLang()}`]=rescue;
      data.source=data.source||'separable-gloss';
    }
  }
  let alt='';
  if(S.subject==='de'&&_trLang()!=='en'&&data.translation_en)alt=`<div style="font-size:12px;color:var(--text-secondary);margin-top:6px"><b style="color:var(--brand)">EN:</b> ${esc(data.translation_en)}</div>`;
  else if(S.subject==='en'&&_trLang()!=='es'&&data.translation_es)alt=`<div style="font-size:12px;color:var(--text-secondary);margin-top:6px"><b style="color:var(--brand)">ES:</b> ${esc(data.translation_es)}</div>`;
  else if(S.subject==='en'&&_trLang()!=='en'&&data.definition_en)alt=`<div style="font-size:12px;color:var(--text-secondary);margin-top:6px"><b style="color:var(--brand)">EN:</b> ${esc(data.definition_en)}</div>`;
  const enAlt=alt;
  const ex=data[exk]||'',ext=data[extk]||'';
  const w=data.word||word;
  const saved=isWordSaved(w);
  const enc=encodeURIComponent(JSON.stringify(data)),lang=S.subject==='de'?'de-DE':'en-GB';
  const saveBtn=showSave?(isPracticeMode()?`<div class="vt-save saved vt-interactive" id="vtSave">${saved?'\u2713 In your deck \u00b7 click again to remove':'\u2713 Saving\u2026'}</div>`:`<button class="vt-save vt-interactive${saved?' saved':''}" id="vtSave" onmousedown="event.preventDefault();event.stopPropagation()" onclick="event.stopPropagation();saveToFC('${enc}')">${saved?'\u2713 Saved':'\uff0b Save to Deck'}</button>`):'';
  const fcLike={word:data.word||word,gender:data.gender,article:data.article,type:data.type||data.pos,sourceLang:S.subject};
  const wordHead=typeof fcWordDisplayHtml==='function'?fcWordDisplayHtml(fcLike,S.subject):esc(w);
  const safePhon=_ttEsc(data.phonetic||''),safePos=_ttEsc(data.pos||'');
  TT.innerHTML=`<div class="vt-body">${`<div class="vt-header"><div class="vt-word">${wordHead}</div><button class="vt-ab vt-interactive" onclick="speakBtn('${encodeURIComponent(typeof fcSpeakPhrase==='function'?fcSpeakPhrase(fcLike,S.subject):(data.word||word))}','${lang}',this)">\uD83D\uDD0A</button></div>${safePhon?`<div class="vt-phonetic">${safePhon}</div>`:''} ${safePos?`<span class="vt-pos">${safePos}</span>`:''}<div class="vt-translation">${esc(trans)}</div>${enAlt}${ex?`<div class="vt-example">${esc(ex)}${ext?`<br><em style="color:var(--text-muted);margin-top:3px;display:block">${esc(ext)}</em>`:''}</div>`:''}`}</div><div class="vt-interactive vt-interactive-row">${`<div class="vt-lang-row">${vocabUiLangs().map(l=>`<button type="button" class="vt-lb vt-lb-tt vt-interactive${_trLang()===l.code?' active':''}" data-lang="${l.code}" onclick="chTTLang('${encodeURIComponent(data.word||word)}','${l.code}',this)">${l.l}</button>`).join('')}</div>${saveBtn}`}</div>`;
}
async function chTTLang(ew,lang,btn){
  if(typeof setVocabUiLang==='function')setVocabUiLang(lang,btn);
  else if(typeof syncUiLangMirrors==='function')syncUiLangMirrors(lang);
  const fromSpan=_vocabHoverSpan?resolveVocabFromSpan(_vocabHoverSpan):null;
  const surface=fromSpan?.surface||decodeVocabToken(ew);
  const context=fromSpan?.context||vocabContextForSpan(_vocabHoverSpan);
  let lookupWord=fromSpan?.word||surface;
  if(!fromSpan?.reunified){
    const resolved=resolveVocabForSave(surface,context);
    if(resolved.reunified)lookupWord=resolved.word;
  }
  const ck=`${lookupWord}_${S.subject}_${_trLang()}`;
  const ss=S._vocabShowSave!==false;
  _vocabActiveCk=ck;
  if(S.vocabCache[ck]){renderTT(S.vocabCache[ck],lookupWord,ss);return;}
  TT.innerHTML=`<div class="vt-word">${esc(lookupWord)}</div><div class="vt-loading"><span class="vt-dot"></span><span class="vt-dot"></span><span class="vt-dot"></span></div>`;
  const reunified=!!(fromSpan?.reunified||lookupWord!==surface);
  const meta=reunified
    ?{word:lookupWord,surface,reunified:true,pairId:fromSpan?.pairId||_vocabHoverSpan?.dataset?.vocabPairId||''}
    :null;
  await fetchVocab(lookupWord,ck,ss,false,context,meta);
}
function setVL(lang,btn){
  if(typeof setVocabUiLang==='function')setVocabUiLang(lang,btn);
  else if(typeof syncUiLangMirrors==='function')syncUiLangMirrors(lang);
}
function refreshOpenVocabTooltip(){
  if(!TT?.classList?.contains('show')||!_vocabHoverSpan)return;
  const span=_vocabHoverSpan;
  if(typeof showVocabFromSpan==='function')showVocabFromSpan({currentTarget:span},span);
}
/** Map WORD_RE match indices → { id, lemma } for split separables. */
function separablePairMetaByMatchIndex(line,sec){
  const map=new Map();
  if(typeof SeparableResolve==='undefined'||!SeparableResolve.findSplitPairs)return map;
  if(S.subject&&S.subject!=='de')return map;
  const tokens=SeparableResolve.tokenize(line);
  const pairs=SeparableResolve.findSplitPairs(tokens);
  if(!pairs.length)return map;
  const tokToWord=[];
  let wi=0;
  for(let i=0;i<tokens.length;i++){
    if(SeparableResolve.isBreakToken(tokens[i]))tokToWord[i]=-1;
    else tokToWord[i]=wi++;
  }
  const re=new RegExp(WORD_RE.source,WORD_RE.flags);
  const matches=[...String(line).matchAll(re)];
  let n=0;
  const secSafe=String(sec||'x').replace(/[^\w\-]+/g,'_');
  for(const p of pairs){
    const ri=tokToWord[p.rootTokenIndex];
    const pi=tokToWord[p.particleTokenIndex];
    if(ri<0||pi<0||ri>=matches.length||pi>=matches.length)continue;
    if(String(matches[ri][0]).toLowerCase()!==p.rootToken)continue;
    if(String(matches[pi][0]).toLowerCase()!==p.particleToken)continue;
    const id=`sep_${secSafe}_${p.lemma}_${n++}`;
    const meta={id,lemma:p.lemma};
    map.set(ri,meta);
    map.set(pi,meta);
  }
  return map;
}
function wrapLineW(line,sec,showSave=true){
  if(!line)return'';
  const pairMeta=separablePairMetaByMatchIndex(line,sec);
  let matchIdx=0;
  const re=new RegExp(WORD_RE.source,WORD_RE.flags);
  return String(line).replace(re,(m)=>{
    const enc=encodeURIComponent(m);
    const meta=pairMeta.get(matchIdx);
    const pairId=meta?.id;
    const lemma=meta?.lemma||'';
    const savedHit=showSave&&(isWordSaved(m)||(lemma&&isWordSaved(lemma)));
    const fc=savedHit?(flashcardForWord(m)||(lemma?flashcardForWord(lemma):null)):null;
    const cachePos=S.vocabCache?.[`${lemma||m}_${S.subject}_${_trLang()}`]||S.vocabCache?.[`${m}_${S.subject}_${_trLang()}`];
    const storedPos=fc?.type||fc?.pos||cachePos?.type||cachePos?.pos;
    const posCls=fc||cachePos||savedHit?vocabPosClassName(storedPos,lemma||m):('');
    const saved=savedHit?' vocab-saved':'';
    const marked=isWordMarked(m)?(isOfficialMode()?' vocab-marked-official':' vocab-marked'):'';
    const target=(typeof TargetUsage!=='undefined'&&S.examData?.vocabPersonal&&TargetUsage.isVerifiedSurface(S.examData,m))?' vocab-target':'';
    const secAttr=String(sec||'').replace(/"/g,'&quot;');
    matchIdx+=1;
    const pairAttr=pairId?` data-vocab-pair-id="${pairId.replace(/"/g,'')}"`:'';
    const lemmaAttr=lemma?` data-vocab-lemma="${encodeURIComponent(lemma)}"`:'';
    return`<span class="vocab-word${saved}${posCls}${marked}${target}" data-vocab="${enc}" data-vocab-sec="${secAttr}" data-vocab-save="${showSave?'1':'0'}"${pairAttr}${lemmaAttr}>${m}</span>`;
  });
}
function bindVocabWordEvents(){
  if(_vocabDelegateBound)return;
  _vocabDelegateBound=true;
  document.addEventListener('pointermove',scheduleVocabHover,{passive:true});
  document.addEventListener('pointerdown',(e)=>{
    if(e.target.closest?.('#VT .vt-interactive'))return;
    const span=e.target.closest?.('.vocab-word');
    if(!span?.dataset?.vocab)return;
    vocabClickFromSpan(e,span);
  });
  if(TT){
    TT.addEventListener('mouseenter',()=>clearTimeout(ttTimer));
    TT.addEventListener('mouseleave',(e)=>{
      if(!e.relatedTarget?.closest?.('.vocab-word'))hideVocab();
    });
  }
}
if(typeof document!=='undefined'){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bindVocabWordEvents);else bindVocabWordEvents();}
function isSpeakerLabel(label){
  const s=String(label||'').trim();
  if(!s||/^\d{1,2}$/.test(s))return false;
  if(/^\d{1,2}:\d{2}$/.test(s))return false;
  return true;
}
function splitDialogueInline(text){
  let s=sanitizeExamText(text);
  s=s.replace(/([.!?…])\s+(?=(?:Moderator(?:in)?|Interviewer(?:in)?|Gast|Herr|Frau|Dr\.|Prof\.|[A-ZÄÖÜ][a-zäöüß]*(?:\s+[A-ZÄÖÜ][a-zäöüß.]+)*)\s*:)/g,'$1\n');
  s=s.replace(/([^\n])\s+(?=(?:Moderator(?:in)?|Interviewer(?:in)?|Gast)\s*:)/g,'$1\n');
  s=s.replace(/([^\n])\s+(?=[A-Z]:\s)/g,'$1\n');
  return s;
}
function formatReadableText(text,sec,showSave=true){
  if(!text)return'';
  const lines=splitDialogueInline(text).split('\n').map(l=>l.trim()).filter(Boolean);
  if(lines.length===1){
    const dm=lines[0].match(/^([A-Za-zÄÖÜäöüß][^:]{0,60}?):\s*(.*)$/);
    if(dm&&isSpeakerLabel(dm[1])){
      return`<div class="dlg-line"><span class="dlg-speaker">${esc(dm[1].trim())}:</span> ${wrapLineW(dm[2],sec,showSave)}</div>`;
    }
    return wrapLineW(lines[0],sec,showSave);
  }
  return lines.map(line=>{
    const dm=line.match(/^([A-Za-zÄÖÜäöüß][^:]{0,60}?):\s*(.*)$/);
    if(dm&&isSpeakerLabel(dm[1])){
      return`<div class="dlg-line"><span class="dlg-speaker">${esc(dm[1].trim())}:</span> ${wrapLineW(dm[2],sec,showSave)}</div>`;
    }
    return`<div class="dlg-line">${wrapLineW(line,sec,showSave)}</div>`;
  }).join('');
}
async function expandMarkedWord(enc,idx){
  const word=decodeURIComponent(enc);
  const panel=document.getElementById('markedTrans_'+idx);
  if(!panel)return;
  panel.innerHTML='<span style="color:var(--text-muted)">Looking up…</span>';
  const ck=`${word}_${S.subject}_${_trLang()}`;
  try{
    if(!S.vocabCache[ck])await fetchVocab(word,ck,true);
    const data=S.vocabCache[ck];
    if(!data){panel.textContent='Could not load translation.';return;}
    const isEnDef=S.subject==='en'&&_trLang()==='en';
    const tk=isEnDef?'definition_en':'translation_'+_trLang();
    const trans=data[tk]||data.translation_en||data.translation_es||'—';
    const saved=isWordSaved(word);
    const dataEnc=encodeURIComponent(JSON.stringify(data));
    const posType=resolveVocabPos(word,data.type||data.pos);
    const posBadge=typeof typeBadge==='function'?typeBadge(posType):'';
    panel.innerHTML=`${posBadge?`<div style="margin-bottom:6px">${posBadge}</div>`:''}<div>${esc(trans)}</div>${saved?'<div style="margin-top:6px;font-size:11px;font-weight:700;color:var(--green)">✓ In your deck</div>':`<button type="button" class="btn-sm accent" style="margin-top:8px" onclick="saveToFC('${dataEnc}');expandMarkedWord('${enc}',${idx})">+ Save to deck</button>`}`;
  }catch(e){panel.textContent='Could not load translation.';}
}
function wrapW(text,sec,showSave=true){
  if(!text)return'';
  const raw=sanitizeExamText(text);
  if(raw.includes('\n')||/(?:Moderator|Interviewer|Gast|Herr |Frau |Dr\.|Prof\.|[A-Z]: )/.test(raw)){
    return formatReadableText(raw,sec,showSave);
  }
  return wrapLineW(raw,sec,showSave);
}
