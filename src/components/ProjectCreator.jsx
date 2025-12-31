import React, { useState } from 'react'

export default function ProjectCreator({ onCreateProject, onCancel }) {
  const [projectName, setProjectName] = useState('')
  const [error, setError] = useState('')

  const handleCreate = async () => {
    if (!projectName.trim()) {
      setError('Project name cannot be empty')
      return
    }

    if (projectName.trim().length < 2) {
      setError('Project name must be at least 2 characters')
      return
    }

    try {
      setError('')
      await onCreateProject(projectName.trim())
      setProjectName('')
    } catch (err) {
      setError(err.message || 'Failed to create project')
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && projectName.trim()) {
      handleCreate()
    }
    if (e.key === 'Escape') {
      handleCancel()
    }
  }

  const handleCancel = () => {
    setProjectName('')
    setError('')
    onCancel()
  }

  const isCreateDisabled = !projectName.trim()

  return (
    <div className="bg-slate-700 rounded-lg p-8 shadow-xl border border-slate-600 max-w-md">
      <h2 className="text-2xl font-bold text-white mb-6">Create New Project</h2>

      <div className="mb-6">
        <label htmlFor="projectName" className="block text-sm font-medium text-slate-200 mb-2">
          Project Name
        </label>
        <input
          id="projectName"
          type="text"
          value={projectName}
          onChange={(e) => {
            setProjectName(e.target.value)
            if (error) setError('')
          }}
          onKeyDown={handleKeyDown}
          placeholder="e.g., Smith v. Johnson"
          className="w-full px-4 py-2 bg-slate-600 border border-slate-500 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 transition-all"
          autoFocus
        />
        <p className="text-xs text-slate-400 mt-2">
          Use clear, descriptive names for easy identification
        </p>
      </div>

      {error && (
        <div className="mb-6 p-3 bg-red-900/30 border border-red-700/50 rounded-lg">
          <p className="text-sm text-red-300">{error}</p>
        </div>
      )}

      <div className="flex gap-3">
        <button
          onClick={handleCreate}
          disabled={isCreateDisabled}
          className="flex-1 bg-green-600 hover:bg-green-700 active:bg-green-800 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-2 px-4 rounded-lg transition-colors"
        >
          Create Project
        </button>
        <button
          onClick={handleCancel}
          className="flex-1 bg-slate-600 hover:bg-slate-500 active:bg-slate-700 text-slate-100 font-semibold py-2 px-4 rounded-lg transition-colors"
        >
          Cancel
        </button>
      </div>

      <p className="text-xs text-slate-500 text-center mt-4">
        Press <kbd className="bg-slate-600 px-1.5 py-0.5 rounded text-slate-300">Enter</kbd> to create or <kbd className="bg-slate-600 px-1.5 py-0.5 rounded text-slate-300">Esc</kbd> to cancel
      </p>
    </div>
  )
}
