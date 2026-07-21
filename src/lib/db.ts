/**
 * Local-first хранилище. В зале часто нет сети, поэтому пишем в IndexedDB
 * и синкаем в Supabase отдельно. См. SPEC.md §2.6.
 *
 * Пока это key-value поверх одного стора — синхронизации ещё нет.
 * Когда появится Supabase, сюда добавится очередь исходящих изменений.
 */

const DB_NAME = "repeat";
const DB_VERSION = 1;
const STORE = "kv";

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

function tx<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(STORE, mode);
        const request = run(transaction.objectStore(STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      }),
  );
}

export function get<T>(key: string): Promise<T | undefined> {
  return tx<T | undefined>("readonly", (store) => store.get(key));
}

export function set(key: string, value: unknown): Promise<void> {
  return tx("readwrite", (store) => store.put(value, key)).then(() => undefined);
}

export function del(key: string): Promise<void> {
  return tx("readwrite", (store) => store.delete(key)).then(() => undefined);
}

export function keys(): Promise<string[]> {
  return tx<IDBValidKey[]>("readonly", (store) => store.getAllKeys()).then(
    (result) => result.map(String),
  );
}
