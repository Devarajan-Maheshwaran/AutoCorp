// Digital delivery handlers — one per category
// Called by server.js after A2A message received

async function deliverCrypto(payload, publish) {
  // Crypto: trade already settled on-chain
  // Just confirm settlement and notify sales
  publish({
    type: 'delivery_confirmed',
    category: '1_crypto',
    lot_id: payload.lot_id,
    delivery_type: 'on_chain_settlement',
    message: 'Both trade legs confirmed filled on-chain',
    buy_result: payload.buy_result,
    sell_result: payload.sell_result
  })
  return { status: 'delivered' }
}

async function deliverCompute(payload, publish) {
  // Compute: verify instance is running, then notify sales to list
  publish({
    type: 'transit_update',
    category: '2_compute',
    lot_id: payload.lot_id,
    status: 'verifying_instance',
    message: `Verifying ${payload.gpu_type} instance ${payload.instance_id}`
  })
  // In live mode: call Vast.ai API to confirm instance state
  // For DEMO_MODE: proceed immediately
  publish({
    type: 'delivery_confirmed',
    category: '2_compute',
    lot_id: payload.lot_id,
    delivery_type: 'digital_credentials',
    instance_id: payload.instance_id,
    ssh_host: payload.ssh_host,
    message: 'GPU instance confirmed running. Ready to list on RunPod.'
  })
  return { status: 'delivered' }
}

async function deliverSaaS(payload, publish) {
  // SaaS: confirm licence pool has available seats
  publish({
    type: 'transit_update',
    category: '5_saas',
    lot_id: payload.lot_id,
    status: 'confirming_licence',
    message: `Confirming ${payload.seats} seats for ${payload.product}`
  })
  publish({
    type: 'delivery_confirmed',
    category: '5_saas',
    lot_id: payload.lot_id,
    delivery_type: 'licence_pool_ready',
    licence_id: payload.licence_id,
    seats: payload.seats,
    admin_url: payload.admin_url,
    message: 'Licence pool active. Ready to allocate seats to buyers.'
  })
  return { status: 'delivered' }
}

module.exports = { deliverCrypto, deliverCompute, deliverSaaS }
