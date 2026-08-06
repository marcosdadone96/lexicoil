// ═══════════════════════════════════════════
// VOCAB TOOLTIP
// ═══════════════════════════════════════════
// C-1 fix: tooltip receives AI/pool-sourced data — escape before innerHTML
function _ttEsc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
const TT=document.getElementById('VT');let ttTimer=null;let _vocabActiveCk='';let _vocabHoverSpan=null;let _vocabDelegateBound=false;let _vocabMoveRaf=0;let _vocabHoverTimer=null;let _vocabFetchCtrl=null;let _vocabFetchTimer=null;
function abortVocabFetch(){if(_vocabFetchTimer){clearTimeout(_vocabFetchTimer);_vocabFetchTimer=null;}if(_vocabFetchCtrl){try{_vocabFetchCtrl.abort();}catch(_){}_vocabFetchCtrl=null;}}
const WORD_RE=/\b([A-Za-zÀ-ÖØ-öø-ÿÄÖÜäöüß]{2,})\b/gu;
function decodeVocabToken(raw){try{return decodeURIComponent(String(raw||''));}catch(_){return String(raw||'');}}
function setVocabActiveSpan(span){
  if(_vocabHoverSpan&&_vocabHoverSpan!==span)_vocabHoverSpan.classList.remove('vocab-active');
  _vocabHoverSpan=span||null;
  if(span)span.classList.add('vocab-active');
}
function clearVocabActiveSpan(){
  if(_vocabHoverSpan)_vocabHoverSpan.classList.remove('vocab-active');
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
  return'Translation unavailable right now. Click the word to save it to your deck.';
}
function renderVocabMiss(word,reason){
  TT.innerHTML=`<div class="vt-word">${esc(word)}</div><div class="vt-loading" style="color:var(--text-secondary);line-height:1.5">${esc(vocabMissMessage(reason))}</div>`;
}
function vocabContextForSpan(span){
  if(!span)return'';
  const line=span.closest('.dlg-line')||span.closest('.readable-text');
  return line?String(line.textContent||'').replace(/\s+/g,' ').trim().slice(0,500):'';
}
function spanShowSave(span){return span?.dataset?.vocabSave!=='0';}
function spanSec(span){return span?.dataset?.vocabSec||'';}
function isWordSaved(word){
  const lvl=String(S.level||'').toUpperCase();
  return S.flashcards.some(f=>f.word===word&&f.sourceLang===S.subject&&fcSourceLevel(f)===lvl);
}
function flashcardForWord(word){
  const lvl=String(S.level||'').toUpperCase();
  return(S.flashcards||[]).find(f=>f.word===word&&f.sourceLang===S.subject&&fcSourceLevel(f)===lvl);
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
function markVocabSaved(word,pos){
  const stored=pos||(flashcardForWord(word)?.type||flashcardForWord(word)?.pos||S.vocabCache?.[`${word}_${S.subject}_${S.vocabLang}`]?.pos||S.vocabCache?.[`${word}_${S.subject}_${S.vocabLang}`]?.type);
  const posCls=vocabPosClassName(stored,word);
  document.querySelectorAll(`[data-vocab="${encodeURIComponent(word)}"]`).forEach(el=>{
    el.classList.remove('vocab-marked','vocab-marked-official');
    el.classList.add('vocab-saved');
    clearVocabPosClasses(el);
    posCls.trim().split(/\s+/).filter(Boolean).forEach(c=>el.classList.add(c));
  });
}
function unmarkVocabSaved(word){
  document.querySelectorAll(`[data-vocab="${encodeURIComponent(word)}"]`).forEach(el=>{
    el.classList.remove('vocab-saved');
    clearVocabPosClasses(el);
  });
}
function isWordMarked(word){
  return(S.activeSession?.markedWords||[]).some(m=>m.word===word);
}
function markVocabMarked(word){
  const cls=isOfficialMode()?'vocab-marked-official':'vocab-marked';
  document.querySelectorAll(`[data-vocab="${encodeURIComponent(word)}"]`).forEach(el=>{
    el.classList.remove('vocab-marked','vocab-marked-official','vocab-saved');
    clearVocabPosClasses(el);
    el.classList.add(cls);
  });
}
function unmarkVocabMarked(word){
  document.querySelectorAll(`[data-vocab="${encodeURIComponent(word)}"]`).forEach(el=>{
    el.classList.remove('vocab-marked','vocab-marked-official');
  });
}
function markWordOfficial(word,sec){
  if(!S.activeSession)initExamSession('official');
  const idx=S.activeSession.markedWords.findIndex(m=>m.word===word);
  if(idx>=0){
    S.activeSession.markedWords.splice(idx,1);
    unmarkVocabMarked(word);
  }else{
    S.activeSession.markedWords.push({word,sec,markedAt:Date.now()});
    markVocabMarked(word);
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
  if(isOfficialMode()){markWordOfficial(word,sec);TT.classList.remove('show');return;}
  showVocab(e,ew,sec,showSave);
  if(showSave&&isPracticeMode())void saveWordQuick(word,vocabContextForSpan(_vocabHoverSpan));
}
function vocabClickFromSpan(e,span){
  e.stopPropagation();
  clearTimeout(ttTimer);
  const word=decodeVocabToken(span.dataset.vocab);
  const sec=spanSec(span);
  const showSave=spanShowSave(span);
  if(isOfficialMode()){markWordOfficial(word,sec);TT.classList.remove('show');return;}
  showVocabFromSpan(e,span);
  if(showSave&&isPracticeMode())void saveWordQuick(word,vocabContextForSpan(span));
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
async function saveWordQuick(word,context){
  if(isWordSaved(word)){
    if(typeof removeSavedWordFromDeck==='function')removeSavedWordFromDeck(word);
    unmarkVocabSaved(word);
    autosaveSession();
    const ck=`${word}_${S.subject}_${S.vocabLang}`;
    if(S.vocabCache[ck])renderTT(S.vocabCache[ck],word,true);
    return;
  }
  const ck=`${word}_${S.subject}_${S.vocabLang}`;
  if(S.vocabCache[ck]){saveToFCData(S.vocabCache[ck]);markVocabSaved(word,S.vocabCache[ck].type||S.vocabCache[ck].pos);autosaveSession();return;}
  try{await fetchVocab(word,ck,true,true,context);autosaveSession();}catch(_){
    if(!isWordSaved(word)){
      const meta=applyGenderToVocabData({word},word,S.subject);
      saveToFCData(meta);
      markVocabSaved(word,meta.type||meta.pos);
    }
  }
}
function showVocab(e,ew,sec,showSave=true){if(isOfficialMode())return;const span=e?.currentTarget?.classList?.contains('vocab-word')?e.currentTarget:null;if(span){showVocabFromSpan(e,span);return;}clearTimeout(ttTimer);const word=decodeVocabToken(ew);if(word.length<2)return;S._vocabShowSave=showSave;clearVocabActiveSpan();posTT(e,null);TT.classList.add('show');const ck=`${word}_${S.subject}_${S.vocabLang}`;if(S.vocabCache[ck]){renderTT(S.vocabCache[ck],word,showSave);return;}TT.innerHTML=`<div class="vt-word">${esc(word)}</div><div class="vt-loading"><span class="vt-dot"></span><span class="vt-dot"></span><span class="vt-dot"></span> Looking up\u2026</div>`;fetchVocab(word,ck,showSave,false,'');}
function showVocabFromSpan(e,span){
  if(isOfficialMode()||!span)return;
  clearTimeout(ttTimer);
  clearTimeout(_vocabHoverTimer);
  const word=decodeVocabToken(span.dataset.vocab);
  if(word.length<2)return;
  setVocabActiveSpan(span);
  const showSave=spanShowSave(span);
  S._vocabShowSave=showSave;
  posTT(e,span);
  TT.classList.add('show');
  const ck=`${word}_${S.subject}_${S.vocabLang}`;
  _vocabActiveCk=ck;
  if(S.vocabCache[ck]){renderTT(S.vocabCache[ck],word,showSave);return;}
  TT.innerHTML=`<div class="vt-word">${esc(word)}</div><div class="vt-loading"><span class="vt-dot"></span><span class="vt-dot"></span><span class="vt-dot"></span> Looking up\u2026</div>`;
  fetchVocab(word,ck,showSave,false,vocabContextForSpan(span));
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
async function fetchVocab(word,ck,showSave=true,autoSave=false,context=''){
  const reqCk=ck;
  const ctx=String(context||'').trim();
  abortVocabFetch();
  _vocabFetchCtrl=typeof AbortController!=='undefined'?new AbortController():null;
  const fetchSignal=_vocabFetchCtrl?.signal;
  if(_vocabFetchCtrl)_vocabFetchTimer=setTimeout(()=>{try{_vocabFetchCtrl?.abort();}catch(_){}},12000);
  try{
    if(S.vocabCache[ck]){
      if(reqCk!==_vocabActiveCk)return;
      renderTT(S.vocabCache[ck],word,showSave);
      if(autoSave){saveToFCData(S.vocabCache[ck]);markVocabSaved(word,S.vocabCache[ck].type||S.vocabCache[ck].pos);}
      return;
    }
    let data=null;
    const dictP=typeof PracticeDictionary!=='undefined'?PracticeDictionary.lookup(word,S.subject,S.level,S.vocabLang).catch(()=>null):Promise.resolve(null);
    const cacheP=typeof fetchVocabCache==='function'?fetchVocabCache(S.subject,S.vocabLang,word,ctx,fetchSignal):Promise.resolve({found:false});
    const [dictHit,cacheHit]=await Promise.all([dictP,cacheP]);
    if(cacheHit?.reason==='aborted')return;
    if(dictHit){
      data=dictHit;
      data.type=data.type||data.pos||'';
      applyGenderToVocabData(data,word,S.subject);
      S.vocabCache[ck]=data;
      if(reqCk!==_vocabActiveCk)return;
      renderTT(data,word,showSave);
      if(autoSave){saveToFCData(data);markVocabSaved(word,data.type||data.pos);}
      return;
    }
    let missReason='miss';
    if(cacheHit?.translation){
      const isEnDef=S.subject==='en'&&S.vocabLang==='en';
      data={word,type:'',pos:'',source:cacheHit.source||'cache'};
      if(isEnDef)data.definition_en=cacheHit.translation;
      else data[`translation_${S.vocabLang}`]=cacheHit.translation;
      applyGenderToVocabData(data,word,S.subject);
      S.vocabCache[ck]=data;
      if(reqCk!==_vocabActiveCk)return;
      renderTT(data,word,showSave);
      if(autoSave){saveToFCData(data);markVocabSaved(word,data.type||data.pos);}
      return;
    }
    missReason=cacheHit?.reason||missReason;
    if(reqCk!==_vocabActiveCk)return;
    if(autoSave&&!isWordSaved(word)){
      const meta=applyGenderToVocabData({word,type:'',pos:''},word,S.subject);
      saveToFCData(meta);
      markVocabSaved(word,meta.type||meta.pos);
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
  }
}
function renderTT(data,word,showSave=true){
  const isEnDef=S.subject==='en'&&S.vocabLang==='en';
  const tk=isEnDef?'definition_en':'translation_'+S.vocabLang;
  const exk=`example_${S.subject==='de'?'german':'english'}`,extk=`example_${S.vocabLang}`;
  const trans=data[tk]||data.translation_en||data.translation_es||data.definition_en||data.translation||'\u2014';
  let alt='';
  if(S.subject==='de'&&S.vocabLang!=='en'&&data.translation_en)alt=`<div style="font-size:12px;color:var(--text-secondary);margin-top:6px"><b style="color:var(--brand)">EN:</b> ${esc(data.translation_en)}</div>`;
  else if(S.subject==='en'&&S.vocabLang!=='es'&&data.translation_es)alt=`<div style="font-size:12px;color:var(--text-secondary);margin-top:6px"><b style="color:var(--brand)">ES:</b> ${esc(data.translation_es)}</div>`;
  else if(S.subject==='en'&&S.vocabLang!=='en'&&data.definition_en)alt=`<div style="font-size:12px;color:var(--text-secondary);margin-top:6px"><b style="color:var(--brand)">EN:</b> ${esc(data.definition_en)}</div>`;
  const enAlt=alt;
  const ex=data[exk]||'',ext=data[extk]||'';
  const w=data.word||word;
  const saved=isWordSaved(w);
  const enc=encodeURIComponent(JSON.stringify(data)),lang=S.subject==='de'?'de-DE':'en-GB';
  const saveBtn=showSave?(isPracticeMode()?`<div class="vt-save saved vt-interactive" id="vtSave">${saved?'\u2713 In your deck \u00b7 click again to remove':'\u2713 Saving\u2026'}</div>`:`<button class="vt-save vt-interactive${saved?' saved':''}" id="vtSave" onmousedown="event.preventDefault();event.stopPropagation()" onclick="event.stopPropagation();saveToFC('${enc}')">${saved?'\u2713 Saved':'\uff0b Save to Deck'}</button>`):'';
  const fcLike={word:data.word||word,gender:data.gender,article:data.article,type:data.type||data.pos,sourceLang:S.subject};
  const wordHead=typeof fcWordDisplayHtml==='function'?fcWordDisplayHtml(fcLike,S.subject):esc(w);
  const safePhon=_ttEsc(data.phonetic||''),safePos=_ttEsc(data.pos||'');
  TT.innerHTML=`<div class="vt-body">${`<div class="vt-header"><div class="vt-word">${wordHead}</div><button class="vt-ab vt-interactive" onclick="speakBtn('${encodeURIComponent(typeof fcSpeakPhrase==='function'?fcSpeakPhrase(fcLike,S.subject):(data.word||word))}','${lang}',this)">\uD83D\uDD0A</button></div>${safePhon?`<div class="vt-phonetic">${safePhon}</div>`:''} ${safePos?`<span class="vt-pos">${safePos}</span>`:''}<div class="vt-translation">${esc(trans)}</div>${enAlt}${ex?`<div class="vt-example">${esc(ex)}${ext?`<br><em style="color:var(--text-muted);margin-top:3px;display:block">${esc(ext)}</em>`:''}</div>`:''}`}</div><div class="vt-interactive vt-interactive-row">${`<div class="vt-lang-row">${LANGS.map(l=>`<button type="button" class="vt-lb vt-lb-tt vt-interactive${S.vocabLang===l.code?' active':''}" data-lang="${l.code}" onclick="chTTLang('${encodeURIComponent(data.word||word)}','${l.code}',this)">${l.l}</button>`).join('')}</div>${saveBtn}`}</div>`;
}
async function chTTLang(ew,lang,btn){S.vocabLang=lang;document.querySelectorAll('.ex-lb').forEach(b=>b.classList.toggle('active',b.textContent.toLowerCase()===lang));const word=decodeVocabToken(ew),ck=`${word}_${S.subject}_${lang}`,ss=S._vocabShowSave!==false;if(S.vocabCache[ck]){renderTT(S.vocabCache[ck],word,ss);return;}TT.innerHTML=`<div class="vt-word">${esc(word)}</div><div class="vt-loading"><span class="vt-dot"></span><span class="vt-dot"></span><span class="vt-dot"></span></div>`;await fetchVocab(word,ck,ss,false,vocabContextForSpan(_vocabHoverSpan));}
function setVL(lang,btn){S.vocabLang=lang;document.querySelectorAll('.ex-lb').forEach(b=>b.classList.remove('active'));if(btn)btn.classList.add('active');document.querySelectorAll('.vt-lb-tt').forEach(b=>b.classList.toggle('active',b.dataset.lang===lang));}
function wrapLineW(line,sec,showSave=true){
  if(!line)return'';
  return String(line).replace(WORD_RE,(m)=>{
    const enc=encodeURIComponent(m);
    const fc=showSave&&isWordSaved(m)?flashcardForWord(m):null;
    const cachePos=S.vocabCache?.[`${m}_${S.subject}_${S.vocabLang}`];
    const storedPos=fc?.type||fc?.pos||cachePos?.type||cachePos?.pos;
    const posCls=fc||cachePos||isWordSaved(m)?vocabPosClassName(storedPos,m):('');
    const saved=showSave&&isWordSaved(m)?' vocab-saved':'';
    const marked=isWordMarked(m)?(isOfficialMode()?' vocab-marked-official':' vocab-marked'):'';
    const target=(typeof TargetUsage!=='undefined'&&S.examData?.vocabPersonal&&TargetUsage.isVerifiedSurface(S.examData,m))?' vocab-target':'';
    const secAttr=String(sec||'').replace(/"/g,'&quot;');
    return`<span class="vocab-word${saved}${posCls}${marked}${target}" data-vocab="${enc}" data-vocab-sec="${secAttr}" data-vocab-save="${showSave?'1':'0'}">${m}</span>`;
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
  const ck=`${word}_${S.subject}_${S.vocabLang}`;
  try{
    if(!S.vocabCache[ck])await fetchVocab(word,ck,true);
    const data=S.vocabCache[ck];
    if(!data){panel.textContent='Could not load translation.';return;}
    const isEnDef=S.subject==='en'&&S.vocabLang==='en';
    const tk=isEnDef?'definition_en':'translation_'+S.vocabLang;
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
