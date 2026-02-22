// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract BusinessEntity {
    enum State { ACTIVE, DISSOLVED }
    enum Category { CRYPTO_ARBITRAGE, COMPUTE_ARBITRAGE, SAAS_ARBITRAGE }

    struct TradeRecord {
        bytes32 tradeId;
        uint256 cost;
        uint256 revenue;
        bool isOpen;
    }

    struct Charter {
        Category category;
        uint256 budget;
        uint256 roiThresholdBP; // ROI threshold in basis points (100 = 1%)
        uint256 deadline;
    }

    address public founder;
    address public investor;
    IERC20 public usdc;
    State public state;
    Charter public charter;
    
    bytes32[] public tradeIds;
    mapping(bytes32 => TradeRecord) public trades;
    
    uint256 public totalCostUsdc;
    uint256 public totalRevenueUsdc;
    uint256 public openTradeCount;

    event TradeOpened(bytes32 indexed tradeId, uint256 cost);
    event TradeClosed(bytes32 indexed tradeId, uint256 revenue, uint256 profitOrLoss);
    event BusinessDissolved(uint256 finalBalance);

    modifier onlyFounder() {
        require(msg.sender == founder, "Not founder");
        _;
    }

    modifier onlyActive() {
        require(state == State.ACTIVE, "Business is dissolved");
        _;
    }

    constructor(
        address _founder,
        address _investor,
        address _usdc,
        Category _category,
        uint256 _budget,
        uint256 _roiThresholdBP,
        uint256 _deadline
    ) {
        founder = _founder;
        investor = _investor;
        usdc = IERC20(_usdc);
        
        charter = Charter({
            category: _category,
            budget: _budget,
            roiThresholdBP: _roiThresholdBP,
            deadline: _deadline
        });
        
        state = State.ACTIVE;
    }

    function openTrade(bytes32 tradeId, uint256 cost) public onlyFounder onlyActive {
        require(!trades[tradeId].isOpen && trades[tradeId].cost == 0, "Trade already exists");
        require(totalCostUsdc + cost <= charter.budget, "Budget exceeded");
        
        require(usdc.transferFrom(investor, address(this), cost), "USDC transfer failed");

        trades[tradeId] = TradeRecord({
            tradeId: tradeId,
            cost: cost,
            revenue: 0,
            isOpen: true
        });
        
        tradeIds.push(tradeId);
        totalCostUsdc += cost;
        openTradeCount += 1;

        emit TradeOpened(tradeId, cost);
    }
    
    function recordPurchase(bytes32 tradeId, uint256 cost) public {
        openTrade(tradeId, cost);
    }

    function closeTrade(bytes32 tradeId, uint256 revenue) public onlyFounder onlyActive {
        require(trades[tradeId].isOpen, "Cannot close non-existent trade");
        
        require(usdc.transferFrom(founder, address(this), revenue), "USDC transfer failed");

        trades[tradeId].revenue = revenue;
        trades[tradeId].isOpen = false;
        
        totalRevenueUsdc += revenue;
        openTradeCount -= 1;
        
        uint256 pnl = revenue > trades[tradeId].cost ? revenue - trades[tradeId].cost : trades[tradeId].cost - revenue;

        emit TradeClosed(tradeId, revenue, pnl);
    }

    function recordSale(bytes32 tradeId, uint256 revenue) public {
        closeTrade(tradeId, revenue);
    }

    function dissolve() public onlyActive {
        bool deadlineReached = block.timestamp >= charter.deadline;
        
        uint256 currentRoiBP = 0;
        if (totalCostUsdc > 0) {
            if (totalRevenueUsdc > totalCostUsdc) {
                uint256 profit = totalRevenueUsdc - totalCostUsdc;
                currentRoiBP = (profit * 10000) / totalCostUsdc;
            }
        }
        
        bool roiReached = currentRoiBP >= charter.roiThresholdBP && totalCostUsdc > 0;
        bool noOpenTrades = openTradeCount == 0;
        
        // Dissolve ONLY if deadline reached OR ROI reached OR no open trades (which means the initial condition can trigger dissolve if no trades have happened yet)
        // Wait, "no open trades" might just be a condition along with the others or independent. 
        // The prompt says "dissolve only if: deadline reached OR ROI reached OR no open trades"
        require(deadlineReached || roiReached || noOpenTrades, "Conditions not met to dissolve");
        
        state = State.DISSOLVED;
        
        uint256 balance = usdc.balanceOf(address(this));
        if (balance > 0) {
            require(usdc.transfer(investor, balance), "Transfer failed");
        }
        
        emit BusinessDissolved(balance);
    }

    function getPnL() public view returns (int256) {
        return int256(totalRevenueUsdc) - int256(totalCostUsdc);
    }

    function getCharter() public view returns (Charter memory) {
        return charter;
    }

    function getTrade(bytes32 tradeId) public view returns (TradeRecord memory) {
        return trades[tradeId];
    }

    function getTradeCount() public view returns (uint256) {
        return tradeIds.length;
    }

    function getTimeRemaining() public view returns (uint256) {
        if (block.timestamp >= charter.deadline) {
            return 0;
        }
        return charter.deadline - block.timestamp;
    }
}
