// The web app's own copy of everything (Decision 51): one IndexedDB store of
// key → value, read once at start into memory and written behind. The sync
// engine's ports are synchronous, so memory is the truth while the page is open
// and IndexedDB is what survives a reload or going offline.

export interface Kv {
  /** Every stored key and value (called once at start). */
  loadAll(): Promise<Map<string, unknown>>;
  /** Queued: written within a moment, in order. */
  set(key: string, value: unknown): void;
  del(key: string): void;
  /** Resolves when everything queued is on disk. */
  flush(): Promise<void>;
  /** Forget everything (log out). */
  clear(): Promise<void>;
}

/** For tests, and for browsers without IndexedDB (some private windows). */
export function memoryKv(seed?: Map<string, unknown>): Kv & { data: Map<string, unknown> } {
  const data = new Map<string, unknown>(seed);
  return {
    data,
    loadAll: async () => new Map(data),
    set: (k, v) => { data.set(k, v); },
    del: (k) => { data.delete(k); },
    flush: async () => {},
    clear: async () => { data.clear(); },
  };
}

const STORE = 'kv';
const DELETE = Symbol('delete');

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error('IndexedDB request failed'));
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB write failed'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB write aborted'));
  });
}

/** IndexedDB, falling back to memory when the browser refuses it. */
export async function openKv(name = 'krnl0'): Promise<Kv> {
  if (typeof indexedDB === 'undefined') return memoryKv();
  let db: IDBDatabase;
  try {
    const open = indexedDB.open(name, 1);
    open.onupgradeneeded = () => { open.result.createObjectStore(STORE); };
    db = await req(open);
  } catch {
    return memoryKv();
  }

  const queue = new Map<string, unknown>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let writing: Promise<void> = Promise.resolve();

  const write = (): Promise<void> => {
    timer = null;
    if (queue.size === 0) return writing;
    const batch = new Map(queue);
    queue.clear();
    writing = writing.then(async () => {
      const tx = db.transaction(STORE, 'readwrite');
      const s = tx.objectStore(STORE);
      for (const [k, v] of batch) {
        if (v === DELETE) s.delete(k); else s.put(v, k);
      }
      await done(tx);
    }).catch((err: unknown) => {
      console.warn('[web] could not save to this browser:', err instanceof Error ? err.message : err);
    });
    return writing;
  };
  const schedule = (): void => { if (!timer) timer = setTimeout(() => void write(), 40); };
  // Leaving the page: write what is left.
  if (typeof window !== 'undefined') window.addEventListener('pagehide', () => { void write(); });

  return {
    async loadAll() {
      const tx = db.transaction(STORE, 'readonly');
      const s = tx.objectStore(STORE);
      const [keys, values] = await Promise.all([req(s.getAllKeys()), req(s.getAll())]);
      const out = new Map<string, unknown>();
      keys.forEach((k, i) => out.set(String(k), values[i]));
      return out;
    },
    set(k, v) { queue.set(k, v); schedule(); },
    del(k) { queue.set(k, DELETE); schedule(); },
    async flush() { if (timer) clearTimeout(timer); await write(); },
    async clear() {
      queue.clear();
      if (timer) clearTimeout(timer);
      timer = null;
      await writing;
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).clear();
      await done(tx);
    },
  };
}
