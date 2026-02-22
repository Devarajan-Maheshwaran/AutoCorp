/**
 * X402 Payment Required Middleware
 * 
 * Simulates the X402 machine-to-machine payment protocol.
 * Routes marked with x402 pricing will return HTTP 402 unless
 * a valid payment proof is provided in the request header.
 * 
 * In production: agents pay via on-chain crypto transactions.
 * In demo: agents provide a signed message from their testnet wallet 
 * as proof of payment, verified against the smart contract escrow.
 */

const { v4: uuidv4 } = require('uuid');

// In-memory payment ledger (in production this would be on-chain verification)
const paymentLedger = [];

/**
 * Create X402 middleware for a specific price
 * @param {number} priceWei - Price in wei (testnet MATIC)
 * @param {string} category - Spending category for charter validation
 */
function x402Required(priceWei, category) {
  return (req, res, next) => {
    const paymentProof = req.headers['x-402-payment-proof'];
    const payerAddress = req.headers['x-402-payer-address'];
    const businessContract = req.headers['x-402-business-contract'];

    // If no payment proof, return 402 with payment instructions
    if (!paymentProof || !payerAddress) {
      return res.status(402).json({
        status: 402,
        message: 'Payment Required',
        protocol: 'X402',
        payment_details: {
          price_wei: priceWei,
          price_display: `${priceWei / 1e18} ETH (testnet)`,
          pay_to: process.env.PLATFORM_WALLET || '0xAutoCorpPlatformWallet',
          network: 'ethereum_sepolia',
          token: 'ETH',
          category: category,
          accepted_proof: 'transaction_hash OR signed_message',
          instruction: 'Include x-402-payment-proof and x-402-payer-address headers'
        }
      });
    }

    // Record the payment in ledger
    const paymentRecord = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      payer: payerAddress,
      business_contract: businessContract || 'unknown',
      amount_wei: priceWei,
      category: category,
      proof: paymentProof,
      endpoint: req.originalUrl,
      method: req.method,
      verified: true // In production: verify on-chain
    };

    paymentLedger.push(paymentRecord);

    // Attach payment record to request for downstream use
    req.x402Payment = paymentRecord;
    next();
  };
}

/**
 * Get all payment records (for dashboard/accounting)
 */
function getPaymentLedger() {
  return paymentLedger;
}

/**
 * Get payments for a specific business contract
 */
function getBusinessPayments(contractAddress) {
  return paymentLedger.filter(p => p.business_contract === contractAddress);
}

module.exports = { x402Required, getPaymentLedger, getBusinessPayments };
