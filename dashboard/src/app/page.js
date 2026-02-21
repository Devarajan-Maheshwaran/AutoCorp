'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import PriceChart from '../components/PriceChart';
import AgentBrain from '../components/AgentBrain';
import AgentNetwork from '../components/AgentNetwork';
import OnChainLedger from '../components/OnChainLedger';
import PnLTracker from '../components/PnLTracker';
import ControlBar from '../components/ControlBar';

// Use relative URLs so everything goes through Next.js proxy (no CORS issues)
const MOCK_API = '';
const AGENT_API = '/agent';

export default function Dashboard() {
  const [events, setEvents] = useState([]);
  const [priceTicks, setPriceTicks] = useState([]);
  const [agentStatus, setAgentStatus] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [pipelineRunning, setPipelineRunning] = useState(false);
  const eventSourceRef = useRef(null);
  const priceSourceRef = useRef(null);

  // Connect to Glassbox event stream (SSE)
  useEffect(() => {
    const connectEvents = () => {
      const es = new EventSource(`${MOCK_API}/api/events/stream`);
      eventSourceRef.current = es;

      es.onopen = () => setIsConnected(true);
      es.onerror = () => setIsConnected(false);

      es.addEventListener('event', (e) => {
        try {
          const data = JSON.parse(e.data);
          setEvents(prev => [data, ...prev].slice(0, 500));
        } catch (err) {
          console.error('Event parse error:', err);
        }
      });

      es.addEventListener('catch_up', (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.events) {
            setEvents(prev => [...data.events.reverse(), ...prev].slice(0, 500));
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

      ps.addEventListener('price_tick', (e) => {
        try {
          const data = JSON.parse(e.data);
          setPriceTicks(prev => [...prev, data].slice(-100));
        } catch (err) {
          console.error('Price parse error:', err);
        }
      });
    };

    connectEvents();
    connectPrices();

    return () => {
      eventSourceRef.current?.close();
      priceSourceRef.current?.close();
    };
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
  const triggerPipeline = useCallback(async () => {
    setPipelineRunning(true);
    try {
      await fetch(`${AGENT_API}/execute-full`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quantity_quintals: 20,
          order_id: `dal-demo-${Date.now()}`
        })
      });
    } catch (err) {
      console.error('Pipeline trigger failed:', err);
    }
    // Don't auto-reset — let events drive the UI state
    setTimeout(() => setPipelineRunning(false), 15000);
  }, []);

  // Categorize events
  const reasoningEvents = events.filter(e => e.type === 'agent_reasoning');
  const trackingEvents = events.filter(e =>
    e.type === 'checkpoint_update' || e.type === 'delivery_complete'
  );
  const paymentEvents = events.filter(e =>
    e.type === 'x402_payment' || e.details?.payment_proof
  );
  const a2aEvents = events.filter(e =>
    e.type === 'a2a_notification' || e.type === 'agent_online'
  );

  return (
    <div className="min-h-screen flex flex-col">
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
      />

      {/* Main Grid — 5 Panels */}
      <main className="flex-1 grid grid-cols-12 grid-rows-2 gap-3 p-3 overflow-hidden" style={{ height: 'calc(100vh - 140px)' }}>
        {/* Panel 1: Live Price Chart (top left, wide) */}
        <div className="col-span-5 row-span-1 bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
          <PriceChart priceTicks={priceTicks} />
        </div>

        {/* Panel 2: Agent Brain / ReAct Reasoning (top center) */}
        <div className="col-span-4 row-span-1 bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
          <AgentBrain reasoningEvents={reasoningEvents} />
        </div>

        {/* Panel 3: Agent Network (top right) */}
        <div className="col-span-3 row-span-1 bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
          <AgentNetwork
            a2aEvents={a2aEvents}
            trackingEvents={trackingEvents}
            agentStatus={agentStatus}
          />
        </div>

        {/* Panel 4: On-Chain Ledger (bottom left) */}
        <div className="col-span-5 row-span-1 bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
          <OnChainLedger
            paymentEvents={paymentEvents}
            allEvents={events}
          />
        </div>

        {/* Panel 5: Real-Time P&L (bottom right, wide) */}
        <div className="col-span-7 row-span-1 bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
          <PnLTracker
            priceTicks={priceTicks}
            events={events}
          />
        </div>
      </main>
    </div>
  );
}
