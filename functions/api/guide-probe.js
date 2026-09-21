import { GUIDE_INSTRUCTIONS } from './guide.js';

const probeBasics = 'Artist Basics (already known; do not repeat these back as a list):\nWhat they are: Test artist\nName: Test\nMusic: Test music\nPeople involved: Not provided\nRoles: Not provided\nRecord: Test record\nRecord status: In progress';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=UTF-8', 'Cache-Control': 'no-store' }
  });
}

export async function onRequest(context) {
  if (context.request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  if (!context.env.LPX_GUIDE_KEY) return json({ error: 'Guide key unavailable.' }, 503);

  const stages = [
    { name: 'minimal', body: { model: 'gpt-5.6-terra', input: 'Reply with exactly OK.' } },
    { name: 'store-false', body: { model: 'gpt-5.6-terra', input: 'Reply with exactly OK.', store: false } },
    { name: 'reasoning-medium', body: { model: 'gpt-5.6-terra', input: 'Reply with exactly OK.', store: false, reasoning: { effort: 'medium' } } },
    { name: 'max-output-tokens', body: { model: 'gpt-5.6-terra', input: 'Reply with exactly OK.', store: false, reasoning: { effort: 'medium' }, max_output_tokens: 900 } },
    { name: 'guide-instructions', body: { model: 'gpt-5.6-terra', input: 'Reply with exactly OK.', store: false, reasoning: { effort: 'medium' }, max_output_tokens: 900, instructions: `${GUIDE_INSTRUCTIONS}\n\n${probeBasics}` } },
    { name: 'production-message-input', body: { model: 'gpt-5.6-terra', input: [{ role: 'user', content: `${probeBasics}\n\nBegin the real conversation.` }], store: false, reasoning: { effort: 'medium' }, max_output_tokens: 900, instructions: `${GUIDE_INSTRUCTIONS}\n\n${probeBasics}` } }
  ];

  const results = [];
  for (const stage of stages) {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${context.env.LPX_GUIDE_KEY}` },
      body: JSON.stringify(stage.body)
    });
    results.push({ stage: stage.name, status: response.status, success: response.ok });
    if (!response.ok) break;
  }
  return json({ results });
}
