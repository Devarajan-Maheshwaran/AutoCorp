import { CHAIN } from '@/lib/constants'

export function EtherscanLink({ hash, short = true }: {
  hash: string, short?: boolean
}) {
  const url = `${CHAIN.explorer}/tx/${hash}`
  const display = short ? `${hash.slice(0,8)}...${hash.slice(-4)}` : hash
  return (
    <a href={url} target="_blank" rel="noopener noreferrer"
       className="text-blue-400 hover:text-blue-300 underline underline-offset-2
                  font-mono text-xs transition-colors">
      {display} ↗
    </a>
  )
}
