'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import PriceChart from '../components/PriceChart';
import AgentBrain from '../components/AgentBrain';
import AgentNetwork from '../components/AgentNetwork';
import OnChainLedger from '../components/OnChainLedger';
import PnLTracker from '../components/PnLTracker';
import ControlBar from '../components/ControlBar';

// Use relative URLs so everything goes through Next.js proxy (no CORS issues)
const MOCK_API = process.env.NEXT_PUBLIC_MOCK_API_URL || 'http://localhost:3001';
const AGENT_API = '/agent';

function parseInrAmount(text) {
  const value = String(text || '').toLowerCase().replace(/[,₹\s]/g, '');
  const kMatch = value.match(/(\d+(?:\.\d+)?)k/);
  if (kMatch) return Math.round(Number(kMatch[1]) * 1000);
  const lakhMatch = value.match(/(\d+(?:\.\d+)?)(l|lac|lakh)/);
  if (lakhMatch) return Math.round(Number(lakhMatch[1]) * 100000);
  const num = Number(value);
  return Number.isFinite(num) ? Math.round(num) : null;
}

function parseBusinessIdeaInputs(idea, latestPrice) {
  const text = String(idea || '');
  const lower = text.toLowerCase();

  const investmentMatch = text.match(/(?:₹|rs\.?|inr)?\s*([\d,.]+\s*(?:k|l|lac|lakh)?)(?:\s*)(?:investment|budget|deploy|capital)?/i);
  const marginMatch = lower.match(/(\d+(?:\.\d+)?)\s*%\s*(?:minimum\s*)?(?:margin|profit)?/i);
  const quantityMatch = lower.match(/(\d+(?:\.\d+)?)\s*(?:q|quintal|quintals)\b/i);
  const perQuintalMatch = text.match(/(?:max\s*buy|buy\s*at|price\s*at|at)\s*(?:₹|rs\.?|inr)?\s*([\d,.]+\s*(?:k|l|lac|lakh)?)(?:\s*\/\s*q|\s*per\s*quintal)?/i);

  const requestedInvestmentInr = investmentMatch ? parseInrAmount(investmentMatch[1]) : null;
  const targetMarginPct = marginMatch ? Number(marginMatch[1]) : 15;
  const explicitQuantity = quantityMatch ? Number(quantityMatch[1]) : null;
  const explicitMaxBuy = perQuintalMatch ? parseInrAmount(perQuintalMatch[1]) : null;

  const currentJodhpur = latestPrice?.jodhpur?.price_per_quintal;

  let quantityQuintals = explicitQuantity || 20;
  if (!explicitQuantity && requestedInvestmentInr && currentJodhpur) {
    quantityQuintals = Math.max(1, Math.floor(requestedInvestmentInr / currentJodhpur));
  }

  let maxPricePerQuintal = explicitMaxBuy || 8500;
  if (!explicitMaxBuy && requestedInvestmentInr && quantityQuintals > 0) {
    maxPricePerQuintal = Math.max(1000, Math.floor(requestedInvestmentInr / quantityQuintals));
  }

  const targetSellPricePerQuintal = Math.round(maxPricePerQuintal * (1 + (targetMarginPct || 15) / 100));

  return {
    objective: text.trim(),
    requestedInvestmentInr,
    targetMarginPct,
    quantityQuintals,
    maxPricePerQuintal,
    targetSellPricePerQuintal,
  };
}

export default function Dashboard() {
  const [events, setEvents] = useState([]);
  const [priceTicks, setPriceTicks] = useState([]);
  const [agentStatus, setAgentStatus] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [pipelineRunning, setPipelineRunning] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [showLanding, setShowLanding] = useState(true);
  const [businessIdea, setBusinessIdea] = useState('Investor deploys ₹30K for dal arbitrage Jodhpur to Mumbai in 30 days with 15% minimum margin.');
  const eventSourceRef = useRef(null);
  const priceSourceRef = useRef(null);
  const lastPriceTickAtRef = useRef(0);

  // Connect to Glassbox event stream (SSE)
  useEffect(() => {
    const connectEvents = () => {
      const es = new EventSource(`${MOCK_API}/api/events/stream`);
      eventSourceRef.current = es;

      es.onopen = () => setIsConnected(true);
      es.onerror = () => setIsConnected(false);

      const onEventMessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          setEvents(prev => [data, ...prev].slice(0, 500));
        } catch (err) {
          console.error('Event parse error:', err);
        }
      };

      es.onmessage = onEventMessage;
      es.addEventListener('event', onEventMessage);

      es.addEventListener('catch_up', (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.events) {
            setEvents(prev => [...data.events.reverse(), ...prev].slice(0, 500));
          } else if (data && data.type) {
            setEvents(prev => [data, ...prev].slice(0, 500));
          }
        } catch (err) {
          console.error('Catch-up parse error:', err);
        }
      });
    };

    // Connect to price stream
    const connectPrices = () => {
      const ps = new EventSource(`${MOCK_API}/api/enam/prices/stream`);
      priceSourceRef.current = ps;

      const onPriceMessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          lastPriceTickAtRef.current = Date.now();
          setPriceTicks(prev => [...prev, data].slice(-100));
        } catch (err) {
          console.error('Price parse error:', err);
        }
      };

      ps.onopen = () => {
        lastPriceTickAtRef.current = Date.now();
      };
      ps.onmessage = onPriceMessage;
      ps.addEventListener('price_tick', onPriceMessage);
    };

    connectEvents();
    connectPrices();

    return () => {
      eventSourceRef.current?.close();
      priceSourceRef.current?.close();
    };
  }, []);

  // Fallback polling for prices in case SSE is delayed/disconnected
  useEffect(() => {
    const pollPriceFallback = async () => {
      const isStale = Date.now() - lastPriceTickAtRef.current > 8000;
      if (!isStale) return;

      try {
        const res = await fetch(`${MOCK_API}/api/enam/prices/current`);
        if (!res.ok) return;
        const payload = await res.json();
        if (payload?.data?.timestamp) {
          const tick = payload.data;
          lastPriceTickAtRef.current = Date.now();
          setPriceTicks(prev => {
            const last = prev[prev.length - 1];
            if (last?.timestamp === tick.timestamp) return prev;
            return [...prev, tick].slice(-100);
          });
        }
      } catch {
      }
    };

    const interval = setInterval(pollPriceFallback, 4000);
    return () => clearInterval(interval);
  }, []);

  // Poll agent status
  useEffect(() => {
    const pollStatus = async () => {
      try {
        const res = await fetch(`${AGENT_API}/status`);
        if (res.ok) setAgentStatus(await res.json());
      } catch { /* agent might not be running */ }
    };

    pollStatus();
    const interval = setInterval(pollStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  // Trigger full pipeline
  const triggerPipeline = useCallback(async (idea) => {
    setPipelineRunning(true);
    try {
      const objective = (idea || businessIdea || '').trim();
      const inputs = parseBusinessIdeaInputs(objective, priceTicks[priceTicks.length - 1]);

      await fetch(`/api/events/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'system',
          agent_id: 'dashboard',
          agent_name: 'Dashboard Launcher',
          action: 'pipeline_parameters',
          details: inputs,
        }),
      });

      await fetch(`/procurement/buy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quantity_quintals: inputs.quantityQuintals,
          max_price_per_quintal: inputs.maxPricePerQuintal,
          objective: inputs.objective,
          requested_investment_inr: inputs.requestedInvestmentInr,
          target_margin_pct: inputs.targetMarginPct,
          target_sell_price_per_quintal: inputs.targetSellPricePerQuintal,
        })
      });
    } catch (err) {
      console.error('Pipeline trigger failed:', err);
    }
    // Don't auto-reset — let events drive the UI state
    setTimeout(() => setPipelineRunning(false), 15000);
  }, [businessIdea, priceTicks]);

  const launchFromIdea = useCallback(async () => {
    setLaunching(true);
    try {
      await fetch('/api/system/ensure-running', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      setShowLanding(false);
      await triggerPipeline(businessIdea);
    } catch (err) {
      console.error('Startup failed:', err);
    } finally {
      setLaunching(false);
    }
  }, [businessIdea, triggerPipeline]);

  // Categorize events
  const reasoningEvents = events.filter(e => e.type === 'agent_reasoning');
  const trackingEvents = events.filter(e =>
    e.type === 'checkpoint_update' || e.type === 'delivery_complete'
  );
  const paymentEvents = events.filter(e =>
    e.type === 'x402_payment' || e.details?.payment_proof
  );
  const a2aEvents = events.filter(e =>
    e.type === 'a2a_notification' ||
    e.type === 'a2a_message' ||
    e.action === 'a2a_handoff' ||
    e.type === 'agent_online'
  );

  return (
    <div className="min-h-screen flex flex-col relative">
      {showLanding && (
        <div className="absolute inset-0 z-50 bg-gray-950/95 flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-gray-900 border border-gray-800 rounded-2xl p-6 shadow-2xl">
            <h2 className="text-xl font-bold text-cyan-400">Start AutoCorp</h2>
            <p className="text-sm text-gray-400 mt-2">Enter your business idea. The system will start agents and run the pipeline automatically.</p>

            <textarea
              value={businessIdea}
              onChange={(e) => setBusinessIdea(e.target.value)}
              rows={4}
              className="mt-4 w-full rounded-lg bg-gray-800 border border-gray-700 text-sm text-gray-200 p-3 focus:outline-none focus:ring-1 focus:ring-cyan-500"
              placeholder="Investor deploys ₹30K for dal arbitrage Jodhpur to Mumbai with 15% target margin"
            />

            <div className="mt-4 flex items-center justify-end gap-3">
              <button
                onClick={launchFromIdea}
                disabled={launching || pipelineRunning}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                  launching || pipelineRunning
                    ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                    : 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white hover:from-cyan-500 hover:to-blue-500'
                }`}
              >
                {launching || pipelineRunning ? 'Starting agents...' : 'Run Business Idea'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="bg-gray-900 border-b border-gray-800 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-gradient-to-br from-cyan-400 to-blue-600 rounded-lg flex items-center justify-center font-bold text-gray-950 text-sm shadow-lg shadow-cyan-500/20">
            AC
          </div>
          <div>
            <h1 className="text-lg font-bold bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">
              AutoCorp Glassbox
            </h1>
            <p className="text-[10px] text-gray-500">Autonomous AI Agent Swarms — Tur Dal Arbitrage: Jodhpur → Mumbai</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-[10px] text-gray-500">
            <span className="px-2 py-0.5 bg-gray-800 rounded text-purple-400">A2A Protocol</span>
            <span className="px-2 py-0.5 bg-gray-800 rounded text-amber-400">X402 Payments</span>
            <span className="px-2 py-0.5 bg-gray-800 rounded text-emerald-400">ERC-6551</span>
          </div>
          <div className={`flex items-center gap-2 text-xs ${isConnected ? 'text-green-400' : 'text-red-400'}`}>
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`} />
            {isConnected ? 'Live' : 'Disconnected'}
          </div>
          <div className="text-xs text-gray-500">
            {events.length} events | {priceTicks.length} ticks
          </div>
        </div>
      </header>

      {/* Control Bar */}
      <ControlBar
        agentStatus={agentStatus}
        onTriggerPipeline={triggerPipeline}
        pipelineRunning={pipelineRunning}
        latestPrice={priceTicks[priceTicks.length - 1]}
        businessIdea={businessIdea}
        onBusinessIdeaChange={setBusinessIdea}
      />

      {/* Main Grid — 5 Panels */}
      <main
        className="flex-1 grid grid-cols-12 gap-3 p-3 overflow-auto lg:grid-rows-[minmax(300px,42vh)_minmax(260px,34vh)]"
        style={{ height: 'calc(100vh - 170px)' }}
      >
        {/* Panel 1: Live Price Chart (top left, wide) */}
        <div className="col-span-12 lg:col-span-4 lg:row-span-1 bg-gray-900 rounded-xl border border-gray-800 overflow-hidden min-h-[240px] lg:min-h-0">
          <PriceChart priceTicks={priceTicks} />
        </div>

        {/* Panel 2: Agent Brain / ReAct Reasoning (top center) */}
        <div className="col-span-12 lg:col-span-5 lg:row-span-1 bg-gray-900 rounded-xl border border-gray-800 overflow-hidden min-h-[240px] lg:min-h-0">
          <AgentBrain reasoningEvents={reasoningEvents} />
        </div>

        {/* Panel 3: Agent Network (top right) */}
        <div className="col-span-12 lg:col-span-3 lg:row-span-1 bg-gray-900 rounded-xl border border-gray-800 overflow-hidden min-h-[240px] lg:min-h-0">
          <AgentNetwork
            a2aEvents={a2aEvents}
            trackingEvents={trackingEvents}
            agentStatus={agentStatus}
          />
        </div>

        {/* Panel 4: On-Chain Ledger (bottom left) */}
        <div className="col-span-12 lg:col-span-4 lg:row-span-1 bg-gray-900 rounded-xl border border-gray-800 overflow-hidden min-h-[230px] lg:min-h-0">
          <OnChainLedger
            paymentEvents={paymentEvents}
            allEvents={events}
          />
        </div>

        {/* Panel 5: Real-Time P&L (bottom right, wide) */}
        <div className="col-span-12 lg:col-span-8 lg:row-span-1 bg-gray-900 rounded-xl border border-gray-800 overflow-hidden min-h-[230px] lg:min-h-0">
          <PnLTracker
            priceTicks={priceTicks}
            events={events}
          />
        </div>
      </main>
    </div>
  );
}
