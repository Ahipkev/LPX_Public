export function onRequest(context) {
  return new Response(JSON.stringify({ geminiApiKeyPresent: Boolean(context.env.GEMINI_API_KEY) }), { headers: { 'Content-Type': 'application/json; charset=UTF-8', 'Cache-Control': 'no-store' } });
}
