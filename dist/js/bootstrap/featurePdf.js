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

  function resolveLang(uiLang) {
    if (uiLang && pdfReportStrings(uiLang)) return uiLang;
    return typeof resolvePdfUiLang === 'function' ? resolvePdfUiLang() : 'en';
  }

  function showPrintHintModal(uiLang) {
    return new Promise((resolve) => {
      const t = pdfReportStrings(uiLang);
      const existing = document.getElementById('pdf-print-hint-overlay');
      if (existing) existing.remove();
      const el = document.createElement('div');
      el.id = 'pdf-print-hint-overlay';
      el.className = 'pdf-print-hint-overlay';
      el.innerHTML = `<div class="pdf-print-hint-box" role="dialog" aria-labelledby="pdf-print-hint-title">
        <h2 id="pdf-print-hint-title">${esc(t.printHintTitle)}</h2>
        <p>${esc(t.printHintBody)}</p>
        <p class="pdf-print-hint-note">${esc(t.printHintNote)}</p>
        <button type="button" class="btn-sm accent pdf-print-hint-btn">${esc(t.printHintContinue)}</button>
      </div>`;
      document.body.appendChild(el);
      const close = () => {
        el.remove();
        resolve();
      };
      el.querySelector('.pdf-print-hint-btn').addEventListener('click', close);
    });
  }

  window.buildPdfHtml = function (score, mods, d, _isDE, correction, speakingParts, grammarCoaching, uiLang) {
    const lang = resolveLang(uiLang);
    const t = pdfReportStrings(lang);
    const name = S.user?.name || t.candidate;
    const cert = d.official?.certificate || '';
    const topic = d.topic || '';
    const passed = score >= 70 ? t.passed : t.notPassed;
    const modNames = {
      lesen: t.modLesen,
      horen: t.modHoren,
      gapfill: t.modGapfill,
      schreiben: t.modSchreiben,
      sprechen: t.modSprechen,
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
        <h2>${esc(t.modules)}</h2>
        <table class="pdf-table"><tbody>`;
    Object.entries(mods || {}).forEach(([k, v]) => {
      if (v != null) html += `<tr><td>${esc(modNames[k] || k)}</td><td class="pdf-num">${v}%</td></tr>`;
    });
    html += `</tbody></table></section>`;

    if (grammarFails.length) {
      html += `<section class="pdf-section"><h2>${esc(t.mistakesByGrammar)}</h2>`;
      grammarFails.forEach((g) => {
        html += `<div class="pdf-grammar-group"><h3>${esc(grammarTagLabel(g.tag))} <span class="pdf-badge">${esc(formatMistakeCount(g.count, lang))}</span></h3>`;
        g.examples.forEach((ex) => {
          html += `<p class="pdf-explain">${esc(ex.explanation)}</p>`;
        });
        html += `</div>`;
      });
      html += `</section>`;
    }

    if (grammarCoaching?.topics?.length) {
      html += `<section class="pdf-section"><h2>${esc(t.grammarCoaching)}</h2>`;
      grammarCoaching.topics.slice(0, 4).forEach((topicItem) => {
        html += `<div class="pdf-coach-topic"><h3>${esc(topicItem.title || grammarTagLabel(topicItem.tag))}</h3>`;
        if (topicItem.explanation) html += `<p>${esc(topicItem.explanation)}</p>`;
        if (topicItem.examples?.length) {
          html += `<ul class="pdf-examples">${topicItem.examples.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>`;
        }
        if (topicItem.tip) html += `<p class="pdf-tip"><em>${esc(topicItem.tip)}</em></p>`;
        html += `</div>`;
      });
      html += `</section>`;
    }

    if (correction?.writingAi?.length) {
      html += `<section class="pdf-section"><h2>${esc(t.writingCorrected)}</h2>`;
      correction.writingAi.forEach((wa) => {
        const c = wa.correction;
        if (!c) return;
        html += `<div class="pdf-writing-block">`;
        if (wa.aufgabe) html += `<h3>${esc(t.task)} ${wa.aufgabe}</h3>`;
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
      html += `<section class="pdf-section"><h2>${esc(t.moduleDetail)}</h2>`;
      correction.parts.forEach((block) => {
        const fails = (block.items || []).filter((it) => !it.ok);
        if (!fails.length) return;
        html += `<div class="pdf-detail-block"><h3>${esc(block.title)}</h3>`;
        fails.slice(0, 12).forEach((it) => {
          html += `<p class="pdf-fail-row"><span class="pdf-x">✗</span> ${esc(it.q)}<br><span class="pdf-muted">${esc(t.yours)}: ${esc(it.yours)} · ${esc(t.correct)}: ${esc(it.correct)}</span></p>`;
        });
        html += `</div>`;
      });
      html += `</section>`;
    }

    if (speakingParts?.length) {
      html += `<section class="pdf-section"><h2>${esc(t.speaking)}</h2>`;
      speakingParts.forEach((sp) => {
        if (sp.transcript) html += `<p><strong>${esc(t.yourAnswer)}:</strong> ${esc(sp.transcript)}</p>`;
        if (sp.criteria) {
          sp.criteria.forEach((c) => {
            html += `<p>${esc(c.name)}: ${c.score}/5 — ${esc(c.comment)}</p>`;
          });
        }
        if (sp.correctedVersion) html += `<p><strong>${esc(t.corrected)}:</strong> ${esc(sp.correctedVersion)}</p>`;
        if (sp.overallFeedback || sp.note) html += `<p class="pdf-muted">${esc(sp.overallFeedback || sp.note || '')}</p>`;
      });
      html += `</section>`;
    }

    html += `<footer class="pdf-footer">${esc(t.docFooter)}</footer></div>`;
    return html;
  };

  window.downloadCorrectionPdf = async function (score, mods, d, isDE, correction, speakingParts) {
    const uiLang = resolveLang();
    const t = pdfReportStrings(uiLang);
    if (!isPro()) {
      notify(t.pdfProFeature, 'warn', 4500);
      if (typeof showUpgrade === 'function') showUpgrade();
      return;
    }

    let coaching = correction?.grammarCoaching || null;
    if (!coaching && typeof genGrammarCoaching === 'function') {
      const fails = collectGrammarFailures(correction);
      const weakTags = fails.map((g) => g.tag).slice(0, 6);
      const samples = collectSampleMistakes(correction);
      if (weakTags.length || samples.length) {
        notify(t.buildingPdf, 'info', 2500);
        coaching = await genGrammarCoaching(d.lang || S.subject || 'de', d.level || S.level, weakTags, samples);
        if (correction && coaching) {
          correction.grammarCoaching = coaching;
          if (S.lastResults?.correction) S.lastResults.correction.grammarCoaching = coaching;
        }
      }
    }

    notify(t.buildingPdf, 'info', 2500);
    try {
      const headers =
        typeof Auth !== 'undefined' && Auth.authHeaders
          ? Auth.authHeaders()
          : { 'Content-Type': 'application/json' };
      const res = await fetch('/.netlify/functions/generate-pdf', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          score,
          mods,
          d,
          isDE,
          correction,
          speakingParts,
          grammarCoaching: coaching,
          uiLang,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (res.status === 403) {
          notify(t.pdfProFeature, 'warn', 4500);
          if (typeof showUpgrade === 'function') showUpgrade();
          return;
        }
        throw new Error(err.message || err.error || `PDF failed (${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const safeName = (S.user?.name || 'report').replace(/[^\w\-]+/g, '_').slice(0, 40);
      a.href = url;
      a.download = `LexiCoil-${safeName}-${d.level || 'exam'}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      notify(t.pdfDownloaded || 'PDF downloaded.', 'success', 3000);
    } catch (e) {
      notify((e && e.message) || 'PDF download failed.', 'error', 6000);
    }
  };
})();
