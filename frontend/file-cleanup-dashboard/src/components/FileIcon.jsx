import { FileText, Sheet, Presentation, Image, Archive, Code2, FileWarning, Video, File } from 'lucide-react'

const MAP = { FileText, Sheet, Presentation, Image, Archive, Code2, FileWarning, Video }

export default function FileIcon({ icon, className = 'h-4 w-4' }) {
  const Icon = MAP[icon] || File
  return <Icon className={className} />
}
