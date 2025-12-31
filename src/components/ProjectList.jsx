import React from 'react'

export default function ProjectList({ projects, selectedProject, onSelectProject }) {
  const formatDate = (dateString) => {
    if (!dateString) return ''
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  if (!projects || projects.length === 0) {
    return (
      <div className="text-slate-400 text-sm py-4">
        No projects yet
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {projects.map((project) => (
        <button
          key={project.name}
          onClick={() => onSelectProject(project.name)}
          className={`w-full text-left px-4 py-3 rounded-lg transition-all duration-200 ${
            selectedProject === project.name
              ? 'bg-blue-600 text-white shadow-lg'
              : 'bg-slate-700 text-slate-100 hover:bg-slate-600 hover:text-white'
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="font-semibold truncate">{project.name}</p>
              <p className="text-xs mt-1 opacity-75">
                {project.fileCount || 0} file{project.fileCount !== 1 ? 's' : ''}
              </p>
              {project.createdAt && (
                <p className="text-xs mt-0.5 opacity-60">
                  {formatDate(project.createdAt)}
                </p>
              )}
            </div>
          </div>
        </button>
      ))}
    </div>
  )
}
