import { openDB } from 'idb'

const DB_NAME = 'legal-ai-storage'
const DB_VERSION = 1
const STORE_NAME = 'directory-handles'
const HANDLE_KEY = 'root-directory-handle'

async function getDB() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }
  })
}

export async function saveDirectoryHandle(handle) {
  try {
    const db = await getDB()
    await db.put(STORE_NAME, handle, HANDLE_KEY)
    console.log('Directory handle saved to IndexedDB')
  } catch (err) {
    console.error('Failed to save directory handle:', err)
    throw err
  }
}

export async function loadDirectoryHandle() {
  try {
    const db = await getDB()
    const handle = await db.get(STORE_NAME, HANDLE_KEY)

    if (!handle) {
      console.log('No directory handle found in IndexedDB')
      return null
    }

    const permission = await handle.queryPermission({ mode: 'readwrite' })

    if (permission === 'granted') {
      console.log('Directory handle loaded from IndexedDB with granted permission')
      return handle
    }

    const requestedPermission = await handle.requestPermission({ mode: 'readwrite' })

    if (requestedPermission === 'granted') {
      console.log('Directory handle permission re-granted')
      return handle
    }

    console.log('Directory handle permission denied')
    return null
  } catch (err) {
    console.error('Failed to load directory handle:', err)
    return null
  }
}

export async function clearDirectoryHandle() {
  try {
    const db = await getDB()
    await db.delete(STORE_NAME, HANDLE_KEY)
    console.log('Directory handle cleared from IndexedDB')
  } catch (err) {
    console.error('Failed to clear directory handle:', err)
    throw err
  }
}
