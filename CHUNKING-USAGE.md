# Sentence-Based Chunking Usage Guide

## Overview

The DocumentChunker now uses **sentence-based chunking with semantic paragraph boundaries**. This ensures chunks never cut mid-sentence and intelligently handles different paragraph sizes.

## Chunking Rules

### Rule 1: Small Paragraphs (1-2 sentences)
**Action:** Buffered and merged with the next paragraph

**Why:** Small paragraphs are often headers or section titles that need context from the following paragraph.

**Example:**
```
Background                     ← 1 sentence (small)

The case began in 2023.        ← 1 sentence (next paragraph)
```
**Result:** Both merged into single chunk: "Background. The case began in 2023."

### Rule 2: Just-Right Paragraphs (3-5 sentences)
**Action:** Kept as single intact chunk

**Why:** A 3-5 sentence paragraph typically represents one complete thought unit.

**Example:**
```
The court applied three tests. First, the reasonable person standard.
Second, the causation analysis. Third, the damages calculation.
```
**Result:** Entire paragraph becomes one chunk (not split)

### Rule 3: Large Paragraphs (6+ sentences)
**Action:** Sliding window with overlap

**Why:** Dense paragraphs need to be broken up, but overlap preserves context.

**Configuration:**
- Window Size: 6 sentences
- Overlap: 2 sentences
- Step: 4 sentences

**Example:**
```
S1. S2. S3. S4. S5. S6. S7. S8. S9. S10.

Chunk 1: [S1, S2, S3, S4, S5, S6]
Chunk 2: [S5, S6, S7, S8, S9, S10]  ← Overlaps with S5, S6
```

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
