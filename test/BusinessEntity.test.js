const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("AutoCorp V2 System", function () {
    let mockUSDC, businessEntity, autoCorpFactory;
    let owner, investor, founder, addr3;

    const budget = ethers.parseUnits("1000", 6);
    const roiThresholdBP = 1000; // 10%
    const category = 0; // CRYPTO_ARBITRAGE

    beforeEach(async function () {
        [owner, investor, founder, addr3] = await ethers.getSigners();

        const MockUSDC = await ethers.getContractFactory("MockUSDC");
        mockUSDC = await MockUSDC.deploy();
        await mockUSDC.waitForDeployment();

        await mockUSDC.mint(investor.address, ethers.parseUnits("10000", 6));
        await mockUSDC.mint(owner.address, ethers.parseUnits("10000", 6));

        const AutoCorpFactory = await ethers.getContractFactory("AutoCorpFactory");
        autoCorpFactory = await AutoCorpFactory.deploy();
        await autoCorpFactory.waitForDeployment();

        const deadline = (await ethers.provider.getBlock("latest")).timestamp + 86400; // 1 day from now
        const tx = await autoCorpFactory.deployBusiness(
            investor.address,
            await mockUSDC.getAddress(),
            category,
            budget,
            roiThresholdBP,
            deadline
        );

        const receipt = await tx.wait();
        const event = receipt.logs.find(e => e.fragment && e.fragment.name === 'BusinessDeployed');
        const businessAddress = event.args[0];

        businessEntity = await ethers.getContractAt("BusinessEntity", businessAddress);

        await mockUSDC.connect(investor).approve(await businessEntity.getAddress(), ethers.MaxUint256);
        await mockUSDC.connect(owner).approve(await businessEntity.getAddress(), ethers.MaxUint256);
    });

    describe("Factory", function () {
        it("Should track deployed businesses", async function () {
            const allBusinesses = await autoCorpFactory.getAllBusinesses();
            expect(allBusinesses.length).to.equal(1);
            expect(allBusinesses[0]).to.equal(await businessEntity.getAddress());
        });

        it("Should track investor businesses", async function () {
            const investorBusinesses = await autoCorpFactory.getBusinessesByInvestor(investor.address);
            expect(investorBusinesses.length).to.equal(1);
            expect(investorBusinesses[0]).to.equal(await businessEntity.getAddress());
        });
    });

    describe("Business Entity Core", function () {
        it("Should store charter correctly", async function () {
            const charter = await businessEntity.getCharter();
            expect(charter.category).to.equal(category);
            expect(charter.budget).to.equal(budget);
            expect(charter.roiThresholdBP).to.equal(roiThresholdBP);
        });

        it("openTrade should record cost and transfer USDC", async function () {
            const tradeId = ethers.keccak256(ethers.toUtf8Bytes("trade1"));
            const cost = ethers.parseUnits("100", 6);

            await expect(businessEntity.openTrade(tradeId, cost))
                .to.emit(businessEntity, "TradeOpened")
                .withArgs(tradeId, cost);

            const trade = await businessEntity.getTrade(tradeId);
            expect(trade.cost).to.equal(cost);
            expect(trade.isOpen).to.be.true;

            const bal = await mockUSDC.balanceOf(await businessEntity.getAddress());
            expect(bal).to.equal(cost);
        });

        it("Should reject trade exceeding budget", async function () {
            const tradeId = ethers.keccak256(ethers.toUtf8Bytes("trade2"));
            const cost = ethers.parseUnits("1001", 6);

            await expect(businessEntity.openTrade(tradeId, cost))
                .to.be.revertedWith("Budget exceeded");
        });

        it("closeTrade should calculate profit correctly and transfer USDC", async function () {
            const tradeId = ethers.keccak256(ethers.toUtf8Bytes("trade3"));
            const cost = ethers.parseUnits("100", 6);
            const revenue = ethers.parseUnits("120", 6); // 20 USDC profit

            await businessEntity.openTrade(tradeId, cost);

            await expect(businessEntity.closeTrade(tradeId, revenue))
                .to.emit(businessEntity, "TradeClosed")
                .withArgs(tradeId, revenue, ethers.parseUnits("20", 6));

            const trade = await businessEntity.getTrade(tradeId);
            expect(trade.revenue).to.equal(revenue);
            expect(trade.isOpen).to.be.false;

            const pnl = await businessEntity.getPnL();
            expect(pnl).to.equal(ethers.parseUnits("20", 6));

            const count = await businessEntity.getTradeCount();
            expect(count).to.equal(1);
        });

        it("ROI calculation correctly allows dissolve", async function () {
            const tradeId = ethers.keccak256(ethers.toUtf8Bytes("trade4"));
            const cost = ethers.parseUnits("100", 6);
            const revenue = ethers.parseUnits("115", 6); // 15% ROI

            await businessEntity.openTrade(tradeId, cost);
            await businessEntity.closeTrade(tradeId, revenue);

            await expect(businessEntity.dissolve())
                .to.emit(businessEntity, "BusinessDissolved");

            expect(await businessEntity.state()).to.equal(1); // DISSOLVED

            const businessBal = await mockUSDC.balanceOf(await businessEntity.getAddress());
            expect(businessBal).to.equal(0);
        });

        it("Dissolve should transfer USDC back to investor", async function () {
            const tradeId = ethers.keccak256(ethers.toUtf8Bytes("trade5"));
            const cost = ethers.parseUnits("100", 6);
            const revenue = ethers.parseUnits("80", 6); // loss

            await businessEntity.openTrade(tradeId, cost);
            await businessEntity.closeTrade(tradeId, revenue);

            const initialInvestorBal = await mockUSDC.balanceOf(investor.address);
            await businessEntity.dissolve();
            const finalInvestorBal = await mockUSDC.balanceOf(investor.address);

            expect(finalInvestorBal - initialInvestorBal).to.equal(ethers.parseUnits("180", 6));
        });

        it("Legacy functions should work as aliases", async function () {
            const tradeId = ethers.keccak256(ethers.toUtf8Bytes("legacy1"));
            const cost = ethers.parseUnits("100", 6);
            const revenue = ethers.parseUnits("110", 6);

            await expect(businessEntity.recordPurchase(tradeId, cost))
                .to.emit(businessEntity, "TradeOpened");

            await expect(businessEntity.recordSale(tradeId, revenue))
                .to.emit(businessEntity, "TradeClosed");
        });
    });
});
