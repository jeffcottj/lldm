export interface ReconnectRecord {
  readonly room_id: string;
  readonly participant_id: string;
  readonly connection_id: string;
  readonly reconnect_token: string;
  readonly expires_at: string;
  readonly view_revision: number;
}

const DATABASE = "lldm-reconnect-v1";
const STORE = "rooms";

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore(STORE, { keyPath: "room_id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(new Error("Reconnect storage is unavailable."));
  });
}

export async function loadReconnect(
  roomId: string,
): Promise<ReconnectRecord | null> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE).objectStore(STORE).get(roomId);
    request.onsuccess = () =>
      resolve((request.result as ReconnectRecord | undefined) ?? null);
    request.onerror = () =>
      reject(new Error("Reconnect record could not be read."));
  });
}

export async function storeReconnect(record: ReconnectRecord): Promise<void> {
  const db = await database();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE, "readwrite");
    transaction.objectStore(STORE).put(record);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(new Error("Reconnect record could not be stored."));
  });
}

export async function clearReconnect(roomId: string): Promise<void> {
  const db = await database();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE, "readwrite");
    transaction.objectStore(STORE).delete(roomId);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(new Error("Reconnect record could not be cleared."));
  });
}
