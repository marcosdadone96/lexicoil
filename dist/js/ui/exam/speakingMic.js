/** Shared microphone recorder for speaking modules — syncs transcript to a textarea. */
const _speakingMicState={};

function speechLangForSubject(subject){
  const ui=typeof examUiStrings==='function'?examUiStrings(subject==='de'?'de':subject==='es'?'es':'en'):{speechLang:'en-GB'};
  return ui.speechLang||'en-GB';
}

function hasSpeechAPI(){
  return 'webkitSpeechRecognition' in window||'SpeechRecognition' in window;
}

function renderSpeakingMicHtml(fieldId,subject){
  const fid=esc(fieldId);
  return`<div class="speak-mic-zone" id="speakMicZone_${fid}">
    <div class="speak-mic-warn" id="speakMicWarn_${fid}" style="display:none">Microphone unavailable — type your answer below.</div>
    <div class="speak-mic-ring" id="speakMicRing_${fid}" onclick="toggleSpeakingMic('${fid}')" role="button" tabindex="0" aria-label="Record"><span>🎙</span></div>
    <div class="speak-mic-status" id="speakMicStatus_${fid}">Tap the microphone to record</div>
    <div class="speak-mic-timer" id="speakMicTimer_${fid}"></div>
    <div class="speak-mic-wave">${[0,1,2,3,4,5,6].map(i=>`<div class="speak-mic-bar" id="speakMicBar_${fid}_${i}"></div>`).join('')}</div>
    <div class="speak-mic-btns">
      <button type="button" class="btn-sm accent" id="speakMicStart_${fid}" onclick="toggleSpeakingMic('${fid}')">Record</button>
      <button type="button" class="btn-sm" id="speakMicStop_${fid}" style="display:none" onclick="stopSpeakingMic('${fid}')">Stop</button>
    </div>
    <div class="speak-mic-lbl">Transcript</div>
    <textarea class="write-field" id="${fid}" style="min-height:140px" placeholder="Your spoken answer…" oninput="typeof updProg==='function'&&updProg()"></textarea>
  </div>`;
}

function initSpeakingMic(fieldId,subject){
  _speakingMicState[fieldId]={recording:false,recognition:null,timer:null,seconds:0,lang:speechLangForSubject(subject),finalText:''};
  const warn=document.getElementById('speakMicWarn_'+fieldId);
  if(warn&&(!hasSpeechAPI()||/firefox/i.test(navigator.userAgent)))warn.style.display='block';
}

function initSpeakingMicsForExam(examData,subject){
  if(!examData)return;
  const ids=[];
  (examData.sprechenParts||[]).forEach(p=>{if(p.fieldId)ids.push(p.fieldId);});
  if(examData.sprechen)ids.push('speakAns');
  [...new Set(ids)].forEach(id=>initSpeakingMic(id,subject));
}

function _syncMicTranscript(fieldId,text){
  const ta=document.getElementById(fieldId);
  if(ta){ta.value=text;if(typeof updProg==='function')updProg();}
}

function toggleSpeakingMic(fieldId){
  const st=_speakingMicState[fieldId];
  if(!st)return;
  if(st.recording)stopSpeakingMic(fieldId);
  else startSpeakingMic(fieldId);
}

function startSpeakingMic(fieldId){
  const st=_speakingMicState[fieldId];
  if(!st)return;
  if(!hasSpeechAPI()){
    const warn=document.getElementById('speakMicWarn_'+fieldId);
    if(warn)warn.style.display='block';
    document.getElementById(fieldId)?.focus();
    return;
  }
  const SpeechRecognition=window.SpeechRecognition||window.webkitSpeechRecognition;
  const rec=new SpeechRecognition();
  rec.lang=st.lang;
  rec.continuous=true;
  rec.interimResults=true;
  st.finalText=document.getElementById(fieldId)?.value||'';
  rec.onresult=(e)=>{
    let interim='';
    for(let i=e.resultIndex;i<e.results.length;i++){
      if(e.results[i].isFinal)st.finalText+=(st.finalText?' ':'')+e.results[i][0].transcript;
      else interim+=e.results[i][0].transcript;
    }
    _syncMicTranscript(fieldId,(st.finalText+(interim?' '+interim:'')).trim());
  };
  rec.onerror=(e)=>{
    if(e.error==='not-allowed')lcToast('Microphone permission denied.','warn');
    stopSpeakingMic(fieldId);
  };
  rec.onend=()=>{if(st.recording)stopSpeakingMic(fieldId);};
  try{rec.start();}catch(_){lcToast('Could not start microphone.','error');return;}
  st.recognition=rec;
  st.recording=true;
  st.seconds=0;
  document.getElementById('speakMicRing_'+fieldId)?.classList.add('recording');
  const status=document.getElementById('speakMicStatus_'+fieldId);
  if(status){status.textContent='Recording…';status.className='speak-mic-status recording';}
  document.getElementById('speakMicStart_'+fieldId)?.style.setProperty('display','none');
  document.getElementById('speakMicStop_'+fieldId)?.style.setProperty('display','inline-flex');
  for(let i=0;i<7;i++)document.getElementById('speakMicBar_'+fieldId+'_'+i)?.classList.add('active');
  st.timer=setInterval(()=>{
    st.seconds++;
    const m=String(Math.floor(st.seconds/60)).padStart(2,'0');
    const s=String(st.seconds%60).padStart(2,'0');
    const el=document.getElementById('speakMicTimer_'+fieldId);
    if(el)el.textContent=m+':'+s;
  },1000);
}

function stopSpeakingMic(fieldId){
  const st=_speakingMicState[fieldId];
  if(!st)return;
  if(st.recognition){try{st.recognition.stop();}catch(_){}st.recognition=null;}
  st.recording=false;
  clearInterval(st.timer);
  document.getElementById('speakMicRing_'+fieldId)?.classList.remove('recording');
  const status=document.getElementById('speakMicStatus_'+fieldId);
  if(status){status.textContent='Recording finished';status.className='speak-mic-status';}
  document.getElementById('speakMicStart_'+fieldId)?.style.setProperty('display','inline-flex');
  document.getElementById('speakMicStop_'+fieldId)?.style.setProperty('display','none');
  for(let i=0;i<7;i++)document.getElementById('speakMicBar_'+fieldId+'_'+i)?.classList.remove('active');
  const ta=document.getElementById(fieldId);
  if(ta&&ta.value.trim())st.finalText=ta.value.trim();
  _syncMicTranscript(fieldId,st.finalText);
}
