import { GUIDE_INSTRUCTIONS } from './guide.js';

const basics = 'Artist Basics (already known; do not repeat these back as a list):\nWhat they are: Test artist\nName: Test Artist\nMusic: Test music\nPeople involved: Not provided\nRoles: Not provided\nRecord: Test Record\nRecord status: In progress';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=UTF-8', 'Cache-Control': 'no-store' } });
}

async function request(context, body) {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${context.env.LPX_GUIDE_KEY}` },
    body: JSON.stringify(body)
  });
  return { status: response.status, success: response.ok };
}

export async function onRequest(context) {
  if (context.request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  const minimal = await request(context, { model: 'gpt-5.6-terra', input: 'Reply with exactly OK.' });
  if (!minimal.success) return json({ minimal });
  const production = await request(context, {
    model: 'gpt-5.6-terra',
    store: false,
    reasoning: { effort: 'medium' },
    max_output_tokens: 900,
    instructions: `${GUIDE_INSTRUCTIONS}\n\n${basics}`,
    input: [{ role: 'user', content: 'Hi Father. Are you alive?' }]
  });
  return json({ minimal, production });
}
