import React, { useState, useRef } from 'react'

export default function DocumentUpload({ projectManager, onUploadComplete }) {
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [uploadedFiles, setUploadedFiles] = useState([])
  const [error, setError] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef(null)

  const handleFileSelect = async (file) => {
    if (!file) return

    // Validate file type
    const validTypes = ['.pdf', '.txt', '.doc', '.docx']
    const fileName = file.name.toLowerCase()
    const hasValidType = validTypes.some(type => fileName.endsWith(type))

    if (!hasValidType) {
      setError(`Invalid file type. Accepted formats: ${validTypes.join(', ')}`)
      return
    }

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024
    if (file.size > maxSize) {
      setError('File size exceeds 10MB limit')
      return
    }

    try {
      setError('')
      setUploading(true)
      setProgress(0)

      // Upload document with progress tracking
      const result = await projectManager.uploadDocumentToProject(file, {
        onProgress: (current, total, percentage) => {
          setProgress(percentage)
        }
      })

      setProgress(100)

      // Add to uploaded files list
      setUploadedFiles(prev => [
        ...prev,
        {
          name: file.name,
          chunkCount: result.chunkCount,
          uploadedAt: new Date().toLocaleString()
        }
      ])

      // Reset after a short delay
      setTimeout(() => {
        setProgress(0)
        setUploading(false)
        if (onUploadComplete) {
          onUploadComplete()
        }
      }, 500)
    } catch (err) {
      console.error('Upload error:', err)
      setError(err.message || 'Failed to upload document. Please try again.')
      setUploading(false)
      setProgress(0)
    }
  }

  const handleDragOver = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleDragLeave = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    const files = e.dataTransfer.files
    if (files.length > 0) {
      handleFileSelect(files[0])
    }
  }

  const handleInputChange = (e) => {
    const files = e.target.files
    if (files.length > 0) {
      handleFileSelect(files[0])
    }
  }

  const handleClickUpload = () => {
    fileInputRef.current?.click()
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-semibold text-white mb-4">Upload Documents</h3>
        <p className="text-slate-400 text-sm">Add legal documents to your project for analysis and search</p>
      </div>

      {/* Drag and drop zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleClickUpload}
        className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all ${
          isDragging
            ? 'border-blue-500 bg-blue-500/10'
            : 'border-slate-500 bg-slate-700/50 hover:border-slate-400 hover:bg-slate-700'
        } ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <input
          ref={fileInputRef}
          type="file"
          onChange={handleInputChange}
          accept=".pdf,.txt,.doc,.docx"
          className="hidden"
          disabled={uploading}
        />

        <div className="space-y-3">
          <div className="flex justify-center">
            <svg
              className="w-12 h-12 text-slate-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 12l2 2m0 0l2-2m-2 2v-6m0 6H7m12 0a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>

          {uploading ? (
            <div>
              <p className="text-slate-300 font-semibold">Processing document...</p>
              <p className="text-slate-400 text-sm mt-1">Please wait while we process your file</p>
            </div>
          ) : (
            <div>
              <p className="text-slate-200 font-semibold">Drag documents here or click to select</p>
              <p className="text-slate-400 text-sm mt-1">Supported: PDF, TXT, DOC, DOCX (Max 10MB)</p>
            </div>
          )}
        </div>
      </div>

      {/* Progress bar */}
      {uploading && progress > 0 && (
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <p className="text-sm text-slate-400">
              {progress < 100 ? 'Generating embeddings...' : 'Complete!'}
            </p>
            <p className="text-sm font-semibold text-blue-400">{Math.round(progress)}%</p>
          </div>
          <div className="w-full bg-slate-600 rounded-full h-2 overflow-hidden">
            <div
              className="bg-blue-500 h-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          {progress > 0 && progress < 100 && (
            <p className="text-xs text-slate-500">
              Processing in memory-efficient batches (50 chunks at a time)
            </p>
          )}
        </div>
      )}

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

      {/* Uploaded files list */}
      {uploadedFiles.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-slate-200">Uploaded in this session</h4>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {uploadedFiles.map((file, index) => (
              <div key={index} className="p-3 bg-slate-700/50 rounded-lg border border-slate-600">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-200 truncate">{file.name}</p>
                    <div className="flex items-center gap-4 text-xs text-slate-400 mt-1">
                      <span className="flex items-center gap-1">
                        <svg className="w-3 h-3 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                        {file.chunkCount} chunks
                      </span>
                      <span>{file.uploadedAt}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Success message */}
      {uploadedFiles.length > 0 && !uploading && (
        <div className="p-4 bg-green-900/30 border border-green-700/50 rounded-lg">
          <p className="text-sm text-green-300">
            ✓ Documents uploaded successfully! You can now ask questions about them.
          </p>
        </div>
      )}
    </div>
  )
}
