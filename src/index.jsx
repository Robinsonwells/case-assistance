import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// Error handling for React initialization
try {
  const rootElement = document.getElementById('root')
  
  if (!rootElement) {
    throw new Error('Root element not found. Make sure index.html contains a <div id="root"></div>')
  }

  const root = ReactDOM.createRoot(rootElement)
  
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
} catch (error) {
  console.error('Failed to mount React application:', error)
  document.body.innerHTML = `
    <div style="padding: 20px; font-family: system-ui; color: #ef4444;">
      <h1>Application Error</h1>
      <p>${error.message}</p>
      <details>
        <summary>Details</summary>
        <pre>${error.stack}</pre>
      </details>
    </div>
  `
}
