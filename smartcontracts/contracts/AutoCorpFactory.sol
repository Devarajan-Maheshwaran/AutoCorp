// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./BusinessEntity.sol";

/**
 * @title AutoCorpFactory
 * @notice Factory contract that deploys BusinessEntity instances.
 *         One factory per AutoCorp deployment. Each business gets its own contract.
 */
contract AutoCorpFactory {
    address public owner;
    address[] public deployedBusinesses;

    mapping(address => address[]) public investorBusinesses;

    event BusinessDeployed(
        address indexed contractAddress,
        address indexed investor,
        uint8   category,
        string  asset,
        uint256 budgetUsdc,
        uint256 timestamp
    );

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function deployBusiness(
        address _investor,
        bytes32 _charterHash,
        uint8   _category,
        string  calldata _subStrategy,
        string  calldata _asset,
        uint256 _budgetUsdc,
        uint256 _minMarginBps,
        uint256 _durationSecs,
        uint256 _maxHoldingSecs
    ) external returns (address) {
        BusinessEntity biz = new BusinessEntity(
            _investor,
            _charterHash,
            _category,
            _subStrategy,
            _asset,
            _budgetUsdc,
            _minMarginBps,
            _durationSecs,
            _maxHoldingSecs
        );

        address bizAddress = address(biz);
        deployedBusinesses.push(bizAddress);
        investorBusinesses[_investor].push(bizAddress);

        emit BusinessDeployed(
            bizAddress,
            _investor,
            _category,
            _asset,
            _budgetUsdc,
            block.timestamp
        );

        return bizAddress;
    }

    function getDeployedCount() external view returns (uint256) {
        return deployedBusinesses.length;
    }

    function getInvestorBusinesses(address investor) external view returns (address[] memory) {
        return investorBusinesses[investor];
    }

    function getDeployedBusiness(uint256 index) external view returns (address) {
        require(index < deployedBusinesses.length, "Index out of bounds");
        return deployedBusinesses[index];
    }
}
