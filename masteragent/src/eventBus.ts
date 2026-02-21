type StreamName = "reasoning" | "a2a" | "ledger" | "pnl";

type Listener = (payload: unknown) => void;

class EventBus {
  private listeners: Record<StreamName, Set<Listener>> = {
    reasoning: new Set(),
    a2a: new Set(),
    ledger: new Set(),
    pnl: new Set(),
  };

  publish(stream: StreamName, payload: unknown): void {
    for (const listener of this.listeners[stream]) {
      listener(payload);
    }
  }

  subscribe(stream: StreamName, listener: Listener): () => void {
    this.listeners[stream].add(listener);
    return () => this.listeners[stream].delete(listener);
  }
}

export const eventBus = new EventBus();
export type { StreamName };
