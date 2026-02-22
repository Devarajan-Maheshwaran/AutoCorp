/**
 * Price Replay Engine
 * 
 * Replays historical price data at accelerated speed.
 * In demo: 1 real day = N seconds of demo time (configurable).
 * NOTE: Legacy data files are retained for backward-compat; new Python agents
 * have built-in category-specific mock data. This engine will be replaced.
 * 
 * Adds realistic micro-fluctuations within the day's min/max range
 * to simulate intraday price ticks.
 */

const jodhpurPrices = require('./data/jodhpur_dal_prices.json');
const mumbaiPrices = require('./data/mumbai_dal_prices.json');

class PriceReplayEngine {
  constructor(options = {}) {
    // How many real milliseconds = 1 simulated day
    this.msPerDay = options.msPerDay || 10000; // 10 seconds = 1 day by default
    // How often to emit a price tick (ms)
    this.tickInterval = options.tickInterval || 2000; // every 2 seconds
    // Current position in the price data
    this.dayIndex = 0;
    this.isRunning = false;
    this.listeners = [];
    this.tickTimer = null;
    this.dayTimer = null;
    this.currentTick = { jodhpur: null, mumbai: null };
    this.priceHistory = { jodhpur: [], mumbai: [] };
    this.startTime = null;
  }

  /**
   * Generate a realistic intraday price tick within the day's range.
   * Uses brownian motion around the modal price.
   */
  _generateTick(dayData) {
    const { min_price, max_price, modal_price } = dayData;
    const range = max_price - min_price;
    // Random walk: 60% weight to modal, 40% random within range
    const noise = (Math.random() - 0.5) * range * 0.4;
    const price = Math.round(modal_price + noise);
    return Math.max(min_price, Math.min(max_price, price));
  }

  /**
   * Start replaying prices
   */
  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.startTime = Date.now();
    this.dayIndex = 0;

    console.log(`[PriceEngine] Started. ${this.msPerDay}ms per simulated day, tick every ${this.tickInterval}ms`);
    console.log(`[PriceEngine] ${jodhpurPrices.length} days of Jodhpur data, ${mumbaiPrices.length} days of Mumbai data`);

    // Emit ticks at regular intervals
    this.tickTimer = setInterval(() => {
      if (this.dayIndex >= jodhpurPrices.length || this.dayIndex >= mumbaiPrices.length) {
        console.log('[PriceEngine] All price data replayed. Looping...');
        this.dayIndex = 0;
      }

      const jodhpurDay = jodhpurPrices[this.dayIndex];
      const mumbaiDay = mumbaiPrices[this.dayIndex];

      const jodhpurPrice = this._generateTick(jodhpurDay);
      const mumbaiPrice = this._generateTick(mumbaiDay);

      this.currentTick = {
        timestamp: new Date().toISOString(),
        simulated_date: jodhpurDay.date,
        day_number: this.dayIndex + 1,
        jodhpur: {
          commodity: jodhpurDay.commodity,
          market: jodhpurDay.market,
          state: jodhpurDay.state,
          price_per_quintal: jodhpurPrice,
          day_min: jodhpurDay.min_price,
          day_max: jodhpurDay.max_price,
          day_modal: jodhpurDay.modal_price,
          unit: jodhpurDay.unit
        },
        mumbai: {
          commodity: mumbaiDay.commodity,
          market: mumbaiDay.market,
          state: mumbaiDay.state,
          price_per_quintal: mumbaiPrice,
          day_min: mumbaiDay.min_price,
          day_max: mumbaiDay.max_price,
          day_modal: mumbaiDay.modal_price,
          unit: mumbaiDay.unit
        },
        spread: mumbaiPrice - jodhpurPrice,
        spread_percentage: ((mumbaiPrice - jodhpurPrice) / jodhpurPrice * 100).toFixed(2)
      };

      // Store in history
      this.priceHistory.jodhpur.push({
        timestamp: this.currentTick.timestamp,
        simulated_date: jodhpurDay.date,
        price: jodhpurPrice
      });
      this.priceHistory.mumbai.push({
        timestamp: this.currentTick.timestamp,
        simulated_date: mumbaiDay.date,
        price: mumbaiPrice
      });

      // Keep only last 200 ticks in memory
      if (this.priceHistory.jodhpur.length > 200) {
        this.priceHistory.jodhpur.shift();
        this.priceHistory.mumbai.shift();
      }

      // Notify all listeners
      this.listeners.forEach(fn => fn(this.currentTick));
    }, this.tickInterval);

    // Advance day index at the simulated day rate
    this.dayTimer = setInterval(() => {
      this.dayIndex++;
      console.log(`[PriceEngine] Advanced to day ${this.dayIndex + 1}: ${jodhpurPrices[this.dayIndex % jodhpurPrices.length]?.date || 'loop'}`);
    }, this.msPerDay);
  }

  stop() {
    this.isRunning = false;
    if (this.tickTimer) clearInterval(this.tickTimer);
    if (this.dayTimer) clearInterval(this.dayTimer);
    console.log('[PriceEngine] Stopped.');
  }

  /**
   * Subscribe to price ticks
   * @param {Function} callback - Called with each price tick
   */
  onTick(callback) {
    this.listeners.push(callback);
  }

  /**
   * Get current latest tick
   */
  getCurrentPrice() {
    return this.currentTick;
  }

  /**
   * Get price history
   */
  getHistory(market = 'both', limit = 50) {
    if (market === 'jodhpur') return this.priceHistory.jodhpur.slice(-limit);
    if (market === 'mumbai') return this.priceHistory.mumbai.slice(-limit);
    return {
      jodhpur: this.priceHistory.jodhpur.slice(-limit),
      mumbai: this.priceHistory.mumbai.slice(-limit)
    };
  }

  /**
   * Get engine status
   */
  getStatus() {
    return {
      running: this.isRunning,
      current_day_index: this.dayIndex,
      total_days: jodhpurPrices.length,
      ms_per_day: this.msPerDay,
      tick_interval_ms: this.tickInterval,
      ticks_emitted: this.priceHistory.jodhpur.length,
      uptime_ms: this.startTime ? Date.now() - this.startTime : 0
    };
  }
}

// Singleton instance
const engine = new PriceReplayEngine({
  msPerDay: parseInt(process.env.MS_PER_DAY) || 10000,
  tickInterval: parseInt(process.env.TICK_INTERVAL) || 2000
});

module.exports = engine;
