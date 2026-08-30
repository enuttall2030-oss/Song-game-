import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { AppStateProvider } from './app/AppStateProvider'
import { ErrorBoundary } from './components/ErrorBoundary'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <AppStateProvider>
        <App />
      </AppStateProvider>
    </ErrorBoundary>
  </StrictMode>,
)
