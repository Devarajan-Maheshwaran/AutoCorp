'use client';
import { useState, useEffect } from 'react';

const AGENTS = [
  { id: 'founder-agent', name: 'Founder', color: 'bg-amber-500', x: 50, y: 25, role: 'Orchestrator', emoji: '🧠' },
  { id: 'procurement-agent-001', name: 'Procurement', color: 'bg-green-500', x: 15, y: 65, role: 'Buys from eNAM', port: 3003, emoji: '🛒' },
  { id: 'logistics-agent-001', name: 'Logistics', color: 'bg-cyan-500', x: 50, y: 85, role: 'Transport', port: 3002, emoji: '🚛' },
  { id: 'sales-agent-001', name: 'Sales', color: 'bg-purple-500', x: 85, y: 65, role: 'Sells to buyers', port: 3004, emoji: '💰' },
];

const CONNECTIONS = [
  { from: 'founder-agent', to: 'procurement-agent-001', label: 'opportunity' },
  { from: 'procurement-agent-001', to: 'logistics-agent-001', label: 'pickup ready' },
  { from: 'logistics-agent-001', to: 'sales-agent-001', label: 'delivered' },
  { from: 'sales-agent-001', to: 'founder-agent', label: 'profit report' },
  { from: 'founder-agent', to: 'logistics-agent-001', label: 'optimize' },
];

export default function AgentNetwork({ a2aEvents, trackingEvents, agentStatus }) {
  const [agentStatuses, setAgentStatuses] = useState({});

  // Poll agent health
  useEffect(() => {
    async function checkAgents() {
      const statuses = {};
      for (const agent of AGENTS) {
        if (!agent.port) {
          statuses[agent.id] = 'orchestrator';
          continue;
        }
        try {
          const proxyPath = agent.port === 3002 ? '/agent/status' : `http://localhost:${agent.port}/status`;
          // For logistics, use proxy. Others direct check
          if (agent.port === 3002) {
            const res = await fetch('/agent/status', { signal: AbortSignal.timeout(2000) });
            statuses[agent.id] = res.ok ? 'online' : 'offline';
          } else {
            // Procurement/Sales — these aren't proxied, just mark based on events 
            statuses[agent.id] = 'unknown';
          }
        } catch {
          statuses[agent.id] = agent.port === 3002 ? 'offline' : 'unknown';
        }
      }
      // Check if procurement/sales agents have published events recently
      const allEvents = [...(a2aEvents || []), ...(trackingEvents || [])];
      allEvents.forEach(e => {
        const from = e.details?.from_agent || e.agent_id;
        const to = e.details?.to_agent;
        if (from && statuses[from] === 'unknown') {
          statuses[from] = 'online';
        }
        if (to && statuses[to] === 'unknown') {
          statuses[to] = 'online';
        }
      });
      setAgentStatuses(statuses);
    }
    checkAgents();
    const interval = setInterval(checkAgents, 5000);
    return () => clearInterval(interval);
  }, [a2aEvents, trackingEvents]);

  const isLogisticsOnline = agentStatus?.status === 'active' || agentStatuses['logistics-agent-001'] === 'online';

  // Count recent events per agent
  const recentActivity = {};
  [...(a2aEvents || []), ...(trackingEvents || [])].slice(0, 20).forEach(e => {
    const agentId = e.agent_id || 'unknown';
    recentActivity[agentId] = (recentActivity[agentId] || 0) + 1;
  });

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-800">
        <h2 className="text-sm font-semibold text-cyan-400">Agent Network</h2>
        <p className="text-xs text-gray-500">A2A Protocol Communication</p>
      </div>

      {/* Network Visualization */}
      <div className="flex-1 relative p-4">
        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
          {CONNECTIONS.map((conn, i) => {
            const from = AGENTS.find(a => a.id === conn.from);
            const to = AGENTS.find(a => a.id === conn.to);
            if (!from || !to) return null;
            return (
              <g key={i}>
                <line
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  stroke="#374151"
                  strokeWidth="0.3"
                  strokeDasharray="1,1"
                />
                <text
                  x={(from.x + to.x) / 2}
                  y={(from.y + to.y) / 2 - 1.5}
                  textAnchor="middle"
                  className="fill-gray-600"
                  style={{ fontSize: '2.5px' }}
                >
                  {conn.label}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Agent Nodes */}
        {AGENTS.map(agent => {
          const status = agentStatuses[agent.id];
          const isOnline = agent.id === 'logistics-agent-001' ? isLogisticsOnline
            : agent.id === 'founder-agent' ? true
            : status === 'online';
          const activity = recentActivity[agent.id] || 0;
          const isActive = activity > 0;

          return (
            <div
              key={agent.id}
              className="absolute transform -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-1"
              style={{ left: `${agent.x}%`, top: `${agent.y}%` }}
            >
              <div className={`relative w-10 h-10 ${agent.color} rounded-full flex items-center justify-center text-white text-sm font-bold shadow-lg ${isActive ? 'animate-pulse' : ''}`}>
                {agent.emoji || agent.name[0]}
                {/* Online indicator */}
                <div className={`absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-gray-900 ${isOnline ? 'bg-green-400' : status === 'unknown' ? 'bg-yellow-400' : 'bg-red-500'}`} />
                {/* Activity ring */}
                {isActive && (
                  <div className={`absolute inset-0 rounded-full border-2 ${agent.color.replace('bg-', 'border-')} animate-ping opacity-30`} />
                )}
              </div>
              <div className="text-center">
                <div className="text-[10px] font-semibold text-white">{agent.name}</div>
                <div className="text-[8px] text-gray-500">{agent.role}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* A2A Event Log */}
      <div className="border-t border-gray-800 px-3 py-2 max-h-[30%] overflow-y-auto">
        <div className="text-[10px] text-gray-500 mb-1">Recent A2A Messages</div>
        {a2aEvents.length === 0 && trackingEvents.length === 0 ? (
          <div className="text-[10px] text-gray-700">No inter-agent messages yet</div>
        ) : (
          [...a2aEvents, ...trackingEvents].slice(0, 5).map((event, i) => {
            const fromAgent = event.details?.from_agent || event.agent_name || event.agent_id;
            const toAgent = event.details?.to_agent;
            const action = event.details?.capability || event.action || event.type;

            return (
            <div key={i} className="text-[10px] text-gray-400 py-0.5 border-b border-gray-800/50">
              <span className="text-cyan-500">{fromAgent}</span>
              {' → '}
              <span className="text-purple-400">{toAgent || 'event_bus'}</span>
              {' '}
              <span className="text-gray-500">{action}</span>
              {event.details?.location && (
                <span className="text-green-400"> @ {event.details.location}</span>
              )}
            </div>
          )})
        )}
      </div>
    </div>
  );
}
