const MAX_REQUEST_CHARS = 6000000;
const MAX_MESSAGE_CHARS = 5000;
const MAX_SECTIONS = 18;

function json(body, status = 200) { return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=UTF-8', 'Cache-Control': 'no-store' } }); }
function outputText(output) { return Array.isArray(output) ? output.flatMap(item => item?.type === 'message' && Array.isArray(item.content) ? item.content : []).filter(item => item?.type === 'output_text').map(item => item.text || '').join('').trim() : ''; }
function clean(value, limit) { return typeof value === 'string' && value.trim() && value.length <= limit ? value.trim() : null; }
function contextFrom(data) {
  const basics = data.basics;
  if (!basics || typeof basics !== 'object') return null;
  const required = ['identity', 'name', 'music', 'record', 'stage'];
  if (required.some(key => !clean(basics[key], 2000))) return null;
  if (!Array.isArray(data.messages) || data.messages.some(item => !item || !['user', 'assistant'].includes(item.role) || !clean(item.text, MAX_MESSAGE_CHARS))) return null;
  const source = data.source && typeof data.source === 'object' ? data.source : {};
  return `Artist: ${basics.name}\nRecord: ${basics.record}\nMusic: ${basics.music}\nStatus: ${basics.stage}\n\nConversation:\n${data.messages.map(item => `${item.role === 'user' ? 'Artist' : 'Guide'}: ${item.text}`).join('\n\n')}\n\nSource material:\n${['track_list', 'lyrics', 'other_material'].map(key => source[key] ? `${key}: ${String(source[key]).slice(0, key === 'lyrics' ? 100000 : 50000)}` : '').filter(Boolean).join('\n\n')}`;
}
async function ask(context, prompt, maxOutputTokens) {
  const response = await fetch('https://api.openai.com/v1/responses', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${context.env.LPX_GUIDE_KEY}` }, body: JSON.stringify({ model: 'gpt-5.6-terra', store: false, reasoning: { effort: 'medium' }, max_output_tokens: maxOutputTokens, instructions: 'You create a faithful LPX Creative Brief from an approved conversation. Do not restart discovery, change approved decisions, or expose process. Return only valid JSON matching the requested shape.', input: prompt }) });
  if (!response.ok) throw new Error(response.status === 429 ? 'The Guide is busy. Please retry.' : 'The Creative Brief could not be prepared. Please retry.');
  const body = await response.json();
  if (body.status === 'incomplete') throw new Error('The Creative Brief needs another pass. Please retry.');
  const text = outputText(body.output);
  try { return JSON.parse(text); } catch { throw new Error('The Creative Brief needs another pass. Please retry.'); }
}

export async function onRequest(context) {
  if (context.request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  if (!context.request.headers.get('content-type')?.includes('application/json')) return json({ error: 'Send a JSON request.' }, 415);
  const length = Number(context.request.headers.get('content-length') || 0);
  if (length > MAX_REQUEST_CHARS) return json({ error: 'This creative session is too large to prepare a brief in the current browser-only version.' }, 413);
  let data; try { data = await context.request.json(); } catch { return json({ error: 'The Creative Brief request could not be read.' }, 400); }
  if (JSON.stringify(data).length > MAX_REQUEST_CHARS) return json({ error: 'This creative session is too large to prepare a brief in the current browser-only version.' }, 413);
  if (!context.env.LPX_GUIDE_KEY) return json({ error: 'The Guide is not configured yet.' }, 503);
  const session = contextFrom(data); if (!session) return json({ error: 'The Creative Brief needs the current Guide conversation.' }, 400);
  try {
    if (data.action === 'plan') {
      const plan = await ask(context, `${session}\n\nCreate a concise complete-artifact manifest. Return JSON only: {"title":"string","sections":[{"id":"lowercase-hyphen-id","title":"string","brief":"what this section must faithfully cover"}],"ledger":[{"status":"LOCKED FACT|LOCKED CREATIVE DECISION|APPROVED VISUAL REFERENCE|GUIDE INTERPRETATION|OPTIONAL DIRECTION|OPEN — DO NOT INVENT","subject":"string","detail":"string","establishes":["string"],"does_not_require":["string"]}]}. Include record-level direction, listener journey, relevant individual track treatments, ending/final state, and only conversation-supported facts. Preserve unknowns as OPEN — DO NOT INVENT; never silently promote interpretations. 6-18 sections.`, 1600);
      if (!clean(plan?.title, 200) || !Array.isArray(plan.sections) || plan.sections.length < 3 || plan.sections.length > MAX_SECTIONS || plan.sections.some(section => !/^[a-z0-9-]{1,60}$/.test(section?.id || '') || !clean(section.title, 200) || !clean(section.brief, 1000))) throw new Error('The Creative Brief plan needs another pass. Please retry.');
      const statuses = new Set(['LOCKED FACT', 'LOCKED CREATIVE DECISION', 'APPROVED VISUAL REFERENCE', 'GUIDE INTERPRETATION', 'OPTIONAL DIRECTION', 'OPEN — DO NOT INVENT']);
      const ledger = Array.isArray(plan.ledger) ? plan.ledger.filter(entry => statuses.has(entry?.status) && clean(entry.subject, 300) && clean(entry.detail, 1500)).slice(0, 60).map(entry => ({ status: entry.status, subject: entry.subject.trim(), detail: entry.detail.trim(), establishes: Array.isArray(entry.establishes) ? entry.establishes.filter(item => clean(item, 300)).slice(0, 12) : [], does_not_require: Array.isArray(entry.does_not_require) ? entry.does_not_require.filter(item => clean(item, 300)).slice(0, 12) : [] })) : [];
      return json({ plan: { title: plan.title, sections: plan.sections.map(section => ({ id: section.id, title: section.title, brief: section.brief })), ledger } });
    }
    if (data.action === 'section') {
      const section = data.section;
      if (!section || !/^[a-z0-9-]{1,60}$/.test(section.id || '') || !clean(section.title, 200) || !clean(section.brief, 1000)) return json({ error: 'The Creative Brief section could not be prepared.' }, 400);
      const result = await ask(context, `${session}\n\nWrite only this approved Creative Brief section: ${section.title}. Scope: ${section.brief}. Return JSON only: {"markdown":"complete Markdown content without a top-level title","complete":true}. Keep it focused, complete, and under 700 words.`, 1800);
      if (result?.complete !== true || !clean(result.markdown, 12000)) throw new Error('The Creative Brief section needs another pass. Please retry.');
      return json({ section: { id: section.id, markdown: result.markdown.trim() } });
    }
    if (data.action === 'reconcile') {
      const ledger = data.ledger;
      if (!Array.isArray(ledger) || ledger.length > 60) return json({ error: 'The Canon Ledger could not be reconciled.' }, 400);
      const result = await ask(context, `${session}\n\nReconcile this proposed Canon Ledger before explicit artist lock: ${JSON.stringify(ledger)}. Preserve locked facts and approved decisions; do not turn them tentative. Preserve approved visual-reference semantics without requiring literal reproduction. Keep unresolved details as OPEN — DO NOT INVENT. Return JSON only: {"ledger":[{"status":"LOCKED FACT|LOCKED CREATIVE DECISION|APPROVED VISUAL REFERENCE|GUIDE INTERPRETATION|OPTIONAL DIRECTION|OPEN — DO NOT INVENT","subject":"string","detail":"string","establishes":["string"],"does_not_require":["string"]}],"complete":true}.`, 1800);
      if (result?.complete !== true || !Array.isArray(result.ledger)) throw new Error('The Canon Ledger needs another pass. Please retry.');
      return json({ ledger: result.ledger });
    }
    return json({ error: 'The Creative Brief request is not valid.' }, 400);
  } catch (error) { return json({ error: error.message || 'The Creative Brief could not be prepared. Please retry.' }, 502); }
}
