// ═══════════════════════════════════════════
// AUDIO — browser speechSynthesis primary TTS
// ═══════════════════════════════════════════
let curUtt=null;
let curAudio=null;

/* ── Voice preference (per language, persisted) ─────────────────────────── */
const TTS_VOICE_KEY='lc_tts_voice';
function _ttsLangCode(lang){return lang==='de'?'de-DE':lang==='es'?'es-ES':'en-GB';}
function _loadVoicePrefs(){try{return JSON.parse(localStorage.getItem(TTS_VOICE_KEY)||'{}');}catch(_){return{};}}
function getTtsVoicePref(lang){return _loadVoicePrefs()[lang]||null;}
function setTtsVoicePref(lang,voiceName){try{const p=_loadVoicePrefs();p[lang]=voiceName;localStorage.setItem(TTS_VOICE_KEY,JSON.stringify(p));}catch(_){}}

/**
 * Returns the best available SpeechSynthesisVoice for a language.
 * Priority: user preference → highest-quality matching voice → first matching.
 */
function bestBrowserVoice(lang){
  if(!window.speechSynthesis)return null;
  const langCode=_ttsLangCode(lang);
  const pref=getTtsVoicePref(lang);
  const voices=window.speechSynthesis.getVoices();
  if(!voices.length)return null;
  const matching=voices.filter(v=>v.lang.startsWith(langCode.slice(0,5))||v.lang.startsWith(langCode.slice(0,2)));
  if(!matching.length)return voices.find(v=>v.lang.startsWith('en'))||voices[0];
  if(pref){const saved=matching.find(v=>v.name===pref);if(saved)return saved;}
  // Prefer online/neural voices (usually higher quality)
  const online=matching.filter(v=>!v.localService);
  return(online.length?online:matching)[0];
}

/**
 * List all available browser voices for a given language — used by voice picker UI.
 */
function listBrowserVoices(lang){
  if(!window.speechSynthesis)return[];
  const langCode=_ttsLangCode(lang);
  const voices=window.speechSynthesis.getVoices();
  return voices.filter(v=>v.lang.startsWith(langCode.slice(0,5))||v.lang.startsWith(langCode.slice(0,2)));
}

function stopAllAudio(){if(window.speechSynthesis)window.speechSynthesis.cancel();curUtt=null;if(curAudio){try{curAudio.pause();curAudio.src='';}catch(_){}curAudio=null;}}

function playMp3Base64(b64,onEnd){stopAllAudio();try{const bin=atob(b64);const bytes=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);const blob=new Blob([bytes],{type:'audio/mpeg'});const url=URL.createObjectURL(blob);const a=new Audio(url);curAudio=a;a.onended=()=>{URL.revokeObjectURL(url);curAudio=null;if(onEnd)onEnd();};a.onerror=()=>{URL.revokeObjectURL(url);curAudio=null;if(onEnd)onEnd(true);};void a.play().catch(()=>{URL.revokeObjectURL(url);curAudio=null;if(onEnd)onEnd(true);});return a;}catch(_){if(onEnd)onEnd(true);return null;}}

function _speakWithBrowser(text,lang,onEnd){
  if(!window.speechSynthesis){if(onEnd)onEnd();return;}
  const u=new SpeechSynthesisUtterance(text);
  u.lang=_ttsLangCode(lang);
  u.rate=0.9;
  const v=bestBrowserVoice(lang);
  if(v)u.voice=v;
  u.onend=()=>{if(onEnd)onEnd();};
  u.onerror=()=>{if(onEnd)onEnd();};
  window.speechSynthesis.speak(u);
}

async function playMultiVoiceSegments(segments,lang,onEnd){
  stopAllAudio();
  if(!segments?.length){if(onEnd)onEnd();return;}
  let i=0;
  async function next(){
    if(i>=segments.length){if(onEnd)onEnd();return;}
    const seg=segments[i++];
    let played=false;
    // Try server cache first (pre-generated MP3 from pool/seed); skip if unavailable quickly.
    if(!played&&typeof fetchTtsAudio==='function'){
      try{
        const voice=seg.voice||(typeof ttsVoiceForLang==='function'?ttsVoiceForLang(lang):lang);
        const hit=await fetchTtsAudio(seg.text,voice,lang);
        if(hit?.audioBase64){
          await new Promise((res)=>playMp3Base64(hit.audioBase64,()=>res()));
          played=true;
        }
      }catch(_){}
    }
    if(!played&&window.speechSynthesis){
      await new Promise((res)=>_speakWithBrowser(seg.text,lang,res));
      played=true;
    }
    if(!played){await new Promise((r)=>setTimeout(r,Math.min(8000,seg.text.length*50)));}
    next();
  }
  await next();
}

function speak(text,lang){
  if(!window.speechSynthesis)return;
  stopAllAudio();
  const u=new SpeechSynthesisUtterance(text);
  u.lang=_ttsLangCode(lang||'en');
  u.rate=0.88;
  const v=bestBrowserVoice(lang||'en');
  if(v)u.voice=v;
  u.onend=()=>{curUtt=null;};
  curUtt=u;
  window.speechSynthesis.speak(u);
}

function speakBtn(ew,lang,btn){
  const word=decodeURIComponent(ew);
  if(window.speechSynthesis?.speaking){window.speechSynthesis.cancel();if(btn){btn.classList.remove('playing');btn.textContent='🔊';}return;}
  speak(word,lang);
  if(btn){btn.classList.add('playing');btn.textContent='■';}
  const ck=setInterval(()=>{if(!window.speechSynthesis?.speaking){clearInterval(ck);if(btn){btn.classList.remove('playing');btn.textContent='🔊';}}},300);
}

// Warm up voice list on page load (some browsers load voices async)
if(window.speechSynthesis){
  if(window.speechSynthesis.onvoiceschanged!==undefined){
    window.speechSynthesis.onvoiceschanged=function(){window.speechSynthesis.getVoices();};
  }
  window.speechSynthesis.getVoices();
}
