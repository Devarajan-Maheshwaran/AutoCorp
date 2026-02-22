'use client'

/* ═══════════════════════════════════════════════════════════════════
   AutoCorp v2.0 — Single-Page Mission Control
   Chat-first onboarding + 5-panel live dashboard on ONE page.
   ═══════════════════════════════════════════════════════════════════ */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts'
import { useAgentSSE }    from '@/hooks/useAgentSSE'
import { useAgentHealth }  from '@/hooks/useAgentHealth'
import { AGENT_NODES, CATEGORIES, CHAIN } from '@/lib/constants'
import { createBusiness, previewCharter, triggerPipeline, getPnL } from '@/lib/api'
import { dualPriceSeries } from '@/lib/chartDataHelpers'
import type { Charter, Business, AgentEvent, PnLState } from '@/lib/types'

// ── Types ────────────────────────────────────────────────────────

type Phase = 'greeting' | 'category' | 'strategy' | 'config' | 'deploying' | 'running'

interface ChatMsg {
  id: number
  role: 'bot' | 'user'
  text: string
  error?: boolean
}

interface DeployConfig {
  budgetInr: number
  durationDays: number
  profitTarget: number
  riskLevel: 'low' | 'medium' | 'high'
}

const INR_PER_USD = 83.5

// ── Helpers ──────────────────────────────────────────────────────

function actionColor(action: string): string {
  const a = (action || '').toUpperCase()
  if (['TRIGGER_BUY','EXECUTE_BUY','ACCEPT_OFFER','ENTER_FUNDING_ARB'].some(k => a.includes(k))) return 'text-green-400'
  if (['WAIT','HOLD','WAIT_BETTER_PRICE'].some(k => a.includes(k))) return 'text-yellow-400'
  if (['ABORT','SKIP','CUT_LOSS','REJECT'].some(k => a.includes(k))) return 'text-red-400'
  if (a.includes('CALL_TOOL')) return 'text-blue-400'
  return 'text-gray-400'
}

function ts(): string {
  return new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
}

// ── Typewriter component ─────────────────────────────────────────

function TypewriterText({ text, speed = 12 }: { text: string; speed?: number }) {
  const [len, setLen] = useState(0)
  useEffect(() => {
    setLen(0)
    let i = 0
    const timer = setInterval(() => {
      i++
      setLen(i)
      if (i >= text.length) clearInterval(timer)
    }, speed)
    return () => clearInterval(timer)
  }, [text, speed])
  return (
    <span>
      {text.slice(0, len)}
      {len < text.length && <span className="typing-cursor" />}
    </span>
  )
}

// ── Network node positions (SVG) ─────────────────────────────────

const NODE_POS: Record<string, { x: number; y: number }> = {
  founder:       { x: 55,  y: 95  },
  price_monitor: { x: 165, y: 35  },
  procurement:   { x: 275, y: 95  },
  logistics:     { x: 385, y: 155 },
  sales:         { x: 495, y: 95  },
  accountant:    { x: 575, y: 35  },
}

const EDGES = [
  ['founder', 'price_monitor'],
  ['founder', 'procurement'],
  ['founder', 'sales'],
  ['founder', 'accountant'],
  ['price_monitor', 'procurement'],
  ['procurement', 'logistics'],
  ['logistics', 'sales'],
  ['sales', 'accountant'],
]

// ═════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═════════════════════════════════════════════════════════════════

export default function AutoCorpApp() {

  // ── Phase & Chat ───────────────────────────
  const [phase, setPhase]                   = useState<Phase>('greeting')
  const [messages, setMessages]             = useState<ChatMsg[]>([])
  const [typing, setTyping]                 = useState(false)
  const [selectedCatId, setSelectedCatId]   = useState<string | null>(null)
  const [selectedStratId, setSelectedStratId] = useState<string | null>(null)
  const [config, setConfig]                 = useState<DeployConfig>({
    budgetInr: 30000, durationDays: 30, profitTarget: 15, riskLevel: 'medium',
  })
  const [business, setBusiness]             = useState<Business | null>(null)
  const [charter, setCharter]               = useState<Charter | null>(null)
  const [showDashboard, setShowDashboard]   = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  // ── Live data hooks ────────────────────────
  const sseState    = useAgentSSE()
  const agentHealth = useAgentHealth()

  // ── PnL fallback polling ───────────────────
  const [pollPnl, setPollPnl] = useState<PnLState | null>(null)
  useEffect(() => {
    if (phase !== 'running') return
    const poll = async () => {
      try { setPollPnl(await getPnL()) } catch { /* ignore */ }
    }
    poll()
    const iv = setInterval(poll, 5000)
    return () => clearInterval(iv)
  }, [phase])

  const livePnl: PnLState = pollPnl && pollPnl.total_spent > sseState.pnl.total_spent
    ? pollPnl : sseState.pnl

  // ── Derived data ───────────────────────────
  const selectedCat   = CATEGORIES.find(c => c.id === selectedCatId) ?? null
  const selectedStrat = selectedCat?.sub_strategies.find(s => s.id === selectedStratId) ?? null

  const chartData = useMemo(() =>
    dualPriceSeries(sseState.priceTicks.source, sseState.priceTicks.destination, 40),
    [sseState.priceTicks]
  )

  const connectedCount = Object.values(sseState.agentStatus).filter(s => s === 'connected').length
  const stepCount      = sseState.reactSteps.length

  // ── Chat helpers ───────────────────────────
  const addBot = useCallback((text: string, error = false) => {
    setMessages(prev => [...prev, { id: Date.now() + Math.random(), role: 'bot', text, error }])
  }, [])

  const addUser = useCallback((text: string) => {
    setMessages(prev => [...prev, { id: Date.now() + Math.random(), role: 'user', text }])
  }, [])

  const botTypeThen = useCallback((text: string, delay: number, error = false): Promise<void> => {
    return new Promise(resolve => {
      setTyping(true)
      setTimeout(() => {
        setTyping(false)
        addBot(text, error)
        resolve()
      }, delay)
    })
  }, [addBot])

  // Auto-scroll chat
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, typing])

  // ── Greeting ───────────────────────────────
  useEffect(() => {
    if (phase !== 'greeting') return
    const run = async () => {
      await botTypeThen(
        "Hey! I'm AutoCorp — an autonomous business engine powered by Gemini AI and Ethereum Sepolia. " +
        "I'll generate a smart contract, deploy a swarm of AI agents, and run a real business on your behalf. " +
        "Every decision, every trade, every on-chain transaction is visible in real time.\n\n" +
        "Choose a business model to get started:",
        1800
      )
      setPhase('category')
    }
    run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Phase: Category Select ─────────────────
  const handleCategorySelect = async (catId: string) => {
    const cat = CATEGORIES.find(c => c.id === catId)!
    setSelectedCatId(catId)
    addUser(`${cat.emoji} ${cat.name}`)
    await botTypeThen(
      `Great pick. **${cat.name}** has ${cat.users} active users with an average ROI of ${cat.avg_roi}%. ` +
      `Here are the strategies available:`,
      1200
    )
    setPhase('strategy')
  }

  // ── Phase: Strategy Select ─────────────────
  const handleStrategySelect = async (stratId: string) => {
    const strat = selectedCat!.sub_strategies.find(s => s.id === stratId)!
    setSelectedStratId(stratId)
    addUser(strat.name)
    await botTypeThen(
      `**${strat.name}**: ${strat.description}\n\n` +
      `• ROI: ${strat.typical_roi}\n• Risk: ${strat.risk}\n• Speed: ${strat.speed}\n\n` +
      `Configure your business parameters below:`,
      1200
    )
    setPhase('config')
  }

  // ── Phase: Deploy ──────────────────────────
  const handleDeploy = async () => {
    addUser(`₹${config.budgetInr.toLocaleString()} · ${config.durationDays}d · ${config.profitTarget}% target · ${config.riskLevel} risk`)
    setPhase('deploying')

    const params = {
      category: selectedCatId!,
      sub_strategy: selectedStratId!,
      budget_inr: config.budgetInr,
      duration_days: config.durationDays,
      min_profit_pct: config.profitTarget,
      risk_level: config.riskLevel,
    }

    // Step 1: Charter
    addBot('⏳ Generating charter with Gemini AI…')
    try {
      const c = await previewCharter(params)
      setCharter(c)
      addBot(`✅ Charter generated — asset: **${c.asset}**, budget: **$${c.budget_usdc} USDC**`)
    } catch (err: any) {
      addBot(`❌ Charter generation failed: ${err.message}\n\nFix: \`cd autocorp/core && python charter_server.py\``, true)
      return
    }

    // Step 2: Deploy contract
    addBot('⏳ Deploying BusinessEntity on Sepolia…')
    try {
      const biz = await createBusiness(params)
      setBusiness(biz)
      const addr = biz.contract_address || '0x…pending'
      addBot(`✅ Smart contract deployed\n   └─ Address: \`${addr}\``)
    } catch (err: any) {
      addBot(`❌ Deploy failed: ${err.message}\n\nFix: \`cd masteragent && npm run dev\``, true)
      return
    }

    // Step 3: Agents
    addBot('✅ All 5 agents configured')

    // Step 4: Pipeline
    addBot('⏳ Starting agent pipeline…')
    try {
      await triggerPipeline()
      addBot('✅ Pipeline started — price monitoring active')
    } catch {
      addBot('⚠️ Pipeline trigger failed — agents will auto-start on next price tick')
    }

    // Step 5: Go live
    setPhase('running')
    setTimeout(() => setShowDashboard(true), 400)
    addBot('🎉 Your business is LIVE! Watch the dashboard panels →')
  }

  // ── Reset ──────────────────────────────────
  const handleNewBusiness = () => {
    setMessages([])
    setPhase('greeting')
    setSelectedCatId(null)
    setSelectedStratId(null)
    setBusiness(null)
    setCharter(null)
    setShowDashboard(false)
    setPollPnl(null)
    setTimeout(async () => {
      await botTypeThen(
        "Hey! I'm AutoCorp — ready to deploy another business. Choose a category:",
        1200
      )
      setPhase('category')
    }, 100)
  }

  // ═══════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-[#030712]">

      {/* ── HEADER BAR ─────────────────────── */}
      <header className="h-12 flex items-center justify-between px-4 border-b border-white/[0.06] bg-white/[0.02] shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-base font-bold text-white tracking-tight">AutoCorp</span>
          <span className="text-xs text-gray-500 hidden sm:block">Autonomous Business Engine</span>
        </div>

        <div className="flex items-center gap-4">
          {/* Agent status dots */}
          <div className="hidden md:flex items-center gap-2">
            {AGENT_NODES.map(node => {
              const connected = sseState.agentStatus[node.id] === 'connected'
              return (
                <div key={node.id} className="flex items-center gap-1" title={node.label}>
                  <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400 animate-pulse-dot' : 'bg-gray-600'}`} />
                  <span className="text-[10px] text-gray-500">{node.label}</span>
                </div>
              )
            })}
          </div>

          {/* Chain badge */}
          <span className="text-[10px] font-mono text-gray-500 bg-white/5 px-2 py-0.5 rounded">
            Sepolia · {CHAIN.id}
          </span>

          {/* Trigger button */}
          {phase === 'running' && (
            <button
              onClick={() => triggerPipeline().catch(() => {})}
              className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-3 py-1 rounded transition-colors"
            >
              ▶ Trigger Pipeline
            </button>
          )}

          {/* Etherscan link */}
          {business?.contract_address && (
            <a
              href={`${CHAIN.explorer}/address/${business.contract_address}`}
              target="_blank" rel="noopener"
              className="text-xs text-blue-400 hover:text-blue-300 font-mono"
            >
              Etherscan ↗
            </a>
          )}
        </div>
      </header>

      {/* ── MAIN BODY ──────────────────────── */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">

        {/* ════════════════════════════════════
            LEFT: CHAT PANEL
            ════════════════════════════════════ */}
        <div className={`flex flex-col border-r border-white/[0.06] transition-all duration-700 ease-in-out ${
          showDashboard ? 'w-full lg:w-[400px] lg:min-w-[400px]' : 'w-full lg:max-w-2xl lg:mx-auto'
        }`}>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.map(msg => (
              <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-bubble-in`}>
                <div className={`max-w-[85%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                  msg.role === 'user'
                    ? 'bg-blue-600/25 border border-blue-500/20 text-white rounded-br-md'
                    : msg.error
                      ? 'bg-red-500/10 border border-red-500/20 text-red-300 rounded-bl-md'
                      : 'bg-white/[0.04] border border-white/[0.06] text-gray-200 rounded-bl-md'
                }`}
                  dangerouslySetInnerHTML={{
                    __html: msg.text
                      .replace(/\*\*(.*?)\*\*/g, '<strong class="text-white">$1</strong>')
                      .replace(/`(.*?)`/g, '<code class="text-blue-400 bg-blue-500/10 px-1 rounded text-xs font-mono">$1</code>')
                      .replace(/\n/g, '<br/>')
                  }}
                />
              </div>
            ))}

            {/* Typing indicator */}
            {typing && (
              <div className="flex justify-start animate-bubble-in">
                <div className="bg-white/[0.04] border border-white/[0.06] px-4 py-2.5 rounded-2xl rounded-bl-md">
                  <div className="flex gap-1">
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-pulse-dot" />
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-pulse-dot" style={{ animationDelay: '0.15s' }} />
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-pulse-dot" style={{ animationDelay: '0.3s' }} />
                  </div>
                </div>
              </div>
            )}

            {/* ── CATEGORY CARDS ──────────── */}
            {phase === 'category' && (
              <div className="space-y-2 pt-2 animate-fade-in">
                {[...CATEGORIES].sort((a, b) => b.users - a.users).map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => handleCategorySelect(cat.id)}
                    className="w-full text-left glass glass-hover rounded-xl p-4 transition-all duration-200 group"
                  >
                    <div className="flex items-start gap-3">
                      <span className="text-3xl mt-0.5">{cat.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-white text-sm">{cat.name}</h3>
                          <span className="text-[10px] text-gray-500">#{cat.rank}</span>
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">{cat.description}</p>
                        <div className="flex items-center gap-4 mt-2">
                          <span className="text-[11px] text-gray-500">👥 {cat.users} users</span>
                          <span className="text-[11px] text-green-400">↑ {cat.avg_roi}% ROI</span>
                        </div>
                        {/* Success rate bar */}
                        <div className="mt-2 h-1 w-full bg-white/5 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${Math.min(cat.avg_roi * 1.5, 100)}%`,
                              background: cat.color === 'yellow' ? '#eab308' : cat.color === 'blue' ? '#3b82f6' : '#a855f7'
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* ── STRATEGY CARDS ──────────── */}
            {phase === 'strategy' && selectedCat && (
              <div className="space-y-2 pt-2 animate-fade-in">
                {selectedCat.sub_strategies.map(strat => (
                  <button
                    key={strat.id}
                    onClick={() => handleStrategySelect(strat.id)}
                    className="w-full text-left glass glass-hover rounded-xl p-4 transition-all duration-200"
                  >
                    <h4 className="font-semibold text-white text-sm">{strat.name}</h4>
                    <p className="text-xs text-gray-400 mt-1">{strat.description}</p>
                    <div className="flex gap-3 mt-2">
                      <span className="text-[10px] px-2 py-0.5 bg-green-500/10 text-green-400 rounded-full">💰 {strat.typical_roi}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                        strat.risk === 'low' ? 'bg-green-500/10 text-green-400' :
                        strat.risk === 'medium' ? 'bg-yellow-500/10 text-yellow-400' :
                        'bg-red-500/10 text-red-400'
                      }`}>⚠️ {strat.risk}</span>
                      <span className="text-[10px] px-2 py-0.5 bg-blue-500/10 text-blue-400 rounded-full">⚡ {strat.speed}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* ── CONFIG FORM ──────────────── */}
            {phase === 'config' && (
              <div className="glass rounded-xl p-5 space-y-4 animate-fade-in">
                {/* Budget */}
                <div>
                  <label className="text-xs text-gray-400 mb-1.5 flex justify-between">
                    <span>Budget</span>
                    <span className="font-mono text-gray-300">₹{config.budgetInr.toLocaleString()} ≈ ${Math.round(config.budgetInr / INR_PER_USD)} USDC</span>
                  </label>
                  <input type="range" min={5000} max={500000} step={1000}
                    value={config.budgetInr}
                    onChange={e => setConfig(p => ({ ...p, budgetInr: parseInt(e.target.value) }))}
                    className="w-full accent-blue-500 h-1.5"
                  />
                </div>
                {/* Duration */}
                <div>
                  <label className="text-xs text-gray-400 mb-1.5 flex justify-between">
                    <span>Duration</span>
                    <span className="font-mono text-gray-300">{config.durationDays} days</span>
                  </label>
                  <input type="range" min={1} max={90} step={1}
                    value={config.durationDays}
                    onChange={e => setConfig(p => ({ ...p, durationDays: parseInt(e.target.value) }))}
                    className="w-full accent-blue-500 h-1.5"
                  />
                </div>
                {/* Profit target */}
                <div>
                  <label className="text-xs text-gray-400 mb-1.5 flex justify-between">
                    <span>Min. profit target</span>
                    <span className="font-mono text-gray-300">{config.profitTarget}%</span>
                  </label>
                  <input type="range" min={5} max={50} step={1}
                    value={config.profitTarget}
                    onChange={e => setConfig(p => ({ ...p, profitTarget: parseInt(e.target.value) }))}
                    className="w-full accent-blue-500 h-1.5"
                  />
                </div>
                {/* Risk level */}
                <div>
                  <label className="text-xs text-gray-400 mb-1.5 block">Risk level</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['low', 'medium', 'high'] as const).map(lvl => (
                      <button key={lvl}
                        onClick={() => setConfig(p => ({ ...p, riskLevel: lvl }))}
                        className={`py-1.5 rounded-lg text-xs font-medium transition-all ${
                          config.riskLevel === lvl
                            ? lvl === 'low' ? 'bg-green-500/20 text-green-400 ring-1 ring-green-500/30'
                              : lvl === 'medium' ? 'bg-yellow-500/20 text-yellow-400 ring-1 ring-yellow-500/30'
                              : 'bg-red-500/20 text-red-400 ring-1 ring-red-500/30'
                            : 'bg-white/5 text-gray-500 hover:bg-white/10'
                        }`}
                      >
                        {lvl.charAt(0).toUpperCase() + lvl.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
                {/* Deploy button */}
                <button
                  onClick={handleDeploy}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-semibold text-sm transition-all duration-200 hover:shadow-lg hover:shadow-blue-500/20"
                >
                  🚀 Deploy Business
                </button>
              </div>
            )}

            {/* ── RUNNING CONTROLS ─────────── */}
            {phase === 'running' && (
              <div className="space-y-2 pt-2 animate-fade-in">
                <div className="glass rounded-xl p-3 flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse-dot" />
                  <span className="text-xs text-green-400 font-medium">Agents running autonomously</span>
                  {business?.contract_address && (
                    <a href={`${CHAIN.explorer}/address/${business.contract_address}`}
                      target="_blank" rel="noopener"
                      className="text-[10px] font-mono text-blue-400 hover:underline ml-auto truncate max-w-[140px]">
                      {business.contract_address}
                    </a>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => triggerPipeline().then(() => addBot('▶ Pipeline triggered manually')).catch(() => addBot('⚠️ Trigger failed', true))}
                    className="flex-1 glass glass-hover rounded-lg py-2 text-xs text-gray-300 transition-colors"
                  >
                    ▶ Force Pipeline Run
                  </button>
                  <button
                    onClick={handleNewBusiness}
                    className="flex-1 glass glass-hover rounded-lg py-2 text-xs text-gray-300 transition-colors"
                  >
                    + New Business
                  </button>
                </div>
              </div>
            )}

            <div ref={chatEndRef} />
          </div>
        </div>

        {/* ════════════════════════════════════
            RIGHT: DASHBOARD PANELS
            ════════════════════════════════════ */}
        {showDashboard && (
          <div className="flex-1 overflow-y-auto p-4 grid grid-cols-12 gap-3 auto-rows-min animate-panel-slide">

            {/* ── PANEL 1: Agent Brain ──── */}
            <div className="col-span-12 glass rounded-xl p-4" style={{ animationDelay: '0.05s' }}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse-dot" />
                  🧠 Agent Brain
                </h3>
                <span className="text-[10px] font-mono text-gray-500">{stepCount} steps</span>
              </div>
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {sseState.reactSteps.length === 0 && (
                  <p className="text-xs text-gray-600 py-4 text-center">Waiting for agent activity…</p>
                )}
                {sseState.reactSteps.slice(0, 10).map((step, i) => (
                  <div key={step.ts + '-' + i} className="bg-black/30 rounded-lg p-3 text-xs font-mono border border-white/[0.04]">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-purple-400 font-semibold">{step.agent}</span>
                      <span className="text-[10px] text-gray-600">{ts()}</span>
                      {step.simulated && (
                        <span className="text-[9px] bg-yellow-500/20 text-yellow-400 px-1.5 py-0.5 rounded-full ml-auto">DEMO</span>
                      )}
                    </div>
                    <div className="text-gray-400 leading-relaxed">
                      {i === 0 ? <TypewriterText text={step.thought || ''} /> : (step.thought || '')}
                    </div>
                    {step.action && (
                      <div className={`mt-1.5 font-semibold ${actionColor(step.action)}`}>
                        → {step.action}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* ── PANEL 2: Price Chart ──── */}
            <div className="col-span-12 lg:col-span-7 glass rounded-xl p-4" style={{ animationDelay: '0.1s' }}>
              <h3 className="text-sm font-semibold mb-3">
                📈 {business?.dashboard_config?.price_chart_title || charter?.buy_source?.name || 'Live Price Monitor'}
              </h3>
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                    <XAxis dataKey="time" tick={{ fill: '#6b7280', fontSize: 9 }} />
                    <YAxis tick={{ fill: '#6b7280', fontSize: 9 }} domain={['auto', 'auto']} />
                    <Tooltip
                      contentStyle={{ background: '#111827', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 11 }}
                      labelStyle={{ color: '#9ca3af' }}
                    />
                    <Line type="monotone" dataKey="source" stroke="#3b82f6" strokeWidth={2} dot={false}
                      name={charter?.buy_source?.name || 'Source'} />
                    <Line type="monotone" dataKey="destination" stroke="#f59e0b" strokeWidth={2} dot={false}
                      name={charter?.sell_destination?.name || 'Destination'} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-44 flex items-center justify-center text-xs text-gray-600">
                  Waiting for price ticks…
                </div>
              )}
            </div>

            {/* ── PANEL 3: Agent Network ── */}
            <div className="col-span-12 lg:col-span-5 glass rounded-xl p-4" style={{ animationDelay: '0.15s' }}>
              <h3 className="text-sm font-semibold mb-3">🌐 Agent Network</h3>
              <svg viewBox="0 0 630 190" className="w-full h-44">
                {/* Static edges */}
                {EDGES.map(([from, to], i) => (
                  <line key={i}
                    x1={NODE_POS[from].x} y1={NODE_POS[from].y}
                    x2={NODE_POS[to].x} y2={NODE_POS[to].y}
                    stroke="rgba(255,255,255,0.08)" strokeWidth="1"
                  />
                ))}
                {/* Active A2A edges */}
                {sseState.a2aEvents.slice(0, 6).map((ev, i) => {
                  const fromPos = NODE_POS[ev.agent]
                  const toPos = NODE_POS[ev.to || '']
                  if (!fromPos || !toPos) return null
                  const age = (Date.now() / 1000 - ev.ts)
                  if (age > 2.5) return null
                  return (
                    <g key={`edge-${i}`}>
                      <line
                        x1={fromPos.x} y1={fromPos.y} x2={toPos.x} y2={toPos.y}
                        stroke="#3b82f6" strokeWidth="2.5" className="animate-edge-flash"
                      />
                      <text
                        x={(fromPos.x + toPos.x) / 2} y={(fromPos.y + toPos.y) / 2 - 8}
                        fill="#60a5fa" fontSize="8" textAnchor="middle"
                      >
                        {ev.capability || ''}
                      </text>
                    </g>
                  )
                })}
                {/* Nodes */}
                {AGENT_NODES.map(node => {
                  const pos = NODE_POS[node.id]
                  if (!pos) return null
                  const connected = sseState.agentStatus[node.id] === 'connected'
                  return (
                    <g key={node.id}>
                      {connected && (
                        <circle cx={pos.x} cy={pos.y} r="16" fill="rgba(34,197,94,0.08)" className="animate-pulse-dot" />
                      )}
                      <circle cx={pos.x} cy={pos.y} r="10"
                        fill={connected ? '#166534' : '#1f2937'}
                        stroke={connected ? '#22c55e' : '#374151'}
                        strokeWidth="1.5"
                      />
                      <circle cx={pos.x} cy={pos.y} r="3"
                        fill={connected ? '#4ade80' : '#6b7280'}
                      />
                      <text x={pos.x} y={pos.y + 22} fill="#9ca3af" fontSize="9" textAnchor="middle">
                        {node.label}
                      </text>
                    </g>
                  )
                })}
              </svg>
            </div>

            {/* ── PANEL 4: On-Chain Ledger ─ */}
            <div className="col-span-12 lg:col-span-7 glass rounded-xl p-4" style={{ animationDelay: '0.2s' }}>
              <h3 className="text-sm font-semibold mb-3">⛓️ On-Chain Ledger</h3>
              {sseState.onchainEvents.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-gray-500 border-b border-white/[0.06]">
                        <th className="text-left py-1.5 pr-3">Time</th>
                        <th className="text-left py-1.5 pr-3">Event</th>
                        <th className="text-right py-1.5 pr-3">Amount</th>
                        <th className="text-right py-1.5">Tx</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sseState.onchainEvents.slice(0, 8).map((ev, i) => {
                        const isRevenue = ev.event === 'SaleRecorded' || ev.event === 'TradeClosed'
                        const amount = isRevenue
                          ? (ev.payload?.revenueUsdc as number || 0) / 1e6
                          : (ev.payload?.costUsdc as number || 0) / 1e6
                        return (
                          <tr key={i} className="border-b border-white/[0.03]">
                            <td className="py-1.5 pr-3 font-mono text-gray-500">
                              {new Date(ev.ts * 1000).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
                            </td>
                            <td className={`py-1.5 pr-3 font-mono ${isRevenue ? 'text-green-400' : 'text-red-400'}`}>
                              {ev.event}
                              {ev.simulated && <span className="ml-1 text-[9px] text-yellow-500">DEMO</span>}
                            </td>
                            <td className={`py-1.5 pr-3 text-right font-mono ${isRevenue ? 'text-green-400' : 'text-red-400'}`}>
                              {isRevenue ? '+' : '-'}${amount.toFixed(2)}
                            </td>
                            <td className="py-1.5 text-right">
                              {ev.etherscan ? (
                                <a href={ev.etherscan} target="_blank" rel="noopener"
                                  className="text-blue-400 hover:text-blue-300 font-mono">
                                  {(ev.etherscan.split('/').pop() || '').slice(0, 8)}…↗
                                </a>
                              ) : (
                                <span className="text-gray-600">—</span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="h-32 flex items-center justify-center text-xs text-gray-600">
                  Awaiting on-chain transactions…
                </div>
              )}
            </div>

            {/* ── PANEL 5: P&L Tracker ──── */}
            <div className="col-span-12 lg:col-span-5 glass rounded-xl p-4" style={{ animationDelay: '0.25s' }}>
              <h3 className="text-sm font-semibold mb-3">💰 Profit & Loss</h3>

              {/* Metrics grid */}
              <div className="grid grid-cols-2 gap-2 mb-3">
                <div className="bg-black/20 rounded-lg p-2.5">
                  <div className="text-[10px] text-gray-500">Budget</div>
                  <div className="text-base font-mono font-bold text-white">
                    ${charter?.budget_usdc || livePnl.total_invested || 0}
                  </div>
                </div>
                <div className="bg-black/20 rounded-lg p-2.5">
                  <div className="text-[10px] text-gray-500">Spent</div>
                  <div className="text-base font-mono font-bold text-red-400">
                    ${livePnl.total_spent.toFixed(2)}
                  </div>
                </div>
                <div className="bg-black/20 rounded-lg p-2.5">
                  <div className="text-[10px] text-gray-500">Revenue</div>
                  <div className="text-base font-mono font-bold text-green-400">
                    ${livePnl.total_revenue.toFixed(2)}
                  </div>
                </div>
                <div className="bg-black/20 rounded-lg p-2.5">
                  <div className="text-[10px] text-gray-500">Profit</div>
                  <div className={`text-base font-mono font-bold ${livePnl.gross_profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {livePnl.gross_profit >= 0 ? '+' : ''}${livePnl.gross_profit.toFixed(2)}
                  </div>
                </div>
              </div>

              {/* ROI bar */}
              <div className="mb-3">
                <div className="flex justify-between text-[10px] mb-1">
                  <span className="text-gray-500">ROI</span>
                  <span className={`font-mono ${livePnl.roi_pct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {livePnl.roi_pct >= 0 ? '+' : ''}{livePnl.roi_pct.toFixed(1)}%
                  </span>
                </div>
                <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${livePnl.roi_pct >= 0 ? 'bg-green-500' : 'bg-red-500'}`}
                    style={{ width: `${Math.min(Math.abs(livePnl.roi_pct) * 2, 100)}%` }}
                  />
                </div>
              </div>

              {/* Trade counters */}
              <div className="grid grid-cols-3 gap-2 mb-3">
                <div className="bg-black/20 rounded-lg p-2 text-center">
                  <div className="text-[10px] text-gray-500">Opened</div>
                  <div className="text-sm font-mono font-bold text-white">{livePnl.lots_purchased}</div>
                </div>
                <div className="bg-black/20 rounded-lg p-2 text-center">
                  <div className="text-[10px] text-gray-500">Closed</div>
                  <div className="text-sm font-mono font-bold text-white">{livePnl.lots_sold}</div>
                </div>
                <div className="bg-black/20 rounded-lg p-2 text-center">
                  <div className="text-[10px] text-gray-500">Open</div>
                  <div className="text-sm font-mono font-bold text-yellow-400">{livePnl.open_trades}</div>
                </div>
              </div>

              {/* Time progress (if charter has duration) */}
              {charter && (
                <div>
                  <div className="flex justify-between text-[10px] mb-1">
                    <span className="text-gray-500">Duration</span>
                    <span className="text-gray-400 font-mono">
                      Day {Math.min(Math.ceil((Date.now() / 1000 - (business?.created_at || Date.now() / 1000)) / 86400), charter.duration_days)} of {charter.duration_days}
                    </span>
                  </div>
                  <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500 rounded-full transition-all duration-700"
                      style={{
                        width: `${Math.min(
                          ((Date.now() / 1000 - (business?.created_at || Date.now() / 1000)) / (charter.duration_days * 86400)) * 100,
                          100
                        )}%`
                      }}
                    />
                  </div>
                </div>
              )}
            </div>

          </div>
        )}

      </div>
    </div>
  )
}
