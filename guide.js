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
  const lyricsInput = document.querySelector('#lyrics');
  const lyricsFile = document.querySelector('#lyrics-file');
  const fileStatus = document.querySelector('#file-status');
  const state = { basics: null, source: null, messages: [], pending: false };
  const SOURCE_LIMITS = { track_list: 20000, lyrics: 100000, other_material: 50000 };

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
    entry.append(label);
    renderSimpleMarkdown(entry, text);
    messages.append(entry);
    entry.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }
  function renderSimpleMarkdown(container, text) {
    for (const paragraph of text.split(/\n{2,}/)) {
      const body = document.createElement('p');
      body.className = 'message-body';
      const pieces = paragraph.split(/(\*\*[^*\n]+\*\*|\*[^*\n]+\*)/g);
      for (const piece of pieces) {
        const lines = piece.split('\n');
        lines.forEach((line, index) => {
          if (/^\*\*[^*\n]+\*\*$/.test(line)) { const strong = document.createElement('strong'); strong.textContent = line.slice(2, -2); body.append(strong); }
          else if (/^\*[^*\n]+\*$/.test(line)) { const emphasis = document.createElement('em'); emphasis.textContent = line.slice(1, -1); body.append(emphasis); }
          else body.append(document.createTextNode(line));
          if (index < lines.length - 1) body.append(document.createElement('br'));
        });
      }
      container.append(body);
    }
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
  function collectSource() {
    const data = new FormData(basicsForm);
    return { track_list: clean(data.get('track_list') || ''), lyrics: clean(data.get('lyrics') || ''), other_material: clean(data.get('other_material') || '') };
  }
  function validateSource(source) {
    for (const [key, limit] of Object.entries(SOURCE_LIMITS)) if (source[key].length > limit) return `${key === 'track_list' ? 'Track list' : key === 'other_material' ? 'Other material' : 'Lyrics'} is too long for this prototype. Please keep it under ${limit.toLocaleString()} characters.`;
    return '';
  }
  async function askGuide() {
    hideError();
    setBusy(true);
    try {
      const response = await fetch('/api/guide', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ basics: state.basics, source: state.source, messages: state.messages }) });
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
    if (event.submitter?.id === 'skip-sources') { document.querySelector('#track-list').value = ''; lyricsInput.value = ''; document.querySelector('#other-material').value = ''; lyricsFile.value = ''; fileStatus.textContent = 'Skipped for now. You can always start over and add material later.'; }
    const source = collectSource();
    const error = validateBasics(basics) || validateSource(source);
    if (error) { formError.textContent = error; formError.hidden = false; return; }
    formError.hidden = true;
    state.basics = basics;
    state.source = source;
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
  lyricsFile.addEventListener('change', () => {
    const file = lyricsFile.files?.[0];
    if (!file) return;
    if (!/\.(txt|md)$/i.test(file.name)) { fileStatus.textContent = 'Choose a .txt or .md file.'; lyricsFile.value = ''; return; }
    if (file.size > SOURCE_LIMITS.lyrics) { fileStatus.textContent = 'That file is too large. Keep lyrics under 100,000 characters.'; lyricsFile.value = ''; return; }
    const reader = new FileReader();
    reader.onload = () => { const value = typeof reader.result === 'string' ? reader.result : ''; if (value.length > SOURCE_LIMITS.lyrics) { fileStatus.textContent = 'That file is too large. Keep lyrics under 100,000 characters.'; return; } lyricsInput.value = value; fileStatus.textContent = `${file.name} was read locally into the lyrics field.`; };
    reader.onerror = () => { fileStatus.textContent = 'That file could not be read. Please paste the text instead.'; };
    reader.readAsText(file);
  });
  retryButton.addEventListener('click', askGuide);
  startOverButton.addEventListener('click', () => {
    if (!window.confirm('Start over? This clears this browser-only Guide conversation.')) return;
    state.basics = null; state.source = null; state.messages = []; messages.replaceChildren(); hideError(); conversationStage.hidden = true; basicsStage.hidden = false; basicsForm.reset(); fileStatus.textContent = 'Read locally into this temporary session. Nothing is uploaded as a file.'; basicsForm.querySelector('[name="identity"]').focus();
  });
})();
