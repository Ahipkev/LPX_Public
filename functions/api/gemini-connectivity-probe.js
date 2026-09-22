function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=UTF-8', 'Cache-Control': 'no-store' } });
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
    if (!response.ok) return json({ classification: 'upstream-http-error', status: response.status, elapsedMs }, 502);
    const body = await response.json().catch(() => null);
    const text = body?.choices?.[0]?.message?.content;
    return json({ classification: typeof text === 'string' ? 'success' : 'invalid-upstream-response', status: response.status, elapsedMs, text: typeof text === 'string' ? text : undefined }, typeof text === 'string' ? 200 : 502);
  } catch {
    return json({ classification: 'fetch-rejection', elapsedMs: Date.now() - startedAt }, 502);
  }
}
