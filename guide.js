(() => {
  const basicsStage = document.querySelector('#basics-stage');
  const conversationStage = document.querySelector('#conversation-stage');
  const basicsForm = document.querySelector('#basics-form');
  const messageForm = document.querySelector('#message-form');
  const messageInput = document.querySelector('#artist-message');
  const sendButton = document.querySelector('#send');
  const messages = document.querySelector('#messages');
  const thinking = document.querySelector('#thinking');
  const formError = document.querySelector('#basics-error');
  const requestError = document.querySelector('#request-error');
  const retryButton = document.querySelector('#retry');
  const startOverButton = document.querySelector('#start-over');
  const state = { basics: null, messages: [], pending: false };

  function clean(value) { return value.trim(); }
  function setBusy(busy) {
    state.pending = busy;
    const canWrite = !busy && state.messages.length > 0;
    messageInput.disabled = !canWrite;
    sendButton.disabled = !canWrite;
    thinking.hidden = !busy;
    if (canWrite) messageInput.focus();
  }
  function showError(message) {
    requestError.querySelector('p').textContent = message;
    requestError.hidden = false;
  }
  function hideError() { requestError.hidden = true; }
  function addMessage(role, text) {
    const entry = document.createElement('article');
    entry.className = `message ${role}`;
    const label = document.createElement('p');
    label.className = 'message-label';
    label.textContent = role === 'guide' ? 'LPX GUIDE' : 'ARTIST';
    const body = document.createElement('p');
    body.textContent = text;
    entry.append(label, body);
    messages.append(entry);
    entry.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }
  function collectBasics() {
    const data = new FormData(basicsForm);
    return {
      identity: clean(data.get('identity') || ''), name: clean(data.get('name') || ''), music: clean(data.get('music') || ''),
      people: clean(data.get('people') || ''), roles: clean(data.get('roles') || ''), record: clean(data.get('record') || ''), stage: clean(data.get('stage') || '')
    };
  }
  function validateBasics(basics) {
    if (!basics.identity || !basics.name || !basics.music || !basics.record || !basics.stage) return 'Please share the essentials: what you are, your name, the music, the record title, and where the record is right now.';
    return '';
  }
  async function askGuide() {
    hideError();
    setBusy(true);
    try {
      const response = await fetch('/api/guide', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ basics: state.basics, messages: state.messages }) });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.message) throw new Error(payload?.error || 'The Guide could not respond just now. Please try again.');
      state.messages.push({ role: 'assistant', text: payload.message });
      addMessage('guide', payload.message);
    } catch (error) {
      showError(error.message || 'The Guide could not respond just now. Please try again.');
    } finally { setBusy(false); }
  }
  basicsForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const basics = collectBasics();
    const error = validateBasics(basics);
    if (error) { formError.textContent = error; formError.hidden = false; return; }
    formError.hidden = true;
    state.basics = basics;
    basicsStage.hidden = true;
    conversationStage.hidden = false;
    await askGuide();
  });
  messageForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const text = clean(messageInput.value);
    if (!text || state.pending) return;
    state.messages.push({ role: 'user', text });
    addMessage('artist', text);
    messageInput.value = '';
    await askGuide();
  });
  messageInput.addEventListener('keydown', (event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); messageForm.requestSubmit(); } });
  retryButton.addEventListener('click', askGuide);
  startOverButton.addEventListener('click', () => {
    if (!window.confirm('Start over? This clears this browser-only Guide conversation.')) return;
    state.basics = null; state.messages = []; messages.replaceChildren(); hideError(); conversationStage.hidden = true; basicsStage.hidden = false; basicsForm.reset(); basicsForm.querySelector('[name="identity"]').focus();
  });
})();
