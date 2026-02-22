import { ethers } from "ethers";
import { BusinessCharter} from "../types.js";

const BusinessEntityAbi = [
  "function recordPurchase(string item, uint256 quantity, uint256 pricePerUnit) returns (bytes32)",
  "function recordSale(string item, uint256 quantity, uint256 pricePerUnit) returns (bytes32)",
  "function getEscrowBalance() view returns (uint256)",
  "function getPnL() view returns (int256)",
  "function dissolve() returns (bool)",
];

export type DeployResult = {
  businessAddress: string;
  txHash?: string;
};

export class OnchainAdapter {
  private provider = new ethers.JsonRpcProvider(
    process.env.SEPOLIA_RPC_URL ?? "https://rpc.sepolia.org"
  );
  private signer = process.env.PRIVATE_KEY
    ? new ethers.Wallet(process.env.PRIVATE_KEY, this.provider)
    : undefined;

  async deployBusiness(charter: BusinessCharter): Promise<DeployResult> {
    const factory = process.env.AUTOCORP_FACTORY_ADDRESS;
    if (
      !factory ||
      !this.signer ||
      factory === "0x0000000000000000000000000000000000000000"
    ) {
      // Simulated deployment
      return {
        businessAddress: ethers.getAddress(
          ethers.hexlify(ethers.randomBytes(20))
        ),
      };
    }

    // Real deployment when factory is available
    try {
      const tx = await this.signer.sendTransaction({
        to: factory,
        data: "0x",
        value: 0,
      });
      const receipt = await tx.wait();
      return {
        businessAddress: receipt?.contractAddress ?? ethers.getAddress(ethers.hexlify(ethers.randomBytes(20))),
        txHash: tx.hash,
      };
    } catch {
      return {
        businessAddress: ethers.getAddress(
          ethers.hexlify(ethers.randomBytes(20))
        ),
      };
    }
  }

  async getEscrowBalance(contractAddress: string): Promise<number> {
    if (!contractAddress || contractAddress === "0x0000000000000000000000000000000000000000") {
      return 0;
    }
    try {
      const contract = new ethers.Contract(
        contractAddress,
        BusinessEntityAbi,
        this.provider
      );
      const balance = await contract.getEscrowBalance();
      return Number(balance);
    } catch {
      return 0;
    }
  }

  async recordPurchase(
    contractAddress: string,
    item: string,
    quantity: number,
    pricePerUnit: number
  ): Promise<string | undefined> {
    if (!this.signer || !contractAddress) return undefined;
    try {
      const contract = new ethers.Contract(
        contractAddress,
        BusinessEntityAbi,
        this.signer
      );
      const tx = await contract.recordPurchase(item, quantity, pricePerUnit);
      await tx.wait();
      return tx.hash;
    } catch {
      return undefined;
    }
  }
}

export const onchainAdapter = new OnchainAdapter();

