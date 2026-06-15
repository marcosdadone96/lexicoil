function openMistakeReview(entryId){
  const hist=getProfileHistory();
  const entry=S.history.find(h=>h.id===entryId)||hist.find(h=>h.id===entryId);
  if(!entry||!entry.correction){lcToast('No mistake review saved for this exam.','warn');return;}
  hideAll();show('mistakeReviewScreen');
  if(typeof LcRouter!=='undefined')LcRouter.replaceRoute('#/review/'+entryId,'Progress');
  const scr=document.getElementById('mistakeReviewScreen');
  const isDE=entry.lang==='de';
  const vocabHtml=entry.savedWords?.length?`<div class="results-detail"><h4>Vocabulary detected</h4><ul class="results-vocab-list">${entry.savedWords.map(w=>'<li>'+esc(w)+'</li>').join('')}</ul></div>`:'';
  scr.innerHTML=`${renderNavBackBtn('Progress')}
    <div class="screen-eyebrow">Mistake review</div>
    <h2 class="screen-h1">${entry.score}% — ${esc(entry.topic)}</h2>
    <p style="font-size:13px;font-weight:600;color:var(--text-secondary);margin-bottom:16px">${entry.date} · ${typeof ExamProfile!=='undefined'&&entry.profileId?ExamProfile.certLabel(entry.lang,entry.level):entry.level}</p>
    ${vocabHtml}
    ${renderCorrectionHtml(entry.correction,{schreiben:null,sprechen:null},isDE)}
    <div style="margin-top:18px;display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn-sm accent" onclick="goFlashcards()">Review vocabulary</button>
      <button class="btn-sm" onclick="backToWorkspace('progress')">Back to progress</button>
    </div>`;
  window.scrollTo({top:0,behavior:'smooth'});
}
