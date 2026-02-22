export const AGENT_ENDPOINTS = {
  masteragent:    process.env.NEXT_PUBLIC_MASTERAGENT_URL    || 'http://localhost:8787',
  price_monitor:  process.env.NEXT_PUBLIC_PRICE_MONITOR_URL  || 'http://localhost:8002',
  procurement:    process.env.NEXT_PUBLIC_PROCUREMENT_URL    || 'http://localhost:8003',
  sales:          process.env.NEXT_PUBLIC_SALES_URL          || 'http://localhost:8004',
  logistics:      process.env.NEXT_PUBLIC_LOGISTICS_URL      || 'http://localhost:3002',
  accountant:     process.env.NEXT_PUBLIC_ACCOUNTANT_URL     || 'http://localhost:8006',
  charter_gen:    process.env.NEXT_PUBLIC_CHARTER_GEN_URL    || 'http://localhost:8009',
}

export const AGENT_NODES = [
  { id: 'founder',       label: 'Founder',       port: 8787, url: AGENT_ENDPOINTS.masteragent,   role: 'orchestration' },
  { id: 'price_monitor', label: 'Price Monitor', port: 8002, url: AGENT_ENDPOINTS.price_monitor,  role: 'market_watch' },
  { id: 'procurement',   label: 'Procurement',   port: 8003, url: AGENT_ENDPOINTS.procurement,    role: 'buying' },
  { id: 'logistics',     label: 'Logistics',     port: 3002, url: AGENT_ENDPOINTS.logistics,      role: 'delivery' },
  { id: 'sales',         label: 'Sales',         port: 8004, url: AGENT_ENDPOINTS.sales,          role: 'selling' },
  { id: 'accountant',    label: 'Accountant',    port: 8006, url: AGENT_ENDPOINTS.accountant,     role: 'accounting' },
]

export const CHAIN = {
  name:     'Ethereum Sepolia',
  id:       11155111,
  explorer: 'https://sepolia.etherscan.io',
  rpc:      'https://rpc.sepolia.org',
}

export const CATEGORIES = [
  {
    id: '1_crypto' as const,
    name: 'Crypto & Token Arbitrage',
    icon: '₿',
    color: 'yellow',
    description: 'Exploit price differences across crypto exchanges for instant profit',
    sub_strategies: [
      {
        id: 'cross_exchange',
        name: 'Cross-Exchange Arbitrage',
        description: 'Buy cheap on WazirX, sell on CoinDCX simultaneously',
        typical_roi: '0.3–1.5% per trade',
        risk: 'medium' as const,
        speed: 'Seconds',
      },
      {
        id: 'funding_rate',
        name: 'Funding Rate Arbitrage',
        description: 'Market-neutral: spot long + perpetual short, collect 8hr funding',
        typical_roi: '10–40% annualised',
        risk: 'low' as const,
        speed: '8hr cycles',
      },
      {
        id: 'triangular',
        name: 'Triangular Arbitrage',
        description: 'BTC → ETH → USDC → BTC loop exploiting pricing gaps',
        typical_roi: '0.1–0.8% per cycle',
        risk: 'low' as const,
        speed: '< 1 second',
      }
    ]
  },
  {
    id: '2_compute' as const,
    name: 'Cloud Compute & GPU Arbitrage',
    icon: '⚡',
    color: 'blue',
    description: 'Buy idle GPU compute at night, resell to ML teams at peak hours',
    sub_strategies: [
      {
        id: 'gpu_spot',
        name: 'GPU Spot Resale',
        description: 'Buy RTX4090 on Vast.ai when idle, list on RunPod at markup',
        typical_roi: '40–130% per 48hrs',
        risk: 'medium' as const,
        speed: 'Hours',
      },
      {
        id: 'api_credits',
        name: 'API Credits Resale',
        description: 'Buy OpenAI/Anthropic bulk credits, resell to indie devs',
        typical_roi: '10–25%',
        risk: 'low' as const,
        speed: 'Days',
      }
    ]
  },
  {
    id: '5_saas' as const,
    name: 'SaaS & Licence Arbitrage',
    icon: '🔑',
    color: 'purple',
    description: 'Buy annual SaaS licences at bulk discount, resell monthly slots',
    sub_strategies: [
      {
        id: 'saas_resale',
        name: 'Annual Licence Resale',
        description: 'Buy Notion/Figma annual seats, sell monthly to startups',
        typical_roi: '30–80% annually',
        risk: 'low' as const,
        speed: 'Monthly recurring',
      },
      {
        id: 'domain_arb',
        name: 'Domain Arbitrage',
        description: 'Backorder expiring domains with traffic, resell on Flippa',
        typical_roi: '100–10,000%',
        risk: 'high' as const,
        speed: 'Weeks',
      }
    ]
  }
]
