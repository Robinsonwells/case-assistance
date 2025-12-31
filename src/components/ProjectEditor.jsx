import React, { useState, useEffect } from 'react'
import DocumentUpload from './DocumentUpload'
import QueryInterface from './QueryInterface'

export default function ProjectEditor({ projectName, projectManager }) {
  const [projectMetadata, setProjectMetadata] = useState(null)
  const [documentCount, setDocumentCount] = useState(0)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [chunkCount, setChunkCount] = useState(0)

  // Load project metadata on mount
  useEffect(() => {
    loadProjectMetadata()
  }, [projectName])

  const loadProjectMetadata = async () => {
    try {
      setIsRefreshing(true)
      setError('')

      // Get all chunks from project to count them
      const chunks = await projectManager.getProjectChunks()
      setChunkCount(chunks.length)

      // Get project info (this would be implemented in ProjectManager)
      // For now, we'll calculate from chunks
      const uniqueFiles = new Set()
      chunks.forEach(chunk => {
        if (chunk.metadata?.fileName) {
          uniqueFiles.add(chunk.metadata.fileName)
        }
      })

      setDocumentCount(uniqueFiles.size)
      setProjectMetadata({
        name: projectName,
        fileCount: uniqueFiles.size,
        chunkCount: chunks.length,
        createdAt: new Date().toLocaleDateString(),
        lastQueried: null
      })
    } catch (err) {
      console.error('Failed to load project metadata:', err)
      setError('Failed to load project information')
    } finally {
      setIsRefreshing(false)
    }
  }

  const handleUploadComplete = async () => {
    await loadProjectMetadata()
  }

  const handleDeleteProject = async () => {
    if (!window.confirm(`Are you sure you want to delete "${projectName}"? This action cannot be undone.`)) {
      return
    }

    try {
      setIsRefreshing(true)
      setError('')
      // Delete would be implemented in ProjectManager
      // await projectManager.deleteProject(projectName)
      // Then navigate back to project list
      alert('Project deletion would be implemented in ProjectManager')
    } catch (err) {
      console.error('Failed to delete project:', err)
      setError('Failed to delete project')
    } finally {
      setIsRefreshing(false)
    }
  }

  return (
    <div className="flex flex-col h-full gap-6">
      {/* Header */}
      <div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-3xl font-bold text-white mb-2">{projectName}</h2>
            <p className="text-slate-400 text-sm">
              Manage documents and query your legal materials
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={loadProjectMetadata}
              disabled={isRefreshing}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 active:bg-slate-800 disabled:opacity-50 text-slate-100 font-medium rounded-lg transition-colors flex items-center gap-2"
            >
              {isRefreshing ? (
                <>
                  <span className="inline-block w-3 h-3 border-2 border-slate-300 border-t-white rounded-full animate-spin"></span>
                  Refreshing...
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
        </div>

        {/* Error message */}
        {error && (
          <div className="mt-4 p-3 bg-red-900/30 border border-red-700/50 rounded-lg">
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
      </div>

      {/* Project metadata sidebar */}
      {projectMetadata && (
        <div className="grid grid-cols-4 gap-4">
          <div className="p-4 bg-slate-700/50 rounded-lg border border-slate-600">
            <p className="text-slate-400 text-xs font-medium mb-1">Created</p>
            <p className="text-white font-semibold text-lg">{projectMetadata.createdAt}</p>
          </div>
          <div className="p-4 bg-slate-700/50 rounded-lg border border-slate-600">
            <p className="text-slate-400 text-xs font-medium mb-1">Documents</p>
            <p className="text-white font-semibold text-lg">{projectMetadata.fileCount}</p>
          </div>
          <div className="p-4 bg-slate-700/50 rounded-lg border border-slate-600">
            <p className="text-slate-400 text-xs font-medium mb-1">Chunks</p>
            <p className="text-white font-semibold text-lg">{projectMetadata.chunkCount}</p>
          </div>
          <div className="p-4 bg-slate-700/50 rounded-lg border border-slate-600">
            <p className="text-slate-400 text-xs font-medium mb-1">Last Queried</p>
            <p className="text-white font-semibold text-lg">
              {projectMetadata.lastQueried || '—'}
            </p>
          </div>
        </div>
      )}

      {/* Main content - two sections */}
      <div className="grid grid-cols-2 gap-6 flex-1 overflow-hidden">
        {/* Document Upload section */}
        <div className="bg-slate-700/30 rounded-lg p-6 border border-slate-600 overflow-y-auto">
          <DocumentUpload
            projectManager={projectManager}
            onUploadComplete={handleUploadComplete}
          />
        </div>

        {/* Query Interface section */}
        <div className="bg-slate-700/30 rounded-lg p-6 border border-slate-600 overflow-y-auto">
          <QueryInterface
            projectManager={projectManager}
            projectName={projectName}
          />
        </div>
      </div>

      {/* Footer actions */}
      <div className="flex justify-between items-center pt-4 border-t border-slate-700">
        <div className="text-xs text-slate-500">
          Project workspace • {projectMetadata?.fileCount || 0} document{projectMetadata?.fileCount !== 1 ? 's' : ''}
        </div>
        <button
          onClick={handleDeleteProject}
          className="px-4 py-2 bg-red-900/20 hover:bg-red-900/30 active:bg-red-900/40 text-red-400 hover:text-red-300 font-medium rounded-lg transition-colors border border-red-700/30"
        >
          Delete Project
        </button>
      </div>
    </div>
  )
}
