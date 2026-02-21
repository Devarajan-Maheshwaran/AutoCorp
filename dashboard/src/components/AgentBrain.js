'use client';

import { useRef, useEffect } from 'react';

const STEP_COLORS = {
  thought: { bg: 'bg-purple-500/10', border: 'border-purple-500/30', text: 'text-purple-300', icon: '💭', label: 'THOUGHT' },
  action: { bg: 'bg-blue-500/10', border: 'border-blue-500/30', text: 'text-blue-300', icon: '⚡', label: 'ACTION' },
  observation: { bg: 'bg-green-500/10', border: 'border-green-500/30', text: 'text-green-300', icon: '👁️', label: 'OBSERVE' }
};

export default function AgentBrain({ reasoningEvents }) {
  const scrollRef = useRef(null);

  // Auto-scroll to bottom on new events
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [reasoningEvents.length]);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-purple-400">Agent Brain</h2>
          <p className="text-xs text-gray-500">ReAct Reasoning Trace (Live)</p>
        </div>
        <div className="flex items-center gap-2">
          {/* LLM Status Badge */}
          {reasoningEvents.some(e => e.details?.content?.includes('Gemini')) && (
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
              reasoningEvents.some(e => e.details?.data?.decision_source === 'gemini-llm')
                ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                : reasoningEvents.some(e => e.details?.content?.includes('429'))
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                  : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
            }`}>
              {reasoningEvents.some(e => e.details?.data?.decision_source === 'gemini-llm')
                ? '🟢 Gemini Active'
                : reasoningEvents.some(e => e.details?.content?.includes('429'))
                  ? '⏳ Gemini Quota'
                  : '🤖 Gemini Ready'}
            </span>
          )}
          <span className="text-xs text-gray-500">
            {reasoningEvents.length} steps
          </span>
        </div>
      </div>

      {/* Reasoning Stream */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2">
        {reasoningEvents.length === 0 ? (
          <div className="h-full flex items-center justify-center text-gray-600 text-sm">
            <div className="text-center">
              <div className="text-2xl mb-2">🧠</div>
              <div>No reasoning events yet</div>
              <div className="text-xs mt-1">Trigger the pipeline to see agent thinking</div>
            </div>
          </div>
        ) : (
          [...reasoningEvents].reverse().map((event, i) => {
            const step = event.details || {};
            const stepType = step.type || 'thought';
            const colors = STEP_COLORS[stepType] || STEP_COLORS.thought;
            const time = new Date(step.timestamp || event.timestamp).toLocaleTimeString('en-IN', {
              hour: '2-digit', minute: '2-digit', second: '2-digit'
            });

            return (
              <div
                key={`${event.id || i}-${step.step_number || i}`}
                className={`${colors.bg} ${colors.border} border rounded-lg p-3 transition-all animate-in`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm">{colors.icon}</span>
                  <span className={`text-[10px] font-bold ${colors.text} uppercase tracking-wider`}>
                    {colors.label}
                  </span>
                  <span className="text-[10px] text-gray-600">
                    Step {step.step_number || '?'} • {time}
                  </span>
                  {step.action_type && (
                    <span className="text-[10px] bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded">
                      {step.action_type}
                    </span>
                  )}
                  {step.data?.decision_source && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                      step.data.decision_source === 'gemini-llm'
                        ? 'bg-green-900/50 text-green-400'
                        : 'bg-gray-800 text-amber-400'
                    }`}>
                      {step.data.decision_source === 'gemini-llm' ? '🤖 AI' : '📊 Algo'}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-300 leading-relaxed">
                  {step.content || JSON.stringify(step)}
                </p>
                {step.data && Object.keys(step.data).length > 0 && (
                  <details className="mt-2">
                    <summary className="text-[10px] text-gray-600 cursor-pointer hover:text-gray-400">
                      Data payload
                    </summary>
                    <pre className="mt-1 text-[10px] text-gray-500 bg-gray-950 rounded p-2 overflow-x-auto">
                      {JSON.stringify(step.data, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
