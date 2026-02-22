// ─── Categories ─────────────────────────────────────────────────
export type CategoryId = '1_crypto' | '2_compute' | '5_saas'

export interface SubStrategy {
  id: string
  name: string
  description: string
  typical_roi: string
  risk: 'low' | 'medium' | 'high'
  speed: string
  popularityScore?: number    // from other users' results
  avgRoiActual?: number       // real ROI from completed businesses
}

export interface Category {
  id: CategoryId
  name: string
  icon: string                // emoji or icon name
  color: string               // tailwind color class
  description: string
  sub_strategies: SubStrategy[]
  totalBusinessesCreated?: number
  avgSuccessRate?: number
}

// ─── Charter ────────────────────────────────────────────────────
export interface Charter {
  business_id: string
  category: CategoryId
  sub_strategy: string
  asset: string
  buy_source: { name: string; api: string; endpoint: string }
  sell_destination: { name: string; api: string; endpoint: string }
  price_unit: string
  budget_usdc: number
  budget_inr: number
  min_margin_pct: number
  duration_days: number
  deadline_timestamp: number
  buy_trigger: string
  sell_trigger: string
  cut_loss_trigger: string
  max_holding_hours: number
  risk_params: {
    max_single_trade_pct: number
    stop_loss_pct: number
    volatility_window_hours: number
  }
  logistics_type: string
  price_monitor_config: {
    poll_interval_seconds: number
    price_window_size: number
    anomaly_threshold_pct: number
  }
}

// ─── Business ───────────────────────────────────────────────────
export interface Business {
  business_id: string
  charter: Charter
  contract_address: string
  state: 'ACTIVE' | 'DISSOLVED'
  created_at: number
  dashboard_config: DashboardConfig
}

export interface DashboardConfig {
  price_unit: string
  buy_source_label: string
  sell_source_label: string
  price_chart_title: string
  network_nodes: AgentNode[]
}

// ─── Events ─────────────────────────────────────────────────────
export type EventType =
  | 'price_tick'
  | 'mumbai_price_tick'
  | 'react_step'
  | 'onchain_event'
  | 'a2a_sent'
  | 'a2a_received'
  | 'sale_completed'
  | 'delivery_confirmed'
  | 'transit_update'
  | 'trade_aborted'
  | 'error'

export interface AgentEvent {
  agent: string
  type: EventType
  thought?: string
  action?: string
  payload?: Record<string, unknown>
  ts: number
  simulated?: boolean
  // raw data for normalizer
  data?: Record<string, unknown>
  // price_tick specific
  price?: number
  source?: string
  asset?: string
  unit?: string
  exchange?: string
  // onchain_event specific
  event?: string
  etherscan?: string
  lot_id?: string
  // a2a_sent specific
  to?: string
  capability?: string
  // react_step specific
  observation?: string
}

// ─── P&L ────────────────────────────────────────────────────────
export interface PnLState {
  total_invested: number
  total_spent: number
  total_revenue: number
  gross_profit: number
  roi_pct: number
  lots_purchased: number
  lots_sold: number
  last_updated: string
  open_trades: number
}

// ─── Agent Health ────────────────────────────────────────────────
export interface AgentHealth {
  name: string
  url: string
  port: number
  status: 'connected' | 'disconnected' | 'unknown'
  last_checked: number
  category?: string
  asset?: string
}

export interface AgentNode {
  id: string
  label: string
  port: number
  url: string
  role: string
}

// ─── Popularity / Social Proof ───────────────────────────────────
export interface PopularityData {
  category_id: CategoryId
  total_businesses: number
  active_businesses: number
  avg_roi_pct: number
  success_rate_pct: number
  top_sub_strategy: string
  total_profit_usdc: number
}

export interface LiveActivity {
  business_id: string
  category_id: CategoryId
  sub_strategy: string
  asset: string
  event_type: string
  description: string
  profit_usdc?: number
  ts: number
}
