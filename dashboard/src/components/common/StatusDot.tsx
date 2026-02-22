export function StatusDot({ status, label }: {
  status: 'connected' | 'disconnected' | 'unknown', label: string
}) {
  const colors = {
    connected:    'bg-green-400 shadow-green-400/50',
    disconnected: 'bg-red-500 shadow-red-500/50',
    unknown:      'bg-gray-500'
  }
  return (
    <div className="flex items-center gap-1.5">
      <div className={`w-2 h-2 rounded-full shadow-md ${colors[status]}
        ${status === 'connected' ? 'animate-pulse' : ''}`}
      />
      <span className="text-xs text-gray-400">{label}</span>
    </div>
  )
}
