// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./BusinessEntity.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract AutoCorpFactory is Ownable {
    address[] public allBusinesses;
    mapping(address => address[]) public investorBusinesses;

    event BusinessDeployed(address indexed businessAddress, address indexed founder, address indexed investor, BusinessEntity.Category category);

    constructor() Ownable(msg.sender) {}

    function deployBusiness(
        address _investor,
        address _usdc,
        BusinessEntity.Category _category,
        uint256 _budget,
        uint256 _roiThresholdBP,
        uint256 _deadline
    ) public onlyOwner returns (address) {
        BusinessEntity newBusiness = new BusinessEntity(
            msg.sender, // founder is owner
            _investor,
            _usdc,
            _category,
            _budget,
            _roiThresholdBP,
            _deadline
        );

        address businessAddress = address(newBusiness);
        allBusinesses.push(businessAddress);
        investorBusinesses[_investor].push(businessAddress);

        emit BusinessDeployed(businessAddress, msg.sender, _investor, _category);

        return businessAddress;
    }

    function getAllBusinesses() public view returns (address[] memory) {
        return allBusinesses;
    }

    function getBusinessesByInvestor(address investor) public view returns (address[] memory) {
        return investorBusinesses[investor];
    }
}
