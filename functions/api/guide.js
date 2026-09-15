const MAX_MESSAGE_CHARS = 5000;
const MAX_TURNS = 50;
const MAX_REQUEST_CHARS = 120000;
const MAX_BASIC_CHARS = 2000;

const GUIDE_INSTRUCTIONS = `You are the LPX Guide, a thoughtful creative conversation for musicians making an LPX: an open, artist-owned publishing format for albums. Your work is to understand the record, never to complete an intake process.

The artist must feel that you actually listened. React to what they just said before asking a question. Notice precise details, contradictions, emotional turns, and connections to earlier things. Follow the most alive thread. Usually ask one principal question at a time. Let meaningful answers breathe. Do not race through a checklist, stack unrelated questions, constantly summarize, sell services, or push implementation, hosting, AHiP, or a product feature.

The artist is the creative authority. Offer observations as tentative hypotheses: “I’m starting to wonder if…” or “What you just said makes me hear that earlier thing differently…” Invite correction. Never decide what the record means. Do not force mythology, narrative, animation, interactivity, or a large concept; restraint may be the right form.

Six areas matter in the background: who they are; what they want to say; visual character; experience; where it lives; and access to analytics. They are hidden areas of understanding, never modules or a sequence. Never mention a module number.

Do not pitch an LPX vision early. Only after enough real context exists may you say “I think I know what this record wants to be.” Then describe a specific experience: entry, what is encountered while music plays, how imagery/words/material participate, progression across the record, restraint, and ending. Ask what feels right and wrong. If rejected, get curious again; do not defend it.

The named experience vocabulary can be useful internally as possibilities, never as templates or a required choice. Multiple modes may combine. Future lyric analysis must treat labels such as verse, chorus, bridge, intro, outro, hook, and refrain as structural metadata, never motifs.

For the first reply, use the factual Basics supplied to notice one concrete detail and open a thoughtful thread. Do not recite the Basics, say only “thanks,” or ask them to repeat anything already supplied. Keep replies warm, concise, and musician-facing. Aim for 600–900 output tokens at most, and ordinarily much less.`;

function json(body, status = 200) { return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=UTF-8', 'Cache-Control': 'no-store' } }); }
function text(value, limit) { return typeof value === 'string' && value.length <= limit ? value.trim() : null; }
function getOutputText(output) {
  if (!Array.isArray(output)) return '';
  return output.flatMap(item => item?.type === 'message' && Array.isArray(item.content) ? item.content : []).filter(part => part?.type === 'output_text' && typeof part.text === 'string').map(part => part.text).join('\n').trim();
}

export async function onRequest(context) {
  if (context.request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  if (!context.request.headers.get('content-type')?.toLowerCase().includes('application/json')) return json({ error: 'Send a JSON request.' }, 415);
  const length = Number(context.request.headers.get('content-length') || 0);
  if (length > MAX_REQUEST_CHARS) return json({ error: 'That conversation is too large for this prototype. Please start a new conversation and keep individual messages under 5,000 characters.' }, 413);
  let data;
  try { data = await context.request.json(); } catch { return json({ error: 'The Guide could not read that request. Please try again.' }, 400); }
  if (!data || JSON.stringify(data).length > MAX_REQUEST_CHARS) return json({ error: 'That conversation is too large for this prototype. Please start a new conversation and keep individual messages under 5,000 characters.' }, 413);
  const basics = data.basics;
  if (!basics || typeof basics !== 'object') return json({ error: 'The Guide needs the Basics before the conversation can begin.' }, 400);
  const required = ['identity', 'name', 'music', 'record', 'stage'];
  for (const key of required) if (!text(basics[key], MAX_BASIC_CHARS)) return json({ error: 'Please complete the essential Basics before starting the conversation.' }, 400);
  const messages = data.messages;
  if (!Array.isArray(messages) || messages.length > MAX_TURNS) return json({ error: 'This prototype can hold up to 50 conversation turns. Please start over to continue.' }, 400);
  const history = [];
  for (const message of messages) {
    if (!message || !['user', 'assistant'].includes(message.role) || !text(message.text, MAX_MESSAGE_CHARS)) return json({ error: 'A conversation message is missing or too long. Artist messages can be up to 5,000 characters.' }, 400);
    history.push({ role: message.role, content: message.text.trim() });
  }
  if (!context.env.OPENAI_API_KEY) return json({ error: 'The Guide is not configured yet. Please try again after the site administrator adds its server-side API key.' }, 503);
  const basicsContext = `Artist Basics (already known; do not repeat these back as a list):\nWhat they are: ${basics.identity.trim()}\nName: ${basics.name.trim()}\nMusic: ${basics.music.trim()}\nPeople involved: ${(text(basics.people, MAX_BASIC_CHARS) || 'Not provided')}\nRoles: ${(text(basics.roles, MAX_BASIC_CHARS) || 'Not provided')}\nRecord: ${basics.record.trim()}\nRecord status: ${basics.stage.trim()}`;
  const input = history.length ? history : [{ role: 'user', content: `${basicsContext}\n\nBegin the real conversation.` }];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);
  let upstream;
  try {
    upstream = await fetch('https://api.openai.com/v1/responses', { method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${context.env.OPENAI_API_KEY}` }, body: JSON.stringify({ model: 'gpt-5.6-terra', store: false, reasoning: { effort: 'medium' }, max_output_tokens: 900, instructions: `${GUIDE_INSTRUCTIONS}\n\n${basicsContext}`, input }) });
  } catch { return json({ error: 'The Guide took too long to respond. Please try again.' }, 504); }
  finally { clearTimeout(timeout); }
  if (!upstream.ok) {
    if (upstream.status === 429) return json({ error: 'The Guide is receiving a lot of attention right now. Please wait a moment and retry.' }, 429);
    if (upstream.status === 401 || upstream.status === 403) return json({ error: 'The Guide is not configured correctly yet. Please try again later.' }, 503);
    return json({ error: 'The Guide could not respond just now. Please try again.' }, 502);
  }
  let response;
  try { response = await upstream.json(); } catch { return json({ error: 'The Guide returned an unreadable response. Please retry.' }, 502); }
  const message = getOutputText(response.output);
  if (!message) return json({ error: 'The Guide did not return a usable response. Please retry.' }, 502);
  return json({ message });
}
