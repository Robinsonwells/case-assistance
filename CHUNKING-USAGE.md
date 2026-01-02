# Sentence-Based Chunking Usage Guide

## Overview

The DocumentChunker uses **continuous sentence accumulation with sliding windows** and **legal header preservation**. This creates consistent 6-sentence chunks with 2-sentence overlap, regardless of paragraph structure.

## Chunking Strategy

### Sentence Accumulator with Sliding Window

The chunker uses a **continuous sentence buffer** that accumulates sentences across paragraph boundaries until reaching the target chunk size (default: 6 sentences), then creates overlapping chunks.

**How It Works:**

1. **Accumulate**: Sentences from all paragraphs are added to a buffer
2. **Chunk**: When buffer reaches 6 sentences, create a chunk
3. **Slide**: Remove 4 sentences (6 - 2 overlap), keep 2 for next chunk
4. **Repeat**: Continue accumulating and chunking throughout document
5. **Flush**: Remaining sentences become final chunk

**Configuration:**
- Window Size: 6 sentences (customizable)
- Overlap: 2 sentences (customizable)
- Step: 4 sentences (windowSize - overlap)

**Example Flow:**

```
Document sentences: S1 S2 S3 S4 S5 S6 S7 S8 S9 S10 S11 S12

Buffer accumulates: [S1, S2, S3, S4, S5, S6]
→ Chunk 1: [S1, S2, S3, S4, S5, S6]
→ Slide by 4, keep [S5, S6] in buffer

Buffer continues: [S5, S6, S7, S8, S9, S10]
→ Chunk 2: [S5, S6, S7, S8, S9, S10] (overlaps with Chunk 1)
→ Slide by 4, keep [S9, S10] in buffer

Buffer continues: [S9, S10, S11, S12]
→ Chunk 3: [S9, S10, S11, S12] (final chunk, less than 6 sentences)
```

**Benefits:**

- **Consistent Size**: All chunks (except the last) have exactly 6 sentences
- **Paragraph Agnostic**: Works with any paragraph structure (handles legal PDFs with frequent line breaks)
- **Continuous Context**: 2-sentence overlap preserves context between chunks
- **No Information Loss**: Every sentence appears in at least one chunk

## Legal Header Preservation

**NEW:** Document headers (case numbers, page numbers, court identifiers) are now preserved as compact context prefixes.

### How It Works

Headers like:
```
No. 12-3834
Page 3
```

Are automatically detected and attached to the following content:
```
[No. 12-3834 | Page 3] Plaintiff's job as a software engineer...
```

### Recognized Header Types

- Case numbers: `No. 12-3834`, `Case No. 2023-1234`
- Page numbers: `Page 3`, `Page 12 of 45`
- Court identifiers: `UNITED STATES COURT OF APPEALS`
- Case names: `Smith v. Jones`
- Date stamps: `Filed: January 1, 2023`
- Section headers: `BACKGROUND`, `OPINION` (all-caps)

### Extracting Metadata

Use the `extractMetadata()` helper to separate headers from content:

```javascript
const { metadata, content } = chunker.extractMetadata(chunk.text)

// metadata: "No. 12-3834 | Page 3" (or null if no header)
// content: "Plaintiff's job as a software engineer..."
// full: original text with header prefix
```

### Benefits

- **Traceability**: Every chunk knows its source case and page
- **Better Search**: Headers provide additional context for semantic search
- **No Loss**: All document metadata preserved in compact format

See `HEADER-PRESERVATION.md` for detailed examples and implementation details.

## Usage

### Basic Usage
```javascript
import DocumentChunker from './src/services/documentChunker.js'

const chunker = new DocumentChunker()
const text = "Your legal document here..."

// Use default settings (6 sentences, 2 overlap)
const chunks = chunker.chunkHybrid(text)

// Or customize window size and overlap
const chunks = chunker.chunkHybrid(text, 8, 3) // 8 sentences, 3 overlap
```

### Accessing Chunk Metadata
```javascript
chunks.forEach(chunk => {
  console.log('ID:', chunk.id)
  console.log('Type:', chunk.type)
  console.log('Text:', chunk.text)
  console.log('Metadata:', chunk.metadata)
  // metadata includes:
  // - paragraph: paragraph index
  // - chunkIndex: chunk index within paragraph
  // - sentenceStart: starting sentence index
  // - sentenceEnd: ending sentence index
  // - sentenceCount: number of sentences
  // - isBuffered: true if from merged small paragraph
  // - overlapWith: ID of previous overlapping chunk (or null)
})
```

### Getting Statistics
```javascript
// Basic statistics
const stats = chunker.getChunkStats(chunks)
console.log('Total Chunks:', stats.totalChunks)
console.log('Average Size:', stats.averageChunkSize)
console.log('By Type:', stats.byType)

// Detailed strategy statistics
const strategy = chunker.getChunkingStrategy(chunks)
console.log('Strategy:', strategy.strategy)
console.log('Buffered Chunks:', strategy.byBuffered.buffered)
console.log('Sentence Stats:', strategy.sentenceStats)
console.log('Overlap Stats:', strategy.overlapStats)
```

## Chunk Types

| Type | Description | Buffered | Example |
|------|-------------|----------|---------|
| `merged_small_paragraphs` | Small paragraph merged with next | Yes | "Title. Content follows." |
| `single_paragraph` | Just-right paragraph kept intact | No | 3-5 sentence paragraph |
| `paragraph_chunk` | Window chunk from large paragraph | No | 6 sentences from 10-sentence paragraph |
| `small_paragraph_last` | Last paragraph is small (edge case) | No | Final 1-2 sentence paragraph |
| `empty_sentence_fallback` | No sentences detected (rare) | No | Edge case handling |

## Integration with RAG System

The chunker is already integrated into `projectManager.js`:

```javascript
// In uploadDocumentToProject()
const chunks = this.chunker.chunkHybrid(fileText)
```

Chunks are automatically:
1. Generated with semantic boundaries
2. Embedded using the EmbeddingGenerator
3. Stored with metadata intact
4. Retrieved using hybrid search in RAG queries

## Benefits

✅ **No mid-sentence cuts** - All chunks end on natural sentence boundaries

✅ **Preserves semantic context** - Headers merged with content, not isolated

✅ **Respects thought units** - Complete paragraphs stay together when appropriate

✅ **Maintains context** - Overlapping windows for large paragraphs

✅ **Optimal for legal docs** - Handles headers, analysis, and dense sections intelligently

## Validation

To verify chunks are valid:

```javascript
// Check all chunks end on sentence boundaries
const allValid = chunks.every(chunk => {
  const text = chunk.text.trim()
  return text.match(/[.!?]$/)
})

console.log('All chunks valid:', allValid)
```

## Performance Notes

- Sentence extraction uses regex matching for `.`, `!`, `?`
- No character or token counting (sentence-only)
- Efficient paragraph-level processing
- Minimal memory overhead (no duplicate sentence storage)

## Edge Cases Handled

1. **Last paragraph is small:** Emitted as single chunk (no next paragraph to merge)
2. **Single paragraph document:** Processed according to size rules
3. **Empty paragraphs:** Skipped with warning
4. **No sentence terminators:** Treated as single sentence
5. **Invalid window config:** Fallback to no overlap with error log

## Configuration Recommendations

| Document Type | Window Size | Overlap | Reasoning |
|--------------|-------------|---------|-----------|
| Legal briefs | 6 | 2 | Default - good balance |
| Case law | 8 | 3 | Longer context needed |
| Contracts | 4 | 1 | Shorter, precise sections |
| Regulations | 6 | 2 | Standard setting |

## Migration Notes

**Old Behavior:**
- Simple sentence overlap without semantic awareness
- Could split small headers into useless standalone chunks
- No special handling for paragraph sizes

**New Behavior:**
- Semantic paragraph boundary detection
- Smart merging of small paragraphs with context
- Size-based rules for optimal chunk quality

**Breaking Changes:**
- Method signature changed: `chunkHybrid(text, sentenceWindowSize, sentenceOverlap)`
- Chunk metadata structure updated with new fields
- Default window size increased from 1 to 6 sentences

**Backwards Compatibility:**
- `chunkByParagraph()` unchanged (still available)
- `_extractSentences()` unchanged
- `getChunkStats()` still works with both old and new chunks
