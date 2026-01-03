import * as pdfjsLib from 'pdfjs-dist'
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker

/**
 * PDFExtractor - Extracts text content from PDF files
 */
export default class PDFExtractor {
  /**
   * Extract text from a PDF file and return structured chunks
   * @param {File} file - PDF file to extract text from
   * @returns {Promise<Array>} - Array of paragraph chunks with page metadata
   */
  async extractTextAsChunks(file) {
    try {
      const arrayBuffer = await file.arrayBuffer()
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise

      const allChunks = []
      let globalParagraphIndex = 0

      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum)
        const textContent = await page.getTextContent()

        const paragraphs = this._extractParagraphs(textContent.items)

        paragraphs.forEach((paragraphText, pageParaIndex) => {
          allChunks.push({
            id: `page${pageNum}_para${pageParaIndex}`,
            text: paragraphText,
            type: 'paragraph',
            metadata: {
              page: pageNum,
              paragraph: globalParagraphIndex,
              pageParaIndex: pageParaIndex,
              totalPages: pdf.numPages
            }
          })
          globalParagraphIndex++
        })
      }

      console.log(`✓ Extracted ${allChunks.length} paragraphs from ${pdf.numPages} pages`)
      return allChunks
    } catch (err) {
      console.error('Error extracting PDF text:', err)
      throw new Error(`Failed to extract PDF text: ${err.message}`)
    }
  }

  /**
   * Extract text from a PDF file (legacy method - returns plain text)
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
   * Extract paragraphs from PDF text items
   * @private
   * @param {array} items - Text items from PDF.js getTextContent()
   * @returns {Array<string>} - Array of paragraph texts
   */
  _extractParagraphs(items) {
    if (!items || items.length === 0) {
      return []
    }

    const sortedItems = [...items].sort((a, b) => {
      const yDiff = b.transform[5] - a.transform[5]
      if (Math.abs(yDiff) > 3) return yDiff
      return a.transform[4] - b.transform[4]
    })

    const lines = []
    let currentLine = { textItems: [], y: sortedItems[0].transform[5], minX: Infinity }
    const sameLineThreshold = 3

    for (const item of sortedItems) {
      const itemY = item.transform[5]
      const itemX = item.transform[4]
      const yDiff = Math.abs(itemY - currentLine.y)

      if (yDiff > sameLineThreshold) {
        if (currentLine.textItems.length > 0) {
          currentLine.textItems.sort((a, b) => a.x - b.x)
          lines.push({
            text: currentLine.textItems.map(t => t.str).join(' ').trim(),
            y: currentLine.y,
            x: currentLine.minX
          })
        }
        currentLine = { textItems: [], y: itemY, minX: Infinity }
      }

      if (item.str.trim().length > 0) {
        currentLine.textItems.push({ str: item.str, x: itemX })
        currentLine.minX = Math.min(currentLine.minX, itemX)
      }
    }

    if (currentLine.textItems.length > 0) {
      currentLine.textItems.sort((a, b) => a.x - b.x)
      lines.push({
        text: currentLine.textItems.map(t => t.str).join(' ').trim(),
        y: currentLine.y,
        x: currentLine.minX
      })
    }

    if (lines.length === 0) {
      return []
    }

    const lineGaps = []
    for (let i = 1; i < lines.length; i++) {
      const gap = Math.abs(lines[i - 1].y - lines[i].y)
      if (gap > 0 && gap < 50) {
        lineGaps.push(gap)
      }
    }

    let typicalLineHeight = 12
    if (lineGaps.length > 0) {
      lineGaps.sort((a, b) => a - b)
      typicalLineHeight = lineGaps[Math.floor(lineGaps.length / 2)]
    }

    const xPositions = lines.map(l => l.x).filter(x => x !== Infinity)
    let leftMargin = 0
    if (xPositions.length > 0) {
      xPositions.sort((a, b) => a - b)
      leftMargin = xPositions[Math.floor(xPositions.length * 0.1)]
    }

    const paragraphs = []
    let currentParagraph = []

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const prevLine = i > 0 ? lines[i - 1] : null

      let isNewParagraph = false

      if (prevLine) {
        const yGap = Math.abs(prevLine.y - line.y)
        if (yGap > typicalLineHeight * 1.8) {
          isNewParagraph = true
        }

        const xIndent = line.x - leftMargin
        if (xIndent > 15 && yGap > typicalLineHeight * 0.8) {
          isNewParagraph = true
        }
      }

      if (isNewParagraph && currentParagraph.length > 0) {
        paragraphs.push(currentParagraph.join(' ').trim())
        currentParagraph = []
      }

      currentParagraph.push(line.text)
    }

    if (currentParagraph.length > 0) {
      paragraphs.push(currentParagraph.join(' ').trim())
    }

    return paragraphs.filter(p => p.length > 0)
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
    const paragraphs = this._extractParagraphs(items)
    return paragraphs.join('\n\n')
  }
}
