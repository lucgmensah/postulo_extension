// --- DASHBOARD : STATISTIQUES, KANBAN, PANNEAU DE DÉTAIL ---
// Dépend de shared.js (JobTracker) et ui.js (UI).

const state = {
  list: [],
  query: '',
  panelId: null, // id de la candidature ouverte, 'new' en création
  returnFocus: null, // sélecteur de l'élément à refocaliser à la fermeture
  panelSnapshot: null, // valeurs du panneau à l'ouverture
  panelCv: null, // métadonnées du CV rattaché
  pendingCvFile: null, // fichier binaire en attente d'enregistrement
  selected: new Set(), // ids des cartes cochées (toujours visibles à l'écran)
  lastToggled: null // dernière carte cochée ou décochée, pour y rendre le focus
};

const $ = (sel) => document.querySelector(sel);
const esc = (s) => JobTracker.escapeHTML(s);

const ICONS = {
  total: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
  sent: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 2-7 20-4-9-9-4 20-7z"/><path d="M22 2 11 13"/></svg>',
  interview: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
  offer: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="6"/><path d="M15.5 13 17 22l-5-3-5 3 1.5-9"/></svg>',
  rate: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 5-6"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>'
};

// --- INITIALISATION ---
document.addEventListener('DOMContentLoaded', () => {
  $('#search-input').addEventListener('input', (e) => {
    state.query = e.target.value.trim().toLowerCase();
    renderKanban();
  });
  $('#btn-add').addEventListener('click', () => openPanel({}));
  $('#btn-export').addEventListener('click', () => handleExportCSV(state.list));

  setupKanbanEvents();
  setupSelection();
  setupPanel();

  JobTracker.getAll((list) => {
    state.list = list;
    render();
    openFromHash();
  });
  JobTracker.onChange((list) => {
    state.list = list;
    // La candidature ouverte a été supprimée ailleurs (popup, autre onglet)
    if (state.panelId && state.panelId !== 'new' && !list.some((c) => c.id === state.panelId)) {
      closePanel();
      UI.toast('Cette candidature a été supprimée');
    }
    render();
  });
});

function render() {
  renderStats();
  renderKanban();
}

// --- STATISTIQUES ---
function renderStats() {
  const s = UI.computeStats(state.list);
  const cards = [
    { id: 'total', label: 'Total', value: s.total },
    { id: 'sent', label: 'Envoyées', value: s.sent },
    { id: 'interview', label: 'Entretiens', value: s.interview },
    { id: 'offer', label: 'Offres', value: s.offer },
    {
      id: 'rate', label: 'Taux de réponse', value: s.responseRate === null ? '-' : `${s.responseRate} %`,
      title: 'Estimation : candidatures ayant dépassé le statut "envoyée"'
    }
  ];
  $('.stats').innerHTML = cards.map((c) => `
    <div class="card stat-card" data-stat="${c.id}"${c.title ? ` title="${esc(c.title)}"` : ''}>
      <span class="stat-card__icon" aria-hidden="true">${ICONS[c.id]}</span>
      <span class="stat-card__value">${esc(String(c.value))}</span>
      <span class="stat-card__label">${esc(c.label)}</span>
    </div>`).join('');
}

// --- KANBAN ---
function matchesQuery(c) {
  if (!state.query) return true;
  return ['title', 'company', 'location', 'notes'].some((k) => (c[k] || '').toLowerCase().includes(state.query));
}

const ICON_CLOCK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';

function reminderTagHTML(value) {
  const short = UI.formatReminderShort(value);
  if (!short) return '';
  return `<span class="tag tag--reminder kanban-card__reminder" title="Rappel : ${esc(UI.formatReminder(value))}">${ICON_CLOCK}${esc(short)}</span>`;
}

function cardHTML(c) {
  const meta = [c.location, UI.relativeTime(c.dateApplied)].filter(Boolean).map(esc).join(' · ');
  return `
    <article class="kanban-card" data-id="${esc(c.id)}" draggable="true" tabindex="0" aria-label="${esc(c.title)} - ${esc(c.company)}">
      <input type="checkbox" class="kanban-card__check" aria-label="Sélectionner ${esc(c.title)}">
      <div class="kanban-card__title">${esc(c.title)}</div>
      <div class="kanban-card__company">${esc(c.company)}</div>
      <div class="kanban-card__footer">
        <span class="kanban-card__meta">${meta}</span>
        ${c.cv ? UI.cvTag(c.cv) : ''}
        ${c.salary ? `<span class="tag tag--neutral">${esc(c.salary)}</span>` : ''}
      </div>
      ${reminderTagHTML(c.reminderAt)}
    </article>`;
}

function renderKanban() {
  const visible = UI.sortCandidatures(state.list.filter(matchesQuery));
  $('.kanban').innerHTML = UI.STATUSES.map((s) => {
    const cards = visible.filter((c) => UI.statusOf(c).id === s.id);
    return `
      <section class="kanban-col" data-status="${s.id}" aria-label="${esc(s.label)}">
        <header class="kanban-col__header">
          <span class="kanban-col__lead">
            <span class="kanban-col__dot" style="background: var(--status-${s.id}-fg)" aria-hidden="true"></span>
            ${cards.length ? `<input type="checkbox" class="kanban-col__check" aria-label="Sélectionner toute la colonne ${esc(s.label)}" title="Sélectionner toute la colonne">` : ''}
          </span>
          <h2 class="kanban-col__title">${esc(s.label)}</h2>
          <span class="kanban-col__count">${cards.length}</span>
          <button type="button" class="icon-btn kanban-col__add" aria-label="Ajouter dans ${esc(s.label)}" title="Ajouter dans ${esc(s.label)}">${ICONS.plus}</button>
        </header>
        <div class="kanban-col__cards">
          ${cards.length ? cards.map(cardHTML).join('') : '<p class="kanban-col__empty">Aucune candidature</p>'}
        </div>
      </section>`;
  }).join('');

  // Ce qu'on voit est ce qu'on touche : une carte masquée (recherche) ou supprimée
  // (ailleurs) sort de la sélection.
  const shown = new Set(visible.map((c) => c.id));
  state.selected = new Set([...state.selected].filter((id) => shown.has(id)));
  syncSelection();
}

// --- SÉLECTION ---
// Cocher une carte ne redessine pas le Kanban : seules les classes, les cases et la barre
// changent, et le focus clavier reste en place.
function syncSelection() {
  const kanban = $('.kanban');
  const count = state.selected.size;
  kanban.classList.toggle('kanban--selecting', count > 0);

  kanban.querySelectorAll('.kanban-card').forEach((card) => {
    const on = state.selected.has(card.dataset.id);
    card.classList.toggle('kanban-card--selected', on);
    card.querySelector('.kanban-card__check').checked = on;
  });

  kanban.querySelectorAll('.kanban-col').forEach((col) => {
    const box = col.querySelector('.kanban-col__check');
    if (!box) return;
    const ids = [...col.querySelectorAll('.kanban-card')].map((c) => c.dataset.id);
    const n = ids.filter((id) => state.selected.has(id)).length;
    box.checked = n > 0 && n === ids.length;
    box.indeterminate = n > 0 && n < ids.length;
  });

  const bar = $('#selection-bar');
  bar.classList.toggle('hidden', count === 0);
  if (count === 0) closeStatusMenu();
  $('#selection-count').textContent = count === 1 ? '1 sélectionnée' : `${count} sélectionnées`;
  // Les messages (toasts) remontent au-dessus de la barre
  document.body.style.setProperty('--selection-bar-height', count > 0 ? `${bar.offsetHeight}px` : '0px');
  document.body.classList.toggle('has-selection', count > 0);
}

function setSelected(ids, on) {
  for (const id of ids) {
    if (on) state.selected.add(id);
    else state.selected.delete(id);
  }
  syncSelection();
}

function toggleSelected(id) {
  state.lastToggled = id;
  setSelected([id], !state.selected.has(id));
}

function clearSelection() {
  if (state.selected.size === 0) return;
  state.selected.clear();
  syncSelection();
}

// La sélection reste cochée, pour enchaîner une autre action
function changeStatusOfSelection(status) {
  const ids = [...state.selected];
  const label = UI.STATUSES.find((s) => s.id === status).label;
  JobTracker.update((list) => JobTracker.applyStatusToIds(list, ids, status), (saved, list) => {
    state.list = list;
    render();
    const count = list.filter((c) => ids.includes(c.id)).length;
    UI.toast(count === 1 ? `Candidature passée en « ${label} »` : `${count} candidatures passées en « ${label} »`);
  });
}

// --- MENU « CHANGER LE STATUT » (même fonctionnement que celui de la popup) ---
// Rien n'est appliqué tant qu'un statut n'est pas choisi (clic ou Entrée).
function onStatusMenuOutside(e) {
  if (!$('#selection-status-menu').contains(e.target) && !$('#selection-status').contains(e.target)) closeStatusMenu();
}

function closeStatusMenu() {
  $('#selection-status-menu').classList.add('hidden');
  $('#selection-status').setAttribute('aria-expanded', 'false');
  document.removeEventListener('click', onStatusMenuOutside, true);
}

function setupStatusMenu() {
  const trigger = $('#selection-status');
  const menu = $('#selection-status-menu');
  menu.innerHTML = UI.STATUSES
    .map((s) => `<button type="button" role="menuitem" data-status="${s.id}" tabindex="-1" aria-label="${esc(s.label)}">${UI.statusTag(s.id)}</button>`)
    .join('');
  const items = () => [...menu.querySelectorAll('[role="menuitem"]')];

  trigger.addEventListener('click', () => {
    if (!menu.classList.contains('hidden')) {
      closeStatusMenu();
      return;
    }
    menu.classList.remove('hidden');
    trigger.setAttribute('aria-expanded', 'true');
    document.addEventListener('click', onStatusMenuOutside, true);
    items()[0].focus();
  });

  menu.addEventListener('keydown', (e) => {
    const list = items();
    const i = list.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); list[(i + 1) % list.length].focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); list[(i - 1 + list.length) % list.length].focus(); }
    if (e.key === 'Tab') closeStatusMenu();
    // preventDefault : Échap ferme le menu sans vider la sélection
    if (e.key === 'Escape') { e.preventDefault(); closeStatusMenu(); trigger.focus(); }
  });

  menu.addEventListener('click', (e) => {
    const item = e.target.closest('[role="menuitem"]');
    if (!item) return;
    closeStatusMenu();
    trigger.focus();
    changeStatusOfSelection(item.dataset.status);
  });
}

function setupSelection() {
  const kanban = $('.kanban');

  kanban.addEventListener('change', (e) => {
    const cardBox = e.target.closest('.kanban-card__check');
    if (cardBox) {
      const id = cardBox.closest('.kanban-card').dataset.id;
      state.lastToggled = id;
      setSelected([id], cardBox.checked);
      return;
    }
    const colBox = e.target.closest('.kanban-col__check');
    if (colBox) {
      const ids = [...colBox.closest('.kanban-col').querySelectorAll('.kanban-card')].map((c) => c.dataset.id);
      setSelected(ids, colBox.checked);
    }
  });

  setupStatusMenu();

  $('#selection-export').addEventListener('click', () => {
    handleExportCSV(state.list.filter((c) => state.selected.has(c.id)));
  });

  // La sélection se vide : les cartes supprimées ne sont plus là, et « Annuler »
  // les fait revenir sans les recocher.
  $('#selection-delete').addEventListener('click', () => {
    const ids = [...state.selected];
    clearSelection();
    deleteCandidatures(ids);
  });

  $('#selection-clear').addEventListener('click', () => {
    const back = state.lastToggled && document.querySelector(`.kanban-card[data-id="${CSS.escape(state.lastToggled)}"]`);
    clearSelection();
    if (back) back.focus();
  });

  // Échap vide la sélection, sauf quand il ferme le panneau : panneau encore ouvert,
  // ou déjà fermé par ce même Échap (preventDefault), selon l'ordre des écouteurs.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || e.defaultPrevented || state.selected.size === 0) return;
    if (!$('.panel').classList.contains('hidden')) return;
    clearSelection();
  });
}

// Délégation d'événements : le Kanban est redessiné à chaque modification
function setupKanbanEvents() {
  const kanban = $('.kanban');

  kanban.addEventListener('click', (e) => {
    // Les cases sont traitées par l'événement `change` (setupSelection)
    if (e.target.closest('.kanban-card__check, .kanban-col__check')) return;
    const add = e.target.closest('.kanban-col__add');
    if (add) {
      openPanel({ status: add.closest('.kanban-col').dataset.status, returnFocus: add });
      return;
    }
    const card = e.target.closest('.kanban-card');
    if (!card) return;
    // Ctrl/Cmd+clic, ou n'importe quel clic pendant une sélection : cocher au lieu d'ouvrir
    if (e.ctrlKey || e.metaKey || state.selected.size > 0) {
      toggleSelected(card.dataset.id);
      return;
    }
    openPanel({ id: card.dataset.id, returnFocus: card });
  });

  kanban.addEventListener('keydown', (e) => {
    // Seulement sur la carte elle-même : la case qu'elle contient a son propre comportement
    const card = e.target.classList.contains('kanban-card') ? e.target : null;
    if (!card) return;
    if (e.key === ' ') {
      e.preventDefault();
      toggleSelected(card.dataset.id);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (state.selected.size > 0) toggleSelected(card.dataset.id);
      else openPanel({ id: card.dataset.id, returnFocus: card });
    }
  });

  // --- GLISSER-DÉPOSER ---
  // Une carte cochée emporte toute la sélection ; une carte non cochée part seule.
  let draggedIds = null;

  kanban.addEventListener('dragstart', (e) => {
    const card = e.target.closest('.kanban-card');
    if (!card) return;
    const id = card.dataset.id;
    draggedIds = state.selected.has(id) ? [...state.selected] : [id];
    for (const dragged of draggedIds) {
      const el = kanban.querySelector(`.kanban-card[data-id="${CSS.escape(dragged)}"]`);
      if (el) el.classList.add('kanban-card--dragging');
    }
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', id);
    }
  });

  kanban.addEventListener('dragend', () => {
    kanban.querySelectorAll('.kanban-card--dragging').forEach((c) => c.classList.remove('kanban-card--dragging'));
    kanban.querySelectorAll('.kanban-col--drop').forEach((c) => c.classList.remove('kanban-col--drop'));
    draggedIds = null;
  });

  kanban.addEventListener('dragover', (e) => {
    const col = e.target.closest('.kanban-col');
    if (!col || !draggedIds) return;
    e.preventDefault();
    kanban.querySelectorAll('.kanban-col--drop').forEach((c) => c !== col && c.classList.remove('kanban-col--drop'));
    col.classList.add('kanban-col--drop');
  });

  kanban.addEventListener('dragleave', (e) => {
    const col = e.target.closest('.kanban-col');
    if (col && !col.contains(e.relatedTarget)) col.classList.remove('kanban-col--drop');
  });

  kanban.addEventListener('drop', (e) => {
    const col = e.target.closest('.kanban-col');
    if (!col || !draggedIds) return;
    e.preventDefault();
    col.classList.remove('kanban-col--drop');
    const ids = draggedIds;
    const status = col.dataset.status;
    JobTracker.update((list) => JobTracker.applyStatusToIds(list, ids, status), (saved, list) => {
      state.list = list;
      render();
    });
  });
}

// --- PANNEAU DE DÉTAIL ---
const FIELDS = {
  title: 'f-title',
  company: 'f-company',
  dateApplied: 'f-date',
  location: 'f-location',
  salary: 'f-salary',
  url: 'f-url',
  contactName: 'f-contact-name',
  contactEmail: 'f-contact-email',
  contactPhone: 'f-contact-phone',
  notes: 'f-notes',
  reminderAt: 'f-reminder-input'
};

const panelEls = () => ({ panel: $('.panel'), backdrop: $('.panel-backdrop') });

function setupPanel() {
  $('#f-reminder').innerHTML = UI.reminderFieldHTML('f-reminder', '');
  UI.bindReminderField($('#f-reminder'), 'f-reminder', () => { });
  $('.status-group').innerHTML = UI.STATUSES.map((s) => `
    <label class="status-option">
      <input type="radio" name="status" value="${s.id}">
      ${UI.statusTag(s.id)}
    </label>`).join('');

  $('#panel-form').addEventListener('submit', (e) => {
    e.preventDefault();
    savePanel();
  });
  $('#panel-close').addEventListener('click', closePanel);
  $('#panel-cancel').addEventListener('click', closePanel);
  $('.panel-backdrop').addEventListener('click', closePanel);
  $('#panel-delete').addEventListener('click', () => deleteCandidatures([state.panelId]));

  // Écouté sur le document : un clic dans une zone non focalisable du panneau
  // renvoie le focus sur <body>, hors du panneau.
  document.addEventListener('keydown', (e) => {
    if ($('.panel').classList.contains('hidden')) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      closePanel();
    }
    if (e.key === 'Tab') trapFocus(e);
  });

  window.addEventListener('hashchange', openFromHash);
}

// Garde le focus dans le panneau tant qu'il est ouvert
function trapFocus(e) {
  const focusables = [...$('.panel').querySelectorAll('button, input, textarea, select, a[href]')]
    .filter((el) => !el.disabled && el.offsetParent !== null && !(el.type === 'radio' && !el.checked));
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (!$('.panel').contains(document.activeElement)) {
    e.preventDefault();
    (e.shiftKey ? last : first).focus();
  } else if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

// Sélecteur de l'élément qui a ouvert le panneau (les cartes sont recréées à chaque rendu)
function focusSelector(el) {
  if (!el) return null;
  if (el.dataset && el.dataset.id) return `.kanban-card[data-id="${CSS.escape(el.dataset.id)}"]`;
  const col = el.closest && el.closest('.kanban-col');
  if (col) return `.kanban-col[data-status="${col.dataset.status}"] .kanban-col__add`;
  return el.id ? `#${el.id}` : null;
}

function renderPanelCv() {
  const container = $('#f-cv');
  if (!container) return;
  container.innerHTML = UI.cvFieldHTML('f-cv', state.panelCv);
  UI.bindCvField(container, 'f-cv', {
    onFileSelected: (file) => {
      state.pendingCvFile = file;
      state.panelCv = {
        name: file.name,
        size: file.size,
        type: file.type,
        updatedAt: JobTracker.todayISO()
      };
      renderPanelCv();
      UI.toast('CV sélectionné');
    },
    onOpen: async () => {
      if (state.pendingCvFile) {
        const url = URL.createObjectURL(state.pendingCvFile);
        const isPdf = (state.pendingCvFile.type || '').includes('pdf') || state.pendingCvFile.name.toLowerCase().endsWith('.pdf');
        if (isPdf && window.open) {
          window.open(url, '_blank');
        } else {
          const a = document.createElement('a');
          a.href = url;
          a.download = state.pendingCvFile.name;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        }
        setTimeout(() => URL.revokeObjectURL(url), 10000);
      } else if (state.panelId && state.panelId !== 'new') {
        try {
          await CvStorage.openOrDownload(state.panelId, state.panelCv && state.panelCv.name);
        } catch (err) {
          UI.toast("Erreur lors de l'ouverture du CV");
        }
      }
    },
    onDelete: async () => {
      const editId = state.panelId && state.panelId !== 'new' ? state.panelId : null;
      state.pendingCvFile = null;
      state.panelCv = null;
      if (editId) {
        try {
          await CvStorage.delete(editId);
        } catch (err) {
          console.error('Erreur suppression CV IndexedDB:', err);
        }
        JobTracker.update((list) => {
          return list.map((item) => (item.id === editId ? { ...item, cv: null } : item));
        }, (saved, list) => {
          state.list = list;
          render();
          renderPanelCv();
          UI.toast('CV supprimé');
        });
      } else {
        renderPanelCv();
        UI.toast('CV retiré');
      }
    }
  });
}

function openPanel({ id, status, returnFocus } = {}) {
  const existing = id ? state.list.find((c) => c.id === id) : null;
  if (id && !existing) {
    UI.toast('Candidature introuvable');
    return;
  }

  const c = existing || { status: status || 'wishlist', dateApplied: JobTracker.todayISO(), cv: null };
  state.panelId = existing ? existing.id : 'new';
  state.returnFocus = focusSelector(returnFocus || document.activeElement);
  state.panelCv = c.cv ? { ...c.cv } : null;
  state.pendingCvFile = null;

  $('#panel-heading').textContent = existing ? 'Modifier la candidature' : 'Nouvelle candidature';
  $('#panel-delete').classList.toggle('hidden', !existing);
  for (const [key, elId] of Object.entries(FIELDS)) {
    const input = document.getElementById(elId);
    input.value = c[key] || '';
    input.removeAttribute('aria-invalid');
  }
  const statusId = UI.statusOf(c).id;
  document.querySelectorAll('.panel input[name="status"]').forEach((r) => { r.checked = r.value === statusId; });
  renderPanelCv();

  // Valeurs à l'ouverture : à l'enregistrement, seuls les champs modifiés sont écrits,
  // pour ne pas écraser ce qui a changé ailleurs pendant l'édition.
  state.panelSnapshot = readPanelFields();

  const { panel, backdrop } = panelEls();
  panel.classList.remove('hidden');
  backdrop.classList.remove('hidden');
  panel.querySelector('.panel__body').scrollTop = 0;
  history.replaceState(null, '', existing ? '#' + encodeURIComponent(existing.id) : location.pathname);
  $('#f-title').focus();
}

function closePanel() {
  const { panel, backdrop } = panelEls();
  if (panel.classList.contains('hidden')) return;
  panel.classList.add('hidden');
  backdrop.classList.add('hidden');
  state.panelId = null;
  state.panelCv = null;
  state.pendingCvFile = null;
  history.replaceState(null, '', location.pathname);
  const target = state.returnFocus && document.querySelector(state.returnFocus);
  if (target) target.focus();
}

function openFromHash() {
  const id = decodeURIComponent(location.hash.slice(1));
  if (!id) return;
  if (state.list.some((c) => c.id === id)) {
    openPanel({ id });
  } else {
    history.replaceState(null, '', location.pathname);
    UI.toast('Candidature introuvable');
  }
}

function readPanelFields() {
  const data = {};
  for (const [key, elId] of Object.entries(FIELDS)) data[key] = document.getElementById(elId).value.trim();
  data.status = (document.querySelector('.panel input[name="status"]:checked') || {}).value || 'wishlist';
  return data;
}

function savePanel() {
  const fields = readPanelFields();
  const missing = ['title', 'company'].filter((k) => !fields[k]);
  for (const k of ['title', 'company']) {
    document.getElementById(FIELDS[k]).setAttribute('aria-invalid', String(missing.includes(k)));
  }
  if (missing.length) {
    document.getElementById(FIELDS[missing[0]]).focus();
    UI.toast("Le poste et l'entreprise sont obligatoires.");
    return;
  }

  // Rappel : seulement s'il a été modifié, et dans le futur
  const reminderIncomplete = UI.readReminderInput(document.getElementById(FIELDS.reminderAt)) === null;
  if (reminderIncomplete || (fields.reminderAt !== state.panelSnapshot.reminderAt && !UI.isValidFutureReminder(fields.reminderAt))) {
    document.getElementById(FIELDS.reminderAt).focus();
    UI.toast('Choisissez une date à venir');
    return;
  }

  const editId = state.panelId !== 'new' ? state.panelId : null;
  const candidature = editId ? null : JobTracker.createCandidature({ ...fields, cv: state.panelCv });
  const changes = Object.fromEntries(Object.entries(fields).filter(([k, v]) => v !== state.panelSnapshot[k]));

  const existingItem = editId ? state.list.find((c) => c.id === editId) : null;
  const existingCv = existingItem ? existingItem.cv : null;
  const cvChanged = JSON.stringify(state.panelCv) !== JSON.stringify(existingCv);
  if (cvChanged) {
    changes.cv = state.panelCv;
  }

  const fileToSave = state.pendingCvFile;
  const cvWasDeleted = editId && existingCv && !state.panelCv;

  JobTracker.update((list) => {
    if (!editId) return JobTracker.isDuplicate(list, fields) ? null : [candidature, ...list];
    const current = list.find((c) => c.id === editId);
    const merged = { ...current, ...changes };
    if (!current || JobTracker.isDuplicate(list, merged, editId)) return null;
    return list.map((c) => (c.id === editId ? merged : c));
  }, async (saved, list) => {
    if (!saved) {
      UI.toast('Une candidature identique existe déjà.');
      return;
    }
    const targetId = editId || candidature.id;
    if (fileToSave) {
      try {
        await CvStorage.save(targetId, fileToSave);
      } catch (e) {
        console.error('Erreur sauvegarde CV:', e);
      }
    } else if (cvWasDeleted) {
      try {
        await CvStorage.delete(targetId);
      } catch (e) {
        console.error('Erreur suppression CV:', e);
      }
    }
    state.list = list;
    render();
    closePanel();
    UI.toast('Candidature enregistrée');
  });
}

// Suppression immédiate, annulable pendant 5 s : CV compris, chaque candidature
// revient à sa position d'origine.
async function deleteCandidatures(ids) {
  let removed = [];
  closePanel();

  // Les CV sont retirés d'IndexedDB tout de suite et gardés en mémoire pour « Annuler »
  const cvBackups = new Map();
  for (const id of ids) {
    try {
      const record = await CvStorage.get(id);
      if (record && (record.file || record.blob)) cvBackups.set(id, record.file || record.blob);
      await CvStorage.delete(id);
    } catch (err) {
      console.error('Erreur suppression CV IndexedDB :', err);
    }
  }

  JobTracker.update((list) => {
    const result = JobTracker.removeByIds(list, ids);
    removed = result.removed;
    return removed.length ? result.list : null;
  }, (saved, list) => {
    state.list = list;
    render();
    if (!saved) return;

    const count = removed.length;
    UI.toast(count === 1 ? 'Candidature supprimée' : `${count} candidatures supprimées`, {
      actionLabel: 'Annuler',
      duration: 5000,
      onAction: async () => {
        for (const [id, file] of cvBackups) {
          try {
            await CvStorage.save(id, file);
          } catch (err) {
            console.error('Erreur restauration CV IndexedDB :', err);
          }
        }
        JobTracker.update((current) => JobTracker.restoreRemoved(current, removed), (restored, restoredList) => {
          state.list = restoredList;
          render();
        });
      }
    });
  });
}

// --- EXPORT CSV ---
// Contenu CSV : séparateur point-virgule (Excel FR Windows)
function buildCSV(list, zipPathMap = null) {
  const headers = [
    'Titre du Poste', 'Entreprise', 'Statut', 'Date Action / Envoi', 'Lieu', 'Salaire',
    "Lien de l'offre", 'Contact Nom', 'Contact Email', 'Contact Telephone', 'Rappel', 'CV adapté', 'Notes'
  ];

  const rows = list.map((c) => {
    let cvValue = (c.cv && c.cv.name) || '';
    if (zipPathMap && zipPathMap.has(c.id)) {
      cvValue = zipPathMap.get(c.id);
    }
    return [
      c.title, c.company, UI.statusOf(c).label, c.dateApplied, c.location, c.salary,
      c.url, c.contactName, c.contactEmail, c.contactPhone, (c.reminderAt || '').replace('T', ' '),
      cvValue, c.notes
    ];
  });

  return [
    headers.join(';'),
    ...rows.map((row) => row.map((val) => {
      // Neutraliser les formules Excel (=, +, -, @) issues de contenus scrapés
      let text = String(val || '');
      if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
      // Échapper les guillemets et remplacer les retours à la ligne par des espaces
      return `"${text.replace(/"/g, '""').replace(/\r?\n|\r/g, ' ')}"`;
    }).join(';'))
  ].join('\r\n');
}

// Exporte `list` : tout le suivi (bouton de l'en-tête) ou la sélection (barre d'actions)
async function handleExportCSV(list) {
  if (list.length === 0) {
    UI.toast('Aucune candidature à exporter.');
    return;
  }

  const candidaturesWithCv = list.filter((c) => c.cv);

  // Si aucun CV rattaché, export direct du CSV seul
  if (candidaturesWithCv.length === 0) {
    const blob = new Blob(['﻿' + buildCSV(list)], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `suivi_candidatures_${JobTracker.todayISO()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return;
  }

  // Si des CV sont présents : création de l'archive ZIP contenant le CSV + les CV
  UI.toast("Préparation de l'archive ZIP...");
  try {
    const zip = new ZipBuilder();
    const usedPaths = new Set();
    const zipPathMap = new Map();

    for (const c of candidaturesWithCv) {
      let targetPath = JobTracker.buildCvZipPath(c);
      if (usedPaths.has(targetPath)) {
        const dot = targetPath.lastIndexOf('.');
        const base = dot !== -1 ? targetPath.slice(0, dot) : targetPath;
        const ext = dot !== -1 ? targetPath.slice(dot) : '';
        let counter = 1;
        while (usedPaths.has(`${base}_(${counter})${ext}`)) {
          counter++;
        }
        targetPath = `${base}_(${counter})${ext}`;
      }
      usedPaths.add(targetPath);
      zipPathMap.set(c.id, targetPath);
    }

    // 1. Ajouter le CSV à la racine du ZIP
    const csvContent = '﻿' + buildCSV(list, zipPathMap);
    zip.addFile(`suivi_candidatures_${JobTracker.todayISO()}.csv`, csvContent);

    // 2. Ajouter les fichiers CV depuis IndexedDB
    for (const c of candidaturesWithCv) {
      const targetPath = zipPathMap.get(c.id);
      const cvRecord = await CvStorage.get(c.id);
      const fileData = cvRecord && (cvRecord.file || cvRecord.blob);
      if (fileData) {
        zip.addFile(targetPath, fileData);
      }
    }

    // 3. Compiler et télécharger l'archive
    const zipBlob = await zip.build();
    const url = URL.createObjectURL(zipBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `suivi_candidatures_${JobTracker.todayISO()}.zip`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    UI.toast(`Export terminé (${candidaturesWithCv.length} CV inclus)`);
  } catch (err) {
    console.error("Erreur lors de l'export ZIP :", err);
    UI.toast("Erreur lors de la création de l'archive d'export.");
  }
}

