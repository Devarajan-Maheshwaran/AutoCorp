const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("BusinessEntity", function () {
  let factory, usdc, deployer, investor;

  beforeEach(async function () {
    [deployer, investor] = await ethers.getSigners();

    // Deploy MockUSDC
    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    usdc = await MockUSDC.deploy();
    await usdc.waitForDeployment();

    // Deploy Factory
    const Factory = await ethers.getContractFactory("AutoCorpFactory");
    factory = await Factory.deploy();
    await factory.waitForDeployment();
  });

  it("should deploy a BusinessEntity via factory", async function () {
    const charterHash = ethers.keccak256(ethers.toUtf8Bytes("test-charter"));
    const tx = await factory.deployBusiness(
      investor.address,
      charterHash,
      0,                 // category: crypto
      "cross_exchange",  // sub_strategy
      "ETHUSDT",         // asset
      10000000000n,      // 10,000 USDC (6 decimals)
      1000n,             // 10% min margin (bps)
      2592000n,          // 30 days
      172800n            // 48 hours max holding
    );

    const receipt = await tx.wait();

    // Check factory tracked it
    expect(await factory.getDeployedCount()).to.equal(1);

    // Get deployed address from event
    const event = receipt.logs.find(
      (log) => {
        try {
          return factory.interface.parseLog(log)?.name === "BusinessDeployed";
        } catch { return false; }
      }
    );
    expect(event).to.not.be.undefined;
  });

  it("should record purchases and sales", async function () {
    const charterHash = ethers.keccak256(ethers.toUtf8Bytes("test"));
    const tx = await factory.deployBusiness(
      investor.address, charterHash, 0, "cross_exchange", "ETHUSDT",
      10000000000n, 1000n, 2592000n, 172800n
    );
    const receipt = await tx.wait();

    // Get business address
    const businesses = await factory.getInvestorBusinesses(investor.address);
    const bizAddress = businesses[0];

    const BusinessEntity = await ethers.getContractFactory("BusinessEntity");
    const biz = BusinessEntity.attach(bizAddress);

    // Record purchase (as factory, since factory == msg.sender in constructor)
    await biz.connect(deployer).recordPurchase("LOT-001", 50000, "USDC");
    expect(await biz.totalPurchases()).to.equal(50000);

    // Record sale
    await biz.connect(deployer).recordSale("LOT-001", 55000, "USDC");
    expect(await biz.totalSales()).to.equal(55000);

    // Check PnL
    const [revenue, costs] = await biz.getPnL();
    expect(revenue).to.equal(55000);
    expect(costs).to.equal(50000);
  });

  it("should dissolve correctly", async function () {
    const charterHash = ethers.keccak256(ethers.toUtf8Bytes("dissolve-test"));
    await factory.deployBusiness(
      investor.address, charterHash, 1, "gpu_spot", "RTX_4090",
      5000000000n, 500n, 604800n, 172800n
    );

    const businesses = await factory.getInvestorBusinesses(investor.address);
    const BusinessEntity = await ethers.getContractFactory("BusinessEntity");
    const biz = BusinessEntity.attach(businesses[0]);

    await biz.connect(deployer).dissolve();
    expect(await biz.dissolved()).to.be.true;

    // Should not allow further trades
    await expect(
      biz.connect(deployer).recordPurchase("LOT-X", 100, "USDC")
    ).to.be.revertedWith("Business dissolved");
  });
});
