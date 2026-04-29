import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { initStore } from './data/store.js'
import './index.css'

async function bootstrap() {
  try {
    await initStore()
  } catch (error) {
    console.warn('Failed to initialize persistent store, continuing without it.', error)
  }

  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
}

bootstrap()
