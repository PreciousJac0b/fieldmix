/** Saved palettes in IndexedDB, so a painter sets theirs up once. */

import type { Paint } from './color/paints.ts'

export interface SavedPalette {
  name: string
  paints: Paint[]
  savedAt: number
}

const DB = 'fieldmix'
const STORE = 'palettes'

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'name' })
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open()
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function listPalettes(): Promise<SavedPalette[]> {
  try {
    const all = await tx<SavedPalette[]>('readonly', (s) => s.getAll() as IDBRequest<SavedPalette[]>)
    return all.sort((a, b) => b.savedAt - a.savedAt)
  } catch {
    return [] // private mode or storage blocked
  }
}

export async function savePalette(name: string, paints: Paint[]): Promise<void> {
  await tx('readwrite', (s) => s.put({ name, paints, savedAt: Date.now() }))
}

export async function deletePalette(name: string): Promise<void> {
  await tx('readwrite', (s) => s.delete(name))
}
