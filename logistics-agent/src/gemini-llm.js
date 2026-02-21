/**
 * Gemini LLM Module for AutoCorp Logistics Agent
 * 
 * Wraps Google Gemini 2.0 Flash for ReAct-style reasoning.
 * The LLM generates REAL thoughts — not templates or hardcoded strings.
 * 
 * Each LLM call streams the response back and parses it into
 * structured ReAct steps (THOUGHT / ACTION / OBSERVATION / DECISION).
 * 
 * All outputs are published to the Glassbox event bus in real-time.
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');
const { LOGISTICS_SYSTEM_PROMPT, FEW_SHOT_EVALUATE, FEW_SHOT_BOOK, FEW_SHOT_PIPELINE } = require('./prompts');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL_NAME = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'openai/gpt-oss-20b:free';

let genAI = null;
let model = null;

function hasOpenRouter() {
  return !!OPENROUTER_API_KEY;
}

function hasGemini() {
  return !!GEMINI_API_KEY;
}

function getProviderLabel() {
  if (hasOpenRouter()) return `openrouter:${OPENROUTER_MODEL}`;
  if (hasGemini()) return `gemini:${MODEL_NAME}`;
  return 'none';
}

function mapHistoryToOpenRouterMessages(history) {
  const messages = [];
  for (const item of history) {
    const content = (item.parts || []).map((p) => p.text).join('\n');
    const role = item.role === 'model' ? 'assistant' : 'user';
    messages.push({ role, content });
  }
  return messages;
}

async function sendWithOpenRouter(systemPrompt, history, userPrompt) {
  const messages = [
    { role: 'system', content: systemPrompt },
    ...mapHistoryToOpenRouterMessages(history),
    { role: 'user', content: userPrompt },
  ];

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      messages,
      reasoning: { enabled: true },
      temperature: 0.5,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenRouter request failed: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) {
    throw new Error('OpenRouter returned empty content');
  }
  return text;
}

/**
 * Initialize the Gemini client (lazy — only when first called)
 */
function getModel() {
  if (!GEMINI_API_KEY) {
    throw new Error(
      'GEMINI_API_KEY not set. Add it to logistics-agent/.env\n' +
      'Get a free key at: https://aistudio.google.com/apikey'
    );
  }
  if (!genAI) {
    genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    model = genAI.getGenerativeModel({
      model: MODEL_NAME,
      generationConfig: {
        temperature: 0.7,
        topP: 0.9,
        topK: 40,
        maxOutputTokens: 2048,
      }
    });
    console.log(`[LLM] Initialized Gemini model: ${MODEL_NAME}`);
  }
  return model;
}

async function runLLMChat({ history, userPrompt }) {
  if (hasOpenRouter()) {
    return sendWithOpenRouter(LOGISTICS_SYSTEM_PROMPT, history, userPrompt);
  }

  if (!hasGemini()) {
    throw new Error('No LLM API key configured. Set OPENROUTER_API_KEY or GEMINI_API_KEY.');
  }

  const m = getModel();
  const chat = m.startChat({ history });
  const result = await chat.sendMessage(userPrompt);
  return result.response.text();
}

/**
 * Parse LLM response into structured ReAct steps.
 * 
 * Expected format from LLM:
 *   THOUGHT: <reasoning text>
 *   ACTION: <action text>
 *   OBSERVATION: <observation text>
 *   DECISION: {"freight_id": "...", "provider": "...", "reason": "..."}
 */
function parseReActSteps(text) {
  const steps = [];
  // Split on ReAct markers
  const lines = text.split('\n');
  let currentType = null;
  let currentContent = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // Check for ReAct marker
    const markers = [
      { prefix: 'THOUGHT:', type: 'thought' },
      { prefix: 'ACTION:', type: 'action' },
      { prefix: 'OBSERVATION:', type: 'observation' },
      { prefix: 'DECISION:', type: 'decision' }
    ];

    let matched = false;
    for (const marker of markers) {
      if (trimmed.startsWith(marker.prefix)) {
        // Save previous step
        if (currentType && currentContent.length > 0) {
          steps.push({
            type: currentType,
            content: currentContent.join('\n').trim()
          });
        }
        // Start new step
        currentType = marker.type;
        currentContent = [trimmed.slice(marker.prefix.length).trim()];
        matched = true;
        break;
      }
    }

    if (!matched && currentType) {
      currentContent.push(trimmed);
    }
  }

  // Save last step
  if (currentType && currentContent.length > 0) {
    steps.push({
      type: currentType,
      content: currentContent.join('\n').trim()
    });
  }

  return steps;
}

/**
 * Extract DECISION JSON from a decision step's content
 */
function parseDecision(content) {
  try {
    // Try to find JSON in the content
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (err) {
    console.error('[LLM] Failed to parse decision JSON:', err.message);
  }
  return null;
}

/**
 * Call Gemini for freight evaluation reasoning
 * 
 * @param {Object} context - Current state (options, prices, constraints)
 * @param {Object} reactEngine - ReAct engine for publishing steps
 * @returns {Object} { steps, decision }
 */
async function evaluateWithLLM(context, reactEngine) {
  const userPrompt = `You have received a logistics task. Evaluate freight options for ${context.quantity_quintals} quintals of Tur Dal from Jodhpur to Mumbai.

Available options from freight API:
${context.options.map((o, i) => `${i + 1}. ${o.provider} (${o.type}): ₹${o.cost_per_quintal}/quintal, ${o.estimated_hours} hours, min ${o.min_load_quintals}q, max ${o.max_load_quintals}q, ${o.vehicle_type}`).join('\n')}

Current spread: ₹${context.spread}/quintal (Jodhpur ₹${context.jodhpur_price}, Mumbai ₹${context.mumbai_price})

Budget constraint: ≤₹${context.max_cost_per_quintal}/quintal. Time constraint: ≤${context.max_delivery_hours} hours.

Think step by step using the ReAct framework. For each step, output exactly one of:
THOUGHT: <your reasoning>
ACTION: <what you will do>
OBSERVATION: <what you learned from the action>

After analyzing all options, output your final decision as:
DECISION: {"freight_id": "<id from options>", "provider": "<name>", "reason": "<1-2 sentence explanation>", "total_cost": <number>, "estimated_hours": <number>}`;

  const history = [
    { role: 'user', parts: [{ text: LOGISTICS_SYSTEM_PROMPT }] },
    { role: 'model', parts: [{ text: 'Understood. I am the AutoCorp Logistics Agent. I will evaluate freight options using the ReAct framework, make data-driven decisions, and communicate transparently through the Glassbox dashboard. Ready for tasks.' }] },
    ...FEW_SHOT_EVALUATE
  ];

  console.log(`[LLM] Sending freight evaluation via ${getProviderLabel()}...`);
  const responseText = await runLLMChat({ history, userPrompt });
  console.log('[LLM] Response received. Parsing ReAct steps...');

  // Parse into structured steps
  const steps = parseReActSteps(responseText);

  // Publish each step to Glassbox
  for (const step of steps) {
    if (step.type === 'thought') {
      await reactEngine.think(step.content, { source: 'gemini-2.5-flash' });
    } else if (step.type === 'action') {
      await reactEngine.act(step.content, 'llm_reasoning', { source: getProviderLabel() });
    } else if (step.type === 'observation') {
      await reactEngine.observe(step.content, { source: getProviderLabel() });
    } else if (step.type === 'decision') {
      await reactEngine.think(`DECISION: ${step.content}`, { source: getProviderLabel(), is_decision: true });
    }
  }

  // Extract decision
  const decisionStep = steps.find(s => s.type === 'decision');
  const decision = decisionStep ? parseDecision(decisionStep.content) : null;

  return {
    steps,
    decision,
    raw_response: responseText,
    model: getProviderLabel()
  };
}

/**
 * Call Gemini for full pipeline reasoning
 */
async function pipelineReasonWithLLM(context, reactEngine) {
  const userPrompt = `FULL LOGISTICS PIPELINE initiated.
Order ID: ${context.order_id}
Quantity: ${context.quantity_quintals} quintals of Tur Dal
Route: Jodhpur (Rajasthan) → Mumbai (Vashi)
Current prices: Jodhpur ₹${context.jodhpur_price}/q, Mumbai ₹${context.mumbai_price}/q (spread: ₹${context.spread})

Available freight options:
${context.options.map((o, i) => `${i + 1}. ${o.provider} (${o.type}): ₹${o.cost_per_quintal}/quintal, ${o.estimated_hours} hours, vehicle: ${o.vehicle_type}`).join('\n')}

Walk me through your complete logistics plan. Think step by step using THOUGHT/ACTION/OBSERVATION markers. End with a DECISION containing the freight_id to book.`;

  const history = [
    { role: 'user', parts: [{ text: LOGISTICS_SYSTEM_PROMPT }] },
    { role: 'model', parts: [{ text: 'Understood. I am the AutoCorp Logistics Agent. Ready for full pipeline operations.' }] },
    ...FEW_SHOT_PIPELINE
  ];

  console.log(`[LLM] Sending full pipeline reasoning via ${getProviderLabel()}...`);
  const responseText = await runLLMChat({ history, userPrompt });
  console.log('[LLM] Pipeline response received.');

  const steps = parseReActSteps(responseText);

  for (const step of steps) {
    if (step.type === 'thought') {
      await reactEngine.think(step.content, { source: 'gemini-2.5-flash' });
    } else if (step.type === 'action') {
      await reactEngine.act(step.content, 'llm_reasoning', { source: getProviderLabel() });
    } else if (step.type === 'observation') {
      await reactEngine.observe(step.content, { source: getProviderLabel() });
    } else if (step.type === 'decision') {
      await reactEngine.think(`DECISION: ${step.content}`, { source: getProviderLabel(), is_decision: true });
    }
  }

  const decisionStep = steps.find(s => s.type === 'decision');
  const decision = decisionStep ? parseDecision(decisionStep.content) : null;

  return { steps, decision, raw_response: responseText, model: getProviderLabel() };
}

/**
 * Call Gemini for booking assessment
 */
async function assessBookingWithLLM(bookingData, reactEngine) {
  const userPrompt = `Booking confirmed. Details:

Shipment ID: ${bookingData.shipment_id}
Provider: ${bookingData.provider}
Vehicle: ${bookingData.vehicle_type || 'Standard'}
Pickup: Jodhpur Mandi
Delivery: Vashi (Mumbai)
ETA: ${bookingData.estimated_hours || '—'} hours
Cost: ₹${bookingData.total_cost} (paid via X402)
Checkpoints: ${bookingData.checkpoints?.map(c => c.location).join(' → ') || 'Standard route'}

What is your assessment of this booking? Use THOUGHT/ACTION/OBSERVATION format.`;

  const history = [
    { role: 'user', parts: [{ text: LOGISTICS_SYSTEM_PROMPT }] },
    { role: 'model', parts: [{ text: 'Understood. Ready to assess booking.' }] },
    ...FEW_SHOT_BOOK
  ];

  console.log(`[LLM] Sending booking assessment via ${getProviderLabel()}...`);
  const responseText = await runLLMChat({ history, userPrompt });

  const steps = parseReActSteps(responseText);
  for (const step of steps) {
    if (step.type === 'thought') {
      await reactEngine.think(step.content, { source: 'gemini-2.5-flash' });
    } else if (step.type === 'action') {
      await reactEngine.act(step.content, 'llm_reasoning', { source: getProviderLabel() });
    } else if (step.type === 'observation') {
      await reactEngine.observe(step.content, { source: getProviderLabel() });
    }
  }

  return { steps, raw_response: responseText, model: getProviderLabel() };
}

/**
 * Check if Gemini is configured and available
 */
function isLLMAvailable() {
  return hasOpenRouter() || hasGemini();
}

function getLLMInfo() {
  return {
    available: isLLMAvailable(),
    provider: hasOpenRouter() ? 'openrouter' : hasGemini() ? 'gemini' : 'none',
    model: hasOpenRouter() ? OPENROUTER_MODEL : hasGemini() ? MODEL_NAME : null,
  };
}

module.exports = {
  evaluateWithLLM,
  pipelineReasonWithLLM,
  assessBookingWithLLM,
  parseReActSteps,
  parseDecision,
  isLLMAvailable,
  getLLMInfo
};
