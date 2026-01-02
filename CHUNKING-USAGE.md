# Sentence-Based Chunking Usage Guide

## Overview

The DocumentChunker uses **per-paragraph sliding windows**, **aggressive header stripping**, **fragment rescue**, and **automatic boundary validation**. This creates semantic chunks that respect paragraph boundaries while maintaining 8-sentence windows with 2-sentence overlap.

## Chunking Strategy

### Per-Paragraph Sliding Window

The chunker uses a **per-paragraph sliding window** that respects paragraph boundaries and prevents mixing sentences from unrelated paragraphs. Each paragraph is independently chunked with overlapping windows (default: 8 sentences per chunk, 2 sentence overlap).

**How It Works:**

1. **Strip Headers**: Remove all legal headers before processing
2. **Orphan Rescue**: Detect and merge paragraph fragments with adjacent paragraphs
3. **For Each Paragraph**:
   - Extract all sentences from the paragraph
   - Apply sliding window: create 8-sentence chunks with 6-sentence step
   - Overlap ensures continuity: chunks share 2 sentences
4. **Validate**: Check boundaries (uppercase start, punctuation end, minimum size)
5. **Incomplete Sentence Detection**: Remove sentences that end mid-word or with dangling prepositions
6. **Report**: Validation report shows any quality issues

**Configuration:**
- Window Size: 8 sentences (customizable)
- Overlap: 2 sentences (customizable)
- Step: 6 sentences (windowSize - overlap)
- Minimum Chunk Size: 80 characters

**Example Flow:**

```
Paragraph 1: [S1, S2, S3, S4, S5]
→ Chunk 1: [S1, S2, S3, S4, S5] (5 sentences, < 8)
→ Validate: Starts uppercase ✓, Ends with punctuation ✓

Paragraph 2: [S6, S7, S8, S9, S10, S11, S12, S13, S14, S15]
→ Chunk 2: [S6, S7, S8, S9, S10, S11, S12, S13] (sentences 0-7 from para)
→ Validate: Starts uppercase ✓, Ends with punctuation ✓
→ Chunk 3: [S12, S13, S14, S15] (sentences 6-9 from para, overlaps with Chunk 2)
→ Validate: Starts uppercase ✓, Ends with punctuation ✓

Paragraph 3: [S16, S17, S18]
→ Chunk 4: [S16, S17, S18] (3 sentences, < 8)
→ Validate: Starts uppercase ✓, Ends with punctuation ✓
```

**Benefits:**

- **Semantic Boundaries**: Chunks never cross paragraph boundaries (preserves topical coherence)
- **Larger Context**: 8-sentence chunks capture complete thoughts
- **Overlap for Continuity**: 2-sentence overlap within paragraphs maintains context
- **No Mixed Topics**: Each chunk comes from a single semantic unit
- **Better Retrieval**: Queries match chunks with cohesive topics
- **Validated Quality**: Every chunk guaranteed to be well-formed

## Smart Sentence Boundary Detection

**NEW:** The chunker uses intelligent sentence detection that recognizes abbreviations and legal citations to avoid creating incomplete chunks.

### The Problem: Naive Period Detection

Simple regex patterns treat every period as a sentence ending, creating broken chunks:

**Naive Approach:**
```javascript
// BAD: Breaks at every period
/[^.!?]+[.!?]+/g

// Creates fragments:
"Dr."
"Smith worked at Lucent Technologies, Inc."
"The company hired three different physicians––Dr."
```

These breaks violate completeness requirements.

### The Solution: Context-Aware Sentence Detection

The chunker analyzes **context** around periods to distinguish:
- **Real sentence endings**: `"Smith worked at Lucent."`
- **Abbreviations**: `"Dr. Smith"`, `"Inc."`, `"U. S. C."`
- **Legal citations**: `"Admin. R. 005"`, `"F. 3d"`
- **Initials**: `"J. K. Smith"`

### Detection Rules

The chunker applies these rules **in order** when evaluating a period:

1. **End of text** → Sentence boundary
2. **Followed by closing punctuation + uppercase** → Sentence boundary
   - `"sentence.)" Next sentence"`
3. **Not followed by space** → NOT a boundary
   - `"example.com"`, `"3.14"`
4. **Followed by lowercase** → NOT a boundary
   - `"e.g. something"`, `"Dr. smith"`
5. **Known abbreviation + uppercase next** → Boundary
   - `"worked at Inc. The company"` (period ends sentence)
6. **Known abbreviation + lowercase next** → NOT a boundary
   - `"Dr. Smith"`, `"Inc. hired"`
7. **Single letter + uppercase next** → Boundary
   - `"J. The next sentence"`
8. **Single letter + lowercase next** → NOT a boundary
   - `"J. Smith"`
9. **Legal citation pattern** → NOT a boundary
   - `"Admin. R. 005"`, `"U. S. C."`
10. **Followed by uppercase/digit** → Boundary

### Abbreviation Database

The chunker maintains a comprehensive list of 60+ common abbreviations:

**Titles:** Dr, Mr, Mrs, Ms, Prof, Rev, Hon, Sr, Jr, Esq

**Degrees:** Ph.D, M.D, J.D, M.A, B.A, B.S, M.S, LL.B, LL.M

**Corporate:** Inc, Corp, Ltd, LLC, Co, Assn, Bros

**Legal:** Admin, R, U, S, C, F, Supp, Cal, App, P, A, N.Y, N.E, S.W

**Months:** Jan, Feb, Mar, Apr, Jun, Jul, Aug, Sep, Oct, Nov, Dec

**Other:** a.m, p.m, etc, vs, v, e.g, i.e, et al, cf, No, Vol, Ed

### Examples

**Input text:**
```
Dr. Smith worked at Lucent Technologies, Inc. from 1998 to 2005. He filed
a claim with Admin. R. 005. Three physicians––Dr. Holtzmeier, Dr. Seymour,
and Dr. Weaver––evaluated his condition.
```

**Old approach (naive):**
```
Sentence 1: "Dr."
Sentence 2: "Smith worked at Lucent Technologies, Inc."
Sentence 3: "from 1998 to 2005."
Sentence 4: "He filed a claim with Admin."
Sentence 5: "R."
... (broken fragments)
```

**New approach (smart):**
```
Sentence 1: "Dr. Smith worked at Lucent Technologies, Inc. from 1998 to 2005."
Sentence 2: "He filed a claim with Admin. R. 005."
Sentence 3: "Three physicians––Dr. Holtzmeier, Dr. Seymour, and Dr. Weaver––evaluated his condition."
```

### Benefits

- **No abbreviation breaks**: `"Dr. Smith"` stays together
- **Legal citations intact**: `"Admin. R. 005"` is one unit
- **Corporate names complete**: `"Lucent Technologies, Inc."` in one sentence
- **Better retrieval**: Queries for "Dr. Smith" match complete context

## Ellipsis Normalization

**NEW:** The chunker automatically normalizes spaced ellipses before sentence extraction to prevent fragment chunks.

### The Problem

Legal documents commonly use spaced periods for ellipses:
```
"disability . . . from engaging in his occupation"
```

The sentence extraction regex treats each `. ` as a sentence ending, creating invalid fragments:
```
Fragment 1: "disability . "
Fragment 2: ". "
Fragment 3: ". from engaging in his occupation"
```

These fragments violate boundary rules (starting with periods or lowercase).

### The Solution

**Before sentence extraction**, the chunker normalizes all spaced ellipses:

```javascript
// Input text
"disability . . . from engaging in his occupation"

// Normalization: ". . ." → "..."
"disability... from engaging in his occupation"

// Now sentence extraction works correctly
["disability... from engaging in his occupation."]
```

**Pattern:** Matches 2 or more occurrences of `". "` or ` . `:
```regex
/(\s*\.\s+){2,}/g
```

**Examples:**
```
". . ." → "..."
" . . . " → "..."
". . . . ." → "..."
```

### Benefits

- **No fragments**: Ellipses never create sentence boundaries
- **Clean chunks**: All chunks start with uppercase/digit, end with punctuation
- **Automatic**: Works transparently during sentence extraction
- **Preserves meaning**: "disability..." still conveys omission

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

After stripping, every chunk is validated with **strict boundary rules**:

**Requirements:**
1. ✓ Starts with **uppercase letter or digit** (NEVER lowercase or punctuation)
2. ✓ Ends with **. ! or ?**
3. ✓ No embedded headers
4. ✓ Minimum length (≥80 chars)
5. ✓ No incomplete sentences (no dangling prepositions or mid-word cuts)

**Auto-Fix:**
- If chunk starts with lowercase/punctuation → find first valid sentence start
- If chunk ends without punctuation → trim to last sentence
- If trailing headers detected → strip and re-validate
- If last sentence incomplete → remove and validate remaining text
- If chunk too small after fixes → discard entirely

**Invalid Start Characters:**
```
Lowercase: a-z
Punctuation: . ! ? , ; : -
```

**Valid Start Characters:**
```
Uppercase: A-Z
Digits: 0-9
```

**Console Output:**

When ellipses are normalized:
```
Processing 143 paragraphs with per-paragraph sliding windows
  Para 5: 3 sentences (normalized ellipses)
```

When fragments are detected:
```
⚠️  Chunk starts with invalid '.': ". from engaging in his occupation..."
   ✓ Trimmed to first valid sentence start
```

When validation passes:
```
Chunk Validation Report: 0 issues found in 42 chunks (0 critical, 0 high, 0 medium)
✓ All chunks passed validation
```

When validation fails:
```
⚠️  Chunk starts with invalid '.': ". from engaging in..."
   ✗ No valid sentence boundary found. Discarding chunk.
```

### Benefits

- **Clean Chunks**: No header pollution or formatting artifacts
- **Valid Boundaries**: Guaranteed uppercase start, punctuation end
- **Better Embeddings**: Pure semantic content without legal boilerplate
- **Larger Context**: 8-sentence chunks capture complete technical details

See `HEADER-PRESERVATION.md` for detailed examples and boundary validation logic.

## Incomplete Ending Validation

**NEW:** The chunker automatically detects and removes chunks ending with incomplete phrases, abbreviations, or dangling words.

### What Are Incomplete Endings?

Incomplete endings are chunks that end with partial text caused by:
- **Abbreviations without continuation**: `"...hired Dr."` (missing name)
- **Incomplete citations**: `"(Admin. R."` (missing document number)
- **Dangling prepositions**: `"worked at"` (missing location)
- **Dangling conjunctions**: `"Smith and"` (missing second name)
- **Mid-word cuts**: `"involved Under"` (split between sentences)

**Examples of Invalid Endings:**
```
❌ "Three different physicians––Dr."
❌ "He filed a claim (Admin. R."
❌ "Plaintiff worked at"
❌ "Smith and"
❌ "Lucent Technologies, Inc."
❌ "disability... from engaging in"
```

### Detection Criteria

The chunker checks chunks against **30+ incomplete phrase patterns**:

**1. Abbreviations/Titles:**
- Ends with: `Dr.`, `Mr.`, `Mrs.`, `Ms.`, `Prof.`
- Example: `"Three physicians––Dr."`
- Action: Trim to previous complete sentence

**2. Corporate Suffixes:**
- Ends with: `Inc.`, `Corp.`, `Ltd.`, `LLC.`
- Example: `"worked at Lucent Technologies, Inc."`
- Action: Trim to previous complete sentence

**3. Incomplete Citations:**
- Ends with: `(Admin. R.`, `(Admin. R. at`, `U. S.`, `F.`
- Example: `"filed claim (Admin. R."`
- Action: Trim to previous complete sentence

**4. Initials:**
- Ends with: `J.`, `J. K.`
- Example: `"Plaintiff J."`
- Action: Trim to previous complete sentence

**5. Trailing Punctuation:**
- Ends with: `(`, `[`, `,`, `;`, `:`
- Example: `"The Plan defined disability as (`
- Action: Trim to previous complete sentence

**6. Dangling Prepositions:**
- Ends with: `to`, `of`, `in`, `for`, `with`, `at`, `by`, `from`, `as`
- Example: `"Plaintiff worked at"`
- Action: Trim to previous complete sentence

**7. Dangling Conjunctions:**
- Ends with: `and`, `or`, `the`, `a`, `an`
- Example: `"Smith and"`
- Action: Trim to previous complete sentence

**8. Lowercase to Uppercase (Mid-sentence cuts):**
- Pattern: `[a-z] [A-Z]` in last 30 characters
- Example: `"...it involved Under the terms"`
- Action: Remove last sentence

**Example Flow 1: Abbreviation Detection**

```
Original chunk: "Plaintiff's medical evaluations were conducted by three physicians––Dr."

Detection:
- Check incomplete phrases: Ends with "Dr." pattern? YES ✓

Action: Find previous complete sentence
- Previous sentence: None found (chunk only has one sentence)

Result: Discard entire chunk (no complete sentence exists)
```

**Example Flow 2: Incomplete Citation**

```
Original chunk: "The medical evidence is in the administrative record (Admin. R."

Detection:
- Check incomplete phrases: Ends with "(Admin. R." pattern? YES ✓

Action: Find previous complete sentence
- Previous sentence: None found

Result: Discard entire chunk
```

**Example Flow 3: Successful Trimming**

```
Original chunk: "Plaintiff worked as a software engineer at Lucent Technologies. The position required concentration and sitting for extended periods. Three physicians––Dr."

Detection:
- Check incomplete phrases: Ends with "Dr." pattern? YES ✓

Action: Find previous complete sentence
- Previous sentence found at position 145: "...extended periods."

Result: "Plaintiff worked as a software engineer at Lucent Technologies. The position required concentration and sitting for extended periods."
- Length: 145 chars (>= 80) ✓
- Keep chunk
```

**Console Output:**

```
⚠️  Chunk ends with incomplete phrase: "...Three physicians––Dr."
   ✓ Trimmed to previous complete sentence

⚠️  Chunk ends with incomplete phrase: "...filed claim (Admin. R."
   ✗ No complete sentence found. Discarding chunk.
```

### Minimum Chunk Size

After all fixes (boundary validation, incomplete sentence removal, header stripping), chunks must be at least 80 characters:

```
⚠️  Chunk too small after fixes (45 chars). Discarding.
```

This prevents tiny orphan chunks with no semantic value.

**Benefits:**

- **Clean Endings**: No mid-sentence cuts or dangling prepositions
- **Complete Context**: Chunks contain only fully-formed thoughts
- **Better Embeddings**: Incomplete fragments don't pollute vector space
- **Automatic**: Zero configuration required

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

## Chunking Rules Summary

Here's a comprehensive summary of all chunking rules that prevent periods from being treated as sentence endings incorrectly:

### Pre-Processing Rules

**1. Ellipsis Normalization (First Pass)**
- Pattern: `(\s*\.\s+){2,}/g`
- Action: Convert `". . ."` → `"..."`
- Prevents: Spaced ellipses creating sentence fragments

**2. Legal Header Stripping**
- Patterns: Case numbers, page numbers, court identifiers, dates
- Action: Remove entirely before sentence extraction
- Prevents: Headers interrupting sentences

**3. Fragment Detection & Merging**
- Patterns: Short paragraphs (<80 chars), starts with lowercase/punctuation
- Action: Merge with adjacent paragraphs
- Prevents: Incomplete paragraph fragments

### Sentence Extraction Rules

**4. Smart Boundary Detection (Core Logic)**

When encountering a period, check these rules in order:

| Rule | Condition | Decision | Example |
|------|-----------|----------|---------|
| 1 | End of text | BOUNDARY | `"sentence."` (EOF) |
| 2 | Followed by `)` or `]` + uppercase | BOUNDARY | `"sentence.)" Next` |
| 3 | Not followed by space | NOT BOUNDARY | `"3.14"`, `"example.com"` |
| 4 | Followed by lowercase | NOT BOUNDARY | `"e.g. something"` |
| 5 | Known abbreviation + uppercase | BOUNDARY | `"Inc. The next"` |
| 6 | Known abbreviation + lowercase | NOT BOUNDARY | `"Dr. Smith"` |
| 7 | Single letter + uppercase | BOUNDARY | `"J. Next sentence"` |
| 8 | Single letter + lowercase | NOT BOUNDARY | `"J. Smith"` |
| 9 | Legal citation pattern | NOT BOUNDARY | `"Admin. R. 005"` |
| 10 | Followed by uppercase/digit | BOUNDARY | `"sentence. Next"` |

**5. Abbreviation Database (60+ entries)**
- Titles: Dr, Mr, Mrs, Ms, Prof, Rev, Hon, Sr, Jr, Esq
- Degrees: Ph.D, M.D, J.D, M.A, B.A, B.S, M.S, LL.B, LL.M
- Corporate: Inc, Corp, Ltd, LLC, Co, Assn, Bros
- Legal: Admin, R, U, S, C, F, Supp, Cal, App
- Other: a.m, p.m, etc, vs, v, e.g, i.e, No, Vol

### Post-Processing Rules

**6. Incomplete Ending Validation (30+ patterns)**

After sentence extraction, check if chunk ends with:

| Pattern Type | Examples | Action |
|-------------|----------|--------|
| Abbreviations | `Dr.`, `Mr.`, `Ms.` | Trim to previous sentence |
| Corporate | `Inc.`, `Corp.`, `Ltd.` | Trim to previous sentence |
| Citations | `(Admin. R.`, `U. S.` | Trim to previous sentence |
| Initials | `J.`, `J. K.` | Trim to previous sentence |
| Punctuation | `(`, `[`, `,`, `;`, `:` | Trim to previous sentence |
| Prepositions | `to`, `of`, `in`, `at`, `by` | Trim to previous sentence |
| Conjunctions | `and`, `or`, `the`, `a` | Trim to previous sentence |
| Mid-cuts | `[a-z] [A-Z]` | Remove last sentence |

**7. Boundary Validation**

Every chunk MUST satisfy:
- ✓ Starts with uppercase letter or digit
- ✓ Ends with `.`, `!`, or `?`
- ✓ Minimum 80 characters
- ✗ NEVER starts with lowercase or punctuation
- ✗ NEVER ends with incomplete phrase

**8. Discard Criteria**

Chunks are discarded if:
- Cannot find valid sentence start
- Cannot find complete sentence ending
- Too small after fixes (< 80 chars)
- Contains only incomplete phrases

### Processing Pipeline

```
1. Raw PDF Text
   ↓
2. Ellipsis Normalization (". . ." → "...")
   ↓
3. Header Stripping (Remove case numbers, page numbers)
   ↓
4. Paragraph Splitting (Double newlines)
   ↓
5. Fragment Detection & Merging
   ↓
6. Smart Sentence Extraction (10 context-aware rules)
   ↓
7. Sliding Window Chunking (8 sentences, 2 overlap)
   ↓
8. Incomplete Ending Check (30+ patterns)
   ↓
9. Boundary Validation (Start/end checks)
   ↓
10. Minimum Size Filter (>= 80 chars)
   ↓
11. Final Clean Chunks ✓
```

### What This Prevents

❌ **Chunks ending with abbreviations:**
```
Bad: "Three physicians––Dr."
Good: "Three physicians––Dr. Smith, Dr. Jones, and Dr. Brown––evaluated him."
```

❌ **Chunks ending with incomplete citations:**
```
Bad: "The record shows (Admin. R."
Good: "The record shows Admin. R. 005 contains medical evaluations."
```

❌ **Chunks with dangling prepositions:**
```
Bad: "Plaintiff worked at"
Good: "Plaintiff worked at Lucent Technologies from 1998 to 2005."
```

❌ **Chunks with corporate name fragments:**
```
Bad: "employed by Lucent Technologies, Inc."
Good: "Plaintiff was employed by Lucent Technologies, Inc. as a software engineer."
```

## Benefits

✅ **No mid-sentence cuts** - All chunks end on natural sentence boundaries

✅ **No abbreviation breaks** - `"Dr. Smith"` stays together

✅ **Complete citations** - `"Admin. R. 005"` is intact

✅ **Preserves semantic context** - Headers merged with content, not isolated

✅ **Respects thought units** - Complete paragraphs stay together when appropriate

✅ **Maintains context** - Overlapping windows for large paragraphs

✅ **Optimal for legal docs** - Handles headers, analysis, and dense sections intelligently

✅ **Automatic validation** - Every chunk guaranteed to be well-formed

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
