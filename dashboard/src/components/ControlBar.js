'use client';

export default function ControlBar({
  agentStatus,
  onTriggerPipeline,
  pipelineRunning,
  latestPrice,
  businessIdea,
  onBusinessIdeaChange,
}) {
  const spread = latestPrice?.spread || 0;
  const isOpportunity = spread > 1500; // ₹1500+ spread = actionable

  return (
    <div className="bg-gray-900/50 border-b border-gray-800 px-6 py-2 flex items-center justify-between">
      {/* Left: Agent Swarm Status */}
      <div className="flex items-center gap-4">
        {/* Agent indicators */}
        <div className="flex items-center gap-3">
          {[
            { name: 'Logistics', status: agentStatus?.status === 'active', emoji: '🚛' },
            { name: 'Procure', status: true, emoji: '🛒' },
            { name: 'Sales', status: true, emoji: '💰' },
          ].map((a, i) => (
            <div key={i} className="flex items-center gap-1">
              <span className="text-xs">{a.emoji}</span>
              <div className={`w-2 h-2 rounded-full ${a.status ? 'bg-green-400' : 'bg-red-500'}`} />
              <span className="text-[10px] text-gray-500">{a.name}</span>
            </div>
          ))}
        </div>

        {/* LLM Status */}
        <div className="flex items-center gap-1 px-2 py-0.5 bg-gray-800 rounded-full">
          <span className="text-[10px]">🤖</span>
          <span className="text-[10px] text-gray-400">Gemini 2.0 Flash</span>
          <div className={`w-2 h-2 rounded-full ${agentStatus?.llm_available ? 'bg-green-400' : 'bg-amber-400'}`} />
        </div>

        {/* Spread Indicator */}
        <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-mono ${
          isOpportunity ? 'bg-green-500/10 border border-green-500/30 text-green-400' :
          'bg-gray-800 border border-gray-700 text-gray-400'
        }`}>
          {isOpportunity ? '📈 ARBITRAGE' : '📊 WATCHING'}
          <span className="font-bold">₹{spread.toLocaleString('en-IN')}</span>
          spread
        </div>
      </div>

      {/* Center: Blockchain Info */}
      <div className="flex items-center gap-4 text-[10px] text-gray-500">
        <span>Protocol: <code className="text-cyan-500">A2A + X402</code></span>
        <span>|</span>
        <span>Chain: <code className="text-emerald-500">Polygon Amoy</code></span>
        <span>|</span>
        <span>Contract: <code className="text-purple-400">{agentStatus?.business_contract?.slice(0, 14) || '0xAutoCorpBiz...'}</code></span>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-3">
        <input
          type="text"
          value={businessIdea}
          onChange={(e) => onBusinessIdeaChange?.(e.target.value)}
          placeholder="Enter business idea (e.g. ₹30K dal arbitrage 30 days)"
          className="w-[340px] px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-xs text-gray-200 placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
        />
        <button
          onClick={() => onTriggerPipeline?.(businessIdea)}
          disabled={pipelineRunning}
          className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            pipelineRunning
              ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
              : 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white hover:from-cyan-500 hover:to-blue-500 active:scale-95 shadow-lg shadow-cyan-900/30'
          }`}
        >
          {pipelineRunning ? (
            <span className="flex items-center gap-2">
              <span className="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
              Pipeline Running...
            </span>
          ) : (
            '⚡ Execute Full Pipeline'
          )}
        </button>
      </div>
    </div>
  );
}