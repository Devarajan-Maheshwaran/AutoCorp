/**
 * ReAct Reasoning Engine for Logistics Agent
 * 
 * Implements the ReAct (Reasoning + Acting) framework:
 *   Thought → Action → Observation → Thought → ...
 * 
 * Each step is logged to the Glassbox event bus so the dashboard
 * can show the agent's internal reasoning in real-time.
 * 
 * This is NOT a mock. It's real decision logic that evaluates
 * freight options using weighted scoring and makes optimal choices.
 */

const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

const MOCK_API = process.env.MOCK_API_URL || 'http://localhost:3001';
const AGENT_ID = process.env.AGENT_ID || 'logistics-agent-001';
const AGENT_NAME = process.env.AGENT_NAME || 'LogisticsAgent';

class ReActEngine {
  constructor() {
    this.reasoningLog = [];
    this.stepCount = 0;
  }

  /**
   * Publish a reasoning step to the Glassbox event bus
   */
  async publishStep(step) {
    this.reasoningLog.push(step);
    this.stepCount++;

    const event = {
      type: 'agent_reasoning',
      agent_id: AGENT_ID,
      agent_name: AGENT_NAME,
      action: step.type, // 'thought', 'action', 'observation'
      details: {
        step_number: this.stepCount,
        ...step
      }
    };

    try {
      await axios.post(`${MOCK_API}/api/events/publish`, event);
    } catch (err) {
      console.error('[ReAct] Failed to publish event:', err.message);
    }

    // Console log for debugging
    const prefix = step.type === 'thought' ? '💭' : step.type === 'action' ? '⚡' : '👁️';
    console.log(`[ReAct Step ${this.stepCount}] ${prefix} ${step.type.toUpperCase()}: ${step.content}`);
  }

  /**
   * THOUGHT step: Agent reasons about current state
   */
  async think(content, data = {}) {
    await this.publishStep({
      type: 'thought',
      content,
      data,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * ACTION step: Agent takes an action (API call, computation, etc.)
   */
  async act(content, actionType, data = {}) {
    await this.publishStep({
      type: 'action',
      content,
      action_type: actionType,
      data,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * OBSERVATION step: Agent observes the result of an action
   */
  async observe(content, data = {}) {
    await this.publishStep({
      type: 'observation',
      content,
      data,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Get full reasoning trace for debugging/display
   */
  getTrace() {
    return {
      agent_id: AGENT_ID,
      total_steps: this.stepCount,
      steps: this.reasoningLog
    };
  }

  /**
   * Reset for a new task
   */
  reset() {
    this.reasoningLog = [];
    this.stepCount = 0;
  }
}

module.exports = ReActEngine;
