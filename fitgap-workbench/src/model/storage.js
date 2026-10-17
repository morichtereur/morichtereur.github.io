// IndexedDB autosave (browser only). Every call is wrapped so a locked-down
// browser, private window or file:// quirk degrades to "autosave unavailable"
// instead of breaking the app.
const DB_NAME = 'gbs-fitgap-workbench', STORE = 'sessions', KEY = 'current';

function openDb() {
  return new Promise((resolve, reject) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => { req.result.createObjectStore(STORE); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('IndexedDB blocked'));
    } catch (e) { reject(e); }
  });
}

async function storageSave(session) {
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(JSON.parse(JSON.stringify(session)), KEY);
    tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
  });
  db.close();
}

async function storageLoad() {
  const db = await openDb();
  const value = await new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY);
    req.onsuccess = () => resolve(req.result || null); req.onerror = () => reject(req.error);
  });
  db.close();
  return value;
}

async function storageClear() {
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).delete(KEY);
    tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
  });
  db.close();
}
