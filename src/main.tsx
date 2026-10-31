import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'leaflet/dist/leaflet.css'
import './tokens.css'
import './index.css'
import App from './App'
import './design.css'

const systemTheme=window.matchMedia('(prefers-color-scheme: light)')
const applyTheme=()=>{document.documentElement.dataset.theme=localStorage.getItem('together:theme') || (systemTheme.matches?'light':'dark')}
applyTheme()
systemTheme.addEventListener('change',applyTheme)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
