# Sentence-Based Chunking Usage Guide

## Overview

The DocumentChunker uses **continuous sentence accumulation with sliding windows**, **aggressive header stripping**, and **automatic boundary validation**. This creates consistent 8-sentence chunks with 2-sentence overlap, guaranteed to start with uppercase and end with proper punctuation.

## Chunking Strategy

### Sentence Accumulator with Sliding Window

The chunker uses a **continuous sentence buffer** that accumulates sentences across paragraph boundaries until reaching the target chunk size (default: 8 sentences), then creates overlapping chunks with validated boundaries.

**How It Works:**

1. **Strip Headers**: Remove all legal headers before processing
2. **Orphan Rescue**: Detect and merge paragraph fragments with adjacent paragraphs
3. **Accumulate**: Sentences from all paragraphs are added to a buffer
4. **Chunk**: When buffer reaches 8 sentences, create a chunk
5. **Validate**: Check boundaries (uppercase start, punctuation end)
6. **Slide**: Remove 6 sentences (8 - 2 overlap), keep 2 for next chunk
7. **Repeat**: Continue accumulating and chunking throughout document
8. **Flush**: Remaining sentences become final chunk
9. **Report**: Validation report shows any quality issues

**Configuration:**
- Window Size: 8 sentences (customizable)
- Overlap: 2 sentences (customizable)
- Step: 6 sentences (windowSize - overlap)

**Example Flow:**

```
Document sentences: S1 S2 S3 S4 S5 S6 S7 S8 S9 S10 S11 S12 S13 S14 S15 S16

Buffer accumulates: [S1, S2, S3, S4, S5, S6, S7, S8]
→ Chunk 1: [S1, S2, S3, S4, S5, S6, S7, S8]
→ Validate: Starts uppercase ✓, Ends with punctuation ✓
→ Slide by 6, keep [S7, S8] in buffer

Buffer continues: [S7, S8, S9, S10, S11, S12, S13, S14]
→ Chunk 2: [S7, S8, S9, S10, S11, S12, S13, S14] (overlaps with Chunk 1)
→ Validate: Starts uppercase ✓, Ends with punctuation ✓
→ Slide by 6, keep [S13, S14] in buffer

Buffer continues: [S13, S14, S15, S16]
→ Chunk 3: [S13, S14, S15, S16] (final chunk, less than 8 sentences)
→ Validate: Starts uppercase ✓, Ends with punctuation ✓
```

**Benefits:**

- **Consistent Size**: All chunks (except the last) have exactly 8 sentences
- **Larger Context**: 8-sentence chunks capture more complete thoughts (vs. previous 6-sentence chunks)
- **Paragraph Agnostic**: Works with any paragraph structure (handles legal PDFs with frequent line breaks)
- **Continuous Context**: 2-sentence overlap preserves context between chunks
- **No Information Loss**: Every sentence appears in at least one chunk
- **Validated Quality**: Every chunk guaranteed to be well-formed

## Orphan Rescue: Fragment Detection and Merging

**NEW:** The chunker automatically detects and merges paragraph fragments to prevent incomplete chunks.

### What Are Fragments?

Fragments are incomplete text units caused by PDF page breaks, legal citations split across lines, or weird formatting:

**Examples:**
```
Fragment 1: ". . disability . . . from engaging in [his] occupation"
Fragment 2: "(Admin. R."
Fragment 3: "supporting [Lucent] employees and consultants round the clock"
```

These fragments appear when:
- A sentence gets split by a page break
- Legal citations are split across lines
- PDF extraction creates weird ellipsis formatting (". . . text . . .")
- Mid-sentence continuations from previous page

### How Orphan Rescue Works

**Detection Criteria:**

A paragraph is flagged as a fragment if it:
1. **Too short** (< 80 chars) and not a complete sentence
2. **Starts with lowercase** - continuation from previous page
3. **Starts with punctuation** (`. , ; : ( ) [ ]`) - weird formatting
4. **Doesn't end properly** - no sentence terminator (. ! ?)
5. **Incomplete citation** - ends with `(Admin. R.` or `(Admin. R. at`
6. **Ellipsis formatting** - `. . disability . . .`
7. **Incomplete reference** - ends with `(` or `[`

**Merging Strategy:**

When a fragment is detected:
1. Look ahead to next paragraph
2. Merge fragment + next paragraph
3. If next paragraph is also a fragment, keep merging
4. Stop when we find a complete paragraph
5. Process the merged text as a single unit

**Example Flow:**

```
Para 1: "Plaintiff's job required high cognitive functioning."
Para 2: ". . disability . . . from engaging in [his] occupation"  ← FRAGMENT
Para 3: "This meant he could not work as a software engineer."

Processing:
1. Para 1 → Normal processing
2. Para 2 → Detected as fragment (starts with punctuation)
3. Merge Para 2 + Para 3 → ". . disability . . . from engaging in [his] occupation This meant he could not work as a software engineer."
4. Process merged text → Complete chunk with full context
```

**Console Output:**

```
Processing 143 paragraphs with sentence-based semantic boundaries
Added 3 sentences from para 0. Buffer: 3 sentences
  ⚠️  Detected fragment para 12: ". . disability . . . from engaging in [his] occupat..."
  ✓ Merged fragment with para 13
Added 2 sentences from merged fragment. Buffer: 5 sentences
```

**Benefits:**

- **No Orphan Chunks**: Fragments are never processed standalone
- **Complete Context**: Fragments reunited with their adjacent content
- **Better Embeddings**: No semantic gaps from split sentences
- **Automatic Detection**: Zero configuration required

## Legal Header Stripping

**CRITICAL:** Document headers (case numbers, page numbers, court identifiers) are **completely removed** before chunking to prevent pollution and boundary violations.

### Why Strip Headers?

Headers appearing mid-chunk create:
- **Duplicate metadata**: "Page 3" appearing multiple times
- **Broken boundaries**: Chunks starting with lowercase after headers
- **Semantic noise**: Legal boilerplate interfering with embeddings

### How It Works

Headers like:
```
No. 12-3834
Javery v. Lucent Tech., Inc. Long Term Disability Plan
Page 3

Plaintiff's job as a software engineer...
```

Are **completely removed**:
```
Plaintiff's job as a software engineer...
```

### Recognized Header Patterns

The system aggressively strips:

- **Case numbers**: `No. 12-3834`, `Case No. 2023-1234`, `12-3834`
- **Case names**: `Javery v. Lucent Tech., Inc. Long Term Disability Plan`
- **Page numbers**: `Page 3`, `Page 12 of 45`
- **Court identifiers**: `UNITED STATES COURT OF APPEALS`
- **Date stamps**: `Filed: January 1, 2023`
- **Section headers**: `BACKGROUND`, `OPINION`, `STANDARD OF REVIEW`

Patterns match headers:
- At start of lines (`^No. 12-3834`)
- Anywhere in lines (`supporting No. 12-3834 employees`)
- As trailing fragments (`...sentence. No. 12-3834 Javery v. Lucent`)

### Automatic Boundary Validation

After stripping, every chunk is validated:

**Requirements:**
1. ✓ Starts with **uppercase letter or digit**
2. ✓ Ends with **. ! or ?**
3. ✓ No embedded headers
4. ✓ Adequate length (>50 chars)

**Auto-Fix:**
- If chunk starts with lowercase → rewind to last sentence boundary
- If chunk ends without punctuation → trim to last sentence
- If trailing headers detected → strip and re-validate

**Console Output:**
```
Chunk Validation Report: 0 issues found in 42 chunks (0 critical, 0 high, 0 medium)
✓ All chunks passed validation
```

Or if issues found:
```
⚠️  Chunk quality issues detected:
  - CRITICAL: STARTS_WITH_LOWERCASE in chunk 12
    "supporting employees and consultants..."
```

### Benefits

- **Clean Chunks**: No header pollution or formatting artifacts
- **Valid Boundaries**: Guaranteed uppercase start, punctuation end
- **Better Embeddings**: Pure semantic content without legal boilerplate
- **Larger Context**: 8-sentence chunks capture complete technical details

See `HEADER-PRESERVATION.md` for detailed examples and boundary validation logic.

## Usage

### Basic Usage
```javascript
import DocumentChunker from './src/services/documentChunker.js'

const chunker = new DocumentChunker()
const text = "Your legal document here..."

// Use default settings (8 sentences, 2 overlap)
const chunks = chunker.chunkHybrid(text)

// Or customize window size and overlap
const chunks = chunker.chunkHybrid(text, 10, 3) // 10 sentences, 3 overlap

// Validate chunk quality
const report = chunker.getChunkValidationReport(chunks)
console.log(report.report)
// "0 issues found in 42 chunks (0 critical, 0 high, 0 medium)"

if (!report.isValid) {
  report.issues.forEach(issue => {
    console.warn(`${issue.severity}: ${issue.issue} in chunk ${issue.chunkIndex}`)
  })
}
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
