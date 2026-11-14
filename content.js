// --- SCRIPT DE CONTENU DE L'EXTENSION AVEC WIDGET INJECTÉ (SHADOW DOM) ---
// Dépend de shared.js, extract.js et ui.js (injectés juste avant, voir manifest.json et popup.js).

(() => {
  // La popup peut réinjecter ce script : ne l'initialiser qu'une seule fois par page
  if (window.__jobTrackerContentLoaded) return;
  window.__jobTrackerContentLoaded = true;

  const ROOT_ID = 'job-tracker-floating-root';
  const FONT_FAMILY = 'JobTrackerJakarta';
  const RENDER_DELAY_MS = 2000; // Laisser le temps aux pages React de rendre l'offre
  const URL_POLL_MS = 1000;
  const SUCCESS_MS = 2000; // durée d'affichage du message de succès

  // Écouter les messages venant de la pop-up
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "getJobDetails") {
      try {
        sendResponse(scrapeJobDetails());
      } catch (e) {
        sendResponse({ success: false, error: e.toString() });
      }
    }
  });

  // Le widget ne s'affiche que sur les sites supportés (pas lors d'une injection par la popup ailleurs)
  if (!JobTracker.isSupportedSite(window.location.href)) return;

  // --- CYCLE DE VIE DU WIDGET ---
  // LinkedIn et Indeed changent d'offre sans recharger la page : on surveille l'URL
  // et on reconstruit le widget quand l'offre affichée change.
  let currentKey = null;
  let currentDetails = null;
  let widgetMode = null; // 'add' ou 'tracked:<id>:<statut>' : état affiché
  let successUntil = 0; // le message de succès reste affiché jusqu'à cette date
  let lastHref = window.location.href;
  let refreshTimer = null;
  let retryCount = 0;
  const MAX_RETRIES = 6;

  function scheduleRefresh(delay = RENDER_DELAY_MS) {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(refreshWidget, delay);
  }

  function refreshWidget() {
    try {
      const details = scrapeJobDetails();
      const isJobPage = !!JobTracker.siteJobKey(window.location.href);
      // Le widget est réservé aux pages d'offre des sites reconnus : une fiche standard
      // trouvée ailleurs (page de recherche, page d'entreprise) ne suffit pas.
      const key = isJobPage && details.success ? JobTracker.jobKey(details.url) : null;

      // Si l'URL correspond à une offre mais que le DOM (React) n'a pas encore fini de charger les détails
      if (isJobPage && !key && retryCount < MAX_RETRIES) {
        retryCount += 1;
        scheduleRefresh(800);
        return;
      }

      if (key === currentKey) return;
      retryCount = 0;

      currentKey = key;
      currentDetails = key ? details : null;
      widgetMode = null;
      removeWidget();
      if (!key) return;

      JobTracker.getAll((list) => {
        // L'utilisateur a pu changer d'offre pendant la lecture du stockage
        if (currentKey === key) syncWidget(list);
      });
    } catch (e) {
      console.error("Erreur lors de l'initialisation du widget de suivi :", e);
    }
  }

  // Affiche l'état correspondant à la liste (offre suivie ou non, statut actuel).
  // Ne reconstruit le widget que si cet état change : un formulaire en cours de saisie est conservé.
  function syncWidget(list) {
    if (!currentKey || !currentDetails || Date.now() < successUntil) return;
    const tracked = JobTracker.findDuplicate(list, currentDetails);
    const mode = tracked ? `tracked:${tracked.id}:${tracked.status}` : 'add';
    if (mode === widgetMode) return;
    widgetMode = mode;
    if (tracked) {
      injectAlreadyTrackedWidget(tracked);
    } else {
      injectFloatingWidget(currentDetails);
    }
  }

  // Ajout, changement de statut ou suppression depuis la popup ou le dashboard
  JobTracker.onChange(syncWidget);

  // Déclenchement réactif : on n'attend pas l'événement `load` complet (retardé par les pubs/trackers)
  scheduleRefresh(500);
  if (document.readyState !== 'complete') {
    window.addEventListener('DOMContentLoaded', () => scheduleRefresh(300), { once: true });
    window.addEventListener('load', () => scheduleRefresh(300), { once: true });
  }

  function onUrlChange() {
    if (window.location.href !== lastHref) {
      lastHref = window.location.href;
      retryCount = 0;
      scheduleRefresh(400);
    }
  }

  window.addEventListener('popstate', onUrlChange);
  window.addEventListener('hashchange', onUrlChange);
  setInterval(onUrlChange, URL_POLL_MS);

  // --- LECTURE DE L'OFFRE ---
  const textOf = (el) => (el ? JobExtract.clean(el.textContent) : '');

  // Premier repère qui donne un texte, dans l'ordre de la liste. Un seul
  // querySelector('a, b, c') renverrait le premier élément du document, et non le
  // premier de la liste : un repère de secours passerait devant les repères précis.
  // Un repère est un sélecteur CSS ou une fonction (racine) → texte.
  function firstText(root, sources) {
    for (const source of sources || []) {
      let value = '';
      try {
        value = typeof source === 'function' ? JobExtract.clean(source(root)) : textOf(root.querySelector(source));
      } catch (e) {
        value = '';
      }
      if (value) return value;
    }
    return '';
  }

  // Un type de contrat ou un salaire n'est pas un lieu : mieux vaut vide que faux
  const NOT_A_PLACE = /€|^(cdi|cdd|stage|alternance|intérim|interim|indépendant|freelance|franchise|temps (plein|partiel))\b/i;
  const placeOnly = (value) => (NOT_A_PLACE.test(JobExtract.clean(value)) ? '' : value);

  // LinkedIn : « Paris, France · il y a 2 jours · 34 candidats » → « Paris, France »
  const linkedinPlace = (selector) => (root) => {
    const el = root.querySelector(selector);
    return el ? el.textContent.trim().split('·')[0].split('  ')[0] : '';
  };

  // Indeed, nouveau panneau : le lieu n'a pas de repère propre. C'est le premier
  // texte du second groupe de la première ligne (après l'entreprise et sa note).
  function indeedHeaderPlace(root) {
    const meta = root.querySelector("[data-testid='company-info-metadata']");
    const row = meta && meta.firstElementChild;
    const group = row && row.children[1];
    return placeOnly(group && group.firstElementChild ? group.firstElementChild.textContent : '');
  }

  // Indeed, recherche : carte de résultat de l'offre affichée dans le panneau
  function indeedCard(testid) {
    const params = new URL(window.location.href).searchParams;
    const jk = params.get('vjk') || params.get('jk');
    const link = jk && document.querySelector(`a[data-jk="${CSS.escape(jk)}"]`);
    const card = link && (link.closest('.job_seen_beacon') || link.closest('li, td'));
    return card ? textOf(card.querySelector(`[data-testid='${testid}']`)) : '';
  }

  // « Télétravail partiel, 69800 Saint-Priest » → « 69800 Saint-Priest »
  function indeedCardPlace() {
    const value = indeedCard('text-location');
    const part = value.split(', ').find((p) => /\d{5}|\((\d{2,3}|2[AB])\)/.test(p));
    return placeOnly(part || value);
  }

  // Welcome to the Jungle : nom déduit de l'adresse, en dernier recours
  function wttjCompanyFromUrl() {
    const match = window.location.pathname.match(/\/companies\/([^/]+)/);
    return match ? match[1].replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : '';
  }

  // France Travail : « Offre d'emploi {poste} - {dép} - {VILLE} - {référence} | France Travail »
  function franceTravailTitle() {
    const m = document.title.match(/^Offre d.emploi (.+) - (\d{2,3}|2[AB]) - (.+) - [A-Z0-9]+ \| France Travail$/);
    return m ? { title: m[1], place: `${m[2]} - ${m[3]}` } : { title: '', place: '' };
  }

  // Repères par site, du plus précis au moins précis. `root` limite la recherche au
  // panneau de l'offre sur les pages « liste + panneau » ; `tidy` retouche le texte trouvé.
  const SCRAPERS = {
    linkedin: {
      title: [
        '.job-details-jobs-unified-top-card__job-title',
        '.jobs-unified-top-card__job-title',
        '.top-card-layout__title',
        '.topcard__title',
        'h1.t-24',
        'h2.t-24',
        '.jobs-details-top-card__job-title',
        '.job-details-jobs-unified-top-card__job-title-link',
        '.jobs-details__main-content h1',
        '.jobs-details__main-content h2',
        '.p5 h1',
        'h1'
      ],
      company: [
        '.topcard__flavor--black-link',
        '.top-card-layout__first-sub-headline a',
        '.job-details-jobs-unified-top-card__company-name a',
        '.jobs-unified-top-card__company-name a',
        '.job-details-jobs-unified-top-card__company-name',
        '.jobs-unified-top-card__company-name',
        '.jobs-unified-top-card__primary-description a',
        '.p5 a',
        "a[href*='/company/']"
      ],
      location: [
        '.topcard__flavor--bullet',
        '.top-card-layout__first-sub-headline .topcard__flavor:not(a)',
        '.job-details-jobs-unified-top-card__bullet',
        '.jobs-unified-top-card__bullet',
        // Vue connectée récente (non vérifiée sur une vraie page)
        '.job-details-jobs-unified-top-card__primary-description-container .tvm__text',
        '.job-details-jobs-unified-top-card__tertiary-description-container .tvm__text',
        '.jobs-unified-top-card__primary-description span',
        '.jobs-details-top-card__bullet'
      ].map(linkedinPlace)
    },

    indeed: {
      root: () => document.querySelector('#jobsearch-ViewjobPaneWrapper'),
      title: [
        "[data-testid='vj-job-title']",
        "[data-testid='jobsearch-JobInfoHeader-title']",
        'h1.jobsearch-JobInfoHeader-title',
        '.jobsearch-JobInfoHeader-title span',
        'h1.jobTitle'
      ],
      company: [
        "[data-testid='desktop-job-header'] a[href*='/cmp/']",
        "[data-testid='inlineHeader-companyName']",
        "[data-company-name='true']",
        'div.jobsearch-CompanyInfoContainer a',
        '.jobsearch-InlineCompanyRating a',
        '.jobsearch-CompanyReview--heading a',
        () => indeedCard('company-name')
      ],
      location: [
        indeedHeaderPlace,
        "[data-testid='job-location']",
        "[data-testid='inlineHeader-companyLocation']",
        '#jobLocationSection',
        '.jobsearch-JobInfoHeader-subtitle div:last-child',
        indeedCardPlace
      ],
      tidy: { title: (value) => value.replace(/\s*-\s*job post$/i, '') }
    },

    wttj: {
      title: ["[data-testid='job-header'] h1 > span:first-child", "[data-testid='job-header-title']"],
      company: [
        "[data-testid='job-header'] h1 a[href*='/companies/']",
        "[data-testid='job-header-company']",
        "a[href*='/companies/'] h4",
        wttjCompanyFromUrl
      ],
      // Dans l'en-tête actuel, le lieu n'est qu'une étiquette parmi d'autres : seule la fiche le donne
      location: [
        "[data-testid='job-metadata-location']",
        "[data-testid='job-header-location']",
        "span[title*='Lieu']",
        'i.wttj-icon-location + span'
      ]
    },

    hellowork: {
      title: ["[data-cy='jobTitle']"],
      company: [
        "h1 a[href*='/entreprises/']",
        // Entreprise sans page dédiée : le reste du titre principal, après le poste
        (root) => {
          const job = textOf(root.querySelector("[data-cy='jobTitle']"));
          const heading = textOf(root.querySelector('h1'));
          return job && heading.startsWith(job) ? heading.slice(job.length) : '';
        }
      ],
      location: [(root) => placeOnly(textOf(root.querySelector('h1 + ul li:first-child')))]
    },

    francetravail: {
      title: ['.sticky-title-container .title', () => franceTravailTitle().title],
      // L'entreprise est souvent absente de l'annonce : le champ se remplit à la main
      company: [],
      location: ['.title-complementary .location', () => franceTravailTitle().place]
    },

    cadremploi: {
      title: ['h1']
    },

    jobteaser: {
      title: ["[data-testid='jobad-DetailView__Heading__title']", 'h1'],
      location: ["[data-testid='jobad-DetailView__CandidacyDetails__Locations']"]
    },

    freework: {
      title: ['h1'],
      tidy: { title: (value) => value.replace(/^Offre d.emploi\s+/i, '') }
    }
  };

  // `success` : la page est une offre (site reconnu, ou fiche standard valide ailleurs).
  // `confident` : le poste vient de la fiche ou d'un repère, pas du titre de la page.
  // Hors offre, les champs restent remplis au mieux pour pré-remplir l'ajout manuel de la popup.
  function scrapeJobDetails() {
    const url = window.location.href;
    const site = JobTracker.siteOf(url);
    const scraper = (site && SCRAPERS[site.id]) || {};
    const root = (scraper.root && scraper.root()) || document;
    const tidy = scraper.tidy || {};
    const read = (field) => {
      const value = firstText(root, scraper[field]);
      return value && tidy[field] ? JobExtract.clean(tidy[field](value)) : value;
    };
    const found = { title: read('title'), company: read('company'), location: read('location') };

    const content = (selector) => {
      const el = document.querySelector(selector);
      return (el && el.getAttribute('content')) || '';
    };
    const ogTitle = content("meta[property='og:title']");
    const fallback = { title: ogTitle || document.title, company: content("meta[property='og:site_name']") };

    // Fiche standard de l'offre, si elle décrit bien l'offre affichée
    const ldTexts = [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) => s.textContent);
    const pageTitles = [found.title, textOf(document.querySelector('h1')), document.title, ogTitle];
    const posting = JobExtract.pickPosting(ldTexts, pageTitles, { pageUrl: url, keyOf: JobTracker.siteJobKey });

    const result = JobExtract.resolve({
      posting,
      found,
      fallback,
      names: site ? site.names : [],
      isJobPage: !!JobTracker.siteJobKey(url)
    });
    return { ...result, url };
  }

  // --- POLICE ---
  // Un @font-face déclaré dans un Shadow DOM n'est pas appliqué par Chrome :
  // on enregistre la police embarquée au niveau du document via l'API FontFace.
  let fontLoaded = false;
  function ensureFont() {
    if (fontLoaded) return;
    fontLoaded = true;
    try {
      const face = new FontFace(
        FONT_FAMILY,
        `url(${chrome.runtime.getURL('fonts/plus-jakarta-sans-latin-wght-normal.woff2')})`,
        { weight: '200 800', display: 'swap' }
      );
      document.fonts.add(face);
      face.load().catch(() => {});
    } catch (e) {
      // Police système en secours
    }
  }

  // --- HÔTE DU WIDGET ---
  const STYLESHEETS = ['tokens.css', 'components.css', 'widget.css'];

  function removeWidget() {
    const existing = document.getElementById(ROOT_ID);
    if (existing) existing.remove();
  }

  // Crée l'hôte Shadow DOM avec les feuilles de style partagées.
  // Le widget reste invisible jusqu'au chargement des styles (pas de flash sans style).
  function createWidgetRoot(html) {
    removeWidget();
    ensureFont();

    const host = document.createElement('div');
    host.id = ROOT_ID;
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: 'open' });

    const container = document.createElement('div');
    container.className = 'widget-container';
    container.style.visibility = 'hidden';
    container.innerHTML = html;

    let pending = STYLESHEETS.length;
    let revealed = false;
    const reveal = () => {
      pending -= 1;
      if (pending <= 0 && !revealed) {
        revealed = true;
        container.style.visibility = '';
      }
    };
    setTimeout(() => {
      if (!revealed) {
        revealed = true;
        container.style.visibility = '';
      }
    }, 400);
    STYLESHEETS.forEach((file) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = chrome.runtime.getURL(file);
      link.addEventListener('load', reveal);
      link.addEventListener('error', reveal);
      shadow.appendChild(link);
    });

    shadow.appendChild(container);
    return { shadow, container };
  }

  const ICONS = {
    briefcase: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="7" width="20" height="14" rx="2"></rect><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"></path></svg>',
    success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><polyline points="16 9 10.5 15 8 12.5"></polyline></svg>'
  };

  // --- WIDGET D'AJOUT ---
  function injectFloatingWidget(details) {
    const esc = JobTracker.escapeHTML;
    const statusOptions = UI.STATUSES
      .map((s) => `<option value="${s.id}"${s.id === 'applied' ? ' selected' : ''}>${esc(s.short)}</option>`)
      .join('');

    const { shadow } = createWidgetRoot(`
      <button type="button" class="wt-pill">${ICONS.briefcase}<span>Suivre cette offre</span></button>

      <div class="wt-panel card hidden" role="dialog" aria-label="Ajouter au suivi">
        <div class="wt-panel__header">
          <span class="logo-dot" aria-hidden="true"></span>
          <span>Postulo</span>
          <button type="button" class="icon-btn wt-close" aria-label="Fermer">${ICONS.close}</button>
        </div>
        <form class="wt-form">
          <div class="wt-field">
            <label class="wt-label" for="wt-title">Poste *</label>
            <input class="input" type="text" id="wt-title" required value="${esc(details.title)}">
          </div>
          <div class="wt-field">
            <label class="wt-label" for="wt-company">Entreprise *</label>
            <input class="input" type="text" id="wt-company" required value="${esc(details.company)}">
          </div>
          <div class="wt-row">
            <div class="wt-field">
              <label class="wt-label" for="wt-status">Statut</label>
              <select class="select" id="wt-status">${statusOptions}</select>
            </div>
            <div class="wt-field">
              <label class="wt-label" for="wt-location">Lieu</label>
              <input class="input" type="text" id="wt-location" value="${esc(details.location)}">
            </div>
          </div>
          <div class="wt-field">
            <label class="wt-label" for="wt-reminder">Me rappeler</label>
            ${UI.reminderSelectHTML('wt-reminder')}
          </div>
          <button type="submit" class="btn btn--primary">Ajouter au suivi</button>
        </form>
      </div>

      <div class="wt-panel card wt-success hidden" role="status">${ICONS.success}<span>Offre ajoutée au suivi</span></div>
    `);

    const pill = shadow.querySelector('.wt-pill');
    const panel = shadow.querySelector('.wt-panel');
    const success = shadow.querySelector('.wt-success');
    const formEl = shadow.querySelector('.wt-form');

    pill.addEventListener('click', () => {
      pill.classList.add('hidden');
      panel.classList.remove('hidden');
      shadow.getElementById('wt-title').focus();
    });

    shadow.querySelector('.wt-close').addEventListener('click', () => {
      panel.classList.add('hidden');
      pill.classList.remove('hidden');
      pill.focus();
    });

    formEl.addEventListener('submit', (e) => {
      e.preventDefault();

      const newJob = JobTracker.createCandidature({
        title: shadow.getElementById('wt-title').value.trim(),
        company: shadow.getElementById('wt-company').value.trim(),
        status: shadow.getElementById('wt-status').value,
        location: shadow.getElementById('wt-location').value.trim(),
        reminderAt: UI.reminderFromPreset(shadow.getElementById('wt-reminder').value),
        url: details.url,
        notes: 'Ajouté automatiquement depuis l\'offre en ligne via le widget.'
      });

      // Réserver l'affichage du succès avant d'écrire : onChange peut arriver
      // avant le retour de l'écriture et remplacerait le widget trop tôt.
      successUntil = Date.now() + SUCCESS_MS;
      const showCurrentState = () => {
        successUntil = 0;
        JobTracker.getAll(syncWidget);
      };

      JobTracker.update((list) => {
        // Vérification de dernière seconde (ajout possible depuis un autre onglet)
        if (JobTracker.isDuplicate(list, newJob)) return null;
        return [newJob, ...list];
      }, (saved) => {
        if (!saved) {
          // Déjà suivie (ajoutée ailleurs entre-temps) : afficher son statut
          showCurrentState();
          return;
        }
        panel.classList.add('hidden');
        success.classList.remove('hidden');
        // Puis l'état de l'offre affichée (« déjà suivie » + statut)
        setTimeout(showCurrentState, SUCCESS_MS);
      });
    });
  }

  // --- WIDGET POUR OFFRE DÉJÀ SUIVIE ---
  function injectAlreadyTrackedWidget(candidature) {
    const { shadow } = createWidgetRoot(`
      <button type="button" class="wt-pill" title="Ouvrir dans le tableau de bord">
        ${ICONS.check}<span>Offre déjà suivie</span>${UI.statusTag(candidature.status)}
      </button>
    `);

    // Une page web ne peut pas ouvrir directement une page de l'extension :
    // on demande au service worker d'ouvrir l'onglet.
    shadow.querySelector('.wt-pill').addEventListener('click', () => {
      try {
        chrome.runtime.sendMessage({ action: 'openDashboard', id: candidature.id });
      } catch (e) {
        // Contexte invalidé (extension rechargée) : recharger la page suffit
        console.warn("Postulo : rechargez la page pour réactiver l'extension.", e);
      }
    });
  }
})();
