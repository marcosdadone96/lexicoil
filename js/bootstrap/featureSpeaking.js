/* Speaking evaluation with AI */
(function () {
  window.buildSpeakingEvalPrompt = function (part, transcript, isDE) {
    const board = isDE ? 'Goethe-Institut' : 'Cambridge Assessment English';
    const cert = S.examData?.official?.certificate || S.level;
    return `You are a certified ${board} examiner evaluating a spoken response at level ${S.level} (${cert}).
Evaluate strictly according to the official speaking rubric.
Reply ONLY with valid JSON.

Task: ${part.situation || ''}
Points: ${(part.points || []).join('; ')}
Candidate transcript:
${transcript}

Model answer reference:
${part.modelAnswer || ''}

Return JSON:
{"criteria":[{"name":"Task Achievement","score":0-5,"comment":"..."},{"name":"Vocabulary Range","score":0-5,"comment":"..."},{"name":"Grammar Accuracy","score":0-5,"comment":"..."},{"name":"Coherence & Fluency","score":0-5,"comment":"..."}],"totalScore":0-100,"passed":true,"overallFeedback":"...","strongPoints":["..."],"improvements":["..."],"correctedVersion":"..."}`;
  };

  window.evalSpeakingWithAI = async function (parts, isDE) {
    const out = [];
    for (const p of parts) {
      const txt = document.getElementById(p.fieldId)?.value.trim() || '';
      if (!txt) {
        out.push({ ...gradeSpeaking(p, '', isDE), part: p, ai: false });
        continue;
      }
      try {
        const speakTicket = await startExamGeneration('exam_generation', 2);
        const raw = await callAI(buildSpeakingEvalPrompt(p, txt, isDE), 1200, { examGeneration: true, aiAction: 'exam_generation', genTicket: speakTicket });
        const data = JSON.parse(raw.replace(/```json|```/g, '').trim());
        out.push({
          part: p,
          ai: true,
          score: data.totalScore || 0,
          passed: data.passed,
          criteria: data.criteria || [],
          overallFeedback: data.overallFeedback,
          strongPoints: data.strongPoints || [],
          improvements: data.improvements || [],
          correctedVersion: data.correctedVersion,
          transcript: txt,
        });
      } catch (_) {
        out.push({ ...gradeSpeaking(p, txt, isDE), part: p, ai: false });
      }
    }
    return out;
  };

  window.renderSpeakingResultsHtml = function (evals, isDE) {
    if (!evals?.length) return '';
    return evals
      .map((sp) => {
        const title =
          sp.part?.teil != null
            ? `${isDE ? 'Sprechen' : 'Speaking'} — ${isDE ? 'Teil' : 'Part'} ${sp.part.teil}`
            : isDE
              ? 'Sprechen'
              : 'Speaking';
        let h = `<div class="speaking-eval-block"><h3 style="font-size:14px;margin-bottom:12px">${title}${sp.ai ? ' <span style="font-size:10px;color:var(--purple)">AI evaluated</span>' : ''}</h3>`;
        if (sp.criteria?.length) {
          sp.criteria.forEach((c) => {
            const pct = Math.round(((c.score || 0) / 5) * 100);
            h += `<div class="speak-crit-row"><span style="min-width:130px;font-weight:600">${esc(c.name)}</span><div class="speak-crit-bar"><div class="speak-crit-fill" style="width:${pct}%"></div></div><span style="font-family:'DM Mono',monospace;font-size:12px">${c.score || 0}/5</span></div><p style="font-size:11px;color:var(--text-muted);margin:-4px 0 10px 0">${esc(c.comment || '')}</p>`;
          });
        } else if (sp.note) {
          h += `<p style="font-size:13px;color:var(--text-secondary)">${esc(sp.note)}</p>`;
        }
        if (sp.overallFeedback) h += `<p style="font-size:13px;color:var(--text-secondary);margin-top:8px">${esc(sp.overallFeedback)}</p>`;
        if (sp.strongPoints?.length) {
          h += `<p style="font-size:11px;font-weight:700;color:var(--green);margin-top:10px">Strengths</p><ul style="font-size:12px;color:var(--text-secondary);padding-left:18px;margin:4px 0 10px">${sp.strongPoints.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>`;
        }
        if (sp.improvements?.length) {
          h += `<p style="font-size:11px;font-weight:700;color:var(--orange);margin-top:4px">Improvements</p><ul style="font-size:12px;color:var(--text-secondary);padding-left:18px;margin:4px 0 10px">${sp.improvements.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>`;
        }
        if (sp.correctedVersion && sp.transcript) {
          h += `<p style="font-size:11px;font-weight:700;color:var(--text-muted);margin-top:8px;text-transform:uppercase;letter-spacing:.06em">Corrected version</p><div class="corr-diff readable-text" style="font-size:13px;line-height:1.7">${highlightCorrectedDiff(sp.transcript, sp.correctedVersion)}</div>`;
        } else if (sp.correctedVersion) {
          h += `<p style="font-size:11px;font-weight:700;color:var(--text-muted);margin-top:8px">Corrected version</p><div class="readable-text" style="font-size:13px">${esc(sp.correctedVersion)}</div>`;
        }
        h += '</div>';
        return h;
      })
      .join('');
  };

  window.highlightCorrectedDiff = function (original, corrected) {
    const oWords = String(original || '').split(/\s+/);
    const cWords = String(corrected || '').split(/\s+/);
    return cWords
      .map((w, i) => {
        const ow = oWords[i] || '';
        if (w.toLowerCase() !== ow.toLowerCase()) return `<mark>${esc(w)}</mark>`;
        return esc(w);
      })
      .join(' ');
  };
})();
