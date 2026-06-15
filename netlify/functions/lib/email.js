'use strict';

const { CONTACT_EMAIL } = require('./siteConfig.js');

async function sendProWelcomeEmail(to, name) {
  const apiKey = String(process.env.RESEND_API_KEY || '').trim();
  if (!apiKey) {
    console.log('[email] RESEND_API_KEY not set ? skipping Pro welcome email');
    return { skipped: true };
  }

  const from = String(process.env.RESEND_FROM || 'LexiCoil <noreply@lexicoil.com>').trim();
  const displayName = String(name || 'there').trim() || 'there';

  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;color:#111">
      <h1 style="font-size:22px;margin-bottom:8px">Welcome to LexiCoil Pro</h1>
      <p>Hi ${displayName},</p>
      <p>Your subscription is active. <strong>Pro</strong> is now enabled on your account.</p>
      <ul>
        <li><strong>12 exam generations</strong> per month</li>
        <li>Personalized vocabulary exams &amp; listening practice</li>
        <li>Full Goethe / Cambridge practice exams</li>
        <li>Priority AI generation</li>
      </ul>
      <p style="font-size:13px;color:#666">Billed monthly at EUR 9.99. Cancel anytime from <strong>Account &rarr; Manage subscription</strong> in the app.</p>
      <p><a href="https://lexicoil.com" style="display:inline-block;padding:10px 18px;background:#E8C547;color:#000;text-decoration:none;border-radius:8px;font-weight:700">Open LexiCoil</a></p>
      <p style="font-size:13px;color:#666;margin-top:24px">Questions? Reply to this email or write to ${CONTACT_EMAIL}.</p>
    </div>
  `.trim();

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: 'LexiCoil Pro activated ? 12 exams/month',
      html,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || data.error || `Resend error ${res.status}`);
  }
  return data;
}

async function sendPasswordResetEmail(to, resetUrl) {
  const apiKey = String(process.env.RESEND_API_KEY || '').trim();
  if (!apiKey) {
    console.log('[email] RESEND_API_KEY not set ? skipping password reset email');
    return { skipped: true };
  }

  const from = String(process.env.RESEND_FROM || 'LexiCoil <noreply@lexicoil.com>').trim();

  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;color:#111">
      <h1 style="font-size:22px;margin-bottom:8px">Reset your LexiCoil password</h1>
      <p>We received a request to reset the password for <strong>${to}</strong>.</p>
      <p><a href="${resetUrl}" style="display:inline-block;padding:10px 18px;background:#E8C547;color:#000;text-decoration:none;border-radius:8px;font-weight:700">Choose a new password</a></p>
      <p style="font-size:13px;color:#666">This link expires in 1 hour. If you did not request this, you can ignore this email.</p>
      <p style="font-size:12px;color:#999;word-break:break-all">${resetUrl}</p>
    </div>
  `.trim();

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: 'Reset your LexiCoil password',
      html,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || data.error || `Resend error ${res.status}`);
  }
  return data;
}

module.exports = { sendProWelcomeEmail, sendPasswordResetEmail };
