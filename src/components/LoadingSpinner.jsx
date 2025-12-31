import React from 'react'

export default function LoadingSpinner({ message, size = 'md' }) {
  // Size configurations
  const sizeConfig = {
    sm: {
      spinner: 'w-6 h-6',
      text: 'text-xs'
    },
    md: {
      spinner: 'w-12 h-12',
      text: 'text-sm'
    },
    lg: {
      spinner: 'w-16 h-16',
      text: 'text-base'
    }
  }

  const config = sizeConfig[size] || sizeConfig.md

  return (
    <div className="flex flex-col items-center justify-center gap-4">
      {/* Spinner */}
      <div className={`${config.spinner} border-4 border-slate-700 border-t-blue-500 rounded-full animate-spin`}></div>

      {/* Message */}
      {message && (
        <p className={`${config.text} text-slate-300 font-medium`}>
          {message}
        </p>
      )}
    </div>
  )
}
