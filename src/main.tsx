import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { RuntimeErrorBoundary } from './components/shell/RuntimeErrorBoundary.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RuntimeErrorBoundary>
      <App />
    </RuntimeErrorBoundary>
  </StrictMode>,
)
