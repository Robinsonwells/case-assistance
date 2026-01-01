import React, { useState, useEffect, useRef } from 'react'

export default function ChatPanel({ projectManager, projectName, documentCount }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const messagesEndRef = useRef(null)

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

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!input.trim() || loading) return

    const userMessage = {
      id: Date.now(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date().toLocaleTimeString()
    }

    setMessages(prev => [...prev, userMessage])
    setInput('')
    setLoading(true)
    setError('')

    try {
      const result = await projectManager.queryProject(input.trim())

      const aiMessage = {
        id: Date.now() + 1,
        role: 'assistant',
        content: result.answer,
        sourcesCount: result.relevantChunks?.length || 0,
        timestamp: new Date().toLocaleTimeString()
      }

      setMessages(prev => [...prev, aiMessage])
    } catch (err) {
      console.error('Query error:', err)
      setError(err.message || 'Failed to get response')
    } finally {
      setLoading(false)
    }
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
                  <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                  <div className="flex items-center gap-2 mt-2 text-xs opacity-70">
                    <span>{msg.timestamp}</span>
                    {msg.role === 'assistant' && msg.sourcesCount > 0 && (
                      <span>• {msg.sourcesCount} sources</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-slate-700 rounded-lg px-4 py-3">
                  <div className="flex items-center gap-2 text-slate-400">
                    <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                    <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                    <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                  </div>
                </div>
              </div>
            )}
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
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors self-end"
          >
            {loading ? 'Sending...' : 'Send'}
          </button>
        </form>
        <p className="text-xs text-slate-500 mt-2">
          Press Enter to send, Shift+Enter for new line
        </p>
      </div>
    </div>
  )
}
