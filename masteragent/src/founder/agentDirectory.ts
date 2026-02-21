type AgentCard = {
  did: string;
  wallet: string;
  capabilities: string[];
  endpoint?: string;
};

const defaultCards: AgentCard[] = [
  { did: "did:autocorp:founder", wallet: "0xFounder", capabilities: ["business_orchestration"] },
  { did: "did:autocorp:pricemon", wallet: "0xPrice", capabilities: ["price_monitoring"] },
  { did: "did:autocorp:proc", wallet: "0xProc", capabilities: ["procurement"] },
  { did: "did:autocorp:logi", wallet: "0xLogi", capabilities: ["logistics"] },
  { did: "did:autocorp:sales", wallet: "0xSales", capabilities: ["sales"] },
  { did: "did:autocorp:acct", wallet: "0xAcct", capabilities: ["accounting"] },
];

class AgentDirectory {
  private cards: AgentCard[] = [];

  constructor() {
    this.cards = this.loadFromEnv() ?? defaultCards;
  }

  private loadFromEnv(): AgentCard[] | undefined {
    const raw = process.env.AGENT_CARDS_JSON;
    if (!raw) return undefined;
    try {
      const parsed = JSON.parse(raw) as AgentCard[];
      if (!Array.isArray(parsed)) return undefined;
      return parsed.filter((item) => item.did && item.wallet && Array.isArray(item.capabilities));
    } catch {
      return undefined;
    }
  }

  register(card: AgentCard): AgentCard {
    const existingIndex = this.cards.findIndex((item) => item.did === card.did);
    if (existingIndex >= 0) {
      this.cards[existingIndex] = card;
      return card;
    }
    this.cards.push(card);
    return card;
  }

  list(): AgentCard[] {
    return [...this.cards];
  }

  findByCapability(capability: string): AgentCard[] {
    return this.cards.filter((card) => card.capabilities.includes(capability));
  }
}

export const agentDirectory = new AgentDirectory();
export type { AgentCard };
