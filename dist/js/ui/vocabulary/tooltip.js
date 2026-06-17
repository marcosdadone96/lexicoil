// ═══════════════════════════════════════════
// VOCAB TOOLTIP
// ═══════════════════════════════════════════
const TT=document.getElementById('VT');let ttTimer=null;
function isWordSaved(word){return S.flashcards.some(f=>f.word===word&&f.sourceLang===S.subject);}
function markVocabSaved(word){document.querySelectorAll(`[data-vocab="${encodeURIComponent(word)}"]`).forEach(el=>el.classList.add('vocab-saved'));}
function isWordMarked(word){
  return(S.activeSession?.markedWords||[]).some(m=>m.word===word);
}
function markVocabMarked(word){
  document.querySelectorAll(`[data-vocab="${encodeURIComponent(word)}"]`).forEach(el=>{
    el.classList.add('vocab-marked');
    el.classList.remove('vocab-saved');
  });
}
function markWordOfficial(word,sec){
  if(!S.activeSession)initExamSession('official');
  if(!S.activeSession.markedWords.some(m=>m.word===word)){
    S.activeSession.markedWords.push({word,sec,markedAt:Date.now()});
    S.activeSession.updatedAt=Date.now();
    syncOfficialFlight();
  }
  markVocabMarked(word);
}
function vocabClick(e,ew,sec,showSave){
  e.stopPropagation();
  clearTimeout(ttTimer);
  const word=decodeURIComponent(ew);
  if(isOfficialMode()){
    markWordOfficial(word,sec);
    TT.classList.remove('show');
    return;
  }
  showVocab(e,ew,sec,showSave);
  if(showSave&&isPracticeMode())void saveWordQuick(word);
}
async function saveWordQuick(word){
  if(isWordSaved(word)){markVocabSaved(word);const ck=`${word}_${S.subject}_${S.vocabLang}`;if(S.vocabCache[ck])renderTT(S.vocabCache[ck],word,true);return;}
  const ck=`${word}_${S.subject}_${S.vocabLang}`;
  if(S.vocabCache[ck]){saveToFCData(S.vocabCache[ck]);markVocabSaved(word);autosaveSession();return;}
  try{await fetchVocab(word,ck,true,true);autosaveSession();}catch(_){}
}
function showVocab(e,ew,sec,showSave=true){if(isOfficialMode())return;clearTimeout(ttTimer);const word=decodeURIComponent(ew);if(word.length<2)return;S._vocabShowSave=showSave;posTT(e);TT.classList.add('show');const ck=`${word}_${S.subject}_${S.vocabLang}`;if(S.vocabCache[ck]){renderTT(S.vocabCache[ck],word,showSave);return;}TT.innerHTML=`<div class="vt-word">${word}</div><div class="vt-loading"><span class="vt-dot"></span><span class="vt-dot"></span><span class="vt-dot"></span> Looking up\u2026</div>`;fetchVocab(word,ck,showSave);}
function posTT(e){const x=e.clientX,y=e.clientY,vw=window.innerWidth,vh=window.innerHeight;let left=x+14,top=y-20;if(left+300>vw-16)left=x-300-14;if(top+230>vh-16)top=vh-246;if(top<8)top=8;TT.style.left=left+'px';TT.style.top=top+'px';}
function hideVocab(){ttTimer=setTimeout(()=>TT.classList.remove('show'),450);}
async function fetchVocab(word,ck,showSave=true,autoSave=false){
  try{
    if(S.vocabCache[ck]){
      renderTT(S.vocabCache[ck],word,showSave);
      if(autoSave)saveToFCData(S.vocabCache[ck]);
      return;
    }
    let data=null;
    if(typeof PracticeDictionary!=='undefined'){
      data=await PracticeDictionary.lookup(word,S.subject,S.level,S.vocabLang);
    }
    if(data){
      data.type=data.type||data.pos||'';
      S.vocabCache[ck]=data;
      renderTT(data,word,showSave);
      if(autoSave)saveToFCData(data);
      return;
    }
    if(typeof fetchVocabCache==='function'){
      const hit=await fetchVocabCache(S.subject,S.vocabLang,word);
      if(hit?.translation){
        const isEnDef=S.subject==='en'&&S.vocabLang==='en';
        data={word,type:'',pos:'',source:hit.source||'cache'};
        if(isEnDef)data.definition_en=hit.translation;
        else data[`translation_${S.vocabLang}`]=hit.translation;
        S.vocabCache[ck]=data;
        renderTT(data,word,showSave);
        if(autoSave)saveToFCData(data);
        return;
      }
    }
    TT.innerHTML=`<div class="vt-word">${esc(word)}</div><div class="vt-loading" style="color:var(--text-secondary);line-height:1.5">Not in library yet. Save it to your deck during practice — translations expand as the content library grows.</div>`;
  }catch(e){TT.innerHTML=`<div class="vt-word">${esc(word)}</div><div class="vt-loading" style="color:var(--red)">Could not load definition</div>`;}
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
  const saveBtn=showSave?(isPracticeMode()?`<div class="vt-save saved" id="vtSave">${saved?'\u2713 In your deck':'\u2713 Saving\u2026'}</div>`:`<button class="vt-save${saved?' saved':''}" id="vtSave" onmousedown="event.preventDefault();event.stopPropagation()" onclick="event.stopPropagation();saveToFC('${enc}')">${saved?'\u2713 Saved':'\uff0b Save to Deck'}</button>`):'';
  TT.innerHTML=`<div class="vt-header"><div class="vt-word">${data.word||word}</div><button class="vt-ab" onclick="speakBtn('${encodeURIComponent(data.word||word)}','${lang}',this)">\uD83D\uDD0A</button></div>${data.phonetic?`<div class="vt-phonetic">${data.phonetic}</div>`:''} ${data.pos?`<span class="vt-pos">${data.pos}</span>`:''}<div class="vt-translation">${esc(trans)}</div>${enAlt}${ex?`<div class="vt-example">${esc(ex)}${ext?`<br><em style="color:var(--text-muted);margin-top:3px;display:block">${esc(ext)}</em>`:''}</div>`:''}<div class="vt-lang-row">${LANGS.map(l=>`<button class="vt-lb vt-lb-tt${S.vocabLang===l.code?' active':''}" data-lang="${l.code}" onclick="chTTLang('${encodeURIComponent(data.word||word)}','${l.code}',this)">${l.l}</button>`).join('')}</div>${saveBtn}`;
}
async function chTTLang(ew,lang,btn){S.vocabLang=lang;document.querySelectorAll('.ex-lb').forEach(b=>b.classList.toggle('active',b.textContent.toLowerCase()===lang));const word=decodeURIComponent(ew),ck=`${word}_${S.subject}_${lang}`,ss=S._vocabShowSave!==false;if(S.vocabCache[ck]){renderTT(S.vocabCache[ck],word,ss);return;}TT.innerHTML=`<div class="vt-word">${word}</div><div class="vt-loading"><span class="vt-dot"></span><span class="vt-dot"></span><span class="vt-dot"></span></div>`;await fetchVocab(word,ck,ss);}
function setVL(lang,btn){S.vocabLang=lang;document.querySelectorAll('.ex-lb').forEach(b=>b.classList.remove('active'));if(btn)btn.classList.add('active');document.querySelectorAll('.vt-lb-tt').forEach(b=>b.classList.toggle('active',b.dataset.lang===lang));}
function wrapLineW(line,sec,showSave=true){
  if(!line)return'';
  return String(line).replace(/([A-Za-zÀ-öø-ÿ]{2,})/g,m=>{
    const enc=encodeURIComponent(m);
    const marked=isWordMarked(m)?' vocab-marked':'';
    const saved=showSave&&isWordSaved(m)?' vocab-saved':'';
    const target=(typeof TargetUsage!=='undefined'&&S.examData?.vocabPersonal&&TargetUsage.isVerifiedSurface(S.examData,m))?' vocab-target':'';
    return`<span class="vocab-word${saved}${marked}${target}" data-vocab="${enc}" onmouseenter="showVocab(event,'${enc}','${sec}',${showSave})" onmouseleave="hideVocab()" onclick="vocabClick(event,'${enc}','${sec}',${showSave})">${m}</span>`;
  });
}
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
    panel.innerHTML=`<div>${esc(trans)}</div>${saved?'<div style="margin-top:6px;font-size:11px;font-weight:700;color:var(--green)">✓ In your deck</div>':`<button type="button" class="btn-sm accent" style="margin-top:8px" onclick="saveToFC('${dataEnc}');expandMarkedWord('${enc}',${idx})">+ Save to deck</button>`}`;
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
