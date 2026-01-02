# Legal Document Header Preservation

## Overview

Legal documents contain critical metadata in headers and footers (case numbers, page numbers, court identifiers). Instead of discarding this information, we now **attach headers to following content as compact context prefixes**.

## How It Works

### 1. Header Detection

The `_isLegalHeader()` method recognizes common patterns:

- **Case Numbers**: `No. 12-3834`, `Case No. 2023-1234`
- **Page Numbers**: `Page 3`, `Page 12 of 45`
- **Court Identifiers**: `UNITED STATES COURT OF APPEALS`
- **Case Names**: `Javery v. Lucent Tech., Inc. Long Term Disability Plan`
- **Date Stamps**: `Filed: January 1, 2023`, `Decided: March 15, 2023`
- **All-caps Headers**: `BACKGROUND`, `OPINION`, `CONCLUSION`

### 2. Header Attachment

The `_attachHeadersToContent()` method:

1. Scans each line to identify headers
2. Accumulates consecutive headers
3. Prepends accumulated headers to the next content line as `[Header1 | Header2 | ...]`
4. Resets header accumulator after attachment

### 3. Metadata Extraction

The `extractMetadata()` helper extracts the prefix for display:

```javascript
const chunker = new DocumentChunker()
const result = chunker.extractMetadata('[No. 12-3834 | Page 3] Plaintiff worked...')

// Returns:
{
  metadata: 'No. 12-3834 | Page 3',
  content: 'Plaintiff worked...',
  full: '[No. 12-3834 | Page 3] Plaintiff worked...'
}
```

## Before/After Example

### Original PDF Text (Javery v. Lucent)

```
No. 12-3834
Javery v. Lucent Tech., Inc. Long Term Disability Plan
Page 3

BACKGROUND

Plaintiff's job as a software engineer required him to sit continuously
for eight to ten hours each day. After developing severe back pain from
a herniated disc, he could no longer maintain this posture. His treating
physician documented that prolonged sitting exacerbated his condition
and recommended limiting sitting to 30 minutes at a time. The insurance
company denied his disability claim, arguing he could perform sedentary
work despite medical evidence to the contrary.

12-3834
Page 4

STANDARD OF REVIEW

We review the district court's decision de novo. When a plan
administrator has discretionary authority, we apply the arbitrary and
capricious standard. However, we have recognized that a structural
conflict of interest exists when the entity that decides claims also
pays benefits. This conflict must be weighed as a factor in our analysis.
```

### After Header Attachment Processing

```
[No. 12-3834 | Javery v. Lucent Tech., Inc. Long Term Disability Plan | Page 3] BACKGROUND

[No. 12-3834 | Javery v. Lucent Tech., Inc. Long Term Disability Plan | Page 3] Plaintiff's job as a software engineer required him to sit continuously
for eight to ten hours each day. After developing severe back pain from
a herniated disc, he could no longer maintain this posture. His treating
physician documented that prolonged sitting exacerbated his condition
and recommended limiting sitting to 30 minutes at a time. The insurance
company denied his disability claim, arguing he could perform sedentary
work despite medical evidence to the contrary.

[12-3834 | Page 4] STANDARD OF REVIEW

[12-3834 | Page 4] We review the district court's decision de novo. When a plan
administrator has discretionary authority, we apply the arbitrary and
capricious standard. However, we have recognized that a structural
conflict of interest exists when the entity that decides claims also
pays benefits. This conflict must be weighed as a factor in our analysis.
```

### Final Chunks (After Hybrid Chunking)

**Chunk 1** (6-sentence window from Page 3):
```
[No. 12-3834 | Page 3] Plaintiff's job as a software engineer required him
to sit continuously for eight to ten hours each day. After developing severe
back pain from a herniated disc, he could no longer maintain this posture.
His treating physician documented that prolonged sitting exacerbated his
condition and recommended limiting sitting to 30 minutes at a time. The
insurance company denied his disability claim, arguing he could perform
sedentary work despite medical evidence to the contrary.
```

**Chunk 2** (From Page 4):
```
[12-3834 | Page 4] We review the district court's decision de novo. When
a plan administrator has discretionary authority, we apply the arbitrary
and capricious standard. However, we have recognized that a structural
conflict of interest exists when the entity that decides claims also pays
benefits. This conflict must be weighed as a factor in our analysis.
```

## Benefits

### ✅ Traceability
Every chunk knows its source:
- Which case: `No. 12-3834`
- Which page: `Page 3`
- What document: `Javery v. Lucent Tech., Inc. Long Term Disability Plan`

### ✅ Improved Semantic Search
Headers provide additional context signals for embedding generation. The model can learn that:
- Chunks from the same case number are related
- "BACKGROUND" sections have different content than "OPINION" sections
- Page numbers help order chunks chronologically

### ✅ Better User Experience
When displaying results, you can:
- Show users exactly where information came from
- Group results by case or section
- Allow filtering by page range

### ✅ No Information Loss
Nothing is discarded. All metadata is preserved in a compact, readable format.

## Implementation Details

### Integration Point

In `DocumentChunker.chunkHybrid()`:

```javascript
// Before paragraph splitting
const processedText = this._attachHeadersToContent(text.trim())

// Then proceed with normal chunking
const paragraphs = processedText.split(/\n\s*\n+/).filter(p => p.trim().length > 0)
```

### Header Pattern Matching

The system uses 12+ regex patterns to identify headers:

```javascript
const headerPatterns = [
  /^No\.\s+\d{2,4}-\d{2,4}$/i,           // No. 12-3834
  /^Case\s+No\.\s+[\d-]+$/i,             // Case No. 2023-1234
  /^Page\s+\d+(\s+of\s+\d+)?$/i,         // Page 3, Page 3 of 45
  /^\d+$/,                                // Standalone page numbers
  /^[A-Z\s]+COURT[A-Z\s]*$/,             // COURT OF APPEALS
  /^UNITED STATES/i,                      // Court headers
  /^IN THE [A-Z\s]+ COURT/i,             // IN THE SUPREME COURT
  /^Filed:\s+/i,                          // Filed: date
  /^Decided:\s+/i,                        // Decided: date
  /^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}$/,     // Date formats
  /^[A-Z][a-z]+\s+v\.\s+[A-Z][a-z]+.*Plan$/, // Case names
  /^\d{2,4}-\d{2,4}$/                    // Short case numbers
]
```

Plus detection of all-caps headers under 100 characters.

## Usage in UI

When displaying chunks, use `extractMetadata()`:

```javascript
import DocumentChunker from './services/documentChunker'

const chunker = new DocumentChunker()

// When displaying a relevant chunk
const { metadata, content } = chunker.extractMetadata(chunk.text)

// Render in UI:
if (metadata) {
  return (
    <div className="chunk">
      <div className="chunk-metadata">{metadata}</div>
      <div className="chunk-content">{content}</div>
    </div>
  )
}
```

## Testing

To verify header preservation:

1. Upload a legal PDF with case numbers and page numbers
2. Check the browser console for chunking logs
3. Inspect chunk text - should see `[...]` prefixes
4. Query for specific facts
5. Check that returned chunks show source metadata
6. Verify that chunks from the same page have consistent headers

## Next Steps

After uploading new documents with this system:

- **Better context**: 6-sentence chunks will include case/page metadata
- **Improved retrieval**: Semantic search can use headers as signals
- **Source attribution**: Every answer can be traced to specific pages
- **No information loss**: All document metadata preserved

Re-upload your legal PDFs to take advantage of this enhancement.
