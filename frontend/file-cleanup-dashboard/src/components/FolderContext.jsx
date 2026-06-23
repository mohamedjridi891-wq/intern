import { createContext, useContext, useState, useEffect } from 'react'

const FolderContext = createContext(null)

export function FolderProvider({ children }) {
  const [selectedFolder, setSelectedFolder] = useState('')
  const [folderHistory, setFolderHistory] = useState([])

  useEffect(() => {
    if (selectedFolder) {
      setFolderHistory(prev => {
        if (!prev.includes(selectedFolder)) {
          return [selectedFolder, ...prev].slice(0, 10)
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
