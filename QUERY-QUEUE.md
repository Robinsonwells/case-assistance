# Query Queue System

This document explains the query queue system that allows users to submit multiple questions without being blocked.

## Overview

Previously, users had to wait for one query to complete before submitting another. Now, users can submit multiple queries in rapid succession, and they'll be processed sequentially in the order received.

## Key Features

### 1. Non-Blocking Submission
- Users can submit queries at any time
- Input field is never disabled
- New queries are immediately queued

### 2. Sequential Processing
- Queries are processed one at a time
- FIFO (First In, First Out) order
- Maintains consistent behavior with backend API

### 3. Visual Feedback

**Status Indicators:**
- **Queued** ⏱️ - Query is waiting to be processed
- **Processing** ⏳ - Query is currently being processed
- **Completed** ✓ - Query finished successfully
- **Failed** ❌ - Query encountered an error

**Queue Counter:**
- Shows number of queries in queue
- Animated spinner during processing
- Real-time updates

## Implementation Details

### ChatPanel Component

**State Management:**
```javascript
const [queryQueue, setQueryQueue] = useState([])
const [isProcessing, setIsProcessing] = useState(false)
const processingRef = useRef(false)
```

**Queue Processing:**
```javascript
useEffect(() => {
  const processQueue = async () => {
    if (processingRef.current || queryQueue.length === 0) {
      return
    }

    processingRef.current = true
    setIsProcessing(true)

    const currentQuery = queryQueue[0]

    // Process query...
    // Update message status...

    setQueryQueue(prev => prev.slice(1))
    processingRef.current = false
    setIsProcessing(false)
  }

  processQueue()
}, [queryQueue, projectManager])
```

**Submit Handler:**
```javascript
const handleSubmit = async (e) => {
  e.preventDefault()
  if (!input.trim()) return

  const questionText = input.trim()
  const messageId = Date.now()

  // Add user message with 'queued' status
  const userMessage = {
    id: messageId,
    role: 'user',
    content: questionText,
    timestamp: new Date().toLocaleTimeString(),
    status: 'queued'
  }

  setMessages(prev => [...prev, userMessage])
  setInput('')

  // Add to processing queue
  setQueryQueue(prev => [
    ...prev,
    {
      question: questionText,
      placeholderId: messageId
    }
  ])
}
```

### QueryInterface Component

Similar implementation with queue processing and status tracking.

## User Experience

### Before Queue System

1. User submits query
2. Input and button become disabled
3. User must wait for response
4. Cannot submit new queries during processing

**Problem:** Frustrating for users who want to ask multiple questions quickly.

### After Queue System

1. User submits query (marked as "Queued")
2. Input and button remain enabled
3. User can immediately submit more queries
4. Queries process in order automatically

**Benefit:** Users can rapidly submit multiple questions and continue working.

## Visual Indicators

### Queue Status Banner

```
┌─────────────────────────────────────────┐
│ ⏳ Processing 3 queries...              │
└─────────────────────────────────────────┘
```

Shows when queries are in the queue, with animated spinner.

### Message Status Tags

Each user message shows its current status:

- `⏱️ Queued` - Waiting in queue
- `⏳ Processing` - Currently processing
- `✓ Completed` - Finished (tag removed)
- `❌ Failed` - Error occurred

### Helper Text

```
Press Enter to send, Shift+Enter for new line • Queries are processed in order
```

Updates dynamically when queue is active.

## Error Handling

### Failed Queries

When a query fails:
1. Message is marked with "Failed" status
2. Error message is displayed
3. Query is removed from queue
4. Next query processes automatically

### User Can Retry

Users can simply re-submit failed queries by typing them again.

## Technical Guarantees

### 1. Sequential Processing
Only one query is processed at a time to avoid race conditions and maintain API rate limits.

### 2. Order Preservation
Queries are processed in the exact order they were submitted.

### 3. No Lost Queries
All submitted queries are added to queue and will eventually be processed (unless there's a critical error).

### 4. Memory Safety
Queue is stored in component state, not localStorage, so it clears on page refresh.

## Performance Considerations

### Queue Size Limits

Currently no hard limit on queue size, but consider:
- Each query takes 3-10 seconds to process
- 10 queries = ~30-100 seconds total
- UI remains responsive throughout

**Future Enhancement:** Could add queue size limit or warning for very large queues.

### Memory Usage

Each queue item stores:
```javascript
{
  question: string,       // ~100-500 bytes
  placeholderId: number,  // 8 bytes
  id: number             // 8 bytes
}
```

**Total:** ~200-600 bytes per queued query

Even 100 queued queries would only use ~50KB of memory.

## Concurrency Control

### Why Not Parallel Processing?

We could process queries in parallel, but we don't because:

1. **API Rate Limits** - Backend may have rate limits
2. **Resource Contention** - Embedding generation is CPU/memory intensive
3. **Predictable Behavior** - Sequential is easier to reason about
4. **Order Matters** - Users expect responses in order

### Processing Flag

```javascript
const processingRef = useRef(false)
```

Uses a ref (not state) to avoid race conditions where multiple useEffect calls try to process simultaneously.

## Testing Scenarios

### Test 1: Rapid Submission
1. Submit 5 queries quickly
2. All should queue immediately
3. Each should process in order
4. Status updates correctly

### Test 2: Error Handling
1. Submit query that will fail (e.g., no documents)
2. Query marked as failed
3. Next queued query processes automatically

### Test 3: Mixed Input
1. Submit text query
2. Submit another while first processes
3. Clear input and submit third
4. All process correctly in order

### Test 4: Page State
1. Submit queries
2. Navigate away from component
3. Return - queue should continue from where it left off (or reset, depending on routing)

## Future Enhancements

### Priority Queue
Allow certain queries to jump to front of queue.

### Query Cancellation
Add "Cancel" button for queued queries.

### Batch Processing
Group similar queries for optimized processing.

### Persistence
Save queue to localStorage for recovery after page refresh.

### Progress Bar
Show detailed progress for each query:
- Retrieving chunks (30%)
- Generating embeddings (60%)
- Querying AI (90%)

## Modified Files

1. **`src/components/ChatPanel.jsx`**
   - Added queue state and processing
   - Removed input blocking
   - Added status indicators

2. **`src/components/QueryInterface.jsx`**
   - Added queue state and processing
   - Removed input blocking
   - Added queue counter display

## Summary

The query queue system dramatically improves user experience by:
- ✅ Removing blocking behavior
- ✅ Allowing rapid query submission
- ✅ Providing clear status feedback
- ✅ Maintaining sequential processing order
- ✅ Handling errors gracefully

Users can now work more efficiently by submitting multiple questions upfront and receiving answers as they complete.
