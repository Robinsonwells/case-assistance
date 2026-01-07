# Hybrid Search Implementation

## Overview

The application now uses a **mandatory hybrid retrieval system** that combines semantic search with keyword search for every query. This ensures comprehensive document coverage by capturing both conceptually similar content (semantic) and exact terminology matches (keyword).

## Architecture

### 1. Query Flow

Every user query goes through these steps:

1. **Keyword Extraction** (LLM-powered)
   - Uses Perplexity API to extract main concepts and keywords
   - Generates general synonyms and variations for each keyword
   - Example: "pain" → ["discomfort", "ache", "painful", "hurting"]

2. **Semantic Search**
   - Retrieves top 100 chunks using cosine similarity on embeddings
   - Captures conceptually relevant content
   - Uses existing RAGRetriever with topK=100

3. **Keyword Search**
   - Searches all chunks for exact keyword/variation matches
   - Case-insensitive string matching
   - Tracks which keywords matched in each chunk

4. **Deduplication**
   - Filters keyword results to remove chunks already in semantic top 100
   - Prevents duplicate chunks in final context

5. **Combination**
   - Concatenates: semantic chunks + additional keyword chunks
   - All chunks sent to LLM for answer generation

6. **Answer Generation**
   - LLM receives combined context
   - Generates answer grounded in all retrieved chunks

### 2. Key Components

#### KeywordExtractor (`src/services/keywordExtractor.js`)
- Calls Perplexity API with specialized prompt
- Extracts 3-7 main keywords from user question
- Generates 2-5 variations/synonyms per keyword
- Returns structured JSON: `{keywords: [{term, variations}]}`
- Includes fallback extraction if API fails

#### KeywordSearcher (`src/services/keywordSearcher.js`)
- Simple, efficient keyword matching across chunks
- Case-insensitive search
- Tracks match counts and matched terms
- Filters duplicates using normalized text comparison
- Provides search statistics

#### ProjectManager Updates
- Orchestrates hybrid retrieval flow
- Manages all 6 steps of query processing
- Provides detailed console logging for debugging
- Returns enriched results with keyword data and stats

#### QueryInterface Updates
- Displays retrieval statistics (semantic/keyword/total counts)
- Shows extracted keywords with variations (collapsible)
- Visual indicators for chunk match types
- Color-coded statistics cards

## Configuration

### Semantic Search
- **Top K**: 100 chunks (configurable in `projectManager.js`)
- **Scoring**: Pure cosine similarity (0-1)
- **Deduplication**: 85% similarity threshold

### Keyword Search
- **Case Sensitivity**: Disabled (case-insensitive)
- **Match Type**: Substring matching (includes)
- **Variations**: Automatic synonym expansion via LLM

### Keyword Extraction
- **Model**: Perplexity (sonar-reasoning-pro)
- **Temperature**: 0.3 (factual responses)
- **Timeout**: 10 seconds
- **Fallback**: Basic word extraction if API fails

## Benefits

1. **Completeness**: Semantic search finds conceptual matches, keyword search catches precise terminology
2. **No Scoring Complexity**: Simple concatenation (no weighted blending)
3. **Transparency**: Users see extraction results and retrieval breakdown
4. **Robustness**: Synonym expansion handles different phrasings
5. **Fallback**: If keyword extraction fails, falls back to semantic-only

## Usage

No configuration required. Every query automatically uses hybrid retrieval.

### Console Output

When running queries, you'll see detailed logs:

```
=== HYBRID RETRIEVAL QUERY ===
Question: What medications were prescribed?
Total chunks available: 245

--- STEP 1: Keyword Extraction ---
Extracted 5 keywords with 18 total terms

--- STEP 2: Semantic Search (Top 100) ---
Retrieved 100 semantic chunks

--- STEP 3: Keyword Search ---
Found 34 chunks with keyword matches

--- STEP 4: Filtering Duplicates ---
After deduplication: 12 additional keyword chunks

--- STEP 5: Combining Results ---
Total chunks for context: 112
  - Semantic: 100
  - Additional keyword: 12

--- STEP 6: Building Context ---
Context length: 156789 characters

--- STEP 7: Querying LLM ---
LLM response received

=== QUERY COMPLETE ===
```

### UI Display

After each query, users see:
- **Statistics Cards**: Semantic count, keyword count, total count
- **Keywords Section** (collapsible): Extracted keywords with variations
- **Match Details**: Which keywords matched and how many times

## Error Handling

- **Keyword extraction failure**: Falls back to semantic-only search
- **Zero keyword matches**: Proceeds with semantic results only
- **API timeout**: Returns empty keyword list, continues with semantic
- **Invalid chunks**: Gracefully skips malformed data

## Performance

- **Keyword extraction**: ~1-3 seconds (Perplexity API call)
- **Semantic search**: Instant (embeddings pre-computed)
- **Keyword search**: ~100-500ms for typical document sets
- **Deduplication**: ~10-50ms
- **Total overhead**: ~1-4 seconds per query

## Future Enhancements

Possible improvements:
- Cache keyword extractions for similar questions
- Add keyword highlighting in UI chunk display
- Configurable semantic/keyword chunk limits
- Keyword importance scoring
- Query expansion beyond synonyms

## Technical Notes

- All keyword matching is case-insensitive
- Deduplication uses first 200 characters of normalized text
- Special regex characters in keywords are escaped
- Keyword variations include singular/plural forms
- No external dependencies (pure string matching)
