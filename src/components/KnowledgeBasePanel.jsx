import React, { useState, useEffect } from 'react'
import DocumentUpload from './DocumentUpload'

export default function KnowledgeBasePanel({ projectManager, projectName, onFilesChanged }) {
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [deleting, setDeleting] = useState(null)

  useEffect(() => {
    loadFiles()
  }, [projectName])

  const loadFiles = async () => {
    try {
      setLoading(true)
      setError('')

      const chunks = await projectManager.getProjectChunks()

      const fileMap = new Map()
      chunks.forEach(chunk => {
        const fileName = chunk.metadata?.fileName || 'Unknown'
        const sourceFile = chunk.metadata?.sourceFile || fileName

        if (!fileMap.has(fileName)) {
          fileMap.set(fileName, {
            name: sourceFile,
            internalName: fileName,
            chunkCount: 0,
            uploadedAt: new Date(chunk.metadata?.uploadedAt || Date.now()).toLocaleDateString()
          })
        }
        fileMap.get(fileName).chunkCount++
      })

      setFiles(Array.from(fileMap.values()))
    } catch (err) {
      console.error('Failed to load files:', err)
      setError('Failed to load files')
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteFile = async (internalName, displayName) => {
    if (!window.confirm(`Delete "${displayName}"? This cannot be undone.`)) {
      return
    }

    try {
      setDeleting(internalName)
      setError('')

      const result = await projectManager.deleteFileFromProject(internalName)
      console.log(`Deleted ${result.deleted} chunks, ${result.remaining} remaining`)

      await loadFiles()
      onFilesChanged()
    } catch (err) {
      console.error('Failed to delete file:', err)
      setError('Failed to delete file: ' + err.message)
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className="flex flex-col h-full gap-6 overflow-hidden">
      <div className="flex-shrink-0">
        <DocumentUpload
          projectManager={projectManager}
          onUploadComplete={() => {
            loadFiles()
            onFilesChanged()
          }}
        />
      </div>

      <div className="flex-1 overflow-hidden flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">
            Uploaded Files ({files.length})
          </h3>
          <button
            onClick={loadFiles}
            disabled={loading}
            className="text-sm text-slate-400 hover:text-slate-300 disabled:opacity-50 flex items-center gap-1"
          >
            {loading ? (
              <>
                <span className="inline-block w-3 h-3 border-2 border-slate-400 border-t-white rounded-full animate-spin"></span>
                Loading...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Refresh
              </>
            )}
          </button>
        </div>

        {error && (
          <div className="mb-3 p-3 bg-red-900/30 border border-red-700/50 rounded-lg">
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

        <div className="flex-1 overflow-y-auto border border-slate-600 rounded-lg bg-slate-700/30">
          {files.length === 0 ? (
            <div className="flex items-center justify-center h-full p-8">
              <div className="text-center max-w-md">
                <svg className="w-16 h-16 text-slate-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p className="text-slate-400">
                  No files uploaded yet. Upload documents to get started.
                </p>
              </div>
            </div>
          ) : (
            <div className="p-4 space-y-3">
              {files.map((file, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-4 bg-slate-700 rounded-lg border border-slate-600 hover:border-slate-500 transition-colors"
                >
                  <div className="flex-1 min-w-0 pr-4">
                    <p className="text-white font-medium truncate">{file.name}</p>
                    <div className="flex gap-4 mt-1 text-xs text-slate-400">
                      <span>{file.chunkCount} chunks</span>
                      <span>Uploaded {file.uploadedAt}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDeleteFile(file.internalName, file.name)}
                    disabled={deleting === file.internalName}
                    className="ml-4 px-3 py-1.5 text-sm text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                  >
                    {deleting === file.internalName ? (
                      <>
                        <span className="inline-block w-3 h-3 border-2 border-red-400 border-t-transparent rounded-full animate-spin"></span>
                        Deleting...
                      </>
                    ) : (
                      'Delete'
                    )}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
