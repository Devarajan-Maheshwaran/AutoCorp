'use client'

export default function LoadingPulse({
  className = '',
  text = 'Loading...',
}: {
  className?: string
  text?: string
}) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="flex gap-1">
        <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
        <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse [animation-delay:150ms]" />
        <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse [animation-delay:300ms]" />
      </div>
      <span className="text-sm text-gray-400">{text}</span>
    </div>
  )
}
