const fs = require('fs');
const { ethers } = require('hardhat');

async function main() {
    console.log("Starting AutoCorp V2 Deployment on Sepolia...");

    const [deployer] = await ethers.getSigners();
    console.log(`Deploying contracts with account: ${deployer.address}`);

    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    const mockUSDC = await MockUSDC.deploy();
    await mockUSDC.waitForDeployment();
    const usdcAddress = await mockUSDC.getAddress();
    console.log(`MockUSDC deployed to: ${usdcAddress}`);

    await mockUSDC.mint(deployer.address, ethers.parseUnits("100000", 6));
    console.log("Minted 100,000 MockUSDC to deployer.");

    const AutoCorpFactory = await ethers.getContractFactory("AutoCorpFactory");
    const autoCorpFactory = await AutoCorpFactory.deploy();
    await autoCorpFactory.waitForDeployment();
    const factoryAddress = await autoCorpFactory.getAddress();
    console.log(`AutoCorpFactory deployed to: ${factoryAddress}`);

    const budget = ethers.parseUnits("1000", 6);
    const roiThresholdBP = 1000;
    const category = 0;
    const deadline = Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60);

    console.log("Deploying demo BusinessEntity...");
    const tx = await autoCorpFactory.deployBusiness(
        deployer.address,
        usdcAddress,
        category,
        budget,
        roiThresholdBP,
        deadline
    );

    const receipt = await tx.wait();
    const event = receipt.logs.find(e => {
        try {
            return autoCorpFactory.interface.parseLog(e)?.name === 'BusinessDeployed';
        } catch (err) {
            return false;
        }
    });

    const parsedEvent = autoCorpFactory.interface.parseLog(event);
    const businessAddress = parsedEvent.args[0];
    console.log(`Demo BusinessEntity deployed to: ${businessAddress}`);

    const deploymentData = {
        mockUSDC: usdcAddress,
        autoCorpFactory: factoryAddress,
        demoBusinessEntity: businessAddress,
        deployer: deployer.address,
        network: "sepolia",
        timestamp: new Date().toISOString()
    };

    fs.writeFileSync('deployment.json', JSON.stringify(deploymentData, null, 2));
    console.log("Saved deployment data to deployment.json");

    console.log("\nDeployment Successful!");
    console.log("------------------------------------------");
    console.log(`MockUSDC Sepolia Etherscan: https://sepolia.etherscan.io/address/${usdcAddress}`);
    console.log(`AutoCorpFactory Sepolia Etherscan: https://sepolia.etherscan.io/address/${factoryAddress}`);
    console.log(`Demo BusinessEntity Sepolia Etherscan: https://sepolia.etherscan.io/address/${businessAddress}`);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
