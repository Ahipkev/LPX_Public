export function onRequest(context) {
  return new Response(JSON.stringify({ lpxGuideKeyPresent: Boolean(context.env.LPX_GUIDE_KEY), geminiApiKeyPresent: Boolean(context.env.GEMINI_API_KEY) }), { headers: { 'Content-Type': 'application/json; charset=UTF-8', 'Cache-Control': 'no-store' } });
}
