// ═══════════════════════════════════════════
// SUBMIT EXAM + CORRECTION
// ═══════════════════════════════════════════
function ansLabel(q, val, isDE) {
  if (!val) return '—';
  if (q.type === 'yn' || q.type === 'ja_nein') return val === 'J' || val === 'Ja' ? 'Ja' : val === 'N' || val === 'Nein' ? 'Nein' : val;
  if (q.type === 'rfn') return val === 'R' ? (isDE ? 'Richtig' : 'True') : val === 'F' ? (isDE ? 'Falsch' : 'False') : val === 'N' ? (isDE ? 'Nicht im Text' : 'Not in text') : val;
  if (q.type === 'person_multi') {
    try { const a = JSON.parse(val); if (Array.isArray(a)) return a.join(', '); } catch (_) {}
    return val;
  }
  if (q.type === 'multiple' || q.type === 'match' || q.type === 'abcd' || q.type === 'gap_fill') {
    const opt = q.options?.find((o) => {
      const v = typeof o === 'string' && o.length === 1 ? o : o[0];
      return v === val || (typeof o === 'string' && o.startsWith(val + ')'));
    });
    if (opt) return typeof opt === 'string' ? (opt.length === 1 ? opt : opt.slice(3).trim()) : opt.slice(3).trim();
    return val;
  }
  if (val === 'R' || val === 'T') return isDE ? 'Richtig' : 'True';
  return isDE ? 'Falsch' : 'False';
}
function correctLabel(q, isDE) {
  if (Array.isArray(q.correct)) return q.correct.join(', ');
  return ansLabel(q, q.correct, isDE);
}
function countSpeakExchanges(text, isDE) {
  const re = isDE ? /^\s*Ich\s*:/gim : /^\s*Me\s*:/gim;
  return (text.match(re) || []).length;
}
function getSchreibenAns(p){
  if(p.formFields)return p.formFields.map((_,i)=>document.getElementById(p.fieldId+'_'+i)?.value.trim()||'').join('\n');
  return document.getElementById(p.fieldId)?.value.trim()||'';
}
function gradeWriting(schreiben, writeAns) {
  if (schreiben.formFields) {
    const filled = schreiben.formFields.filter((_, i) => {
      const el = document.getElementById(schreiben.fieldId + '_' + i);
      return el?.value.trim();
    }).length;
    const total = schreiben.formFields.length;
    const score = filled >= total ? 85 : filled >= total * 0.7 ? 65 : Math.round((filled / total) * 50);
    return { score, note: `Formular: ${filled}/${total} Felder ausgefuellt.`, words: filled, min: total };
  }
  const words = writeAns.split(/\s+/).filter((x) => x).length;
  const min = schreiben.minWords || 40;
  let score = 35;
  let note = `You wrote ${words} words (minimum ${min}).`;
  if (words >= min) {
    score = words >= min * 1.15 ? 85 : 72;
    note = `Word count OK (${words}/${min}). Compare your text with the model answer below.`;
  } else if (words >= min * 0.6) {
    score = 55;
    note = `Almost enough words (${words}/${min}). Add more detail.`;
  }
  return { score, note, words, min };
}
function gradeSpeaking(sprechen, speakAns, isDE) {
  if (sprechen.minWords) {
    const words = speakAns.split(/\s+/).filter((x) => x).length;
    const min = sprechen.minWords;
    let score = words >= min ? 80 : words >= min * 0.6 ? 58 : 35;
    const note = isDE
      ? `Praesentation: ${words} Woerter (mindestens ${min}).`
      : `Presentation: ${words} words (minimum ${min}).`;
    return { score, note, words, min };
  }
  const exchanges = countSpeakExchanges(speakAns, isDE);
  const min = sprechen.minExchanges || 3;
  let score = 30;
  let note = isDE
    ? `Du hast ${exchanges} Antwort(en) mit „Ich:“ geschrieben (mindestens ${min}).`
    : `You wrote ${exchanges} reply line(s) starting with “Me:” (minimum ${min}).`;
  if (exchanges >= min && speakAns.length > 30) {
    score = 80;
    note += isDE ? ' Gute Länge — vergleiche mit dem Muster.' : ' Good length — compare with the model below.';
  } else if (exchanges >= min || speakAns.length > 40) {
    score = 62;
  }
  return { score, note, exchanges, min };
}
function buildCorrection(d, isDE, writeAns, speakAns) {
  const parts = [];
  const pushQ = (mod, title, items) => {
    if (!items.length) return;
    parts.push({ mod, title, items });
  };
  if (d.goetheFormat) {
    d.lesenParts?.forEach((p, pi) => {
      const items = [];
      const signBlock=p.items?.length&&p.items.every(it=>it.signText&&!it.question);
      if(!signBlock)p.items?.forEach((item, idx) => {
        if(!item.question)return;
        const q = itemToQ(item, idx);
        const user = S.answers['lesen_' + pi + '_' + q.id];
        items.push({ ok: goetheAnswersMatch(user, q.correct), q: q.question, yours: ansLabel(q, user, isDE), correct: correctLabel(q, isDE), explanation: q.explanation || '', grammarTags: q.grammarTags || [] });
      });
      (p.questions || []).forEach((q) => {
        const user = S.answers['lesen_' + pi + '_' + q.id];
        items.push({ ok: goetheAnswersMatch(user, q.correct), q: q.gap?`Lücke ${q.gap}`:q.question, yours: ansLabel(q, user, isDE), correct: correctLabel(q, isDE), explanation: q.explanation || '', grammarTags: q.grammarTags || [] });
      });
      pushQ('lesen', `${isDE ? 'Lesen' : 'Reading'} — ${isDE ? 'Teil' : 'Part'} ${p.teil}`, items);
    });
    d.horenParts?.forEach((p, pi) => {
      if (p.questions) {
        pushQ(
          'horen',
          `${isDE ? 'Hörverstehen' : 'Listening'} — ${isDE ? 'Teil' : 'Part'} ${p.teil}`,
          p.questions.map((q) => {
            const user = S.answers['horen_' + pi + '_' + q.id];
            return { ok: goetheAnswersMatch(user, q.correct), q: q.question, yours: ansLabel(q, user, isDE), correct: correctLabel(q, isDE), explanation: q.explanation || '', grammarTags: q.grammarTags || [] };
          })
        );
      }
      p.segments?.forEach((s, si) => {
        pushQ(
          'horen',
          `${isDE ? 'Hörverstehen' : 'Listening'} — ${isDE ? 'Teil' : 'Part'} ${p.teil} (${s.label})`,
          segToQ(s).map((q) => {
            const mod = 'horen_' + pi + '_' + si;
            const user = S.answers[mod + '_' + q.id];
            return { ok: goetheAnswersMatch(user, q.correct), q: q.question, yours: ansLabel(q, user, isDE), correct: correctLabel(q, isDE), explanation: q.explanation || '', grammarTags: q.grammarTags || [] };
          })
        );
      });
      if (p.noteFields) {
        pushQ(
          'horen',
          `${isDE ? 'Hörverstehen' : 'Listening'} — ${isDE ? 'Teil' : 'Part'} ${p.teil} (Notes)`,
          p.noteFields.map((f) => {
            const user = (document.getElementById('note_' + f.id)?.value || '').trim();
            const ok = user.toLowerCase() === String(f.answer).trim().toLowerCase();
            return { ok, q: f.label, yours: user || '—', correct: f.answer };
          })
        );
      }
    });
    const writingParts = (d.schreibenParts || []).map((p) => ({
      ...gradeWriting(p, getSchreibenAns(p)),
      part: p,
    }));
    const speakingParts = (d.sprechenParts || []).map((p) => ({
      ...gradeSpeaking(p, document.getElementById(p.fieldId)?.value.trim() || '', isDE),
      part: p,
    }));
    return { parts, writingParts, speakingParts };
  }
  if (d.lesen) {
    pushQ(
      'lesen',
      isDE ? 'Leseverstehen' : 'Reading',
      d.lesen.questions.map((q, i) => {
        const user = S.answers['lesen_' + q.id];
        const ok = user === q.correct;
        return {
          ok,
          q: `Q${i + 1}: ${q.question}`,
          yours: ansLabel(q, user, isDE),
          correct: correctLabel(q, isDE),
        };
      })
    );
  }
  if (d.horen) {
    pushQ(
      'horen',
      isDE ? 'Hörverstehen' : 'Listening',
      d.horen.questions.map((q, i) => {
        const user = S.answers['horen_' + q.id];
        const ok = user === q.correct;
        return {
          ok,
          q: `Q${i + 1}: ${q.question}`,
          yours: ansLabel(q, user, isDE),
          correct: correctLabel(q, isDE),
        };
      })
    );
  }
  if (d.gapfill) {
    pushQ(
      'gapfill',
      isDE ? 'Lückentext' : 'Gap-Fill',
      d.gapfill.sentences.map((s, i) => {
        const user = (S.gapAnswers[s.id] || '').trim();
        const ok = user.toLowerCase() === s.answer.toLowerCase();
        return {
          ok,
          q: `Gap ${i + 1}: ${s.text.replace('[BLANK]', '___')}`,
          yours: user || '—',
          correct: s.answer,
        };
      })
    );
  }
  const writing = d.schreiben ? gradeWriting(d.schreiben, writeAns) : null;
  const speaking = d.sprechen ? gradeSpeaking(d.sprechen, speakAns, isDE) : null;
  return { parts, writing, speaking };
}
function renderWritingAiBlock(wa, isDE) {
  const c = wa.correction;
  if (!c) return '';
  let h = `<div class="writing-ai-block"><h4 style="font-size:13px;font-weight:700;margin:0 0 10px">Your corrected text</h4>`;
  if (c.correctedText) {
    const diffFn = typeof highlightCorrectedDiff === 'function' ? highlightCorrectedDiff : null;
    h += `<div class="corr-diff readable-text" style="font-size:13px;line-height:1.7;margin-bottom:12px">${diffFn && wa.userText ? diffFn(wa.userText, c.correctedText) : esc(c.correctedText)}</div>`;
  }
  if (c.summary) h += `<p style="font-size:12px;color:var(--text-secondary);margin-bottom:10px">${esc(c.summary)}</p>`;
  if (c.errors?.length) {
    h += `<ul style="font-size:12px;color:var(--text-secondary);line-height:1.65;padding-left:18px;margin:0 0 10px">`;
    c.errors.slice(0, 8).forEach((e) => {
      h += `<li><b>${esc(e.original || '')}</b> → ${esc(e.correction || '')}${e.explanation ? ` <span style="color:var(--text-muted)">(${esc(e.explanation)})</span>` : ''}</li>`;
    });
    h += `</ul>`;
  }
  if (c.grammarPoints?.length) {
    h += `<div style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">${isDE ? 'Grammatik' : 'Grammar'}</div>`;
    c.grammarPoints.slice(0, 3).forEach((g) => {
      h += `<p style="font-size:12px;color:var(--text-secondary);margin:0 0 6px"><b>${esc(g.tag || '')}</b>: ${esc(g.explanation || '')}${g.example ? ` <em>${esc(g.example)}</em>` : ''}</p>`;
    });
  }
  h += '</div>';
  return h;
}
async function loadWritingAiCorrections(correction, d, isDE, entryId) {
  const host = document.getElementById('writingAiHost');
  if (correction.writingAi?.length) {
    if (host) host.innerHTML = correction.writingAi.map((wa) => renderWritingAiBlock(wa, isDE)).join('');
    return;
  }
  if (typeof isPro !== 'function' || !isPro() || typeof correctWritingWithAI !== 'function') return;
  const lang = d.lang || S.subject || 'de';
  const level = d.level || S.level || 'B1';
  const jobs = [];
  if (d.schreibenParts?.length) {
    d.schreibenParts.forEach((p) => {
      const userText = getSchreibenAns(p);
      if (!userText.trim()) return;
      jobs.push({ aufgabe: p.aufgabe, task: p.task || p.instruction || '', userText, minWords: p.minWords });
    });
  } else if (d.schreiben) {
    const userText = document.getElementById('writeAns')?.value.trim() || '';
    if (userText.trim()) jobs.push({ aufgabe: 1, task: d.schreiben.task || '', userText, minWords: d.schreiben.minWords });
  }
  if (!jobs.length) return;
  if (host) host.innerHTML = `<div class="writing-ai-loading" style="font-size:12px;color:var(--text-muted);padding:10px 0">${isDE ? 'Corrigiendo con IA…' : 'AI correction in progress…'}</div>`;
  correction.writingAi = [];
  for (const job of jobs) {
    const result = await correctWritingWithAI(lang, level, job.task, job.userText, { minWords: job.minWords });
    if (result) correction.writingAi.push({ ...job, correction: result });
  }
  if (host) {
    host.innerHTML = correction.writingAi.length
      ? correction.writingAi.map((wa) => renderWritingAiBlock(wa, isDE)).join('')
      : '';
  }
  if (entryId) {
    const h = S.history.find((e) => e.id === entryId);
    if (h?.correction) {
      h.correction.writingAi = correction.writingAi;
      saveHist();
    }
  }
  if (S.lastResults?.correction) S.lastResults.correction.writingAi = correction.writingAi;
}
function renderCorrectionHtml(corr, d, isDE) {
  const hasGoethe = corr.writingParts?.length || corr.speakingParts?.length;
  if (!corr.parts.length && !corr.writing && !corr.speaking && !hasGoethe) return '';
  let html = `<div class="corr-wrap"><h2 style="font-size:16px;font-weight:700;margin-bottom:4px">${isDE ? 'Detaillierte Korrektur' : 'Detailed correction'}</h2>`;
  corr.parts.forEach((sec) => {
    html += `<div class="corr-mod"><h3>${sec.title}</h3>`;
    sec.items.forEach((it) => {
      html += `<div class="corr-row ${it.ok ? 'ok' : 'bad'}"><div class="corr-q">${it.ok ? '✓' : '✗'} ${it.q}</div><div class="corr-ans">${isDE ? 'Deine Antwort' : 'Your answer'}: <b>${esc(it.yours)}</b></div>${it.ok ? '' : `<div class="corr-fix">${isDE ? 'Richtig' : 'Correct'}: ${esc(it.correct)}</div>`}</div>`;
    });
    html += '</div>';
  });
  const renderWritePart = (wp, title) => {
    html += `<div class="corr-mod"><h3>${title} · ${wp.score}%</h3><div class="corr-row ${wp.score >= 70 ? 'ok' : 'bad'}"><div class="corr-ans">${esc(wp.note)}</div></div>`;
    if (wp.part.feedback?.length) {
      html += `<ul class="u-list-secondary">${wp.part.feedback.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>`;
    }
    if (wp.part.modelAnswer) {
      html += `<div class="u-text-caption" style="margin-bottom:6px">${isDE ? 'Musterantwort' : 'Model answer'}</div><div class="corr-model">${esc(wp.part.modelAnswer)}</div>`;
    }
    html += '</div>';
  };
  const writingProHint = `<p class="writing-pro-hint" style="font-size:11px;color:var(--text-muted);margin-top:10px;font-style:italic">${isDE ? 'Corrección con IA: función Pro' : 'AI writing correction: Pro feature'}</p>`;
  const writingAiHost = `<div id="writingAiHost" class="writing-ai-host"></div>`;
  if (corr.writingParts?.length) {
    corr.writingParts.forEach((wp) => renderWritePart(wp, `${isDE ? 'Schreiben' : 'Writing'} — Aufgabe ${wp.part.aufgabe}`));
    html += typeof isPro === 'function' && isPro() ? writingAiHost : writingProHint;
  } else if (corr.writing && d.schreiben) {
    html += `<div class="corr-mod"><h3>${isDE ? 'Schreiben' : 'Writing'} · ${corr.writing.score}%</h3><div class="corr-row ${corr.writing.score >= 70 ? 'ok' : 'bad'}"><div class="corr-ans">${esc(corr.writing.note)}</div></div>`;
    if (d.schreiben.feedback?.length) {
      html += `<div style="font-size:11px;color:var(--text-muted);margin:8px 0 6px;font-weight:700;text-transform:uppercase;letter-spacing:.06em">${isDE ? 'Checkliste' : 'Checklist'}</div><ul style="font-size:12px;color:var(--text-secondary);line-height:1.7;padding-left:18px;margin-bottom:10px">${d.schreiben.feedback.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>`;
    }
    if (d.schreiben.modelAnswer) {
      html += `<div class="u-text-caption" style="margin-bottom:6px">${isDE ? 'Musterantwort' : 'Model answer'}</div><div class="corr-model">${esc(d.schreiben.modelAnswer)}</div>`;
    }
    html += typeof isPro === 'function' && isPro() ? writingAiHost : writingProHint;
    html += '</div>';
  }
  if (corr.speakingParts?.length) {
    corr.speakingParts.forEach((sp) => {
      html += `<div class="corr-mod"><h3>${isDE ? 'Sprechen' : 'Speaking'} — Teil ${sp.part.teil} · ${sp.score}%</h3><div class="corr-row ${sp.score >= 70 ? 'ok' : 'bad'}"><div class="corr-ans">${esc(sp.note)}</div></div>`;
      if (sp.part.feedback?.length) {
        html += `<ul style="font-size:12px;color:var(--text-secondary);line-height:1.7;padding-left:18px;margin:10px 0">${sp.part.feedback.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>`;
      }
      if (sp.part.modelAnswer) {
        html += `<div class="u-text-caption" style="margin-bottom:6px">${isDE ? 'Musterdialog' : 'Model dialogue'}</div><div class="corr-model">${esc(sp.part.modelAnswer)}</div>`;
      }
      html += '</div>';
    });
  } else if (corr.speaking && d.sprechen) {
    html += `<div class="corr-mod"><h3>${isDE ? 'Sprechen' : 'Speaking'} · ${corr.speaking.score}%</h3><div class="corr-row ${corr.speaking.score >= 70 ? 'ok' : 'bad'}"><div class="corr-ans">${esc(corr.speaking.note)}</div></div>`;
    if (d.sprechen.feedback?.length) {
      html += `<ul style="font-size:12px;color:var(--text-secondary);line-height:1.7;padding-left:18px;margin:10px 0">${d.sprechen.feedback.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>`;
    }
    if (d.sprechen.modelAnswer) {
      html += `<div class="u-text-caption" style="margin-bottom:6px">${isDE ? 'Musterdialog' : 'Model dialogue'}</div><div class="corr-model">${esc(d.sprechen.modelAnswer)}</div>`;
    }
    html += '</div>';
  }
  html += '</div>';
  return html;
}
async function submitExam(){
  stopTimer();
  const d=S.examData;if(!d)return;
  const isDE=d.lang==='de';
  const isDemo=!!d.demo||!!S.isDemo;
  const writeAns=document.getElementById('writeAns')?.value.trim()||'';
  const speakAns=document.getElementById('speakAns')?.value.trim()||'';
  let correct=0,total=0,moduleScores={lesen:null,horen:null,gapfill:null,schreiben:null,sprechen:null};
  let speakingEvals=null;
  if(d.goetheFormat){
    let lc=0,lt=0,hc=0,ht=0;
    forEachGoetheQ(d,(mod,q)=>{
      const user=S.answers[mod+'_'+q.id];
      if(mod.startsWith('lesen_')){lt++;if(goetheAnswersMatch(user,q.correct))lc++;}
      else if(mod.startsWith('horen_')){ht++;if(goetheAnswersMatch(user,q.correct))hc++;}
    });
    d.horenParts?.forEach(p=>{
      p.noteFields?.forEach(f=>{
        ht++;
        const ans=(document.getElementById('note_'+f.id)?.value||'').trim().toLowerCase();
        if(ans===String(f.answer).trim().toLowerCase())hc++;
      });
    });
    if(lt){moduleScores.lesen=Math.round(lc/lt*100);correct+=lc;total+=lt;}
    if(ht){moduleScores.horen=Math.round(hc/ht*100);correct+=hc;total+=ht;}
    if(d.schreibenParts?.length){
      const ws=d.schreibenParts.map(p=>gradeWriting(p,getSchreibenAns(p)));
      moduleScores.schreiben=Math.round(ws.reduce((s,w)=>s+w.score,0)/ws.length);
      correct+=moduleScores.schreiben/100*d.schreibenParts.length;total+=d.schreibenParts.length;
    }
    if(d.sprechenParts?.length){
      if(isDemo){
        const ss=d.sprechenParts.map(p=>gradeSpeaking(p,document.getElementById(p.fieldId)?.value.trim()||'',isDE));
        moduleScores.sprechen=Math.round(ss.reduce((s,x)=>s+x.score,0)/ss.length);
        correct+=moduleScores.sprechen/100*d.sprechenParts.length;total+=d.sprechenParts.length;
      }else{
        hideAll();show('loadingScreen');
        if(typeof setLoaderStep==='function')setLoaderStep('Evaluating speaking…','AI examiner is reviewing your responses');
        speakingEvals=await evalSpeakingWithAI(d.sprechenParts,isDE);
        moduleScores.sprechen=Math.round(speakingEvals.reduce((s,x)=>s+(x.score||0),0)/speakingEvals.length);
        correct+=moduleScores.sprechen/100*d.sprechenParts.length;total+=d.sprechenParts.length;
      }
    }
  }else{
  if(d.lesen){let c=0;d.lesen.questions.forEach(q=>{const key='lesen_'+q.id,ans=S.answers[key];if(ans===q.correct)c++;total++;});correct+=c;moduleScores.lesen=Math.round(c/d.lesen.questions.length*100);}
  if(d.horen){let c=0;d.horen.questions.forEach(q=>{const key='horen_'+q.id,ans=S.answers[key];if(ans===q.correct)c++;total++;});correct+=c;moduleScores.horen=Math.round(c/d.horen.questions.length*100);}
  if(d.gapfill){let c=0;d.gapfill.sentences.forEach(s=>{const ans=(S.gapAnswers[s.id]||'').trim().toLowerCase();if(ans===s.answer.toLowerCase())c++;total++;});correct+=c;moduleScores.gapfill=Math.round(c/d.gapfill.sentences.length*100);}
  if(d.schreiben){
    const w=gradeWriting(d.schreiben,writeAns);
    moduleScores.schreiben=w.score;correct+=w.score/100;total+=1;
  }
  if(d.sprechen){
    if(isDemo){
      const sp=gradeSpeaking(d.sprechen,speakAns,isDE);
      moduleScores.sprechen=sp.score;correct+=sp.score/100;total+=1;
    }else{
      hideAll();show('loadingScreen');
      if(typeof setLoaderStep==='function')setLoaderStep('Evaluating speaking…','AI examiner is reviewing your response');
      const parts=[{...d.sprechen,fieldId:'speakAns'}];
      speakingEvals=await evalSpeakingWithAI(parts,isDE);
      moduleScores.sprechen=speakingEvals[0]?.score||0;
      correct+=moduleScores.sprechen/100;total+=1;
    }
  }
  }
  const score=total?Math.round(correct/total*100):0;
  const correction=buildCorrection(d,isDE,writeAns,speakAns);
  let savedWords=[...(S.examSavedWords||[])];
  S.lastMarkedWords=S.activeSession?.markedWords?[...S.activeSession.markedWords]:[];
  const entry={id:Date.now(),date:new Date().toLocaleDateString(),topic:d.topic,level:d.level,lang:d.lang,score,moduleScores,mode:normalizeMode(S.mode),demo:!!d.demo,guidedDemo:!!d.guidedDemo,correction,savedWords,markedWords:S.lastMarkedWords.map(m=>m.word),examSource:S.examSource||null,poolId:S.examData?.poolId||null};
  if(typeof AnalyticsStore!=='undefined'){
    const goal=getActiveGoal()||S.goals.find(g=>g.id===d.goalId);
    entry.tagStats=AnalyticsStore.recordExamResult(goal,entry,d,S.answers);
  }
  if(typeof TargetUsage!=='undefined'&&S.flashcards?.length){
    const userWords=S.flashcards
      .filter((fc)=>fc.sourceLang===(d.lang||S.subject))
      .map((fc)=>fc.word)
      .filter(Boolean);
    if(userWords.length){
      const usage=TargetUsage.deriveTargetUsage(d,userWords);
      entry.vocabIntersection=usage;
      entry.vocabInExam=usage.map((u)=>u.word);
      entry.vocabNotInExam=userWords.filter(
        (w)=>!usage.some((u)=>u.word.toLowerCase()===w.toLowerCase()),
      );
    }
  }
  if(typeof ExamProfile!=='undefined')ExamProfile.tagItem(entry);
  S.history.unshift(entry);saveHist();
  const goal=getActiveGoal();
  const modeLbl=normalizeMode(S.mode)==='practice'?'Practice':'Official';
  const qm=S.quickMod;
  flushOpenStudySession({type:qm?'quick':'exam',goalId:goal?.id||S.activeGoalId,label:(qm?'Quick '+qm+' · ':modeLbl+' exam · ')+(d.topic||d.level||''),score});
  const savedId=d._savedId||d._flightId;
  if(savedId){
    const si=S.savedExams.findIndex(e=>e.id===savedId);
    if(si>=0){
      S.savedExams[si]={...S.savedExams[si],status:'completed',score,moduleScores,correction,savedWords,markedWords:S.lastMarkedWords.map(m=>m.word),writeAns,speakAns,speakingEvals,completedAt:Date.now()};
      saveSaved();
    }
  }
  S._officialInProgress=null;
  clearActiveSession();
  renderResults(score,moduleScores,d,isDE,writeAns,speakAns,entry.id,correction,speakingEvals,savedWords,S.lastMarkedWords,entry);
}

function getResultsWeakModules(mods,isDE){
  const labels={lesen:isDE?'Leseverstehen':'Reading',horen:isDE?'Hörverstehen':'Listening',gapfill:'Gap-Fill',schreiben:isDE?'Schreiben':'Writing',sprechen:isDE?'Sprechen':'Speaking'};
  return Object.entries(mods||{}).filter(([,v])=>v!=null&&v<70).map(([k,v])=>({label:labels[k]||k,score:v})).sort((a,b)=>a.score-b.score);
}
function getResultsRecommendedAction(score,mods,deckN,practiceMode){
  const goal=getActiveGoal()||S.goals[0];
  const weak=getResultsWeakModules(mods,false);
  if(practiceMode&&deckN>=4)return{title:'Generate a personalized exam',desc:`You saved ${deckN} words from this session. Build a mock test from your weak vocabulary.`,cta:'Personalized exam →',run:workspaceAction('exams',()=>goal&&openExamConfigurator(goal.id))};
  if(practiceMode&&deckN>0)return{title:'Review saved vocabulary',desc:`${deckN} word${deckN!==1?'s':''} detected from mistakes. Strengthen them before your next exam.`,cta:'Review flashcards →',run:workspaceAction('vocabulary',()=>goal&&openDeckHub(goal.id))};
  if(weak.length)return{title:'Practice your weak modules',desc:`Focus on ${weak.map(w=>w.label).join(', ')} in practice mode and save words you miss.`,cta:'Practice again →',run:()=>startMockExam('practice')};
  if(score<70)return{title:'Retake in practice mode',desc:'Save difficult words as you go — they become your personalized study plan.',cta:'Practice exam →',run:()=>startMockExam('practice')};
  return{title:'Take another mock exam',desc:'Keep building exam readiness with another official-format test.',cta:'Next exam →',run:()=>startMockExam('official')};
}
function renderVocabGameSection(entry,isDE){
  const intersection=entry?.vocabInExam||[];
  const notInExam=entry?.vocabNotInExam||[];
  if(!intersection.length&&!notInExam.length)return '';
  const lang=isDE?{
    title:'Tu vocabulario en este examen',
    found:'Palabras tuyas que aparecieron',
    notFound:'Palabras tuyas que NO aparecieron',
    gamePrompt:'¿Recuerdas haberlas visto?',
    none:'Ninguna de tus palabras apareció en este examen',
  }:{
    title:'Your vocabulary in this exam',
    found:'Your words that appeared',
    notFound:'Your words that did NOT appear',
    gamePrompt:'Do you remember seeing them?',
    none:'None of your saved words appeared in this exam',
  };
  if(!intersection.length){
    return `<div class="vocab-game-section">
      <h3>${lang.title}</h3>
      <p class="muted">${lang.none}</p>
    </div>`;
  }
  const foundPills=intersection
    .map((w)=>`<span class="vocab-pill vocab-found">${esc(w)}</span>`)
    .join('');
  const notFoundPills=notInExam.slice(0,10)
    .map((w)=>`<span class="vocab-pill vocab-not-found">${esc(w)}</span>`)
    .join('');
  return `<div class="vocab-game-section">
    <h3>${lang.title}</h3>
    <div class="vocab-game-block">
      <p class="vocab-game-label">${lang.found} (${intersection.length}) — ${lang.gamePrompt}</p>
      <div class="vocab-pills">${foundPills}</div>
    </div>
    ${notInExam.length?`<div class="vocab-game-block">
      <p class="vocab-game-label">${lang.notFound}</p>
      <div class="vocab-pills">${notFoundPills}</div>
    </div>`:''}
  </div>`;
}
function renderResults(score,mods,d,isDE,writeAns,speakAns,entryId,correction,speakingEvals,savedWordsOverride,markedWordsOverride,histEntry){
  hideAll();
  S.lastResults={score,mods,d,isDE,correction,speakingEvals};
  show('resultsScreen');
  const scr=document.getElementById('resultsScreen');
  const cls=score>=70?'pass':score>=50?'mid':'fail';
  const label=score>=70?(isDE?'Bestanden ✓':'Pass ✓'):score>=50?(isDE?'Knapp':'Close'):isDE?'Nicht bestanden':'Fail';
  const corrHtml=correction?renderCorrectionHtml(correction,d,isDE):'';
  const speakHtml=typeof renderSpeakingResultsHtml==='function'?renderSpeakingResultsHtml(speakingEvals,isDE):'';
  let modCards='';
  const msColor=v=>v>=70?'var(--green)':v>=60?'var(--warning,var(--orange))':v>=50?'var(--orange)':'var(--red)';
  if(mods.lesen!=null)modCards+=`<div class="card mod-score"><div class="mod-score__val" style="color:${msColor(mods.lesen)}">${mods.lesen}%</div><div class="mod-score__lbl">${isDE?'Leseverstehen':'Reading'}</div></div>`;
  if(mods.horen!=null)modCards+=`<div class="card mod-score"><div class="mod-score__val" style="color:${msColor(mods.horen)}">${mods.horen}%</div><div class="mod-score__lbl">${isDE?'Hörverstehen':'Listening'}</div></div>`;
  if(mods.gapfill!=null)modCards+=`<div class="card mod-score"><div class="mod-score__val" style="color:${msColor(mods.gapfill)}">${mods.gapfill}%</div><div class="mod-score__lbl">Gap-Fill</div></div>`;
  if(mods.schreiben!=null)modCards+=`<div class="card mod-score"><div class="mod-score__val" style="color:${msColor(mods.schreiben)}">${mods.schreiben}%</div><div class="mod-score__lbl">${isDE?'Schreiben':'Writing'}</div></div>`;
  if(mods.sprechen!=null)modCards+=`<div class="card mod-score"><div class="mod-score__val" style="color:${msColor(mods.sprechen)}">${mods.sprechen}%</div><div class="mod-score__lbl">${isDE?'Sprechen':'Speaking'}</div></div>`;
  let answerHtml='';
  if(d.goetheFormat){
    answerHtml=(d.schreibenParts||[]).map(p=>{const v=document.getElementById(p.fieldId)?.value.trim();return v?`<div class="text-display"><h3>${isDE?'Schreiben':'Writing'} — Aufgabe ${p.aufgabe}</h3><div class="readable-text" style="white-space:pre-wrap">${esc(v)}</div></div>`:'';}).join('');
    answerHtml+=(d.sprechenParts||[]).map(p=>{const v=document.getElementById(p.fieldId)?.value.trim();return v?`<div class="text-display"><h3>${isDE?'Sprechen':'Speaking'} — Teil ${p.teil}</h3><div class="readable-text" style="white-space:pre-wrap">${esc(v)}</div></div>`:'';}).join('');
  }else{
    if(writeAns)answerHtml+=`<div class="text-display"><h3>${isDE?'Deine Antwort — Schreiben':'Your Writing Response'}</h3><div class="readable-text" style="white-space:pre-wrap">${esc(writeAns)}</div></div>`;
    if(speakAns)answerHtml+=`<div class="text-display"><h3>${isDE?'Deine Antwort — Sprechen':'Your Speaking Notes'}</h3><div class="readable-text" style="white-space:pre-wrap">${esc(speakAns)}</div></div>`;
  }
  const deckN=getProfileFlashcards().length;
  const savedWords=savedWordsOverride||S.examSavedWords||[];
  const weakMods=getResultsWeakModules(mods,isDE);
  const weakHtml=weakMods.length?`<div class="results-detail"><h4>Weak areas</h4><ul class="results-weak-list">${weakMods.map(w=>`<li>${esc(w.label)} — ${w.score}%</li>`).join('')}</ul></div>`:'<div class="results-detail"><h4>Weak areas</h4><p class="u-text-xs u-text-secondary">Strong performance across modules. Keep practicing to maintain readiness.</p></div>';
  const markedList=markedWordsOverride||S.lastMarkedWords||[];
  const markedHtml=markedList.length?`<div class="results-detail results-marked"><h4>Review the words you marked</h4><p style="font-size:12px;font-weight:600;color:var(--text-secondary);margin-bottom:10px">In official mode, marked words are translated here — save any you want to your deck.</p>${markedList.map((m,i)=>`<div class="marked-word-row" id="markedRow_${i}"><span class="marked-word">${esc(m.word)}</span><div class="marked-trans" id="markedTrans_${i}"><button type="button" class="btn-sm" onclick="expandMarkedWord('${encodeURIComponent(m.word)}',${i})">Show translation</button></div></div>`).join('')}</div>`:'';
  const vocabHtml=savedWords.length?`<div class="results-detail"><h4>Vocabulary detected</h4><ul class="results-vocab-list">${savedWords.slice(0,12).map(w=>`<li>${esc(w)}</li>`).join('')}${savedWords.length>12?`<li>+${savedWords.length-12} more</li>`:''}</ul></div>`:(isPracticeMode()?`<div class="results-detail"><h4>Vocabulary detected</h4><p class="u-text-xs u-text-secondary">Words you saved during practice appear in your deck.</p></div>`:'');
  const vocabGameHtml=renderVocabGameSection(histEntry,isDE);
  const goalForBatch=getActiveGoal();
  const batchPlan=typeof VocabBatching!=='undefined'?goalForBatch?.vocabPlan:null;
  const batchCov=batchPlan?VocabBatching.coverage(batchPlan):null;
  const nextBatchHtml=batchPlan&&batchCov&&!batchCov.finished?`<div class="results-detail"><h4>Vocabulary batches</h4><p class="u-text-xs u-text-secondary">${esc(VocabBatching.summary(batchPlan,S.subject||goalForBatch?.subject))}</p><button type="button" class="btn-sm accent" onclick="generateNextVocabBatch('${goalForBatch.id}')">Next batch →</button></div>`:'';
  const act=getResultsRecommendedAction(score,mods,deckN,isPracticeMode());
  _coachAction=act.run;
  const isDemoSession=!!d.guidedDemo;
  const guest=(typeof Auth!=='undefined'&&Auth.isGuest&&Auth.isGuest())||isDemoSession;
  const guestHtml=guest?`<div class="results-guest"><p><b>${isDemoSession?'Demo complete — save your preparation profile.':'Save your progress.'}</b> ${isDemoSession?'Create an account to keep vocabulary, personalized practice, exam history, and readiness tracking for '+esc(getPreparingFor())+'.':'Guest mode keeps results on this device only. Create a free account to sync exams, vocabulary, and scores across devices.'}</p><ul class="u-list-compact">${isDemoSession?'<li>Save detected vocabulary</li><li>Keep personalized practice</li><li>Track exam readiness</li><li>Review past mistakes</li>':''}</ul><button class="btn-sm accent" onclick="userMenuSignIn()">Create account to continue</button>${isDemoSession?` <button class="btn-sm" onclick="goFlashcards()">See demo flashcards</button>`:''}</div>`:'';
  const loopMsg=isPracticeMode()
    ?`Practice exam complete. Words you saved become evidence for your personalized study plan.`
    :markedList.length?`Official exam complete. Review the ${markedList.length} word${markedList.length===1?'':'s'} you marked below — save them to your deck for personalized practice.`
    :`Official exam complete. Next time, tap words you struggle with during the exam to review them here.`;
  scr.innerHTML=`
    ${renderNavBackBtn('Exams')}
    <div class="card results-hero">
      <div class="res-score ${cls}">${score}%</div>
      <div class="res-label">${label} — ${d.level} ${d.lang==='de'?'🇩🇪':'🇬🇧'} ${esc(d.topic)}</div>
    </div>
    <div class="results-loop">
      <h4>Every mistake becomes your next lesson</h4>
      <p>${loopMsg}</p>
    </div>
    <div class="module-scores-grid">${modCards}</div>
    ${weakHtml}
    ${vocabGameHtml}
    ${nextBatchHtml}
    ${markedHtml}
    ${vocabHtml}
    <div class="results-action">
      <h4>Recommended next step</h4>
      <p>${esc(act.desc)}</p>
      <button class="btn-sm accent" onclick="runRecommendedAction()">${esc(act.cta)}</button>
      ${deckN>=4?`<button class="btn-sm" style="margin-left:8px" onclick="goFlashcards()">Personalized practice available</button>`:''}
    </div>
    ${guestHtml}
    ${answerHtml}
    ${speakHtml}
    ${corrHtml}
    <div style="display:flex;gap:9px;flex-wrap:wrap;margin-top:22px">
      <button class="btn-sm accent" onclick="saveCurrentExam()">Save exam</button>
      <button class="btn-sm" onclick="shareExamUrl()">Copy exam link</button>
      ${isPracticeMode()&&savedWords.length?`<button class="btn-sm" onclick="goFlashcards()">Review ${savedWords.length} session words</button>`:''}
      <button class="btn-sm" onclick="downloadCorrectionPdf(S.lastResults.score,S.lastResults.mods,S.lastResults.d,S.lastResults.isDE,S.lastResults.correction,S.lastResults.speakingEvals)">Download PDF${typeof isPro==='function'&&!isPro()?' (Pro)':''}</button>
      <button class="btn-sm" onclick="goHistory()">View progress</button>
      <button class="btn-sm" onclick="goHome()">Dashboard</button>
    </div>`;
  const rid=entryId||d._savedId||d._flightId;
  if(typeof LcRouter!=='undefined'&&rid)LcRouter.replaceRoute('#/exam/'+rid+'/results','Results');
  window.scrollTo({top:0,behavior:'smooth'});
  if(correction&&(d.schreibenParts?.length||d.schreiben))loadWritingAiCorrections(correction,d,isDE,entryId);
}
function shareExamUrl(){
  saveCurrentExam();
  const url=typeof getShareableExamUrl==='function'?getShareableExamUrl():null;
  if(!url){lcToast('Save the exam first to get a share link.','warn');return;}
  if(navigator.clipboard&&navigator.clipboard.writeText){
    navigator.clipboard.writeText(url).then(()=>lcToast('Exam link copied to clipboard.','success')).catch(()=>lcToast(url,'info',8000));
  }else lcToast(url,'info',8000);
}
