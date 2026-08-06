/**
 * generationFeedbackPanel.js — PASO 13 P0-2 minimal admin UI for learning rules.
 * Bind from admin.html: GenerationFeedbackPanel.bind({ api, esc, toast, fmtDate })
 */
(function (global) {
  'use strict';

  let deps = { api: null, esc: (s) => String(s || ''), toast: () => {}, fmtDate: (d) => d || '—' };
  let _rows = [];
  let _counts = {};

  function bind(d) {
    deps = { ...deps, ...d };
  }

  function esc(s) {
    return deps.esc(s);
  }

  async function load() {
    const status = document.getElementById('gfFilterStatus')?.value || 'candidate';
    const r = await deps.api('GET', {
      action: 'generation_feedback',
      status,
      limit: 100,
    });
    if (!r || r.error) {
      deps.toast('✗ ' + (r?.error || 'Error cargando feedback'));
      return;
    }
    _rows = r.feedback || [];
    _counts = r.counts || r.metrics || {};
    renderStats();
    renderList();
  }

  function renderStats() {
    const el = document.getElementById('gfStats');
    if (!el) return;
    const c = _counts;
    el.innerHTML = [
      ['candidate', c.candidate ?? c.candidate_count ?? 0],
      ['approved', c.approved ?? c.approved_count ?? 0],
      ['active', c.active ?? c.active_count ?? 0],
      ['deprecated', c.deprecated ?? c.deprecated_count ?? 0],
    ]
      .map(
        ([k, n]) =>
          `<span class="gf-stat"><b>${esc(String(n))}</b> ${esc(k)}</span>`,
      )
      .join('');
  }

  function renderList() {
    const el = document.getElementById('gfList');
    if (!el) return;
    if (!_rows.length) {
      el.innerHTML = '<p style="color:var(--muted);font-size:13px">Sin reglas en este filtro.</p>';
      return;
    }
    el.innerHTML = _rows
      .map((f, i) => {
        const rule = f.rule || '(sin rule — editar antes de activar)';
        const evidence = (f.evidence || []).concat(f.sourceCorrection ? [f.sourceCorrection] : []);
        const examples = f.examples || [];
        const exHtml = examples.length
          ? examples
              .slice(0, 2)
              .map((ex) => {
                if (typeof ex === 'string') return `<li>${esc(ex)}</li>`;
                return `<li>avoid: ${esc(ex.avoid || '')} → prefer: ${esc(ex.prefer || ex.text || '')}</li>`;
              })
              .join('')
          : `<li>${esc((f.avoid || f.wrong || '').slice(0, 80))} → ${esc((f.preferred || f.use || f.correct || '').slice(0, 80))}</li>`;

        const actions = [];
        if (f.status === 'candidate') {
          actions.push(`<button data-i="${i}" data-act="approve">Approve</button>`);
          actions.push(`<button data-i="${i}" data-act="deprecate">Reject</button>`);
        }
        if (f.status === 'approved') {
          actions.push(`<button data-i="${i}" data-act="activate" class="gf-primary">Activate</button>`);
          actions.push(`<button data-i="${i}" data-act="deprecate">Deprecate</button>`);
        }
        if (f.status === 'active') {
          actions.push(`<button data-i="${i}" data-act="deprecate">Deprecate</button>`);
        }
        actions.push(`<button data-i="${i}" data-act="save">Save rule</button>`);

        return `<div class="gf-card" data-id="${esc(f.id)}">
          <div class="gf-hd">
            <code>${esc(f.id)}</code>
            <span class="gf-pill">${esc(f.status)}</span>
            <span class="gf-pill">${esc(f.category || f.type || '')}</span>
            <span class="gf-pill">${esc(f.severity || 'medium')}</span>
          </div>
          <div class="gf-meta">${esc(f.module || '')} T${esc(String(f.teil ?? ''))} · ${esc(deps.fmtDate(f.createdAt))}</div>
          <label class="gf-label">Rule</label>
          <textarea class="gf-rule" data-i="${i}" rows="3">${esc(rule)}</textarea>
          <div class="gf-section"><b>Evidence</b>: ${esc(evidence.filter(Boolean).join(', ') || '—')}</div>
          <div class="gf-section"><b>Examples</b><ul>${exHtml}</ul></div>
          <div class="gf-actions">${actions.join(' ')}</div>
        </div>`;
      })
      .join('');

    el.querySelectorAll('button[data-act]').forEach((btn) => {
      btn.addEventListener('click', () => onAction(btn.getAttribute('data-act'), Number(btn.getAttribute('data-i'))));
    });
  }

  async function onAction(act, index) {
    const f = _rows[index];
    if (!f) return;
    const card = document.querySelector(`.gf-card[data-id="${CSS.escape(f.id)}"]`);
    const ruleEl = card?.querySelector('.gf-rule');
    const rule = ruleEl ? ruleEl.value.trim() : f.rule || '';

    if (act === 'save') {
      const r = await deps.api('POST', {}, { action: 'update_generation_feedback', id: f.id, rule });
      deps.toast(r.ok || r.feedback ? '✓ Rule guardada' : '✗ ' + (r.error || 'Error'));
      if (r.feedback) load();
      return;
    }
    if (act === 'approve') {
      const r = await deps.api('POST', {}, { action: 'approve_generation_feedback', id: f.id });
      deps.toast(r.feedback ? '✓ Approved' : '✗ ' + (r.error || 'Error'));
      if (r.feedback) load();
      return;
    }
    if (act === 'activate') {
      if (!rule || rule.length < 12) {
        deps.toast('✗ Edita una rule válida (≥12 chars) antes de activar');
        return;
      }
      if (!confirm('¿Activar esta regla? Solo active entra en generación (si MODE=active).')) return;
      const r = await deps.api(
        'POST',
        {},
        { action: 'activate_generation_feedback', id: f.id, rule },
      );
      if (r.feedback) {
        deps.toast('✓ Active');
        load();
      } else {
        deps.toast('✗ ' + (r.error || 'activation_rejected') + (r.reasons ? ': ' + r.reasons.join(', ') : ''));
      }
      return;
    }
    if (act === 'deprecate') {
      if (!confirm('¿Deprecar esta regla?')) return;
      const r = await deps.api('POST', {}, { action: 'deprecate_generation_feedback', id: f.id });
      deps.toast(r.feedback ? '✓ Deprecated' : '✗ ' + (r.error || 'Error'));
      if (r.feedback) load();
    }
  }

  global.GenerationFeedbackPanel = { bind, load };
})(typeof window !== 'undefined' ? window : globalThis);
