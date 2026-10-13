// --- RENDUS PARTAGÉS (POPUP, DASHBOARD, WIDGET) ---
// Dépend de shared.js (JobTracker.escapeHTML). Déclaré avec `var` pour
// supporter la réinjection du script de contenu, comme shared.js.
var UI = globalThis.UI || (() => {
  const esc = (s) => JobTracker.escapeHTML(s);

  // Ordre des colonnes du Kanban et des menus. `group` = onglet de la popup.
  const STATUSES = [
    { id: 'wishlist', label: 'À postuler', short: 'À postuler', group: 'todo' },
    { id: 'applied', label: 'Candidature envoyée', short: 'Envoyée', group: 'progress' },
    { id: 'interview', label: 'Entretien', short: 'Entretien', group: 'progress' },
    { id: 'offer', label: 'Offre reçue', short: 'Offre', group: 'done' },
    { id: 'rejected', label: 'Refusée / Classée', short: 'Refusée', group: 'done' }
  ];

  const GROUPS = [
    { id: 'todo', label: 'À faire' },
    { id: 'progress', label: 'En cours' },
    { id: 'done', label: 'Terminées' }
  ];

  const BY_ID = Object.fromEntries(STATUSES.map((s) => [s.id, s]));

  // Statut inconnu (anciennes données) → affiché comme « À postuler », sans réécriture
  function statusOf(c) {
    return BY_ID[c && c.status] || BY_ID.wishlist;
  }

  function statusTag(status) {
    const s = BY_ID[status] || BY_ID.wishlist;
    return `<span class="tag tag--${s.id}">${esc(s.short)}</span>`;
  }

  // 'AAAA-MM-JJ' → Date locale à minuit, ou null
  function parseDay(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    if (!m) return null;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return isNaN(d.getTime()) ? null : d;
  }

  function relativeTime(isoDate, now = new Date()) {
    const d = parseDay(isoDate);
    if (!d) return '';
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const days = Math.round((today - d) / 86400000);
    if (days <= 0) return "aujourd'hui";
    if (days === 1) return 'hier';
    if (days < 30) return `il y a ${days} j`;

    let months = (today.getFullYear() - d.getFullYear()) * 12 + (today.getMonth() - d.getMonth());
    if (today.getDate() < d.getDate()) months -= 1;
    months = Math.max(months, 1);
    if (months < 12) return `il y a ${months} mois`;
    const years = Math.floor(months / 12);
    return `il y a ${years} an${years > 1 ? 's' : ''}`;
  }

  // Plus récentes d'abord ; sans date valide à la fin ; ordre d'origine conservé à égalité
  function sortCandidatures(list) {
    return list
      .map((c, i) => ({ c, i, t: parseDay(c.dateApplied) }))
      .sort((a, b) => {
        if (a.t && b.t && a.t - b.t !== 0) return b.t - a.t;
        if (!a.t !== !b.t) return a.t ? -1 : 1;
        return a.i - b.i;
      })
      .map((x) => x.c);
  }

  const ICON_FILE = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>';

  function cvTag(cv) {
    if (!cv) return '';
    return `<span class="tag tag--cv" title="CV : ${esc(cv.name || '')}">${ICON_FILE}CV</span>`;
  }

  function jobItemHTML(c, { meta = ['company', 'location', 'relative'] } = {}) {
    const parts = meta
      .map((key) => (key === 'relative' ? relativeTime(c.dateApplied) : c[key]))
      .filter(Boolean)
      .map(esc);
    if (c && c.cv) parts.push(cvTag(c.cv));
    return `<span class="job-item__title">${esc(c.title)}</span>` +
      `<span class="job-item__meta">${parts.join(' · ')}</span>` +
      statusTag(statusOf(c).id);
  }

  function computeStats(list) {
    const count = (id) => list.filter((c) => statusOf(c).id === id).length;
    const total = list.length;
    const sent = total - count('wishlist');
    const interview = count('interview');
    const offer = count('offer');
    const responded = interview + offer + count('rejected');
    return {
      total,
      sent,
      interview,
      offer,
      responseRate: sent > 0 ? Math.round((responded / sent) * 100) : null
    };
  }

  // --- RAPPELS ---
  const REMINDER_PRESETS = [
    { id: 'tomorrow', label: 'Demain 9 h' },
    { id: 'in3days', label: 'Dans 3 jours' },
    { id: 'in1week', label: 'Dans 1 semaine' }
  ];
  const timeOf = (d) => d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

  // « sam. 10 oct. à 09:00 »
  function formatReminder(value) {
    const d = JobTracker.parseReminder(value);
    if (!d) return '';
    return `${d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })} à ${timeOf(d)}`;
  }

  // « 10 oct. 09:00 »
  function formatReminderShort(value) {
    const d = JobTracker.parseReminder(value);
    if (!d) return '';
    return `${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} ${timeOf(d)}`;
  }

  // Valeur d'un raccourci ('' pour « clear » ou un raccourci inconnu)
  function reminderFromPreset(preset, now = new Date()) {
    return JobTracker.reminderPresets(now)[preset] || '';
  }

  function reminderFieldHTML(idPrefix, value) {
    const min = JobTracker.toReminderValue(new Date());
    const chips = [...REMINDER_PRESETS, { id: 'clear', label: 'Retirer' }]
      .map((p) => `<button type="button" class="chip${p.id === 'clear' ? ' chip--muted' : ''}" data-preset="${p.id}">${esc(p.label)}</button>`)
      .join('');
    return `<div class="reminder-field">
      <input class="input" id="${idPrefix}-input" type="datetime-local" value="${esc(value)}" min="${min}" aria-label="Date et heure du rappel">
      <div class="chips">${chips}</div>
    </div>`;
  }

  // Les pastilles remplissent le champ et transmettent leur valeur à onPick.
  // La saisie au clavier n'est pas transmise : chaque frappe produirait une valeur
  // intermédiaire (ou vide). Elle est validée par l'appelant (bouton OK, Enregistrer).
  function bindReminderField(root, idPrefix, onPick) {
    const input = root.querySelector(`#${idPrefix}-input`);
    root.querySelectorAll('.reminder-field .chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        input.value = reminderFromPreset(chip.dataset.preset);
        onPick(input.value);
      });
    });
  }

  // Liste compacte pour les formulaires d'ajout : '' (pas de rappel) ou un raccourci
  function reminderSelectHTML(id) {
    const options = [{ id: '', label: 'Pas de rappel' }, ...REMINDER_PRESETS]
      .map((p) => `<option value="${p.id}">${esc(p.label)}</option>`)
      .join('');
    return `<select class="select" id="${id}">${options}</select>`;
  }

  // Valeur saisie, ou null si le champ est incomplet (segment effacé au clavier)
  function readReminderInput(input) {
    return input.validity && input.validity.badInput ? null : input.value;
  }

  // Le rappel est-il dans le futur ? ('' est accepté : pas de rappel)
  function isValidFutureReminder(value, now = new Date()) {
    if (!value) return true;
    const d = JobTracker.parseReminder(value);
    return d !== null && d > now;
  }

  // Message temporaire, avec action facultative (ex. « Annuler »)
  function toast(message, { actionLabel, onAction, duration = 4000 } = {}) {
    let region = document.querySelector('.toast-region');
    if (!region) {
      region = document.createElement('div');
      region.className = 'toast-region';
      region.setAttribute('role', 'status');
      region.setAttribute('aria-live', 'polite');
      document.body.appendChild(region);
    }

    const el = document.createElement('div');
    el.className = 'toast';
    const text = document.createElement('span');
    text.textContent = message;
    el.appendChild(text);

    const remove = () => el.remove();
    if (actionLabel && onAction) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'toast__action';
      btn.textContent = actionLabel;
      btn.addEventListener('click', () => {
        remove();
        onAction();
      });
      el.appendChild(btn);
    }

    region.appendChild(el);
    setTimeout(remove, duration);
  }

  // --- CV : RENDU ET GESTION DES ÉVÉNEMENTS ---
  function cvFieldHTML(idPrefix, cv) {
    if (cv) {
      const sizeStr = JobTracker.formatFileSize(cv.size);
      return `<div class="cv-file-card" id="${idPrefix}-card">
        <div class="cv-file-card__info">
          <span class="cv-file-card__icon">${ICON_FILE}</span>
          <div style="min-width:0;">
            <div class="cv-file-card__name" title="${esc(cv.name)}">${esc(cv.name)}</div>
            <div class="cv-file-card__meta">${esc(sizeStr)}</div>
          </div>
        </div>
        <div class="cv-file-card__actions">
          <button type="button" class="btn btn--secondary btn--sm" id="${idPrefix}-btn-open" title="Ouvrir ou télécharger">Ouvrir</button>
          <button type="button" class="btn btn--ghost btn--sm" id="${idPrefix}-btn-replace" title="Remplacer le CV">Remplacer</button>
          <button type="button" class="btn btn--danger btn--sm" id="${idPrefix}-btn-delete" title="Supprimer le CV">Supprimer</button>
        </div>
        <input type="file" id="${idPrefix}-file-input" accept=".pdf,.doc,.docx" style="display:none;">
      </div>`;
    }
    return `<div class="cv-dropzone" id="${idPrefix}-dropzone" role="button" tabindex="0" aria-label="Déposer un CV ou cliquer pour parcourir">
      <span class="cv-dropzone__icon">${ICON_FILE}</span>
      <span class="cv-dropzone__text">Glissez votre CV ou cliquez pour parcourir</span>
      <span class="cv-dropzone__hint">Formats : .pdf, .doc, .docx (max 10 Mo)</span>
      <input type="file" id="${idPrefix}-file-input" accept=".pdf,.doc,.docx" style="display:none;">
    </div>`;
  }

  function bindCvField(root, idPrefix, { onFileSelected, onOpen, onDelete }) {
    const fileInput = root.querySelector(`#${idPrefix}-file-input`);
    const dropzone = root.querySelector(`#${idPrefix}-dropzone`);
    const btnOpen = root.querySelector(`#${idPrefix}-btn-open`);
    const btnReplace = root.querySelector(`#${idPrefix}-btn-replace`);
    const btnDelete = root.querySelector(`#${idPrefix}-btn-delete`);

    function handleFile(file) {
      if (!file) return;
      const validation = JobTracker.validateCvFile(file);
      if (!validation.valid) {
        toast(validation.error);
        return;
      }
      if (onFileSelected) onFileSelected(file);
    }

    if (fileInput) {
      fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
          handleFile(e.target.files[0]);
        }
      });
    }

    if (dropzone) {
      dropzone.addEventListener('click', () => fileInput && fileInput.click());
      dropzone.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (fileInput) fileInput.click();
        }
      });
      dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.classList.add('cv-dropzone--dragover');
      });
      dropzone.addEventListener('dragleave', () => {
        dropzone.classList.remove('cv-dropzone--dragover');
      });
      dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('cv-dropzone--dragover');
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
          handleFile(e.dataTransfer.files[0]);
        }
      });
    }

    if (btnOpen) {
      btnOpen.addEventListener('click', () => onOpen && onOpen());
    }

    if (btnReplace) {
      btnReplace.addEventListener('click', () => fileInput && fileInput.click());
    }

    if (btnDelete) {
      btnDelete.addEventListener('click', () => onDelete && onDelete());
    }
  }

  return {
    STATUSES, GROUPS, statusOf, statusTag, relativeTime, sortCandidatures, jobItemHTML, computeStats, toast,
    REMINDER_PRESETS, formatReminder, formatReminderShort, reminderFromPreset, reminderFieldHTML, bindReminderField, reminderSelectHTML, readReminderInput, isValidFutureReminder,
    ICON_FILE, cvTag, cvFieldHTML, bindCvField
  };
})();
globalThis.UI = UI;
