/**
 * StorageManager - LocalStorage and IndexedDB utilities
 * 
 * Storage Strategy:
 * - localStorage: Small app state (preferences, project list, UI state)
 *   * Limit: ~5-10MB per origin
 *   * Synchronous access
 *   * Good for small, frequently accessed data
 * 
 * - IndexedDB: Large data (embedding cache, chunks, analytics logs)
 *   * Limit: 50GB+ per origin (browser dependent)
 *   * Asynchronous access
 *   * Better for structured data and large datasets
 * 
 * Privacy:
 * - Both are per-origin (domain-specific)
 * - Both are per-browser (not shared across browsers)
 * - Cleared when browser cache is cleared (unless persistent)
 * - IndexedDB can request persistent storage
 * 
 * Use Cases:
 * - localStorage: Recent projects, user preferences, last opened project
 * - IndexedDB: Embedding cache, chunk cache, query history, analytics
 */

/**
 * localStorage utilities for small app state
 */

/**
 * Save data to localStorage
 * Converts object to JSON string
 * 
 * @param {string} key - Storage key
 * @param {any} value - Value to save (will be JSON stringified)
 * @throws {Error} - If quota exceeded or stringify fails
 */
export function saveToLocalStorage(key, value) {
  try {
    if (!key || typeof key !== 'string') {
      throw new Error('Key must be a non-empty string')
    }

    console.log(`Saving to localStorage: ${key}`)

    const jsonString = JSON.stringify(value)
    localStorage.setItem(key, jsonString)

    console.log(`Successfully saved to localStorage: ${key} (${jsonString.length} bytes)`)
  } catch (err) {
    if (err.name === 'QuotaExceededError') {
      throw new Error('localStorage quota exceeded. Please clear some data.')
    }

    if (err instanceof SyntaxError) {
      throw new Error(`Failed to serialize value for key "${key}": ${err.message}`)
    }

    throw new Error(`Failed to save to localStorage: ${err.message}`)
  }
}

/**
 * Load data from localStorage
 * Parses JSON string back to object
 * 
 * @param {string} key - Storage key
 * @returns {any} - Parsed value, or null if not found
 * @throws {Error} - If parse fails
 */
export function loadFromLocalStorage(key) {
  try {
    if (!key || typeof key !== 'string') {
      throw new Error('Key must be a non-empty string')
    }

    console.log(`Loading from localStorage: ${key}`)

    const jsonString = localStorage.getItem(key)

    // Return null if key doesn't exist
    if (jsonString === null) {
      console.log(`Key not found in localStorage: ${key}`)
      return null
    }

    // Parse JSON string
    const value = JSON.parse(jsonString)

    console.log(`Successfully loaded from localStorage: ${key}`)
    return value
  } catch (err) {
    if (err instanceof SyntaxError) {
      throw new Error(`Failed to parse localStorage value for key "${key}": ${err.message}`)
    }

    throw new Error(`Failed to load from localStorage: ${err.message}`)
  }
}

/**
 * Remove data from localStorage
 * 
 * @param {string} key - Storage key
 */
export function removeFromLocalStorage(key) {
  try {
    if (!key || typeof key !== 'string') {
      throw new Error('Key must be a non-empty string')
    }

    console.log(`Removing from localStorage: ${key}`)

    localStorage.removeItem(key)

    console.log(`Successfully removed from localStorage: ${key}`)
  } catch (err) {
    throw new Error(`Failed to remove from localStorage: ${err.message}`)
  }
}

/**
 * Clear all data from localStorage
 * WARNING: This clears EVERYTHING in localStorage
 */
export function clearLocalStorage() {
  try {
    console.warn('Clearing all localStorage data')

    localStorage.clear()

    console.log('Successfully cleared localStorage')
  } catch (err) {
    throw new Error(`Failed to clear localStorage: ${err.message}`)
  }
}

/**
 * Get all keys in localStorage
 * 
 * @returns {array} - Array of storage keys
 */
export function getLocalStorageKeys() {
  try {
    const keys = []

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key) {
        keys.push(key)
      }
    }

    return keys
  } catch (err) {
    throw new Error(`Failed to get localStorage keys: ${err.message}`)
  }
}

/**
 * Get localStorage usage info
 * Estimates size of stored data
 * 
 * @returns {object} - Storage info {estimatedSize, itemCount, itemDetails}
 */
export function getLocalStorageInfo() {
  try {
    let estimatedSize = 0
    const items = []

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key) {
        const value = localStorage.getItem(key)
        const size = key.length + (value ? value.length : 0)
        estimatedSize += size

        items.push({
          key,
          size,
          sizeKB: (size / 1024).toFixed(2)
        })
      }
    }

    return {
      itemCount: localStorage.length,
      estimatedSizeBytes: estimatedSize,
      estimatedSizeMB: (estimatedSize / (1024 * 1024)).toFixed(2),
      items
    }
  } catch (err) {
    throw new Error(`Failed to get localStorage info: ${err.message}`)
  }
}

/**
 * IndexedDB utilities for larger data
 * Uses idb library for easier handling (optional)
 */

// Lazy-loaded IndexedDB instance
let db = null
const DB_NAME = 'legal-app'
const DB_VERSION = 1

/**
 * Initialize IndexedDB
 * Creates database and object stores if they don't exist
 * 
 * @returns {Promise<IDBDatabase>} - Open database instance
 */
export async function initIndexedDB() {
  try {
    // Return existing instance if already initialized
    if (db) {
      return db
    }

    console.log('Initializing IndexedDB...')

    // Open or create database
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)

      request.onerror = () => {
        console.error('IndexedDB open error:', request.error)
        reject(new Error(`Failed to open IndexedDB: ${request.error.message}`))
      }

      request.onsuccess = () => {
        db = request.result
        console.log('IndexedDB initialized successfully')
        resolve(db)
      }

      request.onupgradeneeded = (event) => {
        const database = event.target.result

        // Create object stores if they don't exist
        const stores = ['projects', 'embeddings', 'chunks', 'queryHistory']

        stores.forEach(storeName => {
          if (!database.objectStoreNames.contains(storeName)) {
            database.createObjectStore(storeName, { keyPath: 'id' })
            console.log(`Created object store: ${storeName}`)
          }
        })
      }
    })
  } catch (err) {
    console.error('Error initializing IndexedDB:', err)
    throw new Error(`Failed to initialize IndexedDB: ${err.message}`)
  }
}

/**
 * Save object to IndexedDB
 * 
 * @param {string} storeName - Name of object store
 * @param {object} object - Object to save (must have 'id' property)
 * @returns {Promise<any>} - The saved key
 */
export async function saveToIndexedDB(storeName, object) {
  try {
    if (!storeName || typeof storeName !== 'string') {
      throw new Error('Store name must be a non-empty string')
    }

    if (!object || typeof object !== 'object') {
      throw new Error('Object must be a non-null object')
    }

    if (!object.id) {
      throw new Error('Object must have an "id" property')
    }

    // Initialize DB if needed
    const database = await initIndexedDB()

    console.log(`Saving to IndexedDB store "${storeName}": ${object.id}`)

    return new Promise((resolve, reject) => {
      const transaction = database.transaction(storeName, 'readwrite')
      const store = transaction.objectStore(storeName)
      const request = store.put(object)

      request.onerror = () => {
        console.error('Save error:', request.error)
        reject(new Error(`Failed to save to IndexedDB: ${request.error.message}`))
      }

      request.onsuccess = () => {
        console.log(`Successfully saved to IndexedDB: ${object.id}`)
        resolve(request.result)
      }
    })
  } catch (err) {
    if (err.name === 'QuotaExceededError') {
      throw new Error('IndexedDB quota exceeded. Please clear some data.')
    }

    throw new Error(`Failed to save to IndexedDB: ${err.message}`)
  }
}

/**
 * Load object from IndexedDB
 * 
 * @param {string} storeName - Name of object store
 * @param {string|number} id - Object ID to retrieve
 * @returns {Promise<object|null>} - Retrieved object or null if not found
 */
export async function loadFromIndexedDB(storeName, id) {
  try {
    if (!storeName || typeof storeName !== 'string') {
      throw new Error('Store name must be a non-empty string')
    }

    if (id === undefined || id === null) {
      throw new Error('ID is required')
    }

    // Initialize DB if needed
    const database = await initIndexedDB()

    console.log(`Loading from IndexedDB store "${storeName}": ${id}`)

    return new Promise((resolve, reject) => {
      const transaction = database.transaction(storeName, 'readonly')
      const store = transaction.objectStore(storeName)
      const request = store.get(id)

      request.onerror = () => {
        console.error('Load error:', request.error)
        reject(new Error(`Failed to load from IndexedDB: ${request.error.message}`))
      }

      request.onsuccess = () => {
        if (request.result) {
          console.log(`Successfully loaded from IndexedDB: ${id}`)
        } else {
          console.log(`Object not found in IndexedDB: ${id}`)
        }
        resolve(request.result || null)
      }
    })
  } catch (err) {
    throw new Error(`Failed to load from IndexedDB: ${err.message}`)
  }
}

/**
 * Get all objects from an IndexedDB store
 * 
 * @param {string} storeName - Name of object store
 * @returns {Promise<array>} - Array of all objects in store
 */
export async function getAllFromIndexedDB(storeName) {
  try {
    if (!storeName || typeof storeName !== 'string') {
      throw new Error('Store name must be a non-empty string')
    }

    // Initialize DB if needed
    const database = await initIndexedDB()

    console.log(`Getting all from IndexedDB store: "${storeName}"`)

    return new Promise((resolve, reject) => {
      const transaction = database.transaction(storeName, 'readonly')
      const store = transaction.objectStore(storeName)
      const request = store.getAll()

      request.onerror = () => {
        console.error('GetAll error:', request.error)
        reject(new Error(`Failed to get all from IndexedDB: ${request.error.message}`))
      }

      request.onsuccess = () => {
        console.log(`Retrieved ${request.result.length} objects from IndexedDB store: "${storeName}"`)
        resolve(request.result)
      }
    })
  } catch (err) {
    throw new Error(`Failed to get all from IndexedDB: ${err.message}`)
  }
}

/**
 * Delete object from IndexedDB
 * 
 * @param {string} storeName - Name of object store
 * @param {string|number} id - Object ID to delete
 * @returns {Promise<void>}
 */
export async function deleteFromIndexedDB(storeName, id) {
  try {
    if (!storeName || typeof storeName !== 'string') {
      throw new Error('Store name must be a non-empty string')
    }

    if (id === undefined || id === null) {
      throw new Error('ID is required')
    }

    // Initialize DB if needed
    const database = await initIndexedDB()

    console.log(`Deleting from IndexedDB store "${storeName}": ${id}`)

    return new Promise((resolve, reject) => {
      const transaction = database.transaction(storeName, 'readwrite')
      const store = transaction.objectStore(storeName)
      const request = store.delete(id)

      request.onerror = () => {
        console.error('Delete error:', request.error)
        reject(new Error(`Failed to delete from IndexedDB: ${request.error.message}`))
      }

      request.onsuccess = () => {
        console.log(`Successfully deleted from IndexedDB: ${id}`)
        resolve()
      }
    })
  } catch (err) {
    throw new Error(`Failed to delete from IndexedDB: ${err.message}`)
  }
}

/**
 * Clear entire IndexedDB store
 * 
 * @param {string} storeName - Name of object store to clear
 * @returns {Promise<void>}
 */
export async function clearIndexedDBStore(storeName) {
  try {
    if (!storeName || typeof storeName !== 'string') {
      throw new Error('Store name must be a non-empty string')
    }

    // Initialize DB if needed
    const database = await initIndexedDB()

    console.warn(`Clearing IndexedDB store: "${storeName}"`)

    return new Promise((resolve, reject) => {
      const transaction = database.transaction(storeName, 'readwrite')
      const store = transaction.objectStore(storeName)
      const request = store.clear()

      request.onerror = () => {
        console.error('Clear error:', request.error)
        reject(new Error(`Failed to clear IndexedDB store: ${request.error.message}`))
      }

      request.onsuccess = () => {
        console.log(`Successfully cleared IndexedDB store: "${storeName}"`)
        resolve()
      }
    })
  } catch (err) {
    throw new Error(`Failed to clear IndexedDB store: ${err.message}`)
  }
}

/**
 * Get IndexedDB storage info
 * Estimates storage usage
 * 
 * @returns {Promise<object>} - Storage info
 */
export async function getIndexedDBInfo() {
  try {
    console.log('Getting IndexedDB info...')

    // Initialize DB
    const database = await initIndexedDB()

    const storeNames = Array.from(database.objectStoreNames)
    const storeInfo = {}

    for (const storeName of storeNames) {
      const objects = await getAllFromIndexedDB(storeName)
      storeInfo[storeName] = {
        objectCount: objects.length,
        estimatedSize: JSON.stringify(objects).length
      }
    }

    // Request storage estimate if available
    let storageEstimate = null
    if (navigator.storage && navigator.storage.estimate) {
      try {
        storageEstimate = await navigator.storage.estimate()
      } catch (err) {
        console.warn('Could not get storage estimate:', err.message)
      }
    }

    return {
      stores: storeInfo,
      totalEstimatedBytes: Object.values(storeInfo).reduce((sum, info) => sum + info.estimatedSize, 0),
      browserStorage: storageEstimate
    }
  } catch (err) {
    throw new Error(`Failed to get IndexedDB info: ${err.message}`)
  }
}

/**
 * Check if browser supports IndexedDB
 * 
 * @returns {boolean} - True if supported
 */
export function isIndexedDBSupported() {
  return !!window.indexedDB
}

/**
 * Get storage info for both localStorage and IndexedDB
 * 
 * @returns {Promise<object>} - Combined storage info
 */
export async function getStorageInfo() {
  try {
    const info = {
      localStorage: getLocalStorageInfo(),
      indexedDB: isIndexedDBSupported() ? await getIndexedDBInfo() : null
    }

    return info
  } catch (err) {
    throw new Error(`Failed to get storage info: ${err.message}`)
  }
}
