export type Connection = 'disconnected' | 'connecting' | 'connected';

export interface HelmetLink {
  readonly name: string;
  connect(nowMs: number): void;
  disconnect(intentional?: boolean): void;
  write(command: Uint8Array): Promise<void>;
  onPacket(listener: (bytes: Uint8Array) => void): () => void;
  onConnection(listener: (connection: Connection, intentional: boolean) => void): () => void;
}

export class CommandQueue {
  private pending: Promise<void> = Promise.resolve();
  private generation = 0;

  constructor(private readonly link: HelmetLink) {}

  send(command: Uint8Array): Promise<void> {
    const generation = this.generation;
    const result = this.pending.then(() => {
      if (generation !== this.generation) return;
      return this.link.write(command);
    });
    // Keep the queue usable after failure; the returned promise still reports it to the caller.
    this.pending = result.catch(() => undefined);
    return result;
  }

  clear() {
    this.generation += 1;
  }
}
