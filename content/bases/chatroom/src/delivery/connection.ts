// Wire frame pushed to a client connection. `seq` is per-connection and
// strictly increasing so clients can detect gaps.

export interface Frame {
  seq: number;
  type: string;
  payload: unknown;
  /** Ephemeral frames (typing, presence) carry no durable state. */
  ephemeral: boolean;
}

/**
 * A client socket. send() resolves once the frame has been written to the
 * socket and rejects if the write fails. Implementations must tolerate
 * close() being called more than once.
 */
export interface Connection {
  readonly id: string;
  readonly userId: string;
  readonly closed: boolean;
  send(frame: Frame): Promise<void>;
  close(reason: string): void;
}
