import * as pdfjsLib from './vendor/pdfjs/pdf.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdfjs/pdf.worker.mjs', import.meta.url).toString();

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
  const clearLyricsButton = document.querySelector('#clear-lyrics');
  const state = { basics: null, source: null, messages: [], pending: false };
  const SOURCE_LIMITS = { track_list: 20000, lyrics: 100000, other_material: 50000 };
  const MAX_LOCAL_FILE_BYTES = 25 * 1024 * 1024;
  const VISION_TRIGGER = 'i think i know what this record wants to be';

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
  function isVisionMoment(text) {
    return text.replace(/\*\*|__/g, '').toLocaleLowerCase().includes(VISION_TRIGGER);
  }
  function addMessage(role, text) {
    const entry = document.createElement('article');
    const vision = role === 'guide' && isVisionMoment(text);
    entry.className = `message ${role}${vision ? ' vision' : ''}`;
    const label = document.createElement('p');
    label.className = 'message-label';
    label.textContent = role === 'guide' ? vision ? 'LPX GUIDE · VISION' : 'LPX GUIDE' : 'ARTIST';
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
  function normalizeExtractedText(value) {
    return value.replace(/\r\n?/g, '\n').split('\n').map(line => line.trimEnd()).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }
  function readTextFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
      reader.onerror = () => reject(new Error('That file could not be read. Please paste the text instead.'));
      reader.readAsText(file);
    });
  }
  async function extractDocxText(file) {
    if (!window.mammoth) throw new Error('The local DOCX reader is not available. Please try again.');
    const result = await window.mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    return result.value || '';
  }
  async function extractPdfText(file) {
    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
    const pdf = await loadingTask.promise;
    const pages = [];
    try {
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        const content = await (await pdf.getPage(pageNumber)).getTextContent();
        let line = '';
        const lines = [];
        for (const item of content.items) {
          if (!('str' in item)) continue;
          line += item.str;
          if (item.hasEOL) { if (line.trim()) lines.push(line.trim()); line = ''; }
          else if (item.str) line += ' ';
        }
        if (line.trim()) lines.push(line.trim());
        if (lines.length) pages.push(lines.join('\n'));
      }
    } finally { await loadingTask.destroy(); }
    return pages.join('\n\n');
  }
  async function extractLocalFile(file) {
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (extension === 'doc') throw new Error('Older .doc files aren’t supported yet. Please save it as .docx or PDF.');
    if (!['txt', 'md', 'docx', 'pdf'].includes(extension)) throw new Error('Choose a TXT, MD, DOCX, or PDF file.');
    if (file.size > MAX_LOCAL_FILE_BYTES) throw new Error('That file is too large to read locally. Please choose a file smaller than 25 MB.');
    const extracted = extension === 'docx' ? await extractDocxText(file) : extension === 'pdf' ? await extractPdfText(file) : await readTextFile(file);
    const cleaned = normalizeExtractedText(extracted);
    if (!cleaned) throw new Error(extension === 'pdf' ? 'This PDF doesn’t appear to contain readable text. It may be a scanned document. OCR isn’t supported yet.' : 'That file does not contain readable text. Please paste the text instead.');
    if (extension === 'pdf' && cleaned.replace(/\s/g, '').length < 20) throw new Error('This PDF doesn’t appear to contain readable text. It may be a scanned document. OCR isn’t supported yet.');
    if (cleaned.length > SOURCE_LIMITS.lyrics) throw new Error('The extracted text is too long for the lyrics field. Please shorten it to under 100,000 characters and try again.');
    return cleaned;
  }
  lyricsFile.addEventListener('change', async () => {
    const files = Array.from(lyricsFile.files || []);
    if (!files.length) return;
    fileStatus.textContent = `Reading ${files.length} file${files.length === 1 ? '' : 's'} locally…`;
    const added = [];
    const issues = [];
    for (const file of files) {
      try {
        const extracted = await extractLocalFile(file);
        const separator = `--------------------------------------------------\nImported file: ${file.name}\n--------------------------------------------------\n\n`;
        const addition = `${lyricsInput.value.trim() ? '\n\n' : ''}${separator}${extracted}`;
        if (lyricsInput.value.length + addition.length > SOURCE_LIMITS.lyrics) {
          issues.push(`Could not add ${file.name} because it would exceed the Lyrics limit.`);
          break;
        }
        lyricsInput.value += addition;
        added.push(file.name);
      } catch (error) { issues.push(`Could not add ${file.name}: ${error.message || 'it could not be read.'}`); }
    }
    if (added.length) lyricsInput.focus();
    const summary = added.length ? `Imported ${added.length} file${added.length === 1 ? '' : 's'} into Lyrics. Added: ${added.join(', ')}.` : '';
    fileStatus.textContent = [summary, ...issues].filter(Boolean).join(' ');
    lyricsFile.value = '';
  });
  clearLyricsButton.addEventListener('click', () => {
    if (lyricsInput.value && !window.confirm('Clear all text in Lyrics?')) return;
    lyricsInput.value = '';
    fileStatus.textContent = 'Lyrics cleared. You can paste or import new text.';
    lyricsInput.focus();
  });
  retryButton.addEventListener('click', askGuide);
  startOverButton.addEventListener('click', () => {
    if (!window.confirm('Start over? This clears this browser-only Guide conversation.')) return;
    state.basics = null; state.source = null; state.messages = []; messages.replaceChildren(); hideError(); conversationStage.hidden = true; basicsStage.hidden = false; basicsForm.reset(); fileStatus.textContent = 'Files append into Lyrics for review. Nothing is uploaded as a file.'; basicsForm.querySelector('[name="identity"]').focus();
  });
})();
