const hre = require("hardhat");
const fs  = require("fs");

async function main() {
  const dep     = JSON.parse(fs.readFileSync("deployment.json"));
  const [owner] = await hre.ethers.getSigners();
  const usdc    = await hre.ethers.getContractAt("MockUSDC", dep.MockUSDC);

  // Mint 10,000 USDC to business entity for demo
  await usdc.mint(dep.DemoBusinessEntity,
    hre.ethers.parseUnits("10000", 6));
  console.log("Funded DemoBusinessEntity with 10,000 USDC");
  console.log("Address:", dep.DemoBusinessEntity);
}
main().catch(e => { console.error(e); process.exit(1); });
