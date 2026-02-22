'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { HeroSection }        from '@/components/landing/HeroSection.tsx'
import { CategorySelector }   from '@/components/landing/CategorySelector.tsx'
import { BusinessForm }       from '@/components/landing/BusinessForm.tsx'
import { PopularityBoard }    from '@/components/landing/PopularityBoard.tsx'
import { LiveActivityFeed }   from '@/components/landing/LiveActivityFeed.tsx'
import { getPopularityData }  from '@/lib/api.ts'
import type { CategoryId, PopularityData } from '@/lib/types'

export default function LandingPage() {
  const router = useRouter()
  const [selectedCategory,    setSelectedCategory]    = useState<CategoryId | null>(null)
  const [selectedSubStrategy, setSelectedSubStrategy] = useState<string | null>(null)
  const [popularityData, setPopularityData] = useState<PopularityData[]>([])

  useEffect(() => {
    getPopularityData().then(setPopularityData)
  }, [])

  const popMap = Object.fromEntries(
    popularityData.map(d => [d.category_id, d])
  ) as Record<CategoryId, PopularityData>

  const handleBusinessCreated = (businessId: string) => {
    router.push(`/dashboard/${businessId}`)
  }

  return (
    <main className="min-h-screen bg-[#050505] text-white">
      {/* Subtle gradient background */}
      <div className="fixed inset-0 bg-gradient-to-br from-blue-950/20
        via-transparent to-purple-950/20 pointer-events-none" />

      <div className="relative max-w-6xl mx-auto px-4 pb-16">
        <HeroSection />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-4">
          {/* Main creation panel */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
              <CategorySelector
                selectedCategory={selectedCategory}
                selectedSubStrategy={selectedSubStrategy}
                onSelectCategory={(id) => {
                  setSelectedCategory(id)
                  setSelectedSubStrategy(null)
                }}
                onSelectSubStrategy={setSelectedSubStrategy}
                popularityData={popMap}
              />
            </div>

            {selectedCategory && selectedSubStrategy && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white/5 border border-white/10 rounded-2xl p-6"
              >
                <BusinessForm
                  category={selectedCategory}
                  subStrategy={selectedSubStrategy}
                  onBusinessCreated={handleBusinessCreated}
                />
              </motion.div>
            )}
          </div>

          {/* Right sidebar */}
          <div className="space-y-4">
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
              <LiveActivityFeed />
            </div>
          </div>
        </div>

        {/* Popularity board — full width below */}
        <div className="mt-8 bg-white/5 border border-white/10 rounded-2xl p-6">
          <PopularityBoard />
        </div>

        {/* Footer chain info */}
        <div className="mt-6 text-center text-xs text-gray-700 space-x-4">
          <span>Ethereum Sepolia · Chain 11155111</span>
          <span>·</span>
          <a href="https://sepolia.etherscan.io"
            className="hover:text-gray-500 transition-colors"
            target="_blank" rel="noopener noreferrer">
            Explorer ↗
          </a>
          <span>·</span>
          <span>AutoCorp v2.0</span>
        </div>
      </div>
    </main>
  )
}
