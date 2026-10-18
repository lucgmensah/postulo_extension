const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

// Mock minimal de IndexedDB pour environnement Node.js
function createMockIndexedDB() {
  const stores = {};
  return {
    open(dbName, version) {
      const req = {
        onsuccess: null,
        onerror: null,
        onupgradeneeded: null,
        result: null
      };

      setTimeout(() => {
        const db = {
          objectStoreNames: {
            contains: (name) => !!stores[name]
          },
          createObjectStore: (name) => {
            stores[name] = {};
            return stores[name];
          },
          transaction: (name, mode) => {
            return {
              objectStore: (storeName) => {
                const store = stores[storeName] || {};
                return {
                  put: (record) => {
                    const r = { onsuccess: null, onerror: null };
                    setTimeout(() => {
                      store[record.id] = record;
                      if (r.onsuccess) r.onsuccess();
                    }, 0);
                    return r;
                  },
                  get: (id) => {
                    const r = { onsuccess: null, onerror: null, result: null };
                    setTimeout(() => {
                      r.result = store[id] || null;
                      if (r.onsuccess) r.onsuccess();
                    }, 0);
                    return r;
                  },
                  delete: (id) => {
                    const r = { onsuccess: null, onerror: null };
                    setTimeout(() => {
                      delete store[id];
                      if (r.onsuccess) r.onsuccess();
                    }, 0);
                    return r;
                  }
                };
              }
            };
          }
        };

        if (req.onupgradeneeded) {
          req.onupgradeneeded({ target: { result: db } });
        }
        req.result = db;
        if (req.onsuccess) req.onsuccess();
      }, 0);

      return req;
    }
  };
}

test('CvStorage : enregistrement, lecture et suppression', async () => {
  globalThis.indexedDB = createMockIndexedDB();
  require(path.join(__dirname, '..', '..', 'cv-storage.js'));
  const storage = globalThis.CvStorage;
  storage._reset();

  const fakeBlob = { size: 1024, type: 'application/pdf', name: 'mon_cv.pdf' };
  
  // 1. Sauvegarde
  const saved = await storage.save('cand-123', fakeBlob);
  assert.equal(saved.id, 'cand-123');
  assert.equal(saved.name, 'mon_cv.pdf');
  assert.equal(saved.size, 1024);

  // 2. Récupération
  const retrieved = await storage.get('cand-123');
  assert.ok(retrieved);
  assert.equal(retrieved.id, 'cand-123');
  assert.equal(retrieved.name, 'mon_cv.pdf');

  // 3. Suppression
  await storage.delete('cand-123');
  const afterDelete = await storage.get('cand-123');
  assert.equal(afterDelete, null);
});
