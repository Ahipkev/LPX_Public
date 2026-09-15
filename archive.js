/* Add projects and experiences here. Tags describe only confirmed content.
   Optional artwork: { src: 'images/filename.jpg', alt: 'Meaningful description' }. */
const archiveProjects = [
  { id: 'nugatron', artist: 'NUGATRON', title: 'Songs from the All Seeing I', context: 'artists',
    details: 'Six songs · 32:59', description: 'A record experienced alongside the 62-page graphic novel “Dispensed.”',
    url: 'https://nugatron.com/longplay/', tags: ['illustrated-narrative', 'narrative'], featured: true },
  { id: 'alien-deth-machine', artist: 'ALIEN DETH MACHINE', context: 'ai-hybrid',
    description: 'Cinematic science-fiction narrative and world-building.',
    url: 'https://aliendethmachine.com/longplay/', tags: ['cinematic', 'narrative', 'world-building'] },
  { id: 'army-of-oblivion', artist: 'ARMY OF OBLIVION', title: 'INDUCTION', context: 'ai-hybrid',
    description: 'Narrative and interactive world-building with reading-gated progression.',
    url: 'https://army-of-oblivion.pages.dev/longplay/', tags: ['narrative', 'interactive', 'world-building'] },
  { id: 'drain-blamage', artist: 'DRAIN BLAMAGE', title: 'Mandela Effect', context: 'ai-hybrid',
    description: 'Five songs. Five different LPX experiences.', collection: true, experiences: [
      { id: 'master-of-my-fate', title: 'MASTER OF MY FATE', description: 'Lyric experience.', tags: ['lyric-experience', 'world-building'], url: 'https://drain-blamage.pages.dev/lpx/experience.html?track=master-of-my-fate' },
      { id: 'go-ask-alice', title: 'GO ASK ALICE', tags: ['visual-journey', 'world-building'], url: 'https://drain-blamage.pages.dev/lpx/experience.html?track=go-ask-alice' },
      { id: 'truly-free', title: 'TRULY FREE', description: 'Illustrated narrative / transformative journey.', tags: ['illustrated-narrative', 'transformative', 'memory-artifact'], url: 'https://drain-blamage.pages.dev/lpx/experience.html?track=truly-free' },
      { id: 'wake-up-dreamer', title: 'WAKE UP DREAMER', description: 'Dream / surreal visual journey.', tags: ['dream-surreal', 'visual-journey'], url: 'https://drain-blamage.pages.dev/lpx/experience.html?track=wake-up-dreamer' },
      { id: 'be-here-now', title: 'BE HERE NOW', tags: ['narrative'], url: 'https://drain-blamage.pages.dev/lpx/experience.html?track=be-here-now' }
    ] }
];
const contexts = { all: 'ALL LPXs', artists: 'ARTISTS & BANDS', 'ai-hybrid': 'AI & HYBRID ARTISTS' };
const experienceLabels = {
  'lyric-experience': 'LYRIC EXPERIENCE',
  narrative: 'NARRATIVE',
  'illustrated-narrative': 'ILLUSTRATED NARRATIVE',
  'visual-journey': 'VISUAL JOURNEY',
  'dream-surreal': 'DREAM / SURREAL',
  'world-building': 'WORLD-BUILDING',
  interactive: 'INTERACTIVE',
  'memory-artifact': 'MEMORY / ARTIFACT',
  cinematic: 'CINEMATIC',
  'documentary-archival': 'DOCUMENTARY / ARCHIVAL',
  'ambient-living-artwork': 'AMBIENT / LIVING ARTWORK',
  transformative: 'TRANSFORMATIVE'
};
const allExperiences = archiveProjects.flatMap(project => project.collection
  ? project.experiences.map(entry => ({ ...entry, artist: project.artist, context: project.context, project: project.id }))
  : [project]);
const results = document.querySelector('#archive-results');
const status = document.querySelector('#result-status');
const clearExperience = document.querySelector('#clear-experience');
let state;

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}
function entryLink(url, label) {
  const link = element('a', 'entry-link', 'ENTER LPX ');
  link.href = url;
  link.setAttribute('aria-label', `Enter LPX — ${label}`);
  const arrow = element('span', '', '→');
  arrow.setAttribute('aria-hidden', 'true');
  link.append(arrow);
  return link;
}
function tagList(tags = []) {
  const list = element('ul', 'project-tags');
  list.setAttribute('aria-label', 'Experience tags');
  tags.forEach(tag => list.append(element('li', '', experienceLabels[tag])));
  return list;
}
function projectPresentation(entry, featured = false) {
  const article = element('article', `project${featured ? ' featured-project' : ''}`);
  article.dataset.entryId = entry.id;
  const title = element('div', 'project-title');
  const body = element('div', 'project-body');
  title.append(element('p', 'eyebrow', entry.project ? entry.artist : contexts[entry.context]));
  const heading = element('h2', '', entry.project ? entry.title : entry.artist);
  heading.id = `entry-${entry.id}`;
  article.setAttribute('aria-labelledby', heading.id);
  title.append(heading);
  if (entry.title && !entry.project) title.append(element('p', 'record-title', entry.title));
  if (entry.details) title.append(element('p', 'record-details', entry.details));
  if (entry.artwork) {
    const image = element('img', 'project-art');
    image.src = entry.artwork.src; image.alt = entry.artwork.alt; image.loading = 'lazy';
    title.prepend(image);
  }
  if (entry.description) body.append(element('p', '', entry.description));
  if (entry.tags?.length) body.append(tagList(entry.tags));
  body.append(entryLink(entry.url, `${entry.artist}${entry.title ? ' — ' + entry.title : ''}`));
  article.append(title, body);
  return article;
}
function collectionPresentation(project) {
  const article = element('article', 'project collection');
  article.dataset.entryId = project.id;
  const header = element('div', 'collection-header');
  const heading = element('h2', '', project.artist);
  heading.id = `entry-${project.id}`;
  article.setAttribute('aria-labelledby', heading.id);
  header.append(heading, element('p', 'record-title', project.title));
  article.append(header, element('p', '', project.description));
  const list = element('ol', 'track-list');
  project.experiences.forEach(entry => {
    const row = element('li', 'track');
    row.dataset.entryId = entry.id;
    row.append(element('h3', '', entry.title));
    const detail = element('div');
    if (entry.description) detail.append(element('p', '', entry.description));
    if (entry.tags.length) detail.append(tagList(entry.tags));
    row.append(detail, entryLink(entry.url, `${project.artist} — ${entry.title}`));
    list.append(row);
  });
  article.append(list);
  return article;
}
function artistInvitation() {
  const aside = element('aside', 'archive-start');
  aside.append(element('h3', '', 'THIS IS WHERE THE ARCHIVE STARTS.'));
  const body = element('div');
  body.append(element('p', '', 'We’re looking for a small group of artists and bands to help define what LPX becomes next.'));
  const link = element('a', 'entry-link', 'FOR ARTISTS →');
  link.href = 'for-artists.html'; body.append(link); aside.append(body);
  return aside;
}
function readState() {
  const params = new URLSearchParams(location.search);
  const view = params.get('view');
  const experience = params.get('experience');
  return { view: Object.hasOwn(contexts, view) ? view : 'all', experience: Object.hasOwn(experienceLabels, experience) ? experience : null };
}
function changeState(next) {
  const url = new URL(location.href);
  url.searchParams.delete('view'); url.searchParams.delete('experience');
  if (next.view !== 'all') url.searchParams.set('view', next.view);
  if (next.experience) url.searchParams.set('experience', next.experience);
  if (url.href !== location.href) history.pushState(null, '', url);
  state = next;
  render();
}
function render() {
  document.querySelectorAll('[data-view]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.view === state.view)));
  document.querySelectorAll('[data-experience]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.experience === (state.experience || ''))));
  clearExperience.hidden = !state.experience;
  const matchesContext = entry => state.view === 'all' || entry.context === state.view;
  const matches = allExperiences.filter(entry => matchesContext(entry) && (!state.experience || entry.tags.includes(state.experience)));
  const fragment = document.createDocumentFragment();
  if (!matches.length) {
    const empty = element('section', 'empty-results');
    empty.append(element('h2', '', 'No LPXs match those filters yet.'));
    const reset = element('button', 'text-button', 'VIEW ALL LPXs'); reset.type = 'button';
    reset.addEventListener('click', () => { changeState({ view: 'all', experience: null }); document.querySelector('[data-view="all"]').focus(); });
    empty.append(reset); fragment.append(empty);
  } else if (state.experience) {
    const grid = element('div', 'experience-grid');
    matches.forEach(entry => grid.append(projectPresentation(entry)));
    fragment.append(grid);
  } else {
    const projects = archiveProjects.filter(matchesContext);
    projects.filter(project => project.featured).forEach(project => { fragment.append(projectPresentation(project, true), artistInvitation()); });
    const others = projects.filter(project => !project.featured);
    if (others.length) {
      const section = element('section');
      const heading = element('h2', 'group-heading', 'AI & HYBRID ARTISTS');
      heading.id = 'hybrid-heading'; section.setAttribute('aria-labelledby', heading.id); section.append(heading);
      const grid = element('div', 'project-grid');
      others.filter(project => !project.collection).forEach(project => grid.append(projectPresentation(project)));
      section.append(grid);
      others.filter(project => project.collection).forEach(project => section.append(collectionPresentation(project)));
      fragment.append(section);
    }
  }
  const wrapper = element('div', 'results-enter'); wrapper.append(fragment); results.replaceChildren(wrapper);
  const projectCount = archiveProjects.filter(matchesContext).length;
  status.textContent = state.experience
    ? `${matches.length} ${matches.length === 1 ? 'experience' : 'experiences'} · ${contexts[state.view]} · ${experienceLabels[state.experience]}`
    : `${projectCount} ${projectCount === 1 ? 'project' : 'projects'} · ${contexts[state.view]}`;
}
for (const [view, label] of Object.entries(contexts)) {
  const button = element('button', '', label); button.type = 'button'; button.dataset.view = view;
  button.addEventListener('click', () => changeState({ view, experience: null }));
  document.querySelector('#context-filters').append(button);
}
const allExperiencesButton = element('button', '', 'ALL EXPERIENCES');
allExperiencesButton.type = 'button';
allExperiencesButton.dataset.experience = '';
allExperiencesButton.addEventListener('click', () => changeState({ ...state, experience: null }));
document.querySelector('#experience-filters').append(allExperiencesButton);
// Keep the full vocabulary for shared URLs; show modes only once content uses them.
const populatedExperiences = new Set(allExperiences.flatMap(entry => entry.tags));
for (const [experience, label] of Object.entries(experienceLabels)) {
  if (!populatedExperiences.has(experience)) continue;
  const button = element('button', '', label); button.type = 'button'; button.dataset.experience = experience;
  button.addEventListener('click', () => changeState({ ...state, experience: state.experience === experience ? null : experience }));
  document.querySelector('#experience-filters').append(button);
}
clearExperience.addEventListener('click', () => {
  const previous = state.experience;
  changeState({ ...state, experience: null });
  (document.querySelector(`[data-experience="${previous}"]`) || document.querySelector(`[data-view="${state.view}"]`)).focus();
});
addEventListener('popstate', () => { state = readState(); render(); });
state = readState(); render();
document.querySelector('.filters').hidden = false;
