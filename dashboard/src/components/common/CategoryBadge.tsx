import type { CategoryId } from '@/lib/types'

const styles: Record<CategoryId, string> = {
  '1_crypto':  'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  '2_compute': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  '5_saas':    'bg-purple-500/20 text-purple-400 border-purple-500/30',
}
const labels: Record<CategoryId, string> = {
  '1_crypto':  '₿ Crypto',
  '2_compute': '⚡ Compute',
  '5_saas':    '🔑 SaaS',
}
export function CategoryBadge({ category }: { category: CategoryId }) {
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium
      ${styles[category]}`}>
      {labels[category]}
    </span>
  )
}
