import * as pdfjsLib from 'pdfjs-dist'
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker

/**
 * PDFExtractor - Extracts raw text content from PDF files
 *
 * IMPORTANT: PDFs are layout-based, not structure-based.
 * This extractor does NOT attempt to infer paragraphs.
 * It extracts text in reading order and returns it as a continuous stream.
 *
 * Chunking strategy is handled by TokenChunker, not here.
 */
export default class PDFExtractor {
  /**
   * Extract all text from a PDF file as a single continuous string
   *
   * @param {File} file - PDF file to extract text from
   * @returns {Promise<object>} - {text: string, pageCount: number, pageRanges: array}
   */
  async extractText(file) {
    try {
      const arrayBuffer = await file.arrayBuffer()
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise

      let allText = ''
      const pageRanges = []

      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum)
        const textContent = await page.getTextContent()

        const pageStartChar = allText.length

        // Sort text items by position (top to bottom, left to right)
        const sortedItems = [...textContent.items].sort((a, b) => {
          const yDiff = b.transform[5] - a.transform[5]
          if (Math.abs(yDiff) > 3) return yDiff
          return a.transform[4] - b.transform[4]
        })

        // Group items into lines
        const lines = this._groupIntoLines(sortedItems)

        // Join lines with single newline
        const pageText = lines.map(line => line.text).join('\n')

        // Add page text to full document text
        if (allText.length > 0) {
          allText += '\n\n' // Double newline between pages
        }
        allText += pageText

        const pageEndChar = allText.length

        pageRanges.push({
          page: pageNum,
          startChar: pageStartChar,
          endChar: pageEndChar
        })
      }

      // Normalize hyphenation across line breaks
      allText = this._normalizeHyphenation(allText)

      console.log(`✓ Extracted ${allText.length} characters from ${pdf.numPages} pages`)

      return {
        text: allText,
        pageCount: pdf.numPages,
        pageRanges
      }
    } catch (err) {
      console.error('Error extracting PDF text:', err)
      throw new Error(`Failed to extract PDF text: ${err.message}`)
    }
  }

  /**
   * Group text items into lines based on Y position
   * @private
   */
  _groupIntoLines(items) {
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

      // If Y position changed significantly, start new line
      if (yDiff > sameLineThreshold) {
        if (currentLine.textItems.length > 0) {
          // Sort items in line by X position (left to right)
          currentLine.textItems.sort((a, b) => a.x - b.x)
          lines.push({
            text: currentLine.textItems.map(t => t.str).join(' ').trim(),
            y: currentLine.y
          })
        }
        currentLine = { textItems: [], y: itemY }
      }

      // Add item to current line
      if (item.str.trim().length > 0) {
        currentLine.textItems.push({ str: item.str, x: itemX })
      }
    }

    // Add final line
    if (currentLine.textItems.length > 0) {
      currentLine.textItems.sort((a, b) => a.x - b.x)
      lines.push({
        text: currentLine.textItems.map(t => t.str).join(' ').trim(),
        y: currentLine.y
      })
    }

    return lines
  }

  /**
   * Normalize hyphenation across line breaks
   * Example: "exam-\nple" becomes "example"
   * @private
   */
  _normalizeHyphenation(text) {
    return text.replace(/(\w+)-\s*\n\s*(\w+)/g, '$1$2')
  }

  /**
   * Filter repeating elements (headers/footers) from text
   * This is optional and can be called after extraction
   *
   * @param {string} text - Full text content
   * @param {array} pageRanges - Page range metadata
   * @returns {string} - Filtered text
   */
  filterRepeatingElements(text, pageRanges) {
    // Simple heuristic: if the same line appears on 3+ pages, it's likely a header/footer
    // This is optional and can be enabled if needed
    // For now, we keep all text to ensure no information loss
    return text
  }
}
