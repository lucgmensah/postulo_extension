// --- EXTRACTION DES OFFRES : LOGIQUE PURE ---
// Aucun accès à la page : content.js collecte les textes, ce module les interprète.
// Déclaré avec `var` pour supporter la réinjection, comme shared.js.
var JobExtract = globalThis.JobExtract || (() => {
  const clean = (str) => (str == null ? '' : String(str).replace(/\s+/g, ' ').trim());

  // Comparaison de titres : sans casse, sans accents, sans ponctuation
  const fold = (str) => clean(str)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

  // --- FICHES JobPosting (schema.org, publiées en JSON-LD pour les moteurs de recherche) ---
  function isJobPosting(item) {
    if (!item || typeof item !== 'object') return false;
    const type = item['@type'];
    return Array.isArray(type) ? type.includes('JobPosting') : type === 'JobPosting';
  }

  // `texts` : contenu brut des <script type="application/ld+json"> de la page
  function parsePostings(texts) {
    const found = [];
    for (const text of texts || []) {
      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        continue;
      }
      const items = Array.isArray(data) ? data : (data && Array.isArray(data['@graph']) ? data['@graph'] : [data]);
      for (const item of items) {
        if (isJobPosting(item)) found.push(item);
      }
    }
    return found;
  }

  // Première fiche qui décrit l'offre affichée. Sur un site à navigation interne,
  // la fiche présente peut être celle de l'offre précédente : son titre doit se
  // retrouver dans un des titres de la page, et son adresse ne doit pas désigner
  // une autre offre du même site.
  function pickPosting(texts, pageTitles, { pageUrl, keyOf } = {}) {
    const pages = (pageTitles || []).map(fold).filter(Boolean).map((t) => ` ${t} `);
    const pageKey = keyOf && pageUrl ? keyOf(pageUrl) : null;
    for (const posting of parsePostings(texts)) {
      const title = fold(posting.title);
      if (!title || !pages.some((p) => p.includes(` ${title} `))) continue;
      if (pageKey && typeof posting.url === 'string') {
        const key = keyOf(posting.url);
        if (key && key !== pageKey) continue;
      }
      return posting;
    }
    return null;
  }

  // --- LIEU ---
  // Département d'un code postal français ('' si ce n'en est pas un)
  function department(postalCode) {
    const cp = clean(postalCode);
    if (!/^\d{5}$/.test(cp)) return '';
    if (cp.startsWith('97') || cp.startsWith('98')) return cp.slice(0, 3);
    if (cp.startsWith('20')) return Number(cp) < 20200 ? '2A' : '2B';
    return cp.slice(0, 2);
  }

  const SMALL_WORDS = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'sur', 'sous', 'en', 'et', 'aux', 'd', 'l']);

  // « LA ROCHE SUR YON » → « La Roche sur Yon ». Un texte déjà en minuscules n'est pas touché.
  function fixCase(text) {
    if (!text || text !== text.toUpperCase() || text === text.toLowerCase()) return text;
    let first = true;
    return text.toLowerCase().replace(/\p{L}+/gu, (word) => {
      const keepLower = !first && SMALL_WORDS.has(word);
      first = false;
      return keepLower ? word : word[0].toUpperCase() + word.slice(1);
    });
  }

  // Nom français du pays, ou '' pour la France (sous-entendue)
  function countryName(value) {
    const raw = clean(value && typeof value === 'object' ? value.name : value);
    if (!raw || /^(fr|fra|france)$/i.test(raw)) return '';
    if (/^[a-z]{2}$/i.test(raw)) {
      try {
        return new Intl.DisplayNames(['fr'], { type: 'region' }).of(raw.toUpperCase()) || raw;
      } catch (e) {
        return raw;
      }
    }
    return raw;
  }

  // Un lieu de la fiche : objet Place, adresse seule, ou simple texte
  function placeText(place) {
    if (!place) return '';
    if (typeof place === 'string') return clean(place);
    const address = 'address' in place ? place.address : place;
    if (!address) return '';
    if (typeof address === 'string') return clean(address);

    const city = fixCase(clean(address.addressLocality));
    const main = city || clean(address.addressRegion);
    const country = countryName(address.addressCountry);
    if (!main) return country;
    if (country) return `${main}, ${country}`;
    const dept = city ? department(address.postalCode) : '';
    return dept ? `${main} (${dept})` : main;
  }

  function postingLocation(posting) {
    const raw = posting.jobLocation;
    const places = [...new Set((Array.isArray(raw) ? raw : [raw]).map(placeText).filter(Boolean))];
    if (places.length === 0) {
      // TELECOMMUTE accompagné d'un lieu est ignoré : il marque aussi le télétravail partiel
      return /TELECOMMUTE/i.test(String(posting.jobLocationType || '')) ? 'Télétravail' : '';
    }
    return places.length > 1 ? `${places[0]} +${places.length - 1}` : places[0];
  }

  // Texte de lieu lu sur la page : les formes connues sont ramenées à « Ville (département) »,
  // tout le reste est rendu tel quel.
  function normalizeLocation(text) {
    const t = clean(text);
    let m;
    if ((m = t.match(/^(\d{5})\s+(.+)$/)) && department(m[1])) {
      return `${fixCase(m[2])} (${department(m[1])})`; // « 69800 Saint-Priest »
    }
    if ((m = t.match(/^(\d{2,3}|2[ABab])\s*-\s*(.+)$/))) {
      return `${fixCase(m[2])} (${m[1].toUpperCase()})`; // « 59 - DOUAI »
    }
    if ((m = t.match(/^(.+?)\s*-\s*(\d{2,3}|2[ABab])$/))) {
      return `${fixCase(m[1])} (${m[2].toUpperCase()})`; // « Chambéry - 73 »
    }
    return t;
  }

  // --- CHAMPS ---
  function postingFields(posting) {
    if (!posting) return { title: '', company: '', location: '' };
    const org = posting.hiringOrganization;
    return {
      title: clean(posting.title),
      company: clean(org && typeof org === 'object' ? org.name : org),
      location: postingLocation(posting)
    };
  }

  // « Poste - Entreprise | Site » → « Poste - Entreprise » : seul un dernier segment
  // qui contient le nom du site est retiré.
  function stripSiteName(title, names) {
    const t = clean(title);
    const m = t.match(/^(.*\S)\s+[|\-–—]\s+([^|]+)$/);
    if (!m) return t;
    const last = m[2].toLowerCase();
    return (names || []).some((name) => last.includes(name)) ? m[1] : t;
  }

  // Valeur de chaque champ : la fiche, sinon les repères du site (`found`), sinon
  // les secours génériques (`fallback`). Le lieu n'a pas de secours : mieux vaut vide que faux.
  // `confident` : le poste ne vient pas d'un secours. `success` : c'est bien une offre.
  function resolve({ posting = null, found = {}, fallback = {}, names = [], isJobPage = false }) {
    const fiche = postingFields(posting);
    const sure = fiche.title || clean(found.title);
    const title = sure || stripSiteName(fallback.title, names);
    let company = fiche.company || clean(found.company) || clean(fallback.company);
    if (names.includes(company.toLowerCase())) company = '';
    const location = fiche.location || normalizeLocation(found.location);
    return {
      success: !!(title && (isJobPage || posting)),
      confident: !!sure,
      title,
      company,
      location
    };
  }

  return {
    clean,
    parsePostings,
    pickPosting,
    postingFields,
    department,
    normalizeLocation,
    stripSiteName,
    resolve
  };
})();
globalThis.JobExtract = JobExtract;
