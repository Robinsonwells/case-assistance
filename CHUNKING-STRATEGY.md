# Document Chunking Strategy

This document explains the chunking strategy implemented in the Legal AI Compliance application.

## Overview

The application uses **two different chunking strategies** based on document type:

1. **Token-based chunking** for PDFs
2. **Paragraph-based chunking** for structured text documents

This dual-strategy approach solves the fundamental problem that PDFs are layout-based (not structure-based), while other document formats have explicit paragraph structure.

## Why Different Strategies?

### The PDF Problem

PDFs store visual layout instructions, not semantic structure. When extracting text from PDFs:

- There are no "real" paragraphs in the file format
- Text is stored as positioned glyphs (paint instructions)
- Line breaks and spacing are visual, not semantic
- Headers, footers, columns, and lists complicate extraction
- Legal documents have citations, bullets, and dense formatting

**Attempting to infer paragraphs from PDFs causes:**
- Text truncation
- Mid-sentence splits
- False paragraph merges
- Lost citations and footnotes
- Unpredictable behavior

### The Solution

Instead of fighting PDF structure, we accept it and use **deterministic token-based chunking** that:

✅ Guarantees 100% text coverage
✅ Never loses information
✅ Has predictable, stable behavior
✅ Includes overlap to prevent context loss
✅ Works reliably for any PDF

For structured documents (TXT, DOCX, MD), we use **paragraph chunking** because:

✅ Paragraphs already exist in the format
✅ Authors intended these boundaries
✅ Higher semantic quality
✅ Better citation accuracy

## Implementation Details

### PDF Processing (Token-Based)

**File:** `src/services/pdfExtractor.js`, `src/services/tokenChunker.js`

**Process:**
1. Extract all text from PDF as continuous stream
2. Maintain page range metadata
3. Chunk text by token count (not inferred paragraphs)
4. Apply overlap between chunks

**Configuration:**
```javascript
{
  targetTokens: 350,       // Target chunk size (optimized for legal precision)
  maxTokens: 500,          // Maximum chunk size
  minTokens: 200,          // Minimum chunk size (enforced)
  overlapTokens: 50        // Overlap between chunks (~14% of target)
}
```

**Why Smaller Chunks for Legal Documents?**

Research and best practices show that **300-500 tokens** is optimal for:
- High-precision legal/compliance queries
- Preserving statutory context without diluting relevance
- Reducing semantic drift when retrieving many chunks
- Improving cosine similarity precision
- Maintaining citation fidelity

**Why 50 Token Overlap?**

The 10-15% overlap ensures that:
- Concepts split across chunk boundaries remain retrievable
- Legal citations aren't partially lost
- Context is preserved for semantic search
- Minimal redundancy when retrieving large volumes (100+ chunks)
- Prevents retrieval inflation while maintaining boundary protection

**Safety Guarantees:**

1. **Minimum token enforcement**: Final chunks smaller than `minTokens` (200) are merged with the previous chunk to prevent tiny tail chunks
2. **Progress guarantee**: Always advances at least 25% of target size (~88 chars) to prevent infinite loops
3. **No text loss**: 100% coverage of original document guaranteed

**Optimized for Legal Document Retrieval:**

When retrieving large volumes (100+ chunks per query), smaller chunks:
- Reduce semantic drift (one legal concept per chunk)
- Improve cosine similarity precision
- Minimize hallucination risk during synthesis
- Preserve citation accuracy
- Enable pinpoint statutory references

**Metadata Tracked:**
- `chunkIndex`: Chunk position in document
- `tokenStart`, `tokenEnd`: Token position in document
- `charStart`, `charEnd`: Character position in document
- `pageStart`, `pageEnd`: PDF pages spanned by chunk
- `pagesSpanned`: Array of all page numbers

### Structured Document Processing (Paragraph-Based)

**File:** `src/services/documentChunker.js`

**Configuration:**
```javascript
{
  maxParagraphTokens: 500,   // Maximum paragraph size in tokens (aligned with PDF chunks)
  overlapTokens: 50,         // Overlap when splitting oversized paragraphs (~10%)
  charsPerToken: 4           // Approximate characters per token
}
```

**Process:**
1. Split on double newlines (`\n\n`)
2. Each paragraph becomes a chunk
3. Oversized paragraphs (>500 tokens) are split with 50-token overlap
4. Final sub-chunks smaller than 50% of max are merged with previous chunk

**Why Token-Aware Splitting?**

Character-based splitting can create chunks that:
- Exceed model token limits (depending on language/punctuation)
- Are inconsistent with PDF chunking strategy
- Have unpredictable sizes for embedding generation

Token-aware splitting ensures:
- Consistent behavior across document types
- Safe chunk sizes for all downstream processing
- Better memory and performance characteristics

**Why No Auto-Merge?**

Previous versions had "smart" merging heuristics that:
- Checked punctuation
- Analyzed capitalization
- Merged short paragraphs
- Detected sentence fragments

**These were removed because:**
- Paragraphs already represent author intent
- Heuristics introduce unpredictability
- False merges are worse than false splits
- Simplicity = reliability

**Safety Guarantees:**

1. **Minimum size enforcement**: Sub-chunks smaller than 50% of target are merged
2. **Progress guarantee**: Always advances at least 25% of target size
3. **Overlap preservation**: Maintains context across split boundaries

**Metadata Tracked:**
- `paragraphIndex`: Original paragraph number
- `totalParagraphs`: Total paragraphs in document
- `tokenCount`: Approximate token count
- `isSplit`: Whether paragraph was split (oversized)
- `subChunkIndex`: Sub-chunk position (if split)

## Edge Case Handling

### Problem: Tiny Tail Chunks

**Issue:** Final chunk could be very small (e.g., 50 tokens) if document length isn't evenly divisible by target size.

**Solution:**
- PDFs: Merge final chunk with previous if below `minTokens` (200)
- Paragraphs: Merge final sub-chunk with previous if below 50% of `maxParagraphTokens` (250 tokens)

### Problem: Infinite Loops

**Issue:** If overlap >= chunk length, position never advances, causing infinite loop.

**Solution:** Always advance at least 25% of target size, regardless of actual chunk length or overlap.

### Problem: Token Limit Exceeded

**Issue:** Character-based limits can exceed token limits depending on language and punctuation density.

**Solution:** All chunking is now token-aware using approximate `charsPerToken = 4` calculation. Conservative enough to never exceed actual token limits.

## Retrieval Benefits

### Completeness

Token-based chunking with overlap guarantees that:
- Every token appears in at least one chunk
- Most tokens appear in multiple chunks (overlap)
- No information can be silently lost
- RAG retrieval cannot fail due to missing chunks

### Accuracy

The dual strategy provides:
- **PDF**: High recall, guaranteed coverage
- **Structured docs**: High precision, semantic clarity
- **Both**: Proper page/paragraph citations

## Display in UI

When displaying search results, the UI shows:

**For PDFs:**
```
Javery.pdf • Pages 5-6 • Similarity: 52.8%
```

**For structured documents:**
```
contract.txt • Paragraph 12 • Similarity: 87.5%
```

This allows users to:
- Locate exact page/paragraph in source document
- Verify context and accuracy
- Cross-reference with original files

## File Structure

```
src/services/
├── pdfExtractor.js        # PDF text extraction (no paragraph inference)
├── tokenChunker.js        # Token-based chunking with overlap
├── documentChunker.js     # Paragraph-based chunking
└── projectManager.js      # Routes documents to correct chunker
```

## Routing Logic

**In `projectManager.js`:**

```javascript
if (isPDF) {
  // Extract raw text
  const { text, pageRanges } = await pdfExtractor.extractText(file)

  // Chunk by tokens
  chunks = tokenChunker.chunkByTokens(text, metadata)

  // Add page information
  chunks = enrichChunksWithPageInfo(chunks, pageRanges)
} else {
  // Structured document - use paragraphs
  const fileText = await file.text()
  chunks = paragraphChunker.chunkByParagraph(fileText)
}
```

## Performance Characteristics

### PDF Processing
- **Extraction**: O(n) where n = number of text items
- **Chunking**: O(m) where m = text length
- **Memory**: Efficient (processes page-by-page)

### Paragraph Processing
- **Splitting**: O(m) where m = text length
- **Memory**: Entire document in memory (acceptable for text files)

## Testing & Validation

To verify chunking quality:

1. **Coverage Test**: Every character from original document should appear in at least one chunk
2. **Overlap Test**: Verify 300 tokens actually overlap between adjacent chunks
3. **Metadata Test**: Page numbers should be accurate and complete
4. **No Truncation**: Compare original document length with sum of all unique characters in chunks

## Best Practices

### For PDF Documents
✅ Use token-based chunking
✅ Rely on overlap for context
✅ Accept mid-sentence splits
✅ Trust page metadata

❌ Don't try to infer paragraphs
❌ Don't use punctuation heuristics
❌ Don't assume visual layout = semantic structure

### For Structured Documents
✅ Use paragraph boundaries
✅ Trust author's formatting
✅ Keep paragraphs intact

❌ Don't auto-merge paragraphs
❌ Don't use capitalization heuristics
❌ Don't apply PDF logic to text files

## Chunk Size Rationale

### Why 350-500 Tokens for Legal Documents?

Based on RAG best practices and retrieval research:

| Use Case | Ideal Size | Rationale |
|----------|------------|-----------|
| High-precision legal/medical QA | 300-500 tokens | Preserves context without diluting relevance |
| Multi-chunk synthesis (100+ chunks) | 200-400 tokens | Minimizes noise when many chunks retrieved |
| Dense statutes/regulations | 300-500 tokens | Aligns with section-level legal meaning |

### Failure Modes We Avoid

❌ **1,000+ token chunks** → Poor recall, mixed concepts, lower cosine precision
❌ **Sentence-level chunks** → Loss of legal/clinical context
❌ **Heavy overlap (>20%)** → Retrieval inflation, redundancy
❌ **Character-only splitting** → Token limit violations, unpredictable sizes

## Future Considerations

### Potential Enhancements
1. **Semantic overlay**: Optional secondary grouping by embeddings
2. **Table extraction**: Specialized handling for PDF tables
3. **Image text**: OCR integration for scanned PDFs
4. **Multi-column**: Improved column detection for complex layouts
5. **Section-aware chunking**: Detect legal section headers for natural boundaries

### Not Recommended
❌ Increasing chunk size beyond 600 tokens (reduces precision)
❌ Replacing token chunking with paragraph inference (causes PDF text loss)
❌ Global auto-merge across document (unpredictable behavior)
❌ Semantic-only chunking (causes information loss)

## References

- PDF.js documentation: https://mozilla.github.io/pdf.js/
- RAG best practices: Overlap prevents retrieval gaps
- Legal document processing: Precision over aesthetics
