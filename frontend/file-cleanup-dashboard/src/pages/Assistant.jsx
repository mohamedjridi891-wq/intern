import { useEffect, useRef, useState } from 'react'
import { Send, Eye, Sparkles } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from 'recharts'
import { sendChatMessage } from '../lib/api'
function ChatChart({ chart }) {
  const data = chart.labels.map((l, i) => ({ name: l, value: chart.values[i] }))
  return (
    <div className="mt-2 rounded-xl border border-slate-100 bg-white p-3 dark:border-slate-800 dark:bg-navy-950/40">
      <p className="mb-2 text-xs font-semibold text-slate-500 dark:text-slate-400">{chart.title}</p>
      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#94A3B8' }} axisLine={false} tickLine={false} interval={0} angle={-15} textAnchor="end" height={50} />
            <YAxis tick={{ fontSize: 10, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
            <Tooltip />
            <Bar dataKey="value" fill="#2563EB" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function ChatTable({ table }) {
  return (
    <div className="mt-2 overflow-hidden rounded-xl border border-slate-100 dark:border-slate-800">
      <table className="w-full text-left text-xs">
        <thead className="bg-slate-50 dark:bg-navy-950/40">
          <tr>{table.columns.map(c => <th key={c} className="px-3 py-2 font-semibold text-slate-500 dark:text-slate-400">{c}</th>)}</tr>
        </thead>
        <tbody>
          {table.rows.map((row, i) => (
            <tr key={i} className="border-t border-slate-100 dark:border-slate-800">
              {row.map((cell, j) => <td key={j} className="px-3 py-2 text-slate-600 dark:text-slate-300">{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ChatFileCards({ files }) {
  return (
    <div className="mt-2 grid gap-2 sm:grid-cols-2">
      {files.map(f => (
        <div key={f.file_id} className="flex items-center gap-2 rounded-xl border border-slate-100 bg-white p-2.5 text-xs dark:border-slate-800 dark:bg-navy-950/40">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-900/30 dark:text-brand-400">
            <span className="text-[10px] font-semibold">{f.extension || 'F'}</span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-slate-700 dark:text-slate-200">{f.name}</p>
            <p className="truncate font-mono text-[10px] text-slate-400">{f.path}</p>
          </div>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-navy-900/60 dark:text-slate-300">{f.label || 'Unknown'}</span>
        </div>
      ))}
    </div>
  )
}

const STARTER_PROMPTS = [
  "What's taking up the most space?",
  'Show me files I haven\'t opened in years.',
  'Are there any duplicate contracts?',
  'Give me a breakdown of all files by label.',
]

export default function Assistant() {
  const [messages, setMessages] = useState([
    { role: 'assistant', text: "Hi! I'm your file assistant — view only, so I can search and explain, but never delete or move anything. What would you like to know about this folder?" },
  ])
  const [input, setInput] = useState('')
  const [typing, setTyping] = useState(false)
  const [sessionId, setSessionId] = useState(null)
  const endRef = useRef(null)

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, typing])

  async function send(text) {
    const msg = text ?? input
    if (!msg.trim()) return
    setMessages(m => [...m, { role: 'user', text: msg }])
    setInput('')
    setTyping(true)

    try {
      const data = await sendChatMessage(sessionId, msg)
      if (data.error) {
        throw new Error(data.error)
      }
      setSessionId(data.session_id)
      setMessages(m => [...m, {
        role: 'assistant',
        text: data.answer || 'No answer returned.',
        chart: data.widgets?.chart,
        table: data.widgets?.table,
        files: data.widgets?.file_cards,
      }])
    } catch (err) {
      console.error('Backend error:', err)
      setMessages(m => [...m, { role: 'assistant', text: `Error: ${err.message}. Please try again later.` }])
    } finally {
      setTyping(false)
    }
  }

  return (
    <div className="flex h-[calc(100vh-128px)] gap-4">
      <div className="flex flex-1 flex-col rounded-2xl border border-slate-200 bg-white shadow-soft dark:border-slate-800 dark:bg-navy-900">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white"><Sparkles className="h-4 w-4" /></span>
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">File Assistant</p>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            <Eye className="h-3.5 w-3.5" /> Assistant — view only
          </span>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                m.role === 'user'
                  ? 'bg-brand-600 text-white'
                  : 'bg-slate-50 text-slate-700 dark:bg-navy-950/60 dark:text-slate-200'
              }`}>
                <p className="leading-relaxed">{m.text}</p>
                {m.chart && <ChatChart chart={m.chart} />}
                {m.table && <ChatTable table={m.table} />}
                {m.files && <ChatFileCards files={m.files} />}
                {m.files && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {m.files.map(f => (
                      <span key={f.file_id} className="rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-mono text-slate-500 ring-1 ring-slate-200 dark:bg-navy-900/60 dark:text-slate-400 dark:ring-slate-700">
                        {f.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          {typing && (
            <div className="flex justify-start">
              <div className="flex gap-1 rounded-2xl bg-slate-50 px-4 py-3 dark:bg-navy-950/60">
                {[0, 1, 2].map(i => <span key={i} className="h-1.5 w-1.5 animate-pulse rounded-full bg-slate-400" style={{ animationDelay: `${i * 150}ms` }} />)}
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        {messages.length <= 1 && (
          <div className="flex flex-wrap gap-1.5 px-4 pb-2">
            {STARTER_PROMPTS.map(p => (
              <button key={p} onClick={() => send(p)} className="focus-ring rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700">
                {p}
              </button>
            ))}
          </div>
        )}

        <form
          onSubmit={(e) => { e.preventDefault(); send() }}
          className="flex items-center gap-2 border-t border-slate-100 p-3 dark:border-slate-800"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about your files…"
            className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-navy-950/60 dark:text-slate-100"
          />
          <button type="submit" className="focus-ring flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white hover:bg-brand-700">
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  )
}
