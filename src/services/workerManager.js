import FileProcessingWorker from '../workers/fileProcessing.worker.js?worker'

export default class WorkerManager {
  constructor() {
    this.worker = null
    this.messageId = 0
    this.pendingRequests = new Map()
  }

  initialize() {
    if (this.worker) {
      return
    }

    this.worker = new FileProcessingWorker()
    this.worker.onmessage = (e) => {
      const { type, data, id } = e.data
      const request = this.pendingRequests.get(id)

      if (!request) {
        return
      }

      if (type === 'progress' && request.onProgress) {
        request.onProgress(data)
      } else if (type === 'success') {
        request.resolve(data)
        this.pendingRequests.delete(id)
      } else if (type === 'error') {
        request.reject(new Error(data.message))
        this.pendingRequests.delete(id)
      } else if (type === 'cancelled') {
        request.reject(new Error('Operation cancelled'))
        this.pendingRequests.delete(id)
      }
    }

    this.worker.onerror = (err) => {
      console.error('Worker error:', err)
      this.pendingRequests.forEach((request) => {
        request.reject(new Error('Worker error: ' + err.message))
      })
      this.pendingRequests.clear()
    }
  }

  async extractPDFText(arrayBuffer, onProgress) {
    this.initialize()

    const id = this.messageId++
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject, onProgress })
      this.worker.postMessage(
        {
          type: 'extractPDF',
          data: { arrayBuffer },
          id
        },
        [arrayBuffer]
      )
    })
  }

  async chunkByTokens(text, options, onProgress) {
    this.initialize()

    const id = this.messageId++
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject, onProgress })
      this.worker.postMessage({
        type: 'chunkTokens',
        data: { text, options },
        id
      })
    })
  }

  async chunkByParagraphs(text, onProgress) {
    this.initialize()

    const id = this.messageId++
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject, onProgress })
      this.worker.postMessage({
        type: 'chunkParagraphs',
        data: { text },
        id
      })
    })
  }

  cancel() {
    if (this.worker) {
      this.worker.postMessage({ type: 'cancel' })
    }
  }

  terminate() {
    if (this.worker) {
      this.worker.terminate()
      this.worker = null
      this.pendingRequests.clear()
    }
  }
}
