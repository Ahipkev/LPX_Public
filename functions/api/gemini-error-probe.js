function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=UTF-8', 'Cache-Control': 'no-store' } });
}

function safeText(value, limit = 400) {
  if (typeof value !== 'string') return undefined;
  const text = value.trim().replace(/[\u0000-\u001f\u007f]/g, ' ');
  if (!text || text.length > limit || /(?:sk-[\w-]+|AIza[\w-]+|bearer\s+\S+|authorization|headers?|request\s*body|environment|context\.env|stack\s*trace|\b(?:api[ _-]?key|secret|token)\s*[:=]\s*\S+)/i.test(text)) return undefined;
  return text;
}

export async function onRequest(context) {
  if (context.request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  const startedAt = Date.now();
  try {
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${context.env.GEMINI_API_KEY}` },
      body: JSON.stringify({ model: 'gemini-3.8-flash', messages: [{ role: 'user', content: 'Reply with exactly: OK' }] })
    });
    const elapsedMs = Date.now() - startedAt;
    if (response.ok) {
      const body = await response.json().catch(() => null);
      return json({ classification: 'success', upstreamStatus: response.status, elapsedMs, text: safeText(body?.choices?.[0]?.message?.content, 20) });
    }
    const body = await response.json().catch(() => null);
    const provider = body?.error && typeof body.error === 'object' ? body.error : body;
    return json({ classification: 'upstream-http-error', upstreamStatus: response.status, code: safeText(String(provider?.code || ''), 100), status: safeText(String(provider?.status || ''), 100), message: safeText(provider?.message), reason: safeText(provider?.reason, 100), elapsedMs }, 502);
  } catch {
    return json({ classification: 'fetch-rejection', elapsedMs: Date.now() - startedAt }, 502);
  }
}
