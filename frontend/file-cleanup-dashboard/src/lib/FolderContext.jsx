import { createContext, useContext, useState, useEffect } from 'react'

const FolderContext = createContext(null)

export function FolderProvider({ children }) {
  const [selectedFolder, setSelectedFolder] = useState('')
  const [folderHistory, setFolderHistory] = useState([])

  // Load from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('selectedFolder')
    if (saved) {
      setSelectedFolder(saved)
    }
  }, [])

  // Save to localStorage when changes
  useEffect(() => {
    if (selectedFolder) {
      localStorage.setItem('selectedFolder', selectedFolder)
      // Add to history if not already there
      setFolderHistory(prev => {
        if (!prev.includes(selectedFolder)) {
          return [selectedFolder, ...prev].slice(0, 10) // Keep last 10
        }
        return prev
      })
    }
  }, [selectedFolder])

  const value = {
    selectedFolder,
    setSelectedFolder,
    folderHistory,
    clearHistory: () => setFolderHistory([]),
  }

  return (
    <FolderContext.Provider value={value}>
      {children}
    </FolderContext.Provider>
  )
}

export function useFolderContext() {
  const context = useContext(FolderContext)
  if (!context) {
    throw new Error('useFolderContext must be used within FolderProvider')
  }
  return context
}
