/**
 * Freight Evaluator — LLM-Powered with Algorithmic Verification
 * 
 * PRIMARY: Gemini 2.0 Flash performs real ReAct reasoning about freight options.
 *          The LLM generates genuine analytical thoughts, not templates.
 * 
 * VERIFICATION: Algorithmic weighted scoring validates the LLM's choice.
 *               If the LLM picks an option that violates hard constraints,
 *               the algorithm overrides it (trust but verify).
 * 
 * FALLBACK: If no API key or LLM fails, falls back to pure algorithmic scoring.
 * 
 * This gives judges REAL AI reasoning on the Glassbox dashboard while
 * ensuring the system never makes economically irrational decisions.
 */

const axios = require('axios');
const { evaluateWithLLM, isLLMAvailable } = require('./gemini-llm');

const MOCK_API = process.env.MOCK_API_URL || 'http://localhost:3001';
const LLM_ENABLED = (process.env.LLM_ENABLED || 'true') === 'true';

// Weights for algorithmic verification
const WEIGHTS = {
  cost: 0.40,
  speed: 0.30,
  reliability: 0.20,
  flexibility: 0.10
};

// Known provider reliability scores (simulated reputation from past transactions)
const PROVIDER_RELIABILITY = {
  'Rivigo': 0.85,
  'BlackBuck': 0.90,
  'Porter Intercity': 0.75,
  'default': 0.70
};

class FreightEvaluator {
  constructor(reactEngine) {
    this.react = reactEngine;
  }

  /**
   * Fetch available freight options from the mock API
   */
  async fetchOptions(quantityQuintals) {
    await this.react.act(
      `Querying freight API for ${quantityQuintals} quintals on Jodhpur→Mumbai route`,
      'api_call',
      { endpoint: '/api/freight/options', quantity: quantityQuintals }
    );

    const response = await axios.get(`${MOCK_API}/api/freight/options`, {
      params: { quantity_quintals: quantityQuintals }
    });

    await this.react.observe(
      `Received ${response.data.options_count} freight options from API`,
      { options: response.data.data.map(o => ({
        provider: o.provider,
        cost: o.estimated_cost,
        hours: o.estimated_hours,
        type: o.type
      }))}
    );

    return response.data.data;
  }

  /**
   * Score a single freight option algorithmically (0-100)
   * Used for VERIFICATION of LLM decisions
   */
  scoreOption(option, quantityQuintals, constraints = {}) {
    const maxCost = constraints.maxCostPerQuintal || 250;
    const maxHours = constraints.maxDeliveryHours || 48;

    const costScore = Math.max(0, (1 - option.cost_per_quintal / maxCost) * 100);
    const speedScore = Math.max(0, (1 - option.estimated_hours / maxHours) * 100);
    const reliability = PROVIDER_RELIABILITY[option.provider] || PROVIDER_RELIABILITY.default;
    const reliabilityScore = reliability * 100;
    const flexScore = option.min_load_quintals <= quantityQuintals ? 100 :
      Math.max(0, (1 - (option.min_load_quintals - quantityQuintals) / option.min_load_quintals) * 100);

    const totalScore = (
      WEIGHTS.cost * costScore +
      WEIGHTS.speed * speedScore +
      WEIGHTS.reliability * reliabilityScore +
      WEIGHTS.flexibility * flexScore
    );

    return {
      provider: option.provider,
      freight_id: option.id,
      cost_score: Math.round(costScore * 10) / 10,
      speed_score: Math.round(speedScore * 10) / 10,
      reliability_score: Math.round(reliabilityScore * 10) / 10,
      flexibility_score: Math.round(flexScore * 10) / 10,
      total_score: Math.round(totalScore * 10) / 10,
      cost_per_quintal: option.cost_per_quintal,
      estimated_hours: option.estimated_hours,
      estimated_cost: option.estimated_cost || option.cost_per_quintal * quantityQuintals,
      meets_constraints: option.cost_per_quintal <= maxCost && option.estimated_hours <= maxHours
    };
  }

  /**
   * MAIN EVALUATE — LLM-first with algorithmic fallback
   * 
   * Flow:
   * 1. Fetch freight options from API
   * 2. If LLM available → send to Gemini for ReAct reasoning
   * 3. Algorithmically score ALL options (verification layer)
   * 4. If LLM decision exists → validate it against constraints
   * 5. If LLM decision violates constraints → override with algo winner
   */
  async evaluate(quantityQuintals, constraints = {}, priceContext = {}) {
    const maxCost = constraints.maxCostPerQuintal || 250;
    const maxHours = constraints.maxDeliveryHours || 48;

    // Step 1: Fetch options
    const options = await this.fetchOptions(quantityQuintals);

    // Filter eligible
    const eligible = options.filter(o =>
      o.available &&
      quantityQuintals >= o.min_load_quintals &&
      quantityQuintals <= o.max_load_quintals
    );
    const toScore = eligible.length > 0 ? eligible : options.filter(o => o.available);

    // Step 2: Algorithmic scoring (always runs — serves as verification)
    const scored = toScore.map(option => this.scoreOption(option, quantityQuintals, constraints));
    scored.sort((a, b) => b.total_score - a.total_score);
    const algoWinner = scored[0];

    // Step 3: LLM reasoning (if available)
    let llmResult = null;
    let usedLLM = false;

    if (LLM_ENABLED && isLLMAvailable()) {
      try {
        await this.react.think(
          `Gemini 2.0 Flash is online. Sending ${toScore.length} freight options for AI-powered analysis...`,
          { llm_enabled: true }
        );

        llmResult = await evaluateWithLLM({
          options: toScore,
          quantity_quintals: quantityQuintals,
          max_cost_per_quintal: maxCost,
          max_delivery_hours: maxHours,
          spread: priceContext.spread || '—',
          jodhpur_price: priceContext.jodhpur_price || '—',
          mumbai_price: priceContext.mumbai_price || '—'
        }, this.react);

        usedLLM = true;
        console.log('[FreightEval] LLM reasoning complete.');
      } catch (err) {
        console.error('[FreightEval] LLM failed, falling back to algo:', err.message);
        await this.react.think(
          `LLM reasoning failed (${err.message}). Falling back to algorithmic multi-criteria scoring.`,
          { error: err.message, fallback: true }
        );
      }
    } else {
      await this.react.think(
        LLM_ENABLED
          ? `No GEMINI_API_KEY configured. Using algorithmic multi-criteria model: Cost(40%), Speed(30%), Reliability(20%), Flexibility(10%).`
          : `LLM disabled via config. Using algorithmic scoring.`,
        { llm_enabled: false }
      );

      // Run the old-style template reasoning for demo purposes
      for (const s of scored) {
        await this.react.think(
          `${s.provider}: Total=${s.total_score}/100 ` +
          `[Cost=${s.cost_score}, Speed=${s.speed_score}, Reliability=${s.reliability_score}, ` +
          `Flexibility=${s.flexibility_score}] ` +
          `₹${s.cost_per_quintal}/q, ${s.estimated_hours}hrs, Total=₹${s.estimated_cost}. ` +
          `${s.meets_constraints ? '✅ Meets all constraints' : '⚠️ Exceeds a constraint'}`
        );
      }
    }

    // Step 4: Determine final selection
    let winner = algoWinner;
    let decision_source = 'algorithmic';

    if (usedLLM && llmResult?.decision) {
      const llmChoice = llmResult.decision;

      // Find the LLM's chosen option in our scored list
      const llmScored = scored.find(s =>
        s.freight_id === llmChoice.freight_id ||
        s.provider.toLowerCase().includes((llmChoice.provider || '').toLowerCase())
      );

      if (llmScored && llmScored.meets_constraints) {
        // LLM choice is valid — use it
        winner = llmScored;
        decision_source = 'gemini-llm';
        await this.react.think(
          `✅ Verification passed: LLM selected ${winner.provider} (algo score: ${winner.total_score}/100). ` +
          `Choice meets all hard constraints (cost ≤₹${maxCost}/q, time ≤${maxHours}h). Accepting LLM decision.`,
          { verification: 'passed', source: 'gemini-llm' }
        );
      } else if (llmScored && !llmScored.meets_constraints) {
        // LLM chose something that violates constraints — override
        decision_source = 'algorithmic-override';
        await this.react.think(
          `⚠️ Verification OVERRIDE: LLM selected ${llmScored.provider} but it violates constraints ` +
          `(₹${llmScored.cost_per_quintal}/q > ₹${maxCost} or ${llmScored.estimated_hours}h > ${maxHours}h). ` +
          `Overriding with algo winner: ${algoWinner.provider} (score: ${algoWinner.total_score}/100).`,
          { verification: 'overridden', reason: 'constraint_violation' }
        );
      } else {
        // LLM returned an unrecognized provider
        decision_source = 'algorithmic-fallback';
        await this.react.think(
          `⚠️ LLM returned unrecognized provider "${llmChoice.provider}". ` +
          `Falling back to algo winner: ${algoWinner.provider}.`,
          { verification: 'fallback', reason: 'unknown_provider' }
        );
      }
    }

    // Final announcement
    if (!usedLLM) {
      await this.react.think(
        `DECISION: Selecting ${winner.provider} (score: ${winner.total_score}/100). ` +
        `Cost: ₹${winner.estimated_cost} for ${quantityQuintals}q. ETA: ${winner.estimated_hours} hours.`
      );
    }

    return {
      recommended: winner,
      all_scored: scored,
      quantity_quintals: quantityQuintals,
      decision_source,
      llm_used: usedLLM,
      llm_model: usedLLM ? (llmResult?.model || null) : null,
      constraints_used: {
        max_cost_per_quintal: maxCost,
        max_delivery_hours: maxHours,
        weights: WEIGHTS
      }
    };
  }
}

module.exports = FreightEvaluator;
