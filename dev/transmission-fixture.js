const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

function shortText(value, limit) {
  return typeof value === 'string' && value.trim() && value.length <= limit ? value.trim() : '';
}

function sourceMaterial(value) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    track_list: shortText(source.track_list, 20000),
    lyrics: shortText(source.lyrics, 100000),
    other_material: shortText(source.other_material, 50000)
  };
}

function completedBrief(value) {
  if (!value || typeof value !== 'object' || !shortText(value.title, 200) || !Array.isArray(value.sections) || !value.sections.length) return null;
  const sections = value.sections.map(section => ({ id: shortText(section?.id, 60), title: shortText(section?.title, 200), markdown: shortText(section?.markdown, 12000) }));
  if (sections.some(section => !section.id || !section.title || !section.markdown)) return null;
  return { title: value.title.trim(), sections, ledger: Array.isArray(value.ledger) ? value.ledger : [] };
}

function visualSources(value) {
  return Array.isArray(value) ? value.filter(source => source && typeof source === 'object' && shortText(source.name, 200) && shortText(source.type, 50) && shortText(source.dataUrl, 6000000)).map(source => ({ name: source.name.trim(), type: source.type.trim(), note: shortText(source.note, 1000), dataUrl: source.dataUrl })) : [];
}

function heardTracks(value) {
  return Array.isArray(value) ? value.filter(record => record && typeof record === 'object').map((record, index) => ({ file: null, name: shortText(record?.source?.display_name, 200) || `Recording ${index + 1}`, note: '', hash: shortText(record?.source?.content_hash, 64), record, status: 'HEARD', error: '' })) : [];
}

function masterReferences(value) {
  return Array.isArray(value) ? value.filter(reference => reference && typeof reference === 'object' && shortText(reference.name, 200)).map(reference => ({ name: reference.name.trim(), contentHash: shortText(reference.contentHash, 64), duration: shortText(reference.duration, 40) })) : [];
}

export function isTransmissionFixtureRequest(location) {
  return Boolean(location && LOCAL_HOSTS.has(location.hostname) && new URLSearchParams(location.search).get('devFixture') === 'transmission');
}

export function loadTransmissionFixture(location, artifacts) {
  if (!isTransmissionFixtureRequest(location)) return null;
  const bundle = artifacts && typeof artifacts === 'object' ? artifacts : {};
  const brief = completedBrief(bundle.creativeBrief);
  const sources = sourceMaterial(bundle.source);
  const visuals = visualSources(bundle.visualSources);
  const recordings = heardTracks(bundle.listeningRecords);
  const masters = masterReferences(bundle.masterAudio);
  const missing = [];
  if (!brief) missing.push('artist-revised Creative Brief');
  if (!sources.track_list) missing.push('track order');
  if (!sources.lyrics && !sources.other_material) missing.push('lyric or text source material');
  if (!visuals.length) missing.push('approved anchor visual references');
  if (!recordings.length) missing.push('Listening Records');
  if (!masters.length) missing.push('master-audio references');
  return {
    id: 'transmission',
    basics: {
      identity: shortText(bundle?.basics?.identity, 500) || 'Music project',
      name: 'Army of Oblivion',
      music: shortText(bundle?.basics?.music, 2000) || 'Not supplied in the portable fixture artifacts.',
      people: shortText(bundle?.basics?.people, 200),
      roles: shortText(bundle?.basics?.roles, 2000),
      record: 'Transmission',
      stage: 'Finished'
    },
    source: sources,
    brief,
    canonLocked: Boolean(bundle.canonLocked && brief),
    visualSources: visuals,
    audioTracks: recordings,
    masterAudio: masters,
    missing
  };
}
