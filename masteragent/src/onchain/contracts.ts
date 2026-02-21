import { ethers } from "ethers";
import { BusinessCharter } from "../types.js";

const FactoryAbi = [
  "function deployBusiness(tuple(string businessName,string commodity,string sourceMandi,string destinationMarket,uint256 budgetInr,uint256 deadlineDays,uint256 minMarginPct,uint256 thresholdBuyPricePerKgInr,uint256 maxPerPurchaseInr,uint256 maxHoldingHours,uint256 pollIntervalSec,(uint256 procurementFailLimit,string onFailAction) escalationPolicy) charter) returns (address)",
];

const AgentRegistryAbi = [
  "function getReputation(string DID) view returns (uint256)",
];

export type DeployResult = {
  businessAddress: string;
  txHash?: string;
};

export class OnchainAdapter {
  private provider = new ethers.JsonRpcProvider(process.env.AMOY_RPC_URL);
  private signer = process.env.PRIVATE_KEY
    ? new ethers.Wallet(process.env.PRIVATE_KEY, this.provider)
    : undefined;

  async deployBusiness(charter: BusinessCharter): Promise<DeployResult> {
    const factory = process.env.AUTOCORP_FACTORY_ADDRESS;
    if (!factory || !this.signer || factory === "0x0000000000000000000000000000000000000000") {
      return {
        businessAddress: ethers.getAddress(
          ethers.hexlify(ethers.randomBytes(20))
        ),
      };
    }

    const contract = new ethers.Contract(factory, FactoryAbi, this.signer);
    const tx = await contract.deployBusiness(charter);
    const receipt = await tx.wait();

    const businessAddress = receipt?.logs?.[0]?.address;
    return {
      businessAddress,
      txHash: tx.hash,
    };
  }

  async getReputation(agentDid: string): Promise<number> {
    const registry = process.env.AGENT_REGISTRY_ADDRESS;
    if (!registry || registry === "0x0000000000000000000000000000000000000000") {
      return 0;
    }

    try {
      const contract = new ethers.Contract(registry, AgentRegistryAbi, this.provider);
      const score = await contract.getReputation(agentDid);
      return Number(score);
    } catch {
      return 0;
    }
  }
}

export const onchainAdapter = new OnchainAdapter();
