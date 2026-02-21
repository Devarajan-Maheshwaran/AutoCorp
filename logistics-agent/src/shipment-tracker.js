/**
 * Shipment Tracker
 * 
 * Monitors freight shipments in real-time via SSE streams.
 * Publishes checkpoint updates to the Glassbox event bus.
 * Detects delivery completion and triggers notification to Sales Agent.
 */

const axios = require('axios');
const { EventSource } = require('eventsource');

const MOCK_API = process.env.MOCK_API_URL || 'http://localhost:3001';
const AGENT_ID = process.env.AGENT_ID || 'logistics-agent-001';
const AGENT_NAME = process.env.AGENT_NAME || 'LogisticsAgent';

class ShipmentTracker {
  constructor(reactEngine) {
    this.react = reactEngine;
    this.activeTracking = new Map(); // shipmentId -> EventSource
    this.shipmentCallbacks = new Map(); // shipmentId -> { onUpdate, onDelivery }
  }

  /**
   * Start tracking a shipment via SSE
   */
  async startTracking(shipmentId, callbacks = {}) {
    if (this.activeTracking.has(shipmentId)) {
      console.log(`[Tracker] Already tracking ${shipmentId}`);
      return;
    }

    await this.react.act(
      `Starting real-time SSE tracking for shipment ${shipmentId}`,
      'sse_connect',
      { endpoint: `/api/freight/track/${shipmentId}/stream` }
    );

    const url = `${MOCK_API}/api/freight/track/${shipmentId}/stream`;
    const es = new EventSource(url);

    this.shipmentCallbacks.set(shipmentId, callbacks);

    es.addEventListener('checkpoint', async (event) => {
      try {
        const data = JSON.parse(event.data);
        
        await this.react.observe(
          `Shipment ${shipmentId} checkpoint: ${data.location} (${data.type}) - ${data.status}`,
          {
            shipment_id: shipmentId,
            checkpoint: data.location,
            type: data.type,
            status: data.status,
            checkpoint_index: data.checkpoint_index,
            total_checkpoints: data.total_checkpoints
          }
        );

        // Publish to event bus
        await this._publishTrackingEvent(shipmentId, 'checkpoint_update', data);

        if (callbacks.onUpdate) {
          callbacks.onUpdate(data);
        }

        // Check if delivered
        if (data.type === 'delivery' && data.status === 'arrived') {
          await this.react.think(
            `Shipment ${shipmentId} has been DELIVERED to ${data.location}! ` +
            `Transit complete. Need to notify Sales Agent for buyer handoff.`
          );

          await this._publishTrackingEvent(shipmentId, 'delivery_confirmed', data);

          if (callbacks.onDelivery) {
            callbacks.onDelivery(data);
          }

          // Clean up SSE connection
          this.stopTracking(shipmentId);
        }
      } catch (err) {
        console.error('[Tracker] Error processing checkpoint:', err.message);
      }
    });

    es.addEventListener('shipment_update', async (event) => {
      try {
        const data = JSON.parse(event.data);
        
        await this.react.observe(
          `Shipment ${shipmentId} status update: ${data.status}`,
          { shipment_id: shipmentId, ...data }
        );

        if (data.status === 'delivered') {
          await this._publishTrackingEvent(shipmentId, 'delivery_confirmed', data);
          
          if (callbacks.onDelivery) {
            callbacks.onDelivery(data);
          }
          this.stopTracking(shipmentId);
        }
      } catch (err) {
        console.error('[Tracker] Error processing update:', err.message);
      }
    });

    es.onerror = (err) => {
      console.error(`[Tracker] SSE error for ${shipmentId}:`, err.message || 'Connection error');
    };

    this.activeTracking.set(shipmentId, es);
    console.log(`[Tracker] Now tracking shipment ${shipmentId}`);
  }

  /**
   * Stop tracking a shipment
   */
  stopTracking(shipmentId) {
    const es = this.activeTracking.get(shipmentId);
    if (es) {
      es.close();
      this.activeTracking.delete(shipmentId);
      this.shipmentCallbacks.delete(shipmentId);
      console.log(`[Tracker] Stopped tracking ${shipmentId}`);
    }
  }

  /**
   * Get current shipment status (poll-based fallback)
   */
  async getStatus(shipmentId) {
    try {
      const response = await axios.get(`${MOCK_API}/api/freight/track/${shipmentId}`);
      return response.data;
    } catch (err) {
      console.error('[Tracker] Failed to get status:', err.message);
      return null;
    }
  }

  /**
   * Publish tracking event to event bus
   */
  async _publishTrackingEvent(shipmentId, eventType, data) {
    try {
      await axios.post(`${MOCK_API}/api/events/publish`, {
        type: eventType,
        agent_id: AGENT_ID,
        agent_name: AGENT_NAME,
        action: 'shipment_tracking',
        details: {
          shipment_id: shipmentId,
          ...data
        }
      });
    } catch (err) {
      console.error('[Tracker] Failed to publish event:', err.message);
    }
  }

  /**
   * Stop all active tracking
   */
  stopAll() {
    for (const [id, es] of this.activeTracking) {
      es.close();
      console.log(`[Tracker] Stopped tracking ${id}`);
    }
    this.activeTracking.clear();
    this.shipmentCallbacks.clear();
  }
}

module.exports = ShipmentTracker;
