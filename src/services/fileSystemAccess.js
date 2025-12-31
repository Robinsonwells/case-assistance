/**
 * FileSystemAccessManager - File System Access API utilities
 * 
 * What is File System Access API?
 * - Modern browser API for direct file/folder access (with user permission)
 * - More powerful than File Input (can read/write files, access directories)
 * - Requires explicit user permission via picker dialog
 * - Works across browser restarts (persistent access via handles)
 * 
 * Browser Support:
 * - Chrome/Edge 86+
 * - Firefox 111+ (experimental)
 * - Safari 16.4+ (partial support)
 * 
 * Security Model:
 * - User must explicitly grant permission (no background access)
 * - Each operation requires user interaction initially
 * - Subsequent access remembers user's choice
 * 
 * Use Case for Legal Compliance App:
 * - Store documents locally (never uploaded to server)
 * - Full privacy: all processing happens in browser
 * - User maintains complete control of files
 */

/**
 * Request access to a storage directory from the user
 * Shows directory picker dialog - user selects where to store documents
 * 
 * @returns {Promise<FileSystemDirectoryHandle>} - Directory handle with read/write access
 * @throws {DOMException} - If user cancels or browser doesn't support API
 */
export async function getStorageDirectory() {
  try {
    // Check if API is supported
    if (!window.showDirectoryPicker) {
      throw new Error(
        'File System Access API not supported in this browser. ' +
        'Please use Chrome, Edge, or Firefox 111+'
      )
    }

    console.log('Requesting storage directory access...')

    // Show directory picker
    // id: 'legal-storage' persists the user's choice across sessions
    // mode: 'readwrite' allows reading and writing files
    const dirHandle = await window.showDirectoryPicker({
      id: 'legal-storage',
      mode: 'readwrite'
    })

    console.log(`Storage directory access granted: ${dirHandle.name}`)
    return dirHandle
  } catch (err) {
    if (err.name === 'NotAllowedError') {
      throw new Error('Storage access denied. You must grant permission to use this feature.')
    }
    throw new Error(`Failed to get storage directory: ${err.message}`)
  }
}

/**
 * Read text content from a file handle
 * 
 * @param {FileSystemFileHandle} fileHandle - Handle to file to read
 * @returns {Promise<string>} - File text content
 * @throws {DOMException|Error} - If file cannot be read
 */
export async function readTextFile(fileHandle) {
  try {
    if (!fileHandle) {
      throw new Error('File handle is required')
    }

    console.log(`Reading file: ${fileHandle.name}`)

    // Get File object from handle
    const file = await fileHandle.getFile()

    // Read as text
    const text = await file.text()

    console.log(`Successfully read ${text.length} characters from ${fileHandle.name}`)
    return text
  } catch (err) {
    if (err.name === 'NotFoundError') {
      throw new Error(`File not found: ${fileHandle.name}`)
    }
    throw new Error(`Failed to read file: ${err.message}`)
  }
}

/**
 * Write text content to a file handle
 * Creates file if it doesn't exist, overwrites if it does
 * 
 * @param {FileSystemFileHandle} fileHandle - Handle to file to write
 * @param {string} content - Text content to write
 * @returns {Promise<void>}
 * @throws {DOMException|Error} - If write fails
 */
export async function writeTextFile(fileHandle, content) {
  try {
    if (!fileHandle) {
      throw new Error('File handle is required')
    }

    if (typeof content !== 'string') {
      throw new Error('Content must be a string')
    }

    console.log(`Writing ${content.length} characters to ${fileHandle.name}`)

    // Create writable stream
    const writable = await fileHandle.createWritable()

    // Write content
    await writable.write(content)

    // Close and flush to disk
    await writable.close()

    console.log(`Successfully wrote to ${fileHandle.name}`)
  } catch (err) {
    if (err.name === 'NotAllowedError') {
      throw new Error(`Permission denied: cannot write to ${fileHandle.name}`)
    }
    throw new Error(`Failed to write file: ${err.message}`)
  }
}

/**
 * Check if a file exists in a directory
 * Non-destructive check - doesn't create the file
 * 
 * @param {FileSystemDirectoryHandle} dirHandle - Directory to check
 * @param {string} fileName - Name of file to check
 * @returns {Promise<boolean>} - True if file exists, false otherwise
 */
export async function fileExists(dirHandle, fileName) {
  try {
    if (!dirHandle) {
      throw new Error('Directory handle is required')
    }

    if (!fileName || typeof fileName !== 'string') {
      throw new Error('File name must be a non-empty string')
    }

    // Try to get file handle without creating it
    await dirHandle.getFileHandle(fileName)

    console.log(`File exists: ${fileName}`)
    return true
  } catch (err) {
    if (err.name === 'NotFoundError') {
      // File doesn't exist - this is expected
      console.log(`File does not exist: ${fileName}`)
      return false
    }

    if (err.name === 'NotAllowedError') {
      throw new Error('Permission denied: cannot check file')
    }

    throw new Error(`Error checking file existence: ${err.message}`)
  }
}

/**
 * List all files in a directory (non-recursive)
 * Filters out subdirectories - returns only files
 * 
 * @param {FileSystemDirectoryHandle} dirHandle - Directory to list
 * @returns {Promise<array>} - Array of file names (strings)
 * @throws {DOMException|Error} - If directory cannot be read
 */
export async function listFilesInDirectory(dirHandle) {
  try {
    if (!dirHandle) {
      throw new Error('Directory handle is required')
    }

    console.log(`Listing files in directory: ${dirHandle.name}`)

    const fileNames = []

    // Iterate through all entries in directory
    for await (const [name, handle] of dirHandle.entries()) {
      // Only include files, skip directories
      if (handle.kind === 'file') {
        fileNames.push(name)
      }
    }

    console.log(`Found ${fileNames.length} files in ${dirHandle.name}`)
    return fileNames
  } catch (err) {
    if (err.name === 'NotAllowedError') {
      throw new Error('Permission denied: cannot access directory')
    }
    throw new Error(`Failed to list directory: ${err.message}`)
  }
}

/**
 * Delete a file from a directory
 * 
 * @param {FileSystemDirectoryHandle} dirHandle - Directory containing file
 * @param {string} fileName - Name of file to delete
 * @returns {Promise<void>}
 * @throws {DOMException|Error} - If deletion fails
 */
export async function deleteFile(dirHandle, fileName) {
  try {
    if (!dirHandle) {
      throw new Error('Directory handle is required')
    }

    if (!fileName || typeof fileName !== 'string') {
      throw new Error('File name must be a non-empty string')
    }

    console.log(`Deleting file: ${fileName}`)

    // Get file handle and remove it
    await dirHandle.removeEntry(fileName)

    console.log(`Successfully deleted: ${fileName}`)
  } catch (err) {
    if (err.name === 'NotFoundError') {
      throw new Error(`File not found: ${fileName}`)
    }

    if (err.name === 'NotAllowedError') {
      throw new Error('Permission denied: cannot delete file')
    }

    throw new Error(`Failed to delete file: ${err.message}`)
  }
}

/**
 * Create a new file in a directory
 * Fails if file already exists (use writeTextFile to overwrite)
 * 
 * @param {FileSystemDirectoryHandle} dirHandle - Directory to create file in
 * @param {string} fileName - Name of file to create
 * @param {string} initialContent - Initial text content (optional)
 * @returns {Promise<FileSystemFileHandle>} - Handle to created file
 * @throws {DOMException|Error} - If creation fails
 */
export async function createFile(dirHandle, fileName, initialContent = '') {
  try {
    if (!dirHandle) {
      throw new Error('Directory handle is required')
    }

    if (!fileName || typeof fileName !== 'string') {
      throw new Error('File name must be a non-empty string')
    }

    console.log(`Creating file: ${fileName}`)

    // Get or create file handle
    const fileHandle = await dirHandle.getFileHandle(fileName, { create: true })

    // Write initial content if provided
    if (initialContent.length > 0) {
      await writeTextFile(fileHandle, initialContent)
    }

    console.log(`Successfully created: ${fileName}`)
    return fileHandle
  } catch (err) {
    if (err.name === 'NotAllowedError') {
      throw new Error('Permission denied: cannot create file')
    }

    throw new Error(`Failed to create file: ${err.message}`)
  }
}

/**
 * Get file size in bytes
 * 
 * @param {FileSystemFileHandle} fileHandle - Handle to file
 * @returns {Promise<number>} - File size in bytes
 * @throws {DOMException|Error} - If size cannot be determined
 */
export async function getFileSize(fileHandle) {
  try {
    if (!fileHandle) {
      throw new Error('File handle is required')
    }

    const file = await fileHandle.getFile()
    return file.size
  } catch (err) {
    throw new Error(`Failed to get file size: ${err.message}`)
  }
}

/**
 * Get file modification time
 * 
 * @param {FileSystemFileHandle} fileHandle - Handle to file
 * @returns {Promise<Date>} - File last modified date
 * @throws {DOMException|Error} - If time cannot be determined
 */
export async function getFileModificationTime(fileHandle) {
  try {
    if (!fileHandle) {
      throw new Error('File handle is required')
    }

    const file = await fileHandle.getFile()
    return new Date(file.lastModified)
  } catch (err) {
    throw new Error(`Failed to get file modification time: ${err.message}`)
  }
}

/**
 * Check if API is supported in current browser
 * Useful for feature detection
 * 
 * @returns {boolean} - True if File System Access API is supported
 */
export function isFileSystemAccessSupported() {
  return !!window.showDirectoryPicker
}

/**
 * Get browser support information
 * Useful for diagnostics
 * 
 * @returns {object} - Support information
 */
export function getFileSystemAccessInfo() {
  return {
    supported: isFileSystemAccessSupported(),
    apiAvailable: !!window.showDirectoryPicker,
    message: isFileSystemAccessSupported()
      ? 'File System Access API is supported'
      : 'File System Access API not supported in this browser. Use Chrome 86+, Edge 86+, or Firefox 111+'
  }
}
