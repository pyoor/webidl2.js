import { Token } from "../tokeniser";

export abstract class ArrayBase<T> extends Array<T> {
  protected readonly source!: Token[];
  /** Recorded tokens. */
  protected tokens!: Record<string, Token | undefined>;
  /** The container of this type. */
  protected parent!: unknown | null;

  constructor({
    source,
    tokens,
  }: {
    source: Token[];
    tokens: Record<string, Token | undefined>;
  }) {
    super();
    Object.defineProperties(this, {
      source: { value: source },
      tokens: { value: tokens },
      parent: { value: null, writable: true },
    });
  }
}
