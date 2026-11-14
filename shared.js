// --- MODULE PARTAGÉ (POPUP, DASHBOARD, SCRIPT DE CONTENU) ---
// Déclaré avec `var` : le script peut être réinjecté dans une page par la popup
// sans provoquer d'erreur de redéclaration.
var JobTracker = globalThis.JobTracker || (() => {
  const STORAGE_KEY = 'candidatures';
  const LOCAL_KEY = 'job_tracker_candidatures'; // Fallback hors extension (développement)

  const hasChromeStorage = () =>
    typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;

  // --- STOCKAGE ---
  function getAll(callback) {
    if (hasChromeStorage()) {
      chrome.storage.local.get([STORAGE_KEY], (result) => {
        callback(result[STORAGE_KEY] || []);
      });
    } else {
      const data = localStorage.getItem(LOCAL_KEY);
      callback(data ? JSON.parse(data) : []);
    }
  }

  function saveAll(list, callback) {
    if (hasChromeStorage()) {
      chrome.storage.local.set({ [STORAGE_KEY]: list }, () => {
        if (callback) callback();
      });
    } else {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(list));
      if (callback) callback();
    }
  }

  // Lit la version la plus récente du stockage, applique `mutator` puis enregistre.
  // `mutator` renvoie la nouvelle liste, ou null pour annuler l'écriture.
  // Évite d'écraser des ajouts faits ailleurs (widget, popup) avec une copie périmée.
  function update(mutator, callback) {
    getAll((list) => {
      const updated = mutator(list);
      if (!updated) {
        if (callback) callback(false, list);
        return;
      }
      saveAll(updated, () => {
        if (callback) callback(true, updated);
      });
    });
  }

  // Notifie chaque modification de la liste (y compris depuis un autre contexte)
  function onChange(callback) {
    if (hasChromeStorage()) {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes[STORAGE_KEY]) {
          callback(changes[STORAGE_KEY].newValue || []);
        }
      });
    } else {
      window.addEventListener('storage', (e) => {
        if (e.key === LOCAL_KEY) callback(e.newValue ? JSON.parse(e.newValue) : []);
      });
    }
  }

  // --- IDENTIFICATION DES OFFRES ---
  function parseUrl(url) {
    try {
      return new URL(url);
    } catch (e) {
      return null;
    }
  }

  // --- SITES RECONNUS ---
  // `domains` : le domaine lui-même et ses sous-domaines. `names` : noms du site,
  // retirés des titres et des entreprises lus sur la page. `key` : identifiant de
  // l'offre dans l'URL, ou null hors d'une page d'offre. Sur Indeed, LinkedIn et
  // Cadremploi, l'identifiant est dans les paramètres : on ne peut pas les supprimer.
  // Tout domaine ajouté ici doit l'être aussi dans manifest.json.
  const pathPart = (u, regex) => {
    const m = u.pathname.match(regex);
    return m ? m.slice(1).join('/') : null;
  };

  const SITES = [
    {
      id: 'linkedin',
      domains: ['linkedin.com'],
      names: ['linkedin'],
      key: (u) => pathPart(u, /\/jobs\/view\/(?:[^/]*-)?(\d+)/) || u.searchParams.get('currentJobId') || u.searchParams.get('jobId')
    },
    {
      id: 'indeed',
      domains: ['indeed.com', 'indeed.fr'],
      names: ['indeed', 'indeed.com'],
      key: (u) => u.searchParams.get('jk') || u.searchParams.get('vjk') || u.searchParams.get('jobId') || u.searchParams.get('id')
    },
    {
      id: 'wttj',
      domains: ['welcometothejungle.com'],
      names: ['welcome to the jungle'],
      key: (u) => (pathPart(u, /\/companies\/([^/]+)\/jobs\/([^/?#]+)/) || '').toLowerCase()
    },
    {
      id: 'hellowork',
      domains: ['hellowork.com'],
      names: ['hellowork', 'hello work'],
      key: (u) => pathPart(u, /\/emplois\/(\d+)\.html$/)
    },
    {
      id: 'francetravail',
      domains: ['candidat.francetravail.fr'],
      names: ['france travail'],
      key: (u) => (pathPart(u, /\/offres\/recherche\/detail\/([A-Za-z0-9]+)/) || '').toUpperCase()
    },
    {
      id: 'cadremploi',
      domains: ['cadremploi.fr'],
      names: ['cadremploi'],
      key: (u) => (u.pathname.startsWith('/emploi/detail_offre') ? u.searchParams.get('offreId') : null)
    },
    {
      id: 'jobteaser',
      domains: ['jobteaser.com'],
      names: ['jobteaser'],
      key: (u) => (pathPart(u, /\/job-offers\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i) || '').toLowerCase()
    },
    {
      id: 'freework',
      domains: ['free-work.com'],
      names: ['free-work', 'freework'],
      key: (u) => (pathPart(u, /\/tech-it\/job-mission\/([^/]+)\/([^/?#]+)/) || '').toLowerCase()
    }
  ];

  function findSite(u) {
    if (!u) return null;
    const host = u.hostname;
    return SITES.find((s) => s.domains.some((d) => host === d || host.endsWith('.' + d))) || null;
  }

  // Site reconnu de cette URL ({ id, names }), que la page soit une offre ou non
  function siteOf(url) {
    const site = findSite(parseUrl(url));
    return site ? { id: site.id, names: site.names } : null;
  }

  // Identifiant stable d'une offre sur un site reconnu, ou null si l'URL
  // n'est pas une page d'offre.
  function siteJobKey(url) {
    const u = parseUrl(url);
    const site = findSite(u);
    if (!site) return null;
    const key = site.key(u);
    return key ? `${site.id}:${key}` : null;
  }

  // Clé de comparaison d'URL : identifiant du site si connu, sinon URL sans paramètres
  function jobKey(url) {
    if (!url) return '';
    const siteKey = siteJobKey(url);
    if (siteKey) return siteKey;
    const u = parseUrl(url);
    if (!u) return url.split('?')[0].split('#')[0].trim();
    return (u.origin + u.pathname).replace(/\/+$/, '').toLowerCase();
  }

  function isSupportedSite(url) {
    return findSite(parseUrl(url)) !== null;
  }

  const normalize = (str) => String(str || '').trim().toLowerCase();

  // Candidature correspondant à la même offre (par URL) ou, à défaut d'URL,
  // au même poste dans la même entreprise. null si aucune.
  function findDuplicate(list, candidate, excludeId) {
    const key = jobKey(candidate.url);
    const title = normalize(candidate.title);
    const company = normalize(candidate.company);

    const match = list.find((item) => {
      if (excludeId && item.id === excludeId) return false;
      if (key && item.url) return jobKey(item.url) === key;
      return title.length > 0 && normalize(item.title) === title && normalize(item.company) === company;
    });
    return match || null;
  }

  function isDuplicate(list, candidate, excludeId) {
    return findDuplicate(list, candidate, excludeId) !== null;
  }

  // --- CRÉATION ---
  function generateId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'uuid-' + Math.random().toString(36).slice(2, 11) + '-' + Date.now().toString(36);
  }

  // Date du jour au format AAAA-MM-JJ dans le fuseau local (toISOString est en UTC)
  function todayISO() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function createCandidature(fields) {
    return {
      id: generateId(),
      title: '',
      company: '',
      status: 'wishlist',
      dateApplied: todayISO(),
      location: '',
      salary: '',
      url: '',
      contactName: '',
      contactEmail: '',
      contactPhone: '',
      notes: '',
      cv: null,
      ...fields
    };
  }

  // --- RAPPELS ---
  // Valeur stockée : 'AAAA-MM-JJTHH:mm' en heure locale (format d'un input datetime-local)
  const REMINDER_HOUR = 9;
  const pad2 = (n) => String(n).padStart(2, '0');

  function parseReminder(value) {
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value || '');
    if (!m) return null;
    const [y, mo, d, h, mi] = m.slice(1).map(Number);
    const date = new Date(y, mo - 1, d, h, mi);
    // Refuser les valeurs hors limites (mois 13, jour 45…) que Date « corrigerait »
    const valid = date.getFullYear() === y && date.getMonth() === mo - 1 && date.getDate() === d &&
      date.getHours() === h && date.getMinutes() === mi;
    return valid ? date : null;
  }

  function toReminderValue(date) {
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
  }

  // Jour local décalé de n jours, à l'heure donnée (sans ajouter de millisecondes : robuste au changement d'heure)
  function dayAt(now, offsetDays, hours, minutes) {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() + offsetDays, hours, minutes);
  }

  function reminderPresets(now) {
    return {
      tomorrow: toReminderValue(dayAt(now, 1, REMINDER_HOUR, 0)),
      in3days: toReminderValue(dayAt(now, 3, REMINDER_HOUR, 0)),
      in1week: toReminderValue(dayAt(now, 7, REMINDER_HOUR, 0))
    };
  }

  function dueReminders(list, now) {
    return list.filter((c) => {
      const d = parseReminder(c.reminderAt);
      return d !== null && d <= now;
    });
  }

  function nextReminderTime(list, now) {
    let next = null;
    for (const c of list) {
      const d = parseReminder(c.reminderAt);
      if (d && d > now && (next === null || d.getTime() < next)) next = d.getTime();
    }
    return next;
  }

  // « Reporter à demain » : lendemain de maintenant, à l'heure du rappel d'origine
  function snoozeValue(reminderAt, now) {
    const original = parseReminder(reminderAt);
    const hours = original ? original.getHours() : REMINDER_HOUR;
    const minutes = original ? original.getMinutes() : 0;
    return toReminderValue(dayAt(now, 1, hours, minutes));
  }

  // Copie avec le nouveau statut ; passer à « envoyée » sans date renseigne la date du jour
  function applyStatus(candidature, status) {
    const needsDate = status === 'applied' && !candidature.dateApplied;
    return { ...candidature, status, dateApplied: needsDate ? todayISO() : candidature.dateApplied };
  }

  // --- ACTIONS SUR PLUSIEURS CANDIDATURES ---
  // Liste sans les candidatures visées, et chacune avec sa position d'origine
  // (ordre croissant) pour pouvoir annuler.
  function removeByIds(list, ids) {
    const wanted = new Set(ids);
    const removed = [];
    const kept = [];
    list.forEach((item, index) => {
      if (wanted.has(item.id)) removed.push({ item, index });
      else kept.push(item);
    });
    return { list: kept, removed };
  }

  // Annulation : chaque candidature revient à sa position d'origine (ou en fin de liste).
  // Celles déjà présentes sont ignorées ; null s'il n'y a rien à réinsérer.
  function restoreRemoved(list, removed) {
    const present = new Set(list.map((c) => c.id));
    const missing = removed.filter((r) => !present.has(r.item.id)).sort((a, b) => a.index - b.index);
    if (missing.length === 0) return null;
    const next = list.slice();
    for (const { item, index } of missing) next.splice(Math.min(index, next.length), 0, item);
    return next;
  }

  function applyStatusToIds(list, ids, status) {
    const wanted = new Set(ids);
    return list.map((c) => (wanted.has(c.id) ? applyStatus(c, status) : c));
  }

  // --- UTILS ---
  function escapeHTML(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // --- CV ---
  const MAX_CV_SIZE = 10 * 1024 * 1024; // 10 Mo
  const ALLOWED_CV_EXTENSIONS = ['.pdf', '.doc', '.docx'];

  function validateCvFile(file) {
    if (!file) return { valid: false, error: 'Aucun fichier sélectionné' };
    const name = (file.name || '').toLowerCase();
    const hasValidExt = ALLOWED_CV_EXTENSIONS.some((ext) => name.endsWith(ext));
    if (!hasValidExt) {
      return {
        valid: false,
        error: 'Format non supporté. Veuillez choisir un fichier .pdf, .doc ou .docx'
      };
    }
    if (file.size > MAX_CV_SIZE) {
      return {
        valid: false,
        error: 'Le fichier dépasse la limite autorisée de 10 Mo'
      };
    }
    return { valid: true };
  }

  function formatFileSize(bytes) {
    if (!bytes || bytes <= 0) return '0 o';
    if (bytes < 1024) return `${bytes} o`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
  }

  // Assainissement des chaînes pour noms de fichiers (suppression accents et caractères interdits)
  function sanitizeFilename(str) {
    if (!str) return 'fichier';
    const clean = String(str)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Supprimer accents
      .replace(/[/\\:*?"<>|]/g, '_')   // Caractères interdits système
      .replace(/\s+/g, '_')           // Remplacer espaces par _
      .replace(/_+/g, '_')            // Dédupliquer les _
      .replace(/^_+|_+$/g, '');       // Trim les _
    return clean || 'fichier';
  }

  // Chemin cible unique et propre pour un CV dans l'archive ZIP (ex. cv/Acme_Dev_mon-cv.pdf)
  function buildCvZipPath(candidature) {
    const safeCompany = sanitizeFilename(candidature.company || 'Entreprise');
    const safeTitle = sanitizeFilename(candidature.title || 'Poste');
    const origName = (candidature.cv && candidature.cv.name) || 'cv.pdf';
    const lastDot = origName.lastIndexOf('.');
    const baseName = lastDot !== -1 ? origName.slice(0, lastDot) : origName;
    const ext = lastDot !== -1 ? origName.slice(lastDot) : '';
    const safeBaseName = sanitizeFilename(baseName);
    const cleanExt = ext ? '.' + sanitizeFilename(ext.slice(1)) : '';
    return `cv/${safeCompany}_${safeTitle}_${safeBaseName}${cleanExt}`;
  }

  return {
    getAll,
    saveAll,
    update,
    onChange,
    siteOf,
    siteJobKey,
    jobKey,
    isSupportedSite,
    findDuplicate,
    isDuplicate,
    generateId,
    todayISO,
    createCandidature,
    applyStatus,
    removeByIds,
    restoreRemoved,
    applyStatusToIds,
    parseReminder,
    toReminderValue,
    reminderPresets,
    dueReminders,
    nextReminderTime,
    snoozeValue,
    escapeHTML,
    MAX_CV_SIZE,
    ALLOWED_CV_EXTENSIONS,
    validateCvFile,
    formatFileSize,
    sanitizeFilename,
    buildCvZipPath
  };
})();
globalThis.JobTracker = JobTracker;
