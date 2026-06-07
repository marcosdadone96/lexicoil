const CLAUDE_ENDPOINT = "/.netlify/functions/claude-chat";

function aiAuthHeaders() {
  const h = { "Content-Type": "application/json" };
  const token = localStorage.getItem("lc_token");
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

async function callAI(prompt, maxTokens = 6000, options = {}) {
  const { consumeQuota = true, timeoutMs = 45000 } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res;
  try {
    res = await fetch(CLAUDE_ENDPOINT, {
      method: "POST",
      headers: aiAuthHeaders(),
      body: JSON.stringify({ prompt, maxTokens, consumeQuota }),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if (err.name === "AbortError") {
      const e = new Error("AI request timed out");
      e.code = "timeout";
      throw e;
    }
    throw err;
  }
  clearTimeout(timer);

  const raw = await res.text();
  let data = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    const snippet = raw ? raw.slice(0, 120).replace(/\s+/g, " ") : "";
    throw new Error(
      res.ok
        ? "Invalid AI response"
        : `AI service error (${res.status})${snippet ? ": " + snippet : ""}`,
    );
  }

  if (!res.ok) {
    if (res.status === 429 && data.error === "quota_exceeded") {
      const e = new Error("quota_exceeded");
      e.code = "quota_exceeded";
      e.used = data.used;
      e.max = data.max;
      e.plan = data.plan;
      throw e;
    }
    if (res.status === 502 || res.status === 503) {
      const e = new Error('AI service temporarily unavailable. Please try again in a moment.');
      e.code = 'ai_unavailable';
      throw e;
    }
    if (res.status === 400 && (data.error || '').toLowerCase().includes('model')) {
      const e = new Error('AI model configuration error. Please contact support.');
      e.code = 'model_error';
      throw e;
    }
    throw new Error(data.error || data.message || `AI service error (${res.status})`);
  }

  if (!data.text) {
    throw new Error(data.error || "Empty AI response");
  }

  if (typeof data.used === "number" && typeof window.applyServerQuota === "function") {
    window.applyServerQuota(data);
  }

  return data.text;
}

async function fetchExamFromPool(lang, level) {
  const q = new URLSearchParams({ lang, level });
  const res = await fetch(`/.netlify/functions/exam-pool?${q}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.found) return null;
  return data;
}

async function saveExamToPool(lang, level, topic, exam) {
  const token = localStorage.getItem("lc_token");
  const headers = { "Content-Type": "application/json" };
  if (token && localStorage.getItem("lc_guest") !== "1") {
    headers.Authorization = `Bearer ${token}`;
  }
  await fetch("/.netlify/functions/exam-pool", {
    method: "POST",
    headers,
    body: JSON.stringify({ lang, level, topic, exam }),
  });
}

async function startStripeCheckout() {
  const token = localStorage.getItem("lc_token");
  if (!token) throw new Error("login_required");
  const res = await fetch("/.netlify/functions/stripe-checkout", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "checkout_failed");
  if (!data.url) throw new Error("checkout_failed");
  window.location.href = data.url;
}
