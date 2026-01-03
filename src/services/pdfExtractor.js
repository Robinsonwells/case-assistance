import * as pdfjsLib from 'pdfjs-dist'
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker

/**
 * PDFExtractor - Extracts text content from PDF files
 */
export default class PDFExtractor {
  /**
   * Extract text from a PDF file
   * @param {File} file - PDF file to extract text from
   * @returns {Promise<string>} - Extracted text content
   */
  async extractText(file) {
    try {
      const arrayBuffer = await file.arrayBuffer()
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise

      const textPages = []

      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum)
        const textContent = await page.getTextContent()

        const pageText = this._reconstructPageLayout(textContent.items)
        textPages.push(pageText)
      }

      return textPages.join('\n\n')
    } catch (err) {
      console.error('Error extracting PDF text:', err)
      throw new Error(`Failed to extract PDF text: ${err.message}`)
    }
  }

  /**
   * Reconstruct page layout by detecting line breaks based on Y-position changes
   * This preserves paragraph structure in the extracted text
   *
   * @private
   * @param {array} items - Text items from PDF.js getTextContent()
   * @returns {string} - Reconstructed text with proper line breaks
   */
  _reconstructPageLayout(items) {
    if (!items || items.length === 0) {
      return ''
    }

    const lines = []
    let currentLine = []
    let currentY = items[0].transform[5]
    const lineHeightThreshold = 2

    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      const itemY = item.transform[5]
      const yDiff = Math.abs(itemY - currentY)

      if (yDiff > lineHeightThreshold) {
        if (currentLine.length > 0) {
          lines.push(currentLine.join(' ').trim())
          currentLine = []
        }
        currentY = itemY
      }

      if (item.str.trim().length > 0) {
        currentLine.push(item.str)
      }
    }

    if (currentLine.length > 0) {
      lines.push(currentLine.join(' ').trim())
    }

    const paragraphs = []
    let currentParagraph = []

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      if (line.trim().length === 0) {
        if (currentParagraph.length > 0) {
          paragraphs.push(currentParagraph.join(' '))
          currentParagraph = []
        }
        continue
      }

      currentParagraph.push(line)

      const nextLine = lines[i + 1]
      if (!nextLine) {
        continue
      }

      const trimmedLine = line.trim()
      const endsWithPunctuation = /[.!?]$/.test(trimmedLine)
      const endsWithAbbreviation = /\b(Dr|Mr|Ms|Mrs|Prof|Sr|Jr|Inc|Ltd|Co|Corp|vs|No|Fig|Vol|etc|St|Ave|Dept|Esq|Hon|Rev|Admin|Supp|Cir|App|pg)\.$/.test(trimmedLine)
      const nextStartsWithCapital = /^[A-Z]/.test(nextLine.trim())
      const isShortLine = line.length < 80
      const isHeader = /^[A-Z\s_-]+$/.test(trimmedLine) && line.length < 100

      if (isHeader || (endsWithPunctuation && !endsWithAbbreviation && nextStartsWithCapital && isShortLine)) {
        paragraphs.push(currentParagraph.join(' '))
        currentParagraph = []
      }
    }

    if (currentParagraph.length > 0) {
      paragraphs.push(currentParagraph.join(' '))
    }

    return paragraphs.join('\n\n')
  }
}
