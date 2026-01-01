import React, { useState, useEffect, useCallback } from 'react'
import ProjectManager from './services/projectManager'
import ProjectList from './components/ProjectList'
import ProjectCreator from './components/ProjectCreator'
import ProjectEditor from './components/ProjectEditor'
import { saveDirectoryHandle, loadDirectoryHandle } from './services/directoryHandleStorage'

export default function App() {
  // State management
  const [projects, setProjects] = useState([])
  const [selectedProject, setSelectedProject] = useState(null)
  const [showCreator, setShowCreator] = useState(false)
  const [projectManager, setProjectManager] = useState(null)
  const [isInitialized, setIsInitialized] = useState(false)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  // Initialize the app on mount
  useEffect(() => {
    const initializeApp = async () => {
      try {
        setLoading(true)
        setError(null)

        // Check if File System Access API is supported
        if (!window.showDirectoryPicker) {
          throw new Error(
            'Your browser does not support the File System Access API. ' +
            'Please use Chrome, Edge, or another Chromium-based browser.'
          )
        }

        // Try to get stored root directory handle from localStorage
        const storedHandle = await loadStorageHandle()
        
        if (storedHandle) {
          // Use the stored handle
          const manager = new ProjectManager(storedHandle)
          setProjectManager(manager)
          setIsInitialized(true)
          await loadProjects(manager)
        } else {
          // Not yet initialized - user needs to set up storage
          setIsInitialized(false)
        }
      } catch (err) {
        console.error('Initialization error:', err)
        setError(err.message || 'Failed to initialize the application')
      } finally {
        setLoading(false)
      }
    }

    initializeApp()
  }, [])

  // Load projects from projectManager
  const loadProjects = useCallback(async (manager) => {
    try {
      const projectList = await manager.listProjects()
      setProjects(projectList)
    } catch (err) {
      console.error('Failed to load projects:', err)
      setError('Failed to load projects. Please try again.')
    }
  }, [])

  // Load storage handle from IndexedDB
  const loadStorageHandle = async () => {
    try {
      const handle = await loadDirectoryHandle()
      return handle
    } catch (err) {
      console.error('Error loading storage handle:', err)
      return null
    }
  }

  // Initialize storage - user picks a folder
  const handleInitializeStorage = async () => {
    try {
      setLoading(true)
      setError(null)

      // Show directory picker
      const dirHandle = await window.showDirectoryPicker({
        id: 'legal-storage',
        mode: 'readwrite',
        startIn: 'documents',
      })

      // Save the directory handle to IndexedDB
      await saveDirectoryHandle(dirHandle)

      // Initialize ProjectManager with the selected directory
      const manager = new ProjectManager(dirHandle)
      setProjectManager(manager)
      setIsInitialized(true)

      // Load projects
      await loadProjects(manager)
    } catch (err) {
      if (err.name === 'AbortError') {
        // User cancelled the picker
        setError(null)
      } else {
        console.error('Storage initialization error:', err)
        setError('Failed to set up storage. Please ensure you have the correct permissions.')
      }
    } finally {
      setLoading(false)
    }
  }

  // Create a new project
  const handleCreateProject = async (projectName) => {
    if (!projectManager) {
      setError('Project manager not initialized')
      return
    }

    try {
      setLoading(true)
      setError(null)

      await projectManager.createProject(projectName)
      setShowCreator(false)
      setSelectedProject(projectName)
      await loadProjects(projectManager)
    } catch (err) {
      console.error('Failed to create project:', err)
      setError(`Failed to create project: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  // Select a project
  const handleSelectProject = async (projectName) => {
    if (!projectManager) {
      setError('Project manager not initialized')
      return
    }

    try {
      setLoading(true)
      setError(null)

      await projectManager.switchProject(projectName)
      setSelectedProject(projectName)
    } catch (err) {
      console.error('Failed to select project:', err)
      setError(`Failed to select project: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  // Delete a project
  const handleDeleteProject = async (projectName) => {
    if (!window.confirm(`Are you sure you want to delete "${projectName}"? This action cannot be undone.`)) {
      return
    }

    try {
      setLoading(true)
      setError(null)

      await projectManager.deleteProject(projectName)

      if (selectedProject === projectName) {
        setSelectedProject(null)
      }

      await loadProjects(projectManager)
    } catch (err) {
      console.error('Failed to delete project:', err)
      setError(`Failed to delete project: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  // Render loading state
  if (loading && !isInitialized) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-900 to-slate-800">
        <div className="text-center">
          <div className="mb-4">
            <div className="inline-block w-12 h-12 border-4 border-slate-700 border-t-blue-500 rounded-full animate-spin"></div>
          </div>
          <p className="text-slate-300">Loading application...</p>
        </div>
      </div>
    )
  }

  // Render initialization screen
  if (!isInitialized) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 p-4">
        <div className="w-full max-w-md">
          <div className="bg-slate-800 rounded-lg p-8 shadow-2xl border border-slate-700">
            <h1 className="text-3xl font-bold text-white mb-2">AI case assistance</h1>
            <p className="text-slate-400 mb-8">Privacy-first document analysis for attorneys</p>

            <div className="bg-slate-700/50 rounded-lg p-6 mb-8 border border-slate-600">
              <h2 className="text-lg font-semibold text-white mb-4">Get Started</h2>
              <p className="text-slate-300 text-sm mb-4">
                Choose a folder on your computer to store your legal documents and projects. 
                Your data will never leave your device.
              </p>
              <p className="text-slate-400 text-xs mb-6">
                ✓ Privacy-first architecture<br />
                ✓ All processing happens locally<br />
                ✓ Zero data retention<br />
              </p>
            </div>

            {error && (
              <div className="mb-6 p-4 bg-red-900/20 border border-red-700 rounded-lg">
                <p className="text-red-300 text-sm">{error}</p>
              </div>
            )}

            <button
              onClick={handleInitializeStorage}
              className="w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold py-3 px-4 rounded-lg transition-colors disabled:opacity-50"
              disabled={loading}
            >
              {loading ? 'Setting up...' : 'Choose Storage Folder'}
            </button>

            <p className="text-slate-500 text-xs text-center mt-6">
              Your documents are stored locally and encrypted on your device.
            </p>
          </div>
        </div>
      </div>
    )
  }

  // Render main app layout
  return (
    <div className="flex flex-col h-screen bg-gradient-to-br from-slate-900 to-slate-800">
      {/* Header */}
      <header className="bg-slate-900 border-b border-slate-700 px-6 py-4 shadow-lg">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-2xl font-bold text-white">AI case assistance</h1>
          <p className="text-slate-400 text-sm">Privacy-first document analysis and compliance</p>
        </div>
      </header>

      {/* Error message */}
      {error && (
        <div className="mx-6 mt-4 p-4 bg-red-900/20 border border-red-700 rounded-lg">
          <p className="text-red-300 text-sm flex items-center justify-between">
            <span>{error}</span>
            <button
              onClick={() => setError(null)}
              className="text-red-400 hover:text-red-300 font-bold"
            >
              ×
            </button>
          </p>
        </div>
      )}

      {/* Main content */}
      <main className="flex flex-1 overflow-hidden w-full">
        {/* Sidebar - Project List */}
        <aside className="w-64 bg-slate-800 border-r border-slate-700 overflow-y-auto">
          <div className="p-4">
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-white mb-4">Projects</h2>
              {projects.length === 0 ? (
                <p className="text-slate-400 text-sm mb-6">No projects yet. Create one to get started.</p>
              ) : (
                <ProjectList
                  projects={projects}
                  selectedProject={selectedProject}
                  onSelectProject={handleSelectProject}
                  onDeleteProject={handleDeleteProject}
                />
              )}
            </div>

            <button
              onClick={() => setShowCreator(true)}
              className="w-full bg-green-600 hover:bg-green-700 active:bg-green-800 text-white font-semibold py-2 px-4 rounded-lg transition-colors text-sm"
              disabled={loading}
            >
              + New Project
            </button>
          </div>
        </aside>

        {/* Main content area */}
        <section className="flex-1 overflow-y-auto p-6 max-w-7xl mx-auto w-full">
          {showCreator ? (
            <div className="max-w-2xl">
              <ProjectCreator
                onCreateProject={handleCreateProject}
                onCancel={() => setShowCreator(false)}
              />
            </div>
          ) : selectedProject && projectManager ? (
            <ProjectEditor
              projectName={selectedProject}
              projectManager={projectManager}
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <p className="text-slate-300 text-xl">Please select or create a project</p>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
