// Outils communs des tests de bout en bout : Chrome for Testing avec l'extension chargée.
const path = require('node:path');
const fs = require('node:fs');
const puppeteer = require('puppeteer');

const ROOT = path.resolve(__dirname, '..', '..');
const SHOTS = path.join(__dirname, 'screenshots');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function launch({ width = 1300, height = 900 } = {}) {
  const macChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || (fs.existsSync(macChrome) ? macChrome : undefined);
  const launchOptions = {
    headless: false,
    pipe: true,
    enableExtensions: [ROOT],
    args: [`--window-size=${width},${height}`, '--lang=fr-FR']
  };
  if (executablePath) launchOptions.executablePath = executablePath;

  const browser = await puppeteer.launch(launchOptions);
  const target = await browser.waitForTarget((t) => t.type() === 'service_worker', { timeout: 15000 });
  const extId = new URL(target.url()).host;
  // L'installation ouvre le dashboard : on le ferme pour partir d'un état connu
  await sleep(500);
  for (const p of await browser.pages()) {
    if (p.url().includes('dashboard.html')) await p.close();
  }
  return { browser, extId };
}

async function worker(browser) {
  const target = await browser.waitForTarget((t) => t.type() === 'service_worker');
  return target.worker();
}

async function seed(browser, list) {
  const w = await worker(browser);
  await w.evaluate((l) => chrome.storage.local.set({ candidatures: l }), list);
}

async function readStore(browser) {
  const w = await worker(browser);
  return w.evaluate(async () => (await chrome.storage.local.get('candidatures')).candidatures || []);
}

async function openExtPage(browser, extId, pagePath, { width = 1280, height = 800 } = {}) {
  const page = await browser.newPage();
  await page.setViewport({ width, height });
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  await page.goto(`chrome-extension://${extId}/${pagePath}`, { waitUntil: 'load' });
  return page;
}

async function shot(page, name) {
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
}

// URL d'une vraie offre LinkedIn consultable sans connexion.
// L'accès invité est parfois limité : plusieurs tentatives avec des recherches différentes.
async function findLinkedInJobUrl(browser) {
  const keywords = ['developpeur', 'data', 'designer'];
  for (let attempt = 0; attempt < keywords.length; attempt++) {
    const page = await browser.newPage();
    try {
      await page.goto(`https://www.linkedin.com/jobs/search?keywords=${keywords[attempt]}&location=France`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await sleep(4000);
      const href = await page.evaluate(() => {
        const a = document.querySelector('a.base-card__full-link, a[href*="/jobs/view/"]');
        return a ? a.href : null;
      });
      if (href) {
        const u = new URL(href);
        return u.origin + u.pathname;
      }
    } catch (e) {
      // Nouvelle tentative
    } finally {
      await page.close();
    }
    await sleep(3000 * (attempt + 1));
  }
  throw new Error('Aucune offre LinkedIn trouvée (accès invité bloqué ?)');
}

// Attend un nouvel onglet dont l'URL satisfait le prédicat
async function waitForTab(browser, predicate, timeout = 10000) {
  const target = await browser.waitForTarget((t) => t.type() === 'page' && predicate(t.url()), { timeout });
  return target.url();
}

// --- PAGES ENREGISTRÉES (tests hors ligne) ---
// tests/e2e/pages/ contient de vraies pages d'offre, réduites à l'en-tête et à la fiche JSON-LD.
const PAGES = path.join(__dirname, 'pages');

function readPage(name, { sansFiche = false } = {}) {
  const html = fs.readFileSync(path.join(PAGES, `${name}.html`), 'utf8');
  return sansFiche ? html.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, '') : html;
}

// Sert `html` à la place du document demandé : la page porte l'adresse réelle du site,
// donc le script de contenu s'y exécute, sans aucun accès au réseau.
async function serveFixture(page, html) {
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    if (req.isNavigationRequest() && req.frame() === page.mainFrame()) {
      req.respond({ status: 200, contentType: 'text/html; charset=utf-8', body: html });
    } else if (req.url().startsWith('chrome-extension://')) {
      req.continue();
    } else {
      req.abort();
    }
  });
}

// Ouvre le panneau « Suivre cette offre » et lit ses champs. null si le widget n'apparaît pas.
async function widgetFields(page, timeout = 15000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const fields = await page.evaluate(() => {
      const host = document.getElementById('job-tracker-floating-root');
      const root = host && host.shadowRoot;
      const panel = root && root.querySelector('.wt-form');
      if (!panel) return null;
      if (root.querySelector('.wt-panel').classList.contains('hidden')) root.querySelector('.wt-pill').click();
      const value = (id) => root.getElementById(id).value;
      return { title: value('wt-title'), company: value('wt-company'), location: value('wt-location') };
    });
    if (fields) return fields;
    await sleep(250);
  }
  return null;
}

module.exports = { ROOT, sleep, launch, worker, seed, readStore, openExtPage, shot, findLinkedInJobUrl, waitForTab, readPage, serveFixture, widgetFields };
