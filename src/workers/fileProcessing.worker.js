import * as pdfjsLib from 'pdfjs-dist'
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { pipeline, env } from '@xenova/transformers'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker

// Configure transformers.js for Web Worker
env.allowLocalModels = false
env.useBrowserCache = true

class FileProcessingWorker {
  constructor() {
    this.cancelled = false
    this.embeddingExtractor = null
    this.embeddingDevice = null
  }

  async extractPDFText(arrayBuffer, onProgress) {
    try {
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise

      let allText = ''
      const pageRanges = []

      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        if (this.cancelled) {
          throw new Error('Operation cancelled')
        }

        const page = await pdf.getPage(pageNum)
        const textContent = await page.getTextContent()

        const pageStartChar = allText.length

        const sortedItems = [...textContent.items].sort((a, b) => {
          const yDiff = b.transform[5] - a.transform[5]
          if (Math.abs(yDiff) > 3) return yDiff
          return a.transform[4] - b.transform[4]
        })

        const lines = this.groupIntoLines(sortedItems)
        const pageText = lines.map(line => line.text).join('\n')

        if (allText.length > 0) {
          allText += '\n\n'
        }
        allText += pageText

        const pageEndChar = allText.length

        pageRanges.push({
          page: pageNum,
          startChar: pageStartChar,
          endChar: pageEndChar
        })

        onProgress({
          type: 'pdf_extraction_progress',
          current: pageNum,
          total: pdf.numPages,
          percentage: Math.round((pageNum / pdf.numPages) * 100)
        })

        await this.yieldToMainThread()
      }

      allText = this.normalizeHyphenation(allText)

      return {
        text: allText,
        pageCount: pdf.numPages,
        pageRanges
      }
    } catch (err) {
      throw new Error(`PDF extraction failed: ${err.message}`)
    }
  }

  groupIntoLines(items) {
    if (!items || items.length === 0) {
      return []
    }

    const lines = []
    let currentLine = { textItems: [], y: items[0].transform[5] }
    const sameLineThreshold = 3

    for (const item of items) {
      const itemY = item.transform[5]
      const itemX = item.transform[4]
      const yDiff = Math.abs(itemY - currentLine.y)

      if (yDiff > sameLineThreshold) {
        if (currentLine.textItems.length > 0) {
          currentLine.textItems.sort((a, b) => a.x - b.x)
          lines.push({
            text: currentLine.textItems.map(t => t.str).join(' ').trim(),
            y: currentLine.y
          })
        }
        currentLine = { textItems: [], y: itemY }
      }

      if (item.str.trim().length > 0) {
        currentLine.textItems.push({ str: item.str, x: itemX })
      }
    }

    if (currentLine.textItems.length > 0) {
      currentLine.textItems.sort((a, b) => a.x - b.x)
      lines.push({
        text: currentLine.textItems.map(t => t.str).join(' ').trim(),
        y: currentLine.y
      })
    }

    return lines
  }
 
  normalizeHyphenation(text) {
    return text.replace(/(\w+)-\s*\n\s*(\w+)/g, '$1$2')
  }

  chunkByTokens(text, options, onProgress) {
    const targetTokens = 350
    const maxTokens = 500
    const minTokens = 250
    const overlapTokens = 50

    const estimatedCharsPerToken = 4
    const targetChars = targetTokens * estimatedCharsPerToken
    const overlapChars = overlapTokens * estimatedCharsPerToken

    const chunks = []
    let position = 0
    let chunkIndex = 0

    const totalLength = text.length
    const estimatedChunks = Math.ceil(totalLength / targetChars)

    while (position < text.length) {
      if (this.cancelled) {
        throw new Error('Operation cancelled')
      }

      let endPosition = Math.min(position + targetChars, text.length)

      if (endPosition < text.length) {
        const searchStart = Math.max(position, endPosition - 200)
        const searchEnd = Math.min(text.length, endPosition + 200)
        const searchText = text.substring(searchStart, searchEnd)

        const boundaryPatterns = [
          /\n\n/g,
          /\.\s+/g,
          /\n/g,
          /[.!?]\s/g
        ]

        let bestBoundary = -1
        for (const pattern of boundaryPatterns) {
          pattern.lastIndex = 0
          let match
          while ((match = pattern.exec(searchText)) !== null) {
            const absolutePos = searchStart + match.index + match[0].length
            if (Math.abs(absolutePos - endPosition) < Math.abs(bestBoundary - endPosition)) {
              bestBoundary = absolutePos
            }
          }
          if (bestBoundary !== -1) break
        }

        if (bestBoundary !== -1) {
          endPosition = bestBoundary
        }
      }

      const chunkText = text.substring(position, endPosition).trim()

      if (chunkText.length > 0) {
        chunks.push({
          text: chunkText,
          metadata: {
            chunkIndex,
            charStart: position,
            charEnd: endPosition,
            sourceFile: options.sourceFile,
            pageCount: options.pageCount,
            documentType: options.documentType
          }
        })
        chunkIndex++
      }

      onProgress({
        type: 'chunking_progress',
        current: chunkIndex,
        total: estimatedChunks,
        percentage: Math.round((position / totalLength) * 100)
      })

      position = Math.max(position + 1, endPosition - overlapChars)
    }

    return chunks
  }

  chunkByParagraph(text, onProgress) {
    const paragraphs = text.split(/\n\s*\n+/)
    const chunks = []
    let chunkIndex = 0

    for (let i = 0; i < paragraphs.length; i++) {
      if (this.cancelled) {
        throw new Error('Operation cancelled')
      }

      const para = paragraphs[i].trim()
      if (para.length === 0) continue

      chunks.push({
        text: para,
        metadata: {
          chunkIndex,
          paragraphIndex: i,
          chunkingStrategy: 'paragraph'
        }
      })
      chunkIndex++

      if (i % 10 === 0) {
        onProgress({
          type: 'chunking_progress',
          current: i,
          total: paragraphs.length,
          percentage: Math.round((i / paragraphs.length) * 100)
        })
      }
    }

    return chunks
  }

  async initializeEmbeddings() {
    if (this.embeddingExtractor) {
      return { device: this.embeddingDevice }
    }

    try {
      // Detect device capability
      const device = await this.detectDevice()
      this.embeddingDevice = device

      // Try to load with appropriate dtype
      let dtype = 'q8'
      if (device === 'webgpu') {
        try {
          this.embeddingExtractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
            device: device,
            dtype: 'fp16'
          })
          dtype = 'fp16'
        } catch (err) {
          console.warn('fp16 not supported, falling back to fp32')
          this.embeddingExtractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
            device: device,
            dtype: 'fp32'
          })
          dtype = 'fp32'
        }
      } else {
        this.embeddingExtractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
          device: device,
          dtype: dtype
        })
      }

      return { device, dtype }
    } catch (err) {
      throw new Error(`Failed to initialize embeddings: ${err.message}`)
    }
  }

  async detectDevice() {
    // Try WebGPU first
    if (navigator.gpu) {
      try {
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const adapter = await navigator.gpu.requestAdapter({
              powerPreference: 'high-performance'
            })
            if (adapter) {
              return 'webgpu'
            }
          } catch (err) {
            if (attempt < 2) {
              await new Promise(resolve => setTimeout(resolve, 500))
            }
          }
        }
      } catch (err) {
        console.warn('WebGPU not available:', err.message)
      }
    }

    // Fall back to WASM
    return 'wasm'
  }

  async generateEmbeddings(textArray, options = {}) {
    try {
      // Initialize model
      await this.initializeEmbeddings()

      const batchSize = options.batchSize || (this.embeddingDevice === 'webgpu' ? 32 : 16)
      const embeddings = []
      const totalBatches = Math.ceil(textArray.length / batchSize)
      let processed = 0
      let lastLoggedPercentage = -1

      // Process in batches
      for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
        if (this.cancelled) {
          throw new Error('Embedding generation cancelled')
        }

        // Get batch slice
        const start = batchIndex * batchSize
        const end = Math.min(start + batchSize, textArray.length)
        const batch = textArray.slice(start, end)

        // Process batch in parallel
        const batchResults = await Promise.all(
          batch.map(text => this.generateSingleEmbedding(text))
        )

        // Convert Float32Arrays to regular arrays for transfer
        embeddings.push(...batchResults.map(arr => Array.from(arr)))

        // Update progress
        processed = end
        const percentage = Math.round((processed / textArray.length) * 100)

        // Report progress only when percentage changes
        if (percentage !== lastLoggedPercentage && options.onProgress) {
          options.onProgress({
            type: 'embedding_progress',
            current: processed,
            total: textArray.length,
            percentage
          })
          lastLoggedPercentage = percentage
        }

        // Yield every few batches
        if (batchIndex % 3 === 0 && batchIndex < totalBatches - 1) {
          await this.yieldToMainThread()
        }
      }

      return embeddings
    } catch (err) {
      throw new Error(`Failed to generate embeddings: ${err.message}`)
    }
  }

  async generateSingleEmbedding(text) {
    if (!text || typeof text !== 'string') {
      throw new Error('Text must be a non-empty string')
    }

    const result = await this.embeddingExtractor(text, {
      pooling: 'mean',
      normalize: true
    })

    return result.data
  }

  async yieldToMainThread() {
    return new Promise(resolve => setTimeout(resolve, 0))
  }

  cancel() {
    this.cancelled = true
  }
}

const workerInstance = new FileProcessingWorker()

self.onmessage = async (e) => {
  const { type, data, id } = e.data

  try {
    if (type === 'extractPDF') {
      const result = await workerInstance.extractPDFText(
        data.arrayBuffer,
        (progress) => {
          self.postMessage({ type: 'progress', data: progress, id })
        }
      )
      self.postMessage({ type: 'success', data: result, id })
    } else if (type === 'chunkTokens') {
      const result = workerInstance.chunkByTokens(
        data.text,
        data.options,
        (progress) => {
          self.postMessage({ type: 'progress', data: progress, id })
        }
      )
      self.postMessage({ type: 'success', data: result, id })
    } else if (type === 'chunkParagraphs') {
      const result = workerInstance.chunkByParagraph(
        data.text,
        (progress) => {
          self.postMessage({ type: 'progress', data: progress, id })
        }
      )
      self.postMessage({ type: 'success', data: result, id })
    } else if (type === 'generateEmbeddings') {
      const result = await workerInstance.generateEmbeddings(
        data.textArray,
        {
          batchSize: data.batchSize,
          onProgress: (progress) => {
            self.postMessage({ type: 'progress', data: progress, id })
          }
        }
      )
      self.postMessage({ type: 'success', data: result, id })
    } else if (type === 'generateSingleEmbedding') {
      await workerInstance.initializeEmbeddings()
      const embedding = await workerInstance.generateSingleEmbedding(data.text)
      // Convert Float32Array to regular array for transfer
      self.postMessage({ type: 'success', data: Array.from(embedding), id })
    } else if (type === 'initializeEmbeddings') {
      const result = await workerInstance.initializeEmbeddings()
      self.postMessage({ type: 'success', data: result, id })
    } else if (type === 'cancel') {
      workerInstance.cancel()
      self.postMessage({ type: 'cancelled', id })
    }
  } catch (err) {
    self.postMessage({
      type: 'error',
      data: { message: err.message },
      id
    })
  }
}
