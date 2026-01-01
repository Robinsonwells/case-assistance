import * as pdfjsLib from 'pdfjs-dist'

const WORKER_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/5.4.530/pdf.worker.min.mjs'
pdfjsLib.GlobalWorkerOptions.workerSrc = WORKER_URL

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

        const pageText = textContent.items
          .map(item => item.str)
          .join(' ')

        textPages.push(pageText)
      }

      return textPages.join('\n\n')
    } catch (err) {
      console.error('Error extracting PDF text:', err)
      throw new Error(`Failed to extract PDF text: ${err.message}`)
    }
  }
}
