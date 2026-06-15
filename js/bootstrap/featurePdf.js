/* PDF export for correction reports */
(function () {
  window.buildPdfHtml = function (score, mods, d, isDE, correction, speakingParts) {
    const name = S.user?.name || 'Candidate';
    const cert = d.official?.certificate || '';
    const topic = d.topic || '';
    const passed = score >= 70 ? (isDE ? 'BESTANDEN' : 'PASSED') : isDE ? 'NICHT BESTANDEN' : 'NOT PASSED';
    const modNames = {
      lesen: isDE ? 'Lesen' : 'Reading',
      horen: isDE ? 'Hörverstehen' : 'Listening',
      gapfill: 'Gap-Fill',
      schreiben: isDE ? 'Schreiben' : 'Writing',
      sprechen: isDE ? 'Sprechen' : 'Speaking',
    };
    let html = `<div class="pdf-doc"><div class="pdf-page"><h1>LexiCoil</h1><p>${new Date().toLocaleDateString()}</p><h2>${esc(name)}</h2><p>${esc(cert)} — ${esc(d.level)} — ${esc(topic)}</p><p><strong>Overall: ${score}% — ${passed}</strong></p><table class="pdf-table">`;
    Object.entries(mods).forEach(([k, v]) => {
      if (v != null) html += `<tr><td>${esc(modNames[k] || k)}</td><td>${v}%</td></tr>`;
    });
    html += '</table></div>';
    if (correction?.parts) {
      correction.parts.forEach((block) => {
        html += `<div class="pdf-page pdf-page-break"><h3>${esc(block.title)}</h3>`;
        block.items.forEach((it) => {
          html += `<p>${it.ok ? '✓' : '✗'} ${esc(it.q)}<br>Yours: ${esc(it.yours)}${it.ok ? '' : '<br>Correct: ' + esc(it.correct)}</p>`;
        });
        html += '</div>';
      });
    }
    if (speakingParts?.length) {
      speakingParts.forEach((sp) => {
        html += `<div class="pdf-page pdf-page-break"><h3>${isDE ? 'Sprechen' : 'Speaking'}</h3>`;
        if (sp.transcript) html += `<p><strong>Your answer:</strong> ${esc(sp.transcript)}</p>`;
        if (sp.criteria) {
          sp.criteria.forEach((c) => {
            html += `<p>${esc(c.name)}: ${c.score}/5 — ${esc(c.comment)}</p>`;
          });
        }
        if (sp.correctedVersion) html += `<p><strong>Corrected:</strong> ${esc(sp.correctedVersion)}</p>`;
        html += `<p>${esc(sp.overallFeedback || sp.note || '')}</p></div>`;
      });
    }
    const weak = Object.entries(mods)
      .filter(([, v]) => v != null)
      .sort((a, b) => a[1] - b[1])
      .slice(0, 2)
      .map(([k]) => modNames[k] || k);
    html += `<div class="pdf-page pdf-page-break"><h3>Recommendations</h3><p>Based on your results in ${esc(weak.join(', ') || 'all modules')}, we recommend practicing: demo exams, flashcard review, and targeted exercises in your weakest modules.</p></div></div>`;
    return html;
  };

  window.downloadCorrectionPdf = function (score, mods, d, isDE, correction, speakingParts) {
    if (!isPro()) {
      notify('PDF reports are a Pro feature. Upgrade to download.', 'warn', 4500);
      if (typeof showUpgrade === 'function') showUpgrade();
      return;
    }
    const box = document.getElementById('pdf-export-container');
    if (!box) return;
    box.innerHTML = buildPdfHtml(score, mods, d, isDE, correction, speakingParts);
    box.style.display = 'block';
    window.print();
    setTimeout(() => {
      box.innerHTML = '';
      box.style.display = 'none';
    }, 500);
  };
})();
