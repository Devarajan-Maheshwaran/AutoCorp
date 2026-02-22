// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title BusinessEntity
 * @notice On-chain record of an AutoCorp autonomous business.
 *         Records purchases, sales, and P&L. Deployed by AutoCorpFactory.
 */
contract BusinessEntity {
    address public investor;
    address public factory;
    bytes32 public charterHash;
    uint8   public category;        // 0=crypto, 1=compute, 2=saas
    string  public subStrategy;
    string  public asset;
    uint256 public budgetUsdc;       // 6-decimal USDC
    uint256 public minMarginBps;     // basis points (e.g. 1000 = 10%)
    uint256 public durationSecs;
    uint256 public maxHoldingSecs;
    uint256 public deployedAt;
    bool    public dissolved;

    // Financial state
    uint256 public totalPurchases;
    uint256 public totalSales;
    int256  public netPnL;

    struct TradeRecord {
        string  lotId;
        uint256 amountCents;
        string  currency;
        uint256 timestamp;
        bool    isSale;
    }

    TradeRecord[] public trades;

    event PurchaseRecorded(string lotId, uint256 costCents, string currency, uint256 timestamp);
    event SaleRecorded(string lotId, uint256 revenueCents, string currency, uint256 timestamp);
    event BusinessDissolved(address investor, int256 finalPnL, uint256 timestamp);

    modifier onlyInvestorOrFactory() {
        require(msg.sender == investor || msg.sender == factory, "Unauthorized");
        _;
    }

    modifier notDissolved() {
        require(!dissolved, "Business dissolved");
        _;
    }

    constructor(
        address _investor,
        bytes32 _charterHash,
        uint8   _category,
        string memory _subStrategy,
        string memory _asset,
        uint256 _budgetUsdc,
        uint256 _minMarginBps,
        uint256 _durationSecs,
        uint256 _maxHoldingSecs
    ) {
        investor       = _investor;
        factory        = msg.sender;
        charterHash    = _charterHash;
        category       = _category;
        subStrategy    = _subStrategy;
        asset          = _asset;
        budgetUsdc     = _budgetUsdc;
        minMarginBps   = _minMarginBps;
        durationSecs   = _durationSecs;
        maxHoldingSecs = _maxHoldingSecs;
        deployedAt     = block.timestamp;
    }

    function recordPurchase(
        string calldata lotId,
        uint256 costCents,
        string calldata currency
    ) external onlyInvestorOrFactory notDissolved {
        trades.push(TradeRecord({
            lotId: lotId,
            amountCents: costCents,
            currency: currency,
            timestamp: block.timestamp,
            isSale: false
        }));
        totalPurchases += costCents;
        netPnL -= int256(costCents);

        emit PurchaseRecorded(lotId, costCents, currency, block.timestamp);
    }

    function recordSale(
        string calldata lotId,
        uint256 revenueCents,
        string calldata currency
    ) external onlyInvestorOrFactory notDissolved {
        trades.push(TradeRecord({
            lotId: lotId,
            amountCents: revenueCents,
            currency: currency,
            timestamp: block.timestamp,
            isSale: true
        }));
        totalSales += revenueCents;
        netPnL += int256(revenueCents);

        emit SaleRecorded(lotId, revenueCents, currency, block.timestamp);
    }

    function getEscrowBalance() external view returns (uint256) {
        // Returns remaining budget estimate based on P&L
        if (netPnL >= 0) return budgetUsdc;
        uint256 loss = uint256(-netPnL);
        return loss >= budgetUsdc ? 0 : budgetUsdc - loss;
    }

    function getPnL() external view returns (int256 revenue, int256 costs) {
        return (int256(totalSales), int256(totalPurchases));
    }

    function getTradeCount() external view returns (uint256) {
        return trades.length;
    }

    function dissolve() external onlyInvestorOrFactory notDissolved {
        dissolved = true;
        emit BusinessDissolved(investor, netPnL, block.timestamp);
    }
}
