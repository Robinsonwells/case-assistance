import React, { useState } from 'react'

export default function QueryInterface({ projectManager, projectName }) {
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [queriesHistory, setQueriesHistory] = useState([])
  const [showKeywordDetails, setShowKeywordDetails] = useState(false)

  const handleQuery = async () => {
    if (!question.trim()) {
      setError('Please enter a question')
      return
    }

    try {
      setError('')
      setLoading(true)
      setAnswer(null)

      // Query the project
      const result = await projectManager.queryProject(question)

      // Set answer
      setAnswer({
        text: result.answer,
        sourcesCount: result.relevantChunks?.length || 0,
        timestamp: new Date().toLocaleTimeString(),
        keywordData: result.keywordData || null,
        retrievalStats: result.retrievalStats || null
      })

      // Add to history
      setQueriesHistory(prev => [
        {
          id: Date.now(),
          question: question.trim(),
          answer: result.answer,
          sourcesCount: result.relevantChunks?.length || 0,
          timestamp: new Date().toLocaleString()
        },
        ...prev
      ])

      setQuestion('')
    } catch (err) {
      console.error('Query error:', err)
      setError(err.message || 'Failed to query documents. Please try again.')
      setAnswer(null)
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      handleQuery()
    }
  }

  const clearHistory = () => {
    if (window.confirm('Are you sure you want to clear the query history?')) {
      setQueriesHistory([])
    }
  }

  const formatAnswer = (text) => {
    if (!text) return ''
    // Preserve line breaks and add basic formatting
    return text.split('\n').map((line, idx) => (
      <div key={idx} className="mb-3">
        {line}
      </div>
    ))
  }

  return (
    <div className="space-y-6 h-full flex flex-col">
      {/* Header */}
      <div>
        <h3 className="text-xl font-semibold text-white mb-2">Ask About {projectName}</h3>
        <p className="text-slate-400 text-sm">Ask questions about your uploaded documents and get AI-powered answers</p>
      </div>

      {/* Query input section */}
      <div className="space-y-3">
        <label htmlFor="question" className="block text-sm font-medium text-slate-200">
          Your Question
        </label>
        <textarea
          id="question"
          value={question}
          onChange={(e) => {
            setQuestion(e.target.value)
            if (error) setError('')
          }}
          onKeyDown={handleKeyDown}
          placeholder="e.g., What are the key dates mentioned in the documents?"
          className="w-full px-4 py-3 bg-slate-600 border border-slate-500 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 transition-all resize-none"
          rows="4"
          disabled={loading}
        />
        <p className="text-xs text-slate-400">
          Tip: Ask specific questions for better results. Use Ctrl+Enter to submit.
        </p>
      </div>

      {/* Error message */}
      {error && (
        <div className="p-4 bg-red-900/30 border border-red-700/50 rounded-lg">
          <p className="text-sm text-red-300 flex items-start justify-between">
            <span>{error}</span>
            <button
              onClick={() => setError('')}
              className="text-red-400 hover:text-red-300 ml-4 font-bold"
            >
              ×
            </button>
          </p>
        </div>
      )}

      {/* Ask button */}
      <button
        onClick={handleQuery}
        disabled={loading || !question.trim()}
        className="w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
      >
        {loading ? (
          <>
            <span className="inline-block w-4 h-4 border-2 border-slate-300 border-t-white rounded-full animate-spin"></span>
            Processing...
          </>
        ) : (
          <>
            <span>Ask AI</span>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </>
        )}
      </button>

      {/* Answer section */}
      {answer && (
        <div className="space-y-3 flex-1 overflow-y-auto">
          {/* Retrieval Statistics */}
          {answer.retrievalStats && (
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 bg-blue-900/30 border border-blue-700/50 rounded-lg">
                <div className="text-xs text-blue-300 mb-1">Semantic</div>
                <div className="text-lg font-semibold text-blue-100">
                  {answer.retrievalStats.semanticCount}
                </div>
              </div>
              <div className="p-3 bg-green-900/30 border border-green-700/50 rounded-lg">
                <div className="text-xs text-green-300 mb-1">Keyword</div>
                <div className="text-lg font-semibold text-green-100">
                  {answer.retrievalStats.keywordCount}
                </div>
              </div>
              <div className="p-3 bg-purple-900/30 border border-purple-700/50 rounded-lg">
                <div className="text-xs text-purple-300 mb-1">Total</div>
                <div className="text-lg font-semibold text-purple-100">
                  {answer.retrievalStats.totalCount}
                </div>
              </div>
            </div>
          )}

          {/* Keyword Information */}
          {answer.keywordData && answer.keywordData.extracted && answer.keywordData.extracted.length > 0 && (
            <div className="p-4 bg-slate-700/50 border border-slate-600 rounded-lg">
              <button
                onClick={() => setShowKeywordDetails(!showKeywordDetails)}
                className="w-full flex items-center justify-between text-left"
              >
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                  </svg>
                  <span className="text-sm font-medium text-slate-200">
                    Keywords Extracted ({answer.keywordData.extracted.length})
                  </span>
                </div>
                <svg
                  className={`w-4 h-4 text-slate-400 transition-transform ${showKeywordDetails ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {showKeywordDetails && (
                <div className="mt-3 space-y-2">
                  {answer.keywordData.extracted.map((keyword, idx) => (
                    <div key={idx} className="p-2 bg-slate-800/50 rounded border border-slate-600/50">
                      <div className="text-sm font-medium text-slate-200 mb-1">
                        {keyword.term}
                      </div>
                      {keyword.variations && keyword.variations.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {keyword.variations.map((variation, vIdx) => (
                            <span
                              key={vIdx}
                              className="text-xs px-2 py-0.5 bg-slate-700 text-slate-300 rounded"
                            >
                              {variation}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                  {answer.keywordData.searchStats && (
                    <div className="mt-2 pt-2 border-t border-slate-600 text-xs text-slate-400">
                      <div className="flex items-center justify-between">
                        <span>Unique keywords matched:</span>
                        <span className="font-medium">{answer.keywordData.searchStats.uniqueKeywords}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Answer */}
          <div className="p-6 bg-slate-700 rounded-lg border border-slate-600 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <h4 className="text-sm font-semibold text-slate-200 mb-1">Answer</h4>
                <div className="text-xs text-slate-400">
                  {answer.sourcesCount > 0 ? (
                    <span className="flex items-center gap-1">
                      <svg className="w-3 h-3 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      Based on {answer.sourcesCount} relevant chunk{answer.sourcesCount !== 1 ? 's' : ''}
                    </span>
                  ) : (
                    <span>No sources found</span>
                  )}
                </div>
              </div>
              <span className="text-xs text-slate-500">{answer.timestamp}</span>
            </div>
            <div className="prose prose-invert text-sm text-slate-100 leading-relaxed max-w-none">
              {formatAnswer(answer.text)}
            </div>
          </div>
        </div>
      )}

      {/* Query history */}
      {queriesHistory.length > 0 && (
        <div className="space-y-3 border-t border-slate-700 pt-6 flex-1 overflow-y-auto">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-slate-200">Query History</h4>
            <button
              onClick={clearHistory}
              className="text-xs text-slate-400 hover:text-slate-300 transition-colors"
            >
              Clear history
            </button>
          </div>

          <div className="space-y-3">
            {queriesHistory.map((item) => (
              <div key={item.id} className="p-4 bg-slate-700/50 rounded-lg border border-slate-600 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-200 line-clamp-2">
                      Q: {item.question}
                    </p>
                    <p className="text-xs text-slate-400 mt-2 line-clamp-2">
                      A: {item.answer.substring(0, 100)}...
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-500">
                  <span className="flex items-center gap-1">
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M12.316 3.051a1 1 0 01.633 1.265l-4 12a1 1 0 11-1.898-.632l4-12a1 1 0 011.265-.633z" clipRule="evenodd" />
                    </svg>
                    {item.sourcesCount} chunk{item.sourcesCount !== 1 ? 's' : ''}
                  </span>
                  <span>{item.timestamp}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!answer && queriesHistory.length === 0 && !loading && (
        <div className="flex-1 flex items-center justify-center text-center py-12">
          <div>
            <svg className="w-16 h-16 text-slate-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-slate-400 text-sm max-w-xs">
              Ask a question about your documents to get started. The AI will search through your uploaded files and provide relevant answers.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
