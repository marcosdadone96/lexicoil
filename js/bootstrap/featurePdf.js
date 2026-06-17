/* PDF export — compact professional correction report */
(function () {
  function grammarTagLabel(tag) {
    if (!tag) return '';
    const t = String(tag);
    if (t.startsWith('g-')) {
      const parts = t.split('-').slice(2);
      return parts
        .join(' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());
    }
    return t.replace(/_/g, ' ');
  }

  function collectGrammarFailures(correction) {
    const byTag = new Map();
    (correction?.parts || []).forEach((block) => {
      (block.items || []).forEach((it) => {
        if (it.ok) return;
        const tags = it.grammarTags?.length ? it.grammarTags : ['general'];
        tags.forEach((tag) => {
          if (!byTag.has(tag)) byTag.set(tag, { tag, count: 0, examples: [] });
          const g = byTag.get(tag);
          g.count++;
          if (g.examples.length < 2 && it.explanation) {
            g.examples.push({ q: it.q, explanation: it.explanation, yours: it.yours, correct: it.correct });
          }
        });
      });
    });
    return [...byTag.values()].sort((a, b) => b.count - a.count);
  }

  function collectSampleMistakes(correction, limit = 8) {
    const out = [];
    (correction?.parts || []).forEach((block) => {
      (block.items || []).forEach((it) => {
        if (it.ok || out.length >= limit) return;
        out.push({
          tag: (it.grammarTags && it.grammarTags[0]) || 'grammar',
          question: it.q,
          yours: it.yours,
          correct: it.correct,
          explanation: it.explanation,
        });
      });
    });
    return out;
  }

  window.buildPdfHtml = function (score, mods, d, isDE, correction, speakingParts, grammarCoaching) {
    const name = S.user?.name || (isDE ? 'Kandidat/in' : 'Candidate');
    const cert = d.official?.certificate || '';
    const topic = d.topic || '';
    const passed =
      score >= 70 ? (isDE ? 'BESTANDEN' : 'PASSED') : isDE ? 'NICHT BESTANDEN' : 'NOT PASSED';
    const modNames = {
      lesen: isDE ? 'Lesen' : 'Reading',
      horen: isDE ? 'Hörverstehen' : 'Listening',
      gapfill: 'Gap-Fill',
      schreiben: isDE ? 'Schreiben' : 'Writing',
      sprechen: isDE ? 'Sprechen' : 'Speaking',
    };
    const grammarFails = collectGrammarFailures(correction);

    let html = `<div class="pdf-doc">
      <header class="pdf-header">
        <div class="pdf-brand">LexiCoil</div>
        <div class="pdf-meta">${new Date().toLocaleDateString()} · ${esc(cert)} · ${esc(d.level)} · ${esc(topic)}</div>
        <h1 class="pdf-candidate">${esc(name)}</h1>
        <p class="pdf-scoreline"><strong>${score}%</strong> — ${passed}</p>
      </header>
      <section class="pdf-section">
        <h2>${isDE ? 'Module' : 'Modules'}</h2>
        <table class="pdf-table"><tbody>`;
    Object.entries(mods || {}).forEach(([k, v]) => {
      if (v != null) html += `<tr><td>${esc(modNames[k] || k)}</td><td class="pdf-num">${v}%</td></tr>`;
    });
    html += `</tbody></table></section>`;

    if (grammarFails.length) {
      html += `<section class="pdf-section"><h2>${isDE ? 'Resumen de fallos por gramática' : 'Mistakes by grammar topic'}</h2>`;
      grammarFails.forEach((g) => {
        html += `<div class="pdf-grammar-group"><h3>${esc(grammarTagLabel(g.tag))} <span class="pdf-badge">${g.count} ${isDE ? 'fallos' : 'mistakes'}</span></h3>`;
        g.examples.forEach((ex) => {
          html += `<p class="pdf-explain">${esc(ex.explanation)}</p>`;
        });
        html += `</div>`;
      });
      html += `</section>`;
    }

    if (grammarCoaching?.topics?.length) {
      html += `<section class="pdf-section"><h2>${isDE ? 'Explicación gramatical (IA)' : 'Grammar coaching (AI)'}</h2>`;
      grammarCoaching.topics.slice(0, 4).forEach((t) => {
        html += `<div class="pdf-coach-topic"><h3>${esc(t.title || grammarTagLabel(t.tag))}</h3>`;
        if (t.explanation) html += `<p>${esc(t.explanation)}</p>`;
        if (t.examples?.length) {
          html += `<ul class="pdf-examples">${t.examples.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>`;
        }
        if (t.tip) html += `<p class="pdf-tip"><em>${esc(t.tip)}</em></p>`;
        html += `</div>`;
      });
      html += `</section>`;
    }

    if (correction?.writingAi?.length) {
      html += `<section class="pdf-section"><h2>${isDE ? 'Schreiben — tu texto corregido' : 'Writing — your corrected text'}</h2>`;
      correction.writingAi.forEach((wa) => {
        const c = wa.correction;
        if (!c) return;
        html += `<div class="pdf-writing-block">`;
        if (wa.aufgabe) html += `<h3>${isDE ? 'Aufgabe' : 'Task'} ${wa.aufgabe}</h3>`;
        if (c.correctedText) html += `<p class="pdf-corrected">${esc(c.correctedText)}</p>`;
        if (c.summary) html += `<p class="pdf-muted">${esc(c.summary)}</p>`;
        if (c.errors?.length) {
          html += `<ul class="pdf-errors">${c.errors.slice(0, 8).map((e) => `<li><strong>${esc(e.original || '')}</strong> → ${esc(e.correction || '')}${e.explanation ? ` — ${esc(e.explanation)}` : ''}</li>`).join('')}</ul>`;
        }
        html += `</div>`;
      });
      html += `</section>`;
    }

    if (correction?.parts?.length) {
      html += `<section class="pdf-section"><h2>${isDE ? 'Detalle por módulo' : 'Module detail'}</h2>`;
      correction.parts.forEach((block) => {
        const fails = (block.items || []).filter((it) => !it.ok);
        if (!fails.length) return;
        html += `<div class="pdf-detail-block"><h3>${esc(block.title)}</h3>`;
        fails.slice(0, 12).forEach((it) => {
          html += `<p class="pdf-fail-row"><span class="pdf-x">✗</span> ${esc(it.q)}<br><span class="pdf-muted">${isDE ? 'Tuyo' : 'Yours'}: ${esc(it.yours)} · ${isDE ? 'Correcto' : 'Correct'}: ${esc(it.correct)}</span></p>`;
        });
        html += `</div>`;
      });
      html += `</section>`;
    }

    if (speakingParts?.length) {
      html += `<section class="pdf-section"><h2>${isDE ? 'Sprechen' : 'Speaking'}</h2>`;
      speakingParts.forEach((sp) => {
        if (sp.transcript) html += `<p><strong>${isDE ? 'Tu respuesta' : 'Your answer'}:</strong> ${esc(sp.transcript)}</p>`;
        if (sp.criteria) {
          sp.criteria.forEach((c) => {
            html += `<p>${esc(c.name)}: ${c.score}/5 — ${esc(c.comment)}</p>`;
          });
        }
        if (sp.correctedVersion) html += `<p><strong>${isDE ? 'Corregido' : 'Corrected'}:</strong> ${esc(sp.correctedVersion)}</p>`;
        if (sp.overallFeedback || sp.note) html += `<p class="pdf-muted">${esc(sp.overallFeedback || sp.note || '')}</p>`;
      });
      html += `</section>`;
    }

    html += `</div>`;
    return html;
  };

  window.downloadCorrectionPdf = async function (score, mods, d, isDE, correction, speakingParts) {
    if (!isPro()) {
      notify('PDF reports are a Pro feature. Upgrade to download.', 'warn', 4500);
      if (typeof showUpgrade === 'function') showUpgrade();
      return;
    }
    const box = document.getElementById('pdf-export-container');
    if (!box) return;

    let coaching = correction?.grammarCoaching || null;
    if (!coaching && typeof genGrammarCoaching === 'function') {
      const fails = collectGrammarFailures(correction);
      const weakTags = fails.map((g) => g.tag).slice(0, 6);
      const samples = collectSampleMistakes(correction);
      if (weakTags.length || samples.length) {
        notify(isDE ? 'Generando informe PDF…' : 'Building PDF report…', 'info', 2500);
        coaching = await genGrammarCoaching(d.lang || S.subject || 'de', d.level || S.level, weakTags, samples);
        if (correction && coaching) {
          correction.grammarCoaching = coaching;
          if (S.lastResults?.correction) S.lastResults.correction.grammarCoaching = coaching;
        }
      }
    }

    box.innerHTML = buildPdfHtml(score, mods, d, isDE, correction, speakingParts, coaching);
    box.style.display = 'block';
    window.print();
    setTimeout(() => {
      box.innerHTML = '';
      box.style.display = 'none';
    }, 500);
  };
})();
