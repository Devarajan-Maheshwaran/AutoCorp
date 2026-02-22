const hre = require("hardhat");
const fs  = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer:", deployer.address);
  console.log("Network:", hre.network.name);

  // 1. Deploy MockUSDC
  const USDC = await hre.ethers.getContractFactory("MockUSDC");
  const usdc = await USDC.deploy();
  await usdc.waitForDeployment();
  const usdcAddr = await usdc.getAddress();
  console.log("MockUSDC:", usdcAddr);

  // 2. Mint 100,000 USDC to deployer
  await usdc.mint(deployer.address,
    hre.ethers.parseUnits("100000", 6));
  console.log("Minted 100,000 USDC to deployer");

  // 3. Deploy Factory
  const Factory = await hre.ethers.getContractFactory("AutoCorpFactory");
  const factory= await Factory.deploy(usdcAddr);
  await factory.waitForDeployment();
  const factoryAddr = await factory.getAddress();
  console.log("AutoCorpFactory:", factoryAddr);

  // 4. Deploy a demo BusinessEntity
  const charterHash = hre.ethers.keccak256(
    hre.ethers.toUtf8Bytes("autocorp-demo-v2")
  );
  const tx = await factory.deployBusiness(
    deployer.address,
    charterHash,
    0,                                          // crypto category
    "cross_exchange",
    "ETHUSDT",
    hre.ethers.parseUnits("359", 6),            // ~₹30,000
    1500,                                       // 15% min margin bps
    30 * 24 * 3600,                             // 30 days
    48 * 3600                                   // 48hr max hold
  );
  const receipt  = await tx.wait();
  const iface    = factory.interface;
  let demoAddr   = "";
  for (const log of receipt.logs) {
    try {
      const parsed = iface.parseLog(log);
      if (parsed?.name === "BusinessDeployed") {
        demoAddr = parsed.args.contractAddress;
        break;
      }
    } catch {}
  }
  console.log("Demo BusinessEntity:", demoAddr);

  // 5. Approve factory to spend USDC on behalf of deployer
  await usdc.approve(factoryAddr,
    hre.ethers.parseUnits("100000", 6));

  // 6. Save deployment.json
  const out = {
    network:              hre.network.name,
    chainId:              11155111,
    deployer:             deployer.address,
    MockUSDC:             usdcAddr,
    AutoCorpFactory:      factoryAddr,
    DemoBusinessEntity:   demoAddr,
    deployedAt:           new Date().toISOString()
  };
  fs.writeFileSync(
    path.join(__dirname, "../deployment.json"),
    JSON.stringify(out, null, 2)
  );
  console.log("\n=== DEPLOYMENT COMPLETE ===");
  console.log(JSON.stringify(out, null, 2));
  console.log("\nCopy these to .env:");
  console.log("USDC_CONTRACT_ADDRESS=" + usdcAddr);
  console.log("FACTORY_CONTRACT_ADDRESS=" + factoryAddr);
  console.log("BUSINESS_CONTRACT_ADDRESS=" + demoAddr);
}

main().catch(e => { console.error(e); process.exit(1); });
