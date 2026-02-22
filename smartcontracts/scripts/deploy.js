const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying contracts with:", deployer.address);
  console.log("Balance:", (await hre.ethers.provider.getBalance(deployer.address)).toString());

  // 1. Deploy MockUSDC
  console.log("\n--- Deploying MockUSDC ---");
  const MockUSDC = await hre.ethers.getContractFactory("MockUSDC");
  const usdc = await MockUSDC.deploy();
  await usdc.waitForDeployment();
  const usdcAddress = await usdc.getAddress();
  console.log("MockUSDC deployed to:", usdcAddress);

  // Mint 100k mUSDC to deployer
  await usdc.mint(deployer.address, 100_000n * 10n ** 6n);
  console.log("Minted 100,000 mUSDC to deployer");

  // 2. Deploy AutoCorpFactory
  console.log("\n--- Deploying AutoCorpFactory ---");
  const Factory = await hre.ethers.getContractFactory("AutoCorpFactory");
  const factory = await Factory.deploy();
  await factory.waitForDeployment();
  const factoryAddress = await factory.getAddress();
  console.log("AutoCorpFactory deployed to:", factoryAddress);

  // 3. Save deployment info
  const deployment = {
    network: hre.network.name,
    chainId: (await hre.ethers.provider.getNetwork()).chainId.toString(),
    deployer: deployer.address,
    contracts: {
      MockUSDC: usdcAddress,
      AutoCorpFactory: factoryAddress,
    },
    timestamp: new Date().toISOString(),
  };

  const outPath = path.join(__dirname, "../deployment.json");
  fs.writeFileSync(outPath, JSON.stringify(deployment, null, 2));
  console.log("\nDeployment info saved to:", outPath);

  // 4. Print .env values
  console.log("\n--- Add to .env ---");
  console.log(`USDC_CONTRACT_ADDRESS=${usdcAddress}`);
  console.log(`FACTORY_CONTRACT_ADDRESS=${factoryAddress}`);
  console.log(`# BUSINESS_CONTRACT_ADDRESS will be set per-business after deployBusiness()`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
