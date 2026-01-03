import React, { useState, useEffect, useRef } from 'react'

function MessageContent({ content }) {
  const [showThinking, setShowThinking] = useState(false)

  const thinkMatch = content.match(/<think>([\s\S]*?)<\/think>([\s\S]*)/i)

  if (!thinkMatch) {
    return <p className="whitespace-pre-wrap break-words">{content}</p>
  }

  const thinkingContent = thinkMatch[1].trim()
  const actualContent = thinkMatch[2].trim()

  return (
    <div>
      {actualContent && (
        <p className="whitespace-pre-wrap break-words mb-3">{actualContent}</p>
      )}
      <div className="border-t border-slate-600 pt-2">
        <button
          onClick={() => setShowThinking(!showThinking)}
          className="flex items-center gap-2 text-xs text-slate-400 hover:text-slate-300 transition-colors"
        >
          <svg
            className={`w-4 h-4 transition-transform ${showThinking ? 'rotate-90' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span>{showThinking ? 'Hide' : 'Show'} thinking process</span>
        </button>
        {showThinking && (
          <div className="mt-2 p-3 bg-slate-800/50 rounded text-xs text-slate-300 whitespace-pre-wrap break-words">
            {thinkingContent}
          </div>
        )}
      </div>
    </div>
  )
}

function SourcesExpander({ sources }) {
  const [showSources, setShowSources] = useState(false)

  if (!sources || sources.length === 0) {
    return null
  }

  return (
    <div className="mt-1">
      <button
        onClick={() => setShowSources(!showSources)}
        className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-300 transition-colors"
      >
        <svg
          className={`w-3 h-3 transition-transform ${showSources ? 'rotate-90' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <span>{sources.length} sources</span>
      </button>
      {showSources && (
        <div className="mt-2 space-y-2 max-h-[600px] overflow-y-auto">
          {sources.map((chunk, index) => {
            const metadata = chunk.metadata || {}
            const hasPageInfo = metadata.pageStart !== undefined && metadata.pageStart !== null

            return (
              <div key={index} className="p-3 bg-slate-800/50 rounded text-xs">
                <div className="flex items-center gap-2 mb-2 text-slate-400 flex-wrap">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span className="font-medium">{chunk.fileName}</span>
                  {hasPageInfo && (
                    <span className="text-blue-400">
                      • Page{metadata.pageStart !== metadata.pageEnd ? 's' : ''} {metadata.pageStart}
                      {metadata.pageStart !== metadata.pageEnd && `-${metadata.pageEnd}`}
                    </span>
                  )}
                  <span className="text-slate-500">• Similarity: {(chunk.similarity * 100).toFixed(1)}%</span>
                </div>
                <div className="text-slate-300 whitespace-pre-wrap break-words leading-relaxed max-h-none">
                  {chunk.content}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function ChatPanel({ projectManager, projectName, documentCount }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [queryQueue, setQueryQueue] = useState([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState('')
  const messagesEndRef = useRef(null)
  const processingRef = useRef(false)

  useEffect(() => {
    const savedMessages = localStorage.getItem(`chat_history_${projectName}`)
    if (savedMessages) {
      try {
        setMessages(JSON.parse(savedMessages))
      } catch (err) {
        console.error('Failed to load chat history:', err)
      }
    } else {
      setMessages([])
    }
  }, [projectName])

  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem(`chat_history_${projectName}`, JSON.stringify(messages))
    }
  }, [messages, projectName])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Process query queue
  useEffect(() => {
    const processQueue = async () => {
      if (processingRef.current || queryQueue.length === 0) {
        return
      }

      processingRef.current = true
      setIsProcessing(true)

      const currentQuery = queryQueue[0]

      // Update message status to processing
      setMessages(prev => prev.map(msg =>
        msg.id === currentQuery.placeholderId
          ? { ...msg, status: 'processing' }
          : msg
      ))

      try {
        const result = await projectManager.queryProject(currentQuery.question)

        const aiMessage = {
          id: Date.now(),
          role: 'assistant',
          content: result.answer,
          sourcesCount: result.relevantChunks?.length || 0,
          sources: result.relevantChunks || [],
          timestamp: new Date().toLocaleTimeString(),
          status: 'completed'
        }

        // Update user message to completed and add AI response
        setMessages(prev => [
          ...prev.map(msg =>
            msg.id === currentQuery.placeholderId
              ? { ...msg, status: 'completed' }
              : msg
          ),
          aiMessage
        ])

        setError('')
      } catch (err) {
        console.error('Query error:', err)

        // Mark message as failed
        setMessages(prev => prev.map(msg =>
          msg.id === currentQuery.placeholderId
            ? { ...msg, status: 'failed', error: err.message }
            : msg
        ))

        setError(err.message || 'Failed to get response')
      }

      // Remove processed query from queue
      setQueryQueue(prev => prev.slice(1))
      processingRef.current = false
      setIsProcessing(false)
    }

    processQueue()
  }, [queryQueue, projectManager])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!input.trim()) return

    const questionText = input.trim()
    const messageId = Date.now()

    const userMessage = {
      id: messageId,
      role: 'user',
      content: questionText,
      timestamp: new Date().toLocaleTimeString(),
      status: 'queued'
    }

    setMessages(prev => [...prev, userMessage])
    setInput('')

    // Add to queue
    setQueryQueue(prev => [
      ...prev,
      {
        question: questionText,
        placeholderId: messageId
      }
    ])
  }

  const clearChat = () => {
    if (window.confirm('Clear all messages?')) {
      setMessages([])
      setError('')
      localStorage.removeItem(`chat_history_${projectName}`)
    }
  }

  return (
    <div className="flex flex-col h-full bg-slate-800/30 rounded-lg overflow-hidden">
      {messages.length > 0 && (
        <div className="flex-shrink-0 border-b border-slate-700 p-4 flex items-center justify-end">
          <button
            onClick={clearChat}
            className="text-sm text-slate-400 hover:text-slate-300 transition-colors"
          >
            Clear Chat
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center max-w-md">
              <svg className="w-16 h-16 text-slate-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <p className="text-slate-400">
                Start a conversation by asking a question about your documents.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg px-4 py-3 ${
                    msg.role === 'user'
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-700 text-slate-100'
                  }`}
                >
                  {msg.role === 'user' ? (
                    <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                  ) : (
                    <MessageContent content={msg.content} />
                  )}
                  <div className="flex items-center gap-2 mt-2 text-xs opacity-70">
                    <span>{msg.timestamp}</span>
                    {msg.role === 'user' && msg.status && (
                      <span className="flex items-center gap-1">
                        {msg.status === 'queued' && (
                          <>
                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                            </svg>
                            <span>Queued</span>
                          </>
                        )}
                        {msg.status === 'processing' && (
                          <>
                            <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            <span>Processing</span>
                          </>
                        )}
                        {msg.status === 'failed' && (
                          <>
                            <svg className="w-3 h-3 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                            </svg>
                            <span className="text-red-400">Failed</span>
                          </>
                        )}
                      </span>
                    )}
                  </div>
                  {msg.role === 'assistant' && msg.sources && msg.sources.length > 0 && (
                    <SourcesExpander sources={msg.sources} />
                  )}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      <div className="flex-shrink-0 border-t border-slate-700 p-4">
        {error && (
          <div className="mb-3 p-2 bg-red-900/30 border border-red-700/50 rounded text-sm text-red-300">
            {error}
          </div>
        )}
        {queryQueue.length > 0 && (
          <div className="mb-3 p-2 bg-blue-900/30 border border-blue-700/50 rounded text-sm text-blue-300 flex items-center gap-2">
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span>
              Processing {queryQueue.length} {queryQueue.length === 1 ? 'query' : 'queries'}...
            </span>
          </div>
        )}
        <form onSubmit={handleSubmit} className="flex gap-3">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSubmit(e)
              }
            }}
            placeholder="Ask a question about your documents..."
            className="flex-1 resize-none bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
            rows={3}
          />
          <button
            type="submit"
            disabled={!input.trim()}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors self-end"
          >
            Send
          </button>
        </form>
        <p className="text-xs text-slate-500 mt-2">
          Press Enter to send, Shift+Enter for new line{queryQueue.length > 0 ? ' • Queries are processed in order' : ''}
        </p>
      </div>
    </div>
  )
}
