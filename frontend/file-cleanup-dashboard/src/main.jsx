import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import { FolderProvider } from './components/FolderContext.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <FolderProvider>
        <App />
      </FolderProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
