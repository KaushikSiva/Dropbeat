import type { CueEvent, StudioMode, VisualCue } from "./types";
export interface SavedTake { id: string; title: string; createdAt: string; duration: number; mode: StudioMode; cues: CueEvent[]; blob: Blob; prompt?: string; style?: string; exportId?: string; refinementId?: string; refinementSummary?: string; }
const desktop = () => typeof window !== "undefined" && Boolean(window.reproclipDesktop);
const endpoint = "/create/music-video/api/takes";
async function localRequest(url: string, options?: RequestInit) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error("Local take storage is unavailable. Download your take to keep it.");
  return response;
}
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("kriya-music-video", 2);
    request.onupgradeneeded = () => {
      for (const name of ["takes", "pictures"]) if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
}
export async function saveTake(take: SavedTake) {
  if (desktop()) {
    const { blob, ...metadata } = take;
    const form = new FormData(); form.set("metadata", JSON.stringify(metadata)); form.set("media", blob, "take.webm");
    await localRequest(endpoint, { method: "POST", body: form }); return;
  }
  const db = await database();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction("takes", "readwrite"); tx.objectStore("takes").put(take);
    tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => { db.close(); reject(tx.error); }; tx.onabort = () => { db.close(); reject(tx.error); };
  });
}
export async function listTakes(): Promise<SavedTake[]> {
  if (desktop()) {
    const items = await (await localRequest(endpoint)).json() as (Omit<SavedTake, "blob"> & { mimeType: string })[];
    const takes = await Promise.all(items.map(async item => ({ ...item, blob: new Blob([await (await localRequest(`${endpoint}?id=${encodeURIComponent(item.id)}`)).arrayBuffer()], { type: item.mimeType }) })));
    return takes.sort((a,b) => b.createdAt.localeCompare(a.createdAt));
  }
  const db = await database();
  return new Promise((resolve, reject) => {
    const request = db.transaction("takes").objectStore("takes").getAll();
    request.onsuccess = () => { db.close(); resolve((request.result as SavedTake[]).sort((a,b) => b.createdAt.localeCompare(a.createdAt))); };
    request.onerror = () => { db.close(); reject(request.error); };
  });
}
export async function deleteTake(id: string) {
  if (desktop()) { await localRequest(`${endpoint}?id=${encodeURIComponent(id)}`, { method: "DELETE" }); return; }
  const db = await database();
  return new Promise<void>((resolve,reject) => { const tx = db.transaction("takes", "readwrite"); tx.objectStore("takes").delete(id); tx.oncomplete=()=>{db.close();resolve();}; tx.onerror=()=>{db.close();reject(tx.error);}; });
}

export async function savePicture(picture: VisualCue) {
  const db = await database();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction("pictures", "readwrite"); tx.objectStore("pictures").put(picture);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = tx.onabort = () => { db.close(); reject(tx.error); };
  });
}
export async function listPictures(): Promise<VisualCue[]> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const request = db.transaction("pictures").objectStore("pictures").getAll();
    request.onsuccess = () => { db.close(); resolve(request.result as VisualCue[]); };
    request.onerror = () => { db.close(); reject(request.error); };
  });
}
