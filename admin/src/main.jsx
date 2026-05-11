import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { initAdminMonitoring } from './monitoring/sentry'
import './index.css'
import App from './App.jsx'

initAdminMonitoring()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
