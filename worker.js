// ══════════════════════════════════════════════════════
// AI Solving Math — Cloudflare Worker Proxy
// ══════════════════════════════════════════════════════
// Settings → Variables and Secrets me add karo:
//   NVIDIA_KEY
//   OPENROUTER_KEY
//   GEMINI_KEY
// ══════════════════════════════════════════════════════

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors() },
  });
}

async function proxy(upstream, headers, body) {
  const res = await fetch(upstream, { method: 'POST', headers, body });
  const text = await res.text();
  return new Response(text, {
    status: res.status,
    headers: { 'Content-Type': 'application/json', ...cors() },
  });
}

export default {
  async fetch(request, env) {

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors() });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    // ── GET /ping — health check ──────────────────────
    if (request.method === 'GET' && path === '/ping') {
      return json({ ok: true, msg: 'Worker is running!' });
    }

    // ── GET /keys — return keys to frontend (for large image calls) ──
    if (request.method === 'GET' && path === '/keys') {
      return json({
        gemini: env.GEMINI_KEY || '',
        openrouter: env.OPENROUTER_KEY || '',
      });
    }

    // ── All other routes need POST ────────────────────
    if (request.method !== 'POST') {
      return json({ error: 'Method not allowed' }, 405);
    }

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return json({ error: 'Invalid JSON body' }, 400);
    }

    try {

      // ── /nvidia ──────────────────────────────────────
      if (path === '/nvidia') {
        if (!env.NVIDIA_KEY) return json({ error: 'NVIDIA_KEY not set' }, 500);
        return await proxy(
          'https://integrate.api.nvidia.com/v1/chat/completions',
          {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${env.NVIDIA_KEY}`,
          },
          JSON.stringify(body)
        );
      }

      // ── /openrouter ──────────────────────────────────
      if (path === '/openrouter') {
        if (!env.OPENROUTER_KEY) return json({ error: 'OPENROUTER_KEY not set' }, 500);
        return await proxy(
          'https://openrouter.ai/api/v1/chat/completions',
          {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${env.OPENROUTER_KEY}`,
            'HTTP-Referer': 'https://ai-solving-math.app',
            'X-Title': 'AI Solving Math',
          },
          JSON.stringify(body)
        );
      }

      // ── /gemini ──────────────────────────────────────
      if (path === '/gemini') {
        if (!env.GEMINI_KEY) return json({ error: 'GEMINI_KEY not set' }, 500);
        const model = body.model || 'gemini-2.0-flash-lite';
        return await proxy(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_KEY}`,
          { 'Content-Type': 'application/json' },
          JSON.stringify({ contents: body.contents })
        );
      }

      return json({ error: 'Unknown route: ' + path }, 404);

    } catch (err) {
      return json({ error: err.message }, 500);
    }
  },
};
