// --- GESTION DU STOCKAGE BINAIRE LOCAL DES CVs (INDEXEDDB) ---
var CvStorage = globalThis.CvStorage || (() => {
  const DB_NAME = 'postulo_db';
  const DB_VERSION = 1;
  const STORE_NAME = 'cv_files';

  let dbPromise = null;

  function getDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const idb = globalThis.indexedDB;
      if (!idb) return reject(new Error('IndexedDB non disponible'));
      const req = idb.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  async function save(id, file) {
    if (!id) throw new Error('Identifiant de candidature manquant');
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const record = {
        id,
        file,
        name: file.name || 'cv.pdf',
        type: file.type || 'application/pdf',
        size: file.size || 0,
        updatedAt: new Date().toISOString()
      };
      const req = store.put(record);
      req.onsuccess = () => resolve(record);
      req.onerror = () => reject(req.error);
    });
  }

  async function get(id) {
    if (!id) return null;
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async function remove(id) {
    if (!id) return true;
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(id);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }

  async function openOrDownload(id, fallbackName) {
    const record = await get(id);
    if (!record || !record.file) {
      throw new Error('Fichier introuvable');
    }
    const blob = record.file;
    const url = URL.createObjectURL(blob);
    const isPdf = (record.type || '').includes('pdf') || (record.name || '').toLowerCase().endsWith('.pdf');

    if (isPdf && typeof window !== 'undefined' && window.open) {
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } else if (typeof document !== 'undefined') {
      const a = document.createElement('a');
      a.href = url;
      a.download = record.name || fallbackName || 'cv';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    return url;
  }

  return {
    save,
    get,
    delete: remove,
    openOrDownload,
    _reset: () => { dbPromise = null; }
  };
})();

globalThis.CvStorage = CvStorage;
