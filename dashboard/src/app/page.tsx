'use client'

import { useState, useEffect, useRef } from 'react'
import { AGENT_ENDPOINTS, AGENT_NODES, CATEGORIES, CHAIN } from '@/lib/constants'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

type Phase = 'greeting' | 'category_select' | 'strategy_select' | 'config_form' | 'deploying' | 'running'

interface ChatMessage {
  role: 'bot' | 'user'
  text: string
  typing?: boolean
}

interface ReActStep {
  thought: string
  action: string
  observation: string
  timestamp: number
}

interface PricePoint {
  time: string
  binance: number
  coindcx: number
}

interface A2AEdge {
  from: string
  to: string
  label: string
  timestamp: number
}

interface LedgerEntry {
  txHash: string
  action: string
  amount: string
  timestamp: string
  status: 'confirmed' | 'pending'
}

interface PnLData {
  gross_profit: number
  net_profit: number
  roi_pct: number
  trades_executed: number
  success_rate: number
}

interface Config {
  budget: number
  risk_level: 'low' | 'medium' | 'high'
  auto_reinvest: boolean
}

export default function HomePage() {
  // ===== PHASE & CHAT STATE =====
  const [phase, setPhase] = useState<Phase>('greeting')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [selectedStrategy, setSelectedStrategy] = useState<string | null>(null)
  const [config, setConfig] = useState<Config>({ budget: 1000, risk_level: 'medium', auto_reinvest: false })
  const [deployStep, setDeployStep] = useState(0)
  const [businessId, setBusinessId] = useState<string | null>(null)

  // ===== DASHBOARD STATE =====
  const [reactSteps, setReactSteps] = useState<ReActStep[]>([])
  const [priceData, setPriceData] = useState<PricePoint[]>([])
  const [a2aEdges, setA2aEdges] = useState<A2AEdge[]>([])
  const [ledger, setLedger] = useState<LedgerEntry[]>([])
  const [pnl, setPnl] = useState<PnLData>({ gross_profit: 0, net_profit: 0, roi_pct: 0, trades_executed: 0, success_rate: 0 })
  const [showDashboard, setShowDashboard] = useState(false)

  // ===== REFS =====
  const chatEndRef = useRef<HTMLDivElement>(null)

  // ===== GREETING EFFECT =====
  useEffect(() => {
    if (phase === 'greeting') {
      addBotMessage('👋 Welcome to **AutoCorp v2.0** — Your AI-powered autonomous business engine.', 1000)
      setTimeout(() => {
        addBotMessage('I can deploy a **self-operating business entity** on Ethereum Sepolia that:\n\n• Monitors markets 24/7\n• Executes arbitrage trades\n• Records all P&L on-chain\n• Coordinates multi-agent workflows via A2A protocol', 2500)
        setTimeout(() => {
          addBotMessage('Ready to launch your autonomous venture? Choose a business category below:', 1500)
          setTimeout(() => setPhase('category_select'), 1800)
        }, 3500)
      }, 1500)
    }
  }, [phase])

  // ===== SSE HOOK (RUNNING PHASE) =====
  useEffect(() => {
    if (phase !== 'running' || !businessId) return

    const eventSources: EventSource[] = []
    const endpoints = [
      { url: `${AGENT_ENDPOINTS.price_monitor}/stream`, agent: 'price_monitor' },
      { url: `${AGENT_ENDPOINTS.procurement}/stream`, agent: 'procurement' },
      { url: `${AGENT_ENDPOINTS.sales}/stream`, agent: 'sales' },
      { url: `${AGENT_ENDPOINTS.logistics}/stream`, agent: 'logistics' },
      { url: `${AGENT_ENDPOINTS.accountant}/stream`, agent: 'accountant' },
      { url: `${AGENT_ENDPOINTS.masteragent}/stream`, agent: 'founder' },
    ]

    endpoints.forEach(({ url, agent }) => {
      const es = new EventSource(url)

      es.addEventListener('react_step', (e: any) => {
        const step = JSON.parse(e.data)
        setReactSteps(prev => [...prev.slice(-9), { ...step, timestamp: Date.now() }])
      })

      es.addEventListener('price_update', (e: any) => {
        const { binance, coindcx } = JSON.parse(e.data)
        setPriceData(prev => [...prev.slice(-19), { time: new Date().toLocaleTimeString(), binance, coindcx }])
      })

      es.addEventListener('a2a_message', (e: any) => {
        const { from, to, action } = JSON.parse(e.data)
        setA2aEdges(prev => [...prev.slice(-14), { from, to, label: action, timestamp: Date.now() }])
      })

      es.addEventListener('transaction', (e: any) => {
        const tx = JSON.parse(e.data)
        setLedger(prev => [tx, ...prev.slice(0, 9)])
      })

      es.addEventListener('pnl_update', (e: any) => {
        setPnl(JSON.parse(e.data))
      })

      es.onerror = () => {
        console.warn(`[SSE] ${agent} connection lost, will retry...`)
      }

      eventSources.push(es)
    })

    return () => {
      eventSources.forEach(es => es.close())
    }
  }, [phase, businessId])

  // ===== CHAT HELPERS =====
  const addBotMessage = (text: string, delay: number = 0) => {
    setTimeout(() => {
      setMessages(prev => [...prev, { role: 'bot', text, typing: true }])
      setTimeout(() => {
        setMessages(prev => prev.map((m, i) => i === prev.length - 1 ? { ...m, typing: false } : m))
      }, Math.min(text.length * 30, 2000))
    }, delay)
  }

  const addUserMessage = (text: string) => {
    setMessages(prev => [...prev, { role: 'user', text }])
  }

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ===== CATEGORY SELECTION =====
  const handleCategorySelect = (catId: string) => {
    const cat = CATEGORIES.find(c => c.id === catId)!
    setSelectedCategory(catId)
    addUserMessage(`${cat.emoji} ${cat.name}`)
    addBotMessage(`Great choice! **${cat.name}** is trending with **${cat.users} active users** and an average ROI of **${cat.avg_roi}%**.`, 800)
    setTimeout(() => {
      addBotMessage(`Now pick a sub-strategy:`, 1200)
      setTimeout(() => setPhase('strategy_select'), 1500)
    }, 1500)
  }

  // ===== STRATEGY SELECTION =====
  const handleStrategySelect = (stratId: string) => {
    const cat = CATEGORIES.find(c => c.id === selectedCategory)!
    const strat = cat.sub_strategies.find(s => s.id === stratId)!
    setSelectedStrategy(stratId)
    addUserMessage(strat.name)
    addBotMessage(`**${strat.name}** selected.\n\n${strat.description}\n\n• ROI: ${strat.typical_roi}\n• Risk: ${strat.risk}\n• Speed: ${strat.speed}`, 800)
    setTimeout(() => {
      addBotMessage('Configure your business parameters:', 1200)
      setTimeout(() => setPhase('config_form'), 1500)
    }, 1500)
  }

  // ===== CONFIG SUBMIT =====
  const handleConfigSubmit = () => {
    addUserMessage(`Budget: $${config.budget} | Risk: ${config.risk_level} | Auto-reinvest: ${config.auto_reinvest ? 'Yes' : 'No'}`)
    addBotMessage('Perfect! Deploying your autonomous business now...', 800)
    setTimeout(() => setPhase('deploying'), 1200)
    startDeployment()
  }

  // ===== DEPLOYMENT SEQUENCE =====
  const startDeployment = async () => {
    const steps = [
      { msg: '🔐 Connecting to Ethereum Sepolia...', delay: 1500 },
      { msg: '📜 Generating business charter with Gemini AI...', delay: 2500 },
      { msg: '⛓️  Deploying BusinessEntity smart contract...', delay: 3000 },
      { msg: '💰 Funding wallet with USDC...', delay: 2000 },
      { msg: '🤖 Spinning up 6 agent servers...', delay: 2500 },
      { msg: '✅ Business deployed! Going live...', delay: 1500 },
    ]

    for (let i = 0; i < steps.length; i++) {
      await new Promise(resolve => setTimeout(resolve, steps[i].delay))
      setDeployStep(i + 1)
      addBotMessage(steps[i].msg, 0)
    }

    // Mock businessId for demo
    const mockId = `0x${Math.random().toString(16).substring(2, 10)}`
    setBusinessId(mockId)
    
    setTimeout(() => {
      addBotMessage(`🎉 **Your business is LIVE!**\n\nContract: [${mockId}](${CHAIN.explorer}/address/${mockId})\n\nWatch your agents work in the dashboard panels sliding in now...`, 1000)
      setTimeout(() => {
        setPhase('running')
        setShowDashboard(true)
      }, 2000)
    }, 1800)
  }

  // ===== RENDER =====
  return (
    <div className="relative min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 text-white overflow-hidden">
      
      {/* ===== BACKGROUND GRID ===== */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute inset-0" style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
          backgroundSize: '50px 50px'
        }} />
      </div>

      {/* ===== MAIN CONTAINER ===== */}
      <div className="relative z-10 flex h-screen">

        {/* ===== LEFT: CHAT PANEL ===== */}
        <div className={`transition-all duration-700 ${showDashboard ? 'w-1/3' : 'w-full max-w-3xl mx-auto'} flex flex-col p-8`}>
          
          {/* HEADER */}
          <div className="mb-8">
            <h1 className="text-5xl font-bold bg-gradient-to-r from-yellow-400 via-purple-400 to-blue-400 bg-clip-text text-transparent">
              AutoCorp
            </h1>
            <p className="text-gray-400 mt-2">Autonomous Business on Blockchain</p>
          </div>

          {/* CHAT MESSAGES */}
          <div className="flex-1 overflow-y-auto space-y-4 mb-6 pr-4 custom-scrollbar">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-md px-5 py-3 rounded-2xl animate-chat-bubble ${
                  msg.role === 'user' 
                    ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white' 
                    : 'bg-gray-800 border border-gray-700 text-gray-100'
                }`}>
                  {msg.typing ? (
                    <span className="animate-typewriter">{msg.text}</span>
                  ) : (
                    <div className="prose prose-invert prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: msg.text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br/>') }} />
                  )}
                </div>
              </div>
            ))}
            
            {/* CATEGORY CARDS */}
            {phase === 'category_select' && (
              <div className="grid grid-cols-1 gap-4 mt-6 animate-panel-appear">
                {CATEGORIES.sort((a, b) => a.rank - b.rank).map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => handleCategorySelect(cat.id)}
                    className="group relative bg-gradient-to-br from-gray-800 to-gray-900 border border-gray-700 p-6 rounded-xl text-left hover:border-purple-500 hover:shadow-2xl hover:shadow-purple-500/20 transition-all duration-300 hover:-translate-y-1"
                  >
                    <div className="flex items-start gap-4">
                      <div className="text-5xl">{cat.emoji}</div>
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-xl font-bold text-white">{cat.name}</h3>
                          <span className="px-2 py-1 bg-purple-500/20 text-purple-300 text-xs rounded-full">#{cat.rank}</span>
                        </div>
                        <p className="text-gray-400 text-sm mb-3">{cat.description}</p>
                        <div className="flex gap-4 text-xs">
                          <span className="text-yellow-400">👥 {cat.users} users</span>
                          <span className="text-green-400">📈 {cat.avg_roi}% avg ROI</span>
                        </div>
                      </div>
                    </div>
                    <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-purple-500/10 to-transparent rounded-bl-full opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                ))}
              </div>
            )}

            {/* STRATEGY CARDS */}
            {phase === 'strategy_select' && selectedCategory && (
              <div className="space-y-3 mt-6 animate-panel-appear">
                {CATEGORIES.find(c => c.id === selectedCategory)!.sub_strategies.map(strat => (
                  <button
                    key={strat.id}
                    onClick={() => handleStrategySelect(strat.id)}
                    className="w-full bg-gray-800 border border-gray-700 p-5 rounded-xl text-left hover:border-blue-500 hover:shadow-lg hover:shadow-blue-500/20 transition-all duration-300"
                  >
                    <h4 className="text-lg font-semibold text-white mb-2">{strat.name}</h4>
                    <p className="text-gray-400 text-sm mb-3">{strat.description}</p>
                    <div className="flex gap-3 text-xs">
                      <span className="px-2 py-1 bg-green-500/20 text-green-300 rounded">💰 {strat.typical_roi}</span>
                      <span className="px-2 py-1 bg-yellow-500/20 text-yellow-300 rounded">⚠️ {strat.risk}</span>
                      <span className="px-2 py-1 bg-blue-500/20 text-blue-300 rounded">⚡ {strat.speed}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* CONFIG FORM */}
            {phase === 'config_form' && (
              <div className="bg-gray-800 border border-gray-700 p-6 rounded-xl mt-6 animate-panel-appear">
                <div className="space-y-5">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Budget (USD)</label>
                    <input
                      type="number"
                      value={config.budget}
                      onChange={(e) => setConfig({ ...config, budget: parseInt(e.target.value) || 0 })}
                      className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-purple-500 transition"
                      min="100"
                      max="100000"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Risk Level</label>
                    <select
                      value={config.risk_level}
                      onChange={(e) => setConfig({ ...config, risk_level: e.target.value as any })}
                      className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-purple-500 transition"
                    >
                      <option value="low">Low (Conservative)</option>
                      <option value="medium">Medium (Balanced)</option>
                      <option value="high">High (Aggressive)</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={config.auto_reinvest}
                      onChange={(e) => setConfig({ ...config, auto_reinvest: e.target.checked })}
                      className="w-5 h-5 rounded border-gray-700 bg-gray-900 text-purple-500 focus:ring-purple-500"
                    />
                    <label className="text-sm text-gray-300">Auto-reinvest profits</label>
                  </div>
                  <button
                    onClick={handleConfigSubmit}
                    className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white font-semibold py-3 rounded-lg transition-all duration-300 hover:shadow-lg hover:shadow-purple-500/50"
                  >
                    🚀 Deploy Business
                  </button>
                </div>
              </div>
            )}

            {/* DEPLOYMENT PROGRESS */}
            {phase === 'deploying' && (
              <div className="bg-gray-800 border border-gray-700 p-6 rounded-xl mt-6 animate-panel-appear">
                <div className="space-y-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className={`flex items-center gap-3 ${i < deployStep ? 'opacity-100' : 'opacity-30'}`}>
                      {i < deployStep ? (
                        <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center text-xs">✓</div>
                      ) : (
                        <div className="w-6 h-6 rounded-full border-2 border-gray-600" />
                      )}
                      <span className="text-sm text-gray-300">Step {i + 1} of 6</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div ref={chatEndRef} />
          </div>

          {/* RUNNING CONTROLS */}
          {phase === 'running' && (
            <div className="flex gap-3">
              <button className="flex-1 bg-red-600 hover:bg-red-500 text-white py-3 rounded-lg transition font-semibold">
                ⏸️ Pause
              </button>
              <button className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-3 rounded-lg transition font-semibold">
                📊 Report
              </button>
            </div>
          )}
        </div>

        {/* ===== RIGHT: DASHBOARD PANELS ===== */}
        {showDashboard && (
          <div className="w-2/3 p-8 grid grid-cols-2 gap-6 overflow-y-auto custom-scrollbar animate-panel-appear">
            
            {/* PANEL 1: AGENT BRAIN (ReAct Steps) */}
            <div className="bg-gray-800/50 backdrop-blur border border-gray-700 rounded-xl p-5 col-span-2">
              <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                <span className="animate-pulse-dot inline-block w-3 h-3 bg-green-400 rounded-full"></span>
                🧠 Agent Brain (ReAct Loop)
              </h3>
              <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar">
                {reactSteps.slice(-5).map((step, i) => (
                  <div key={i} className="bg-gray-900/50 p-3 rounded-lg text-xs font-mono border border-gray-700">
                    <div className="text-yellow-400">💭 Thought: {step.thought}</div>
                    <div className="text-blue-400 mt-1">⚡ Action: {step.action}</div>
                    <div className="text-green-400 mt-1">👁️ Observation: {step.observation}</div>
                  </div>
                ))}
                {reactSteps.length === 0 && <p className="text-gray-500 text-sm">Waiting for agent activity...</p>}
              </div>
            </div>

            {/* PANEL 2: PRICE CHART */}
            <div className="bg-gray-800/50 backdrop-blur border border-gray-700 rounded-xl p-5">
              <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                📈 Live Price Monitor
              </h3>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={priceData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="time" tick={{ fill: '#9CA3AF', fontSize: 10 }} />
                  <YAxis tick={{ fill: '#9CA3AF', fontSize: 10 }} />
                  <Tooltip contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151' }} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Line type="monotone" dataKey="binance" stroke="#3B82F6" strokeWidth={2} dot={false} name="Binance" />
                  <Line type="monotone" dataKey="coindcx" stroke="#F59E0B" strokeWidth={2} dot={false} name="CoinDCX" />
                </LineChart>
              </ResponsiveContainer>
              {priceData.length === 0 && (
                <div className="h-48 flex items-center justify-center text-gray-500 text-sm">
                  Waiting for price data...
                </div>
              )}
            </div>

            {/* PANEL 3: AGENT NETWORK (A2A) */}
            <div className="bg-gray-800/50 backdrop-blur border border-gray-700 rounded-xl p-5">
              <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                🌐 Agent Network (A2A)
              </h3>
              <svg viewBox="0 0 400 250" className="w-full h-48">
                {/* Nodes */}
                {AGENT_NODES.map((node, i) => {
                  const angle = (i / AGENT_NODES.length) * 2 * Math.PI - Math.PI / 2
                  const x = 200 + Math.cos(angle) * 80
                  const y = 125 + Math.sin(angle) * 80
                  return (
                    <g key={node.id}>
                      <circle cx={x} cy={y} r="12" fill="#8B5CF6" className="animate-pulse-dot" />
                      <text x={x} y={y + 25} textAnchor="middle" fill="#D1D5DB" fontSize="10">{node.label}</text>
                    </g>
                  )
                })}
                {/* Edges */}
                {a2aEdges.slice(-8).map((edge, i) => {
                  const fromNode = AGENT_NODES.find(n => n.id === edge.from)
                  const toNode = AGENT_NODES.find(n => n.id === edge.to)
                  if (!fromNode || !toNode) return null
                  const fromIdx = AGENT_NODES.indexOf(fromNode)
                  const toIdx = AGENT_NODES.indexOf(toNode)
                  const angle1 = (fromIdx / AGENT_NODES.length) * 2 * Math.PI - Math.PI / 2
                  const angle2 = (toIdx / AGENT_NODES.length) * 2 * Math.PI - Math.PI / 2
                  const x1 = 200 + Math.cos(angle1) * 80
                  const y1 = 125 + Math.sin(angle1) * 80
                  const x2 = 200 + Math.cos(angle2) * 80
                  const y2 = 125 + Math.sin(angle2) * 80
                  return (
                    <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#3B82F6" strokeWidth="2" opacity="0.6" className="animate-edge-flash" />
                  )
                })}
              </svg>
              {a2aEdges.length === 0 && (
                <div className="h-48 flex items-center justify-center text-gray-500 text-sm">
                  Waiting for agent messages...
                </div>
              )}
            </div>

            {/* PANEL 4: ON-CHAIN LEDGER */}
            <div className="bg-gray-800/50 backdrop-blur border border-gray-700 rounded-xl p-5 col-span-2">
              <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                ⛓️ On-Chain Ledger (Sepolia)
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-gray-400 border-b border-gray-700">
                    <tr>
                      <th className="text-left py-2">Tx Hash</th>
                      <th className="text-left py-2">Action</th>
                      <th className="text-left py-2">Amount</th>
                      <th className="text-left py-2">Time</th>
                      <th className="text-left py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="text-gray-300">
                    {ledger.slice(0, 5).map((entry, i) => (
                      <tr key={i} className="border-b border-gray-800">
                        <td className="py-2 font-mono text-xs text-blue-400">
                          <a href={`${CHAIN.explorer}/tx/${entry.txHash}`} target="_blank" rel="noopener" className="hover:underline">
                            {entry.txHash.slice(0, 10)}...
                          </a>
                        </td>
                        <td className="py-2">{entry.action}</td>
                        <td className="py-2 text-green-400">{entry.amount}</td>
                        <td className="py-2 text-xs text-gray-500">{entry.timestamp}</td>
                        <td className="py-2">
                          <span className={`px-2 py-1 rounded text-xs ${entry.status === 'confirmed' ? 'bg-green-500/20 text-green-300' : 'bg-yellow-500/20 text-yellow-300'}`}>
                            {entry.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {ledger.length === 0 && (
                  <div className="h-32 flex items-center justify-center text-gray-500 text-sm">
                    No transactions yet...
                  </div>
                )}
              </div>
            </div>

            {/* PANEL 5: P&L TRACKER */}
            <div className="bg-gray-800/50 backdrop-blur border border-gray-700 rounded-xl p-5 col-span-2">
              <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                💰 Profit & Loss Tracker
              </h3>
              <div className="grid grid-cols-5 gap-4">
                <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-700">
                  <div className="text-xs text-gray-400 mb-1">Gross Profit</div>
                  <div className="text-2xl font-bold text-green-400">${pnl.gross_profit.toFixed(2)}</div>
                </div>
                <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-700">
                  <div className="text-xs text-gray-400 mb-1">Net Profit</div>
                  <div className="text-2xl font-bold text-blue-400">${pnl.net_profit.toFixed(2)}</div>
                </div>
                <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-700">
                  <div className="text-xs text-gray-400 mb-1">ROI</div>
                  <div className="text-2xl font-bold text-purple-400">{pnl.roi_pct.toFixed(1)}%</div>
                </div>
                <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-700">
                  <div className="text-xs text-gray-400 mb-1">Trades</div>
                  <div className="text-2xl font-bold text-yellow-400">{pnl.trades_executed}</div>
                </div>
                <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-700">
                  <div className="text-xs text-gray-400 mb-1">Success Rate</div>
                  <div className="text-2xl font-bold text-green-400">{pnl.success_rate.toFixed(0)}%</div>
                </div>
              </div>
            </div>

          </div>
        )}

      </div>

      {/* CUSTOM SCROLLBAR STYLE */}
      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(31, 41, 55, 0.5);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(139, 92, 246, 0.5);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(139, 92, 246, 0.8);
        }
      `}</style>
    </div>
  )
}
