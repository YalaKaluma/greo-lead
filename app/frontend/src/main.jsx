import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css' // ← CRITICAL: Import Tailwind CSS

import { hydrateSessionCredentials } from './sessionCredentials.js'

async function startApp() {
  await hydrateSessionCredentials()
  await import('./authenticatedTransport.js')
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )
}

startApp()
