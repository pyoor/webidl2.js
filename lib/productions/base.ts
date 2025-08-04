import { Token } from "../tokeniser";
import { ExtendedAttributes } from "./extended-attributes";
import { Writer } from "../writer";
import { Definitions } from "../validator";
import { WebIDLErrorData } from "../error";

export abstract class Base {
  /** A list of extended attributes. */
  extAttrs?: ExtendedAttributes;
  /** The container of this type. */
  parent!: Base | null;
  /** All tokens for the current input. */
  source!: Token[];
  /** Recorded tokens. */
  tokens!: Record<string, Token | undefined>;
  /** A direct reference to the object for escaping from the proxy. */
  this!: this;

  constructor({
    source,
    tokens,
  }: {
    source: Token[];
    tokens: Record<string, Token | undefined>;
  }) {
    Object.defineProperties(this, {
      source: { value: source },
      tokens: { value: tokens, writable: true },
      parent: { value: null, writable: true },
      this: { value: this }, // useful when escaping from proxy
    });
  }

  toJSON(): {
    type: unknown;
    name: unknown;
    inheritance: unknown;
    [key: string]: unknown;
  } {
    const json = { type: undefined, name: undefined, inheritance: undefined };
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    let proto = this;
    while (proto !== Object.prototype) {
      const descMap = Object.getOwnPropertyDescriptors(proto);
      for (const [key, value] of Object.entries(descMap)) {
        if (value.enumerable || value.get) {
          // @ts-expect-error - allow indexing here
          json[key] = this[key];
        }
      }
      proto = Object.getPrototypeOf(proto);
    }
    return json;
  }

  /**
   * No-op validation method to ensure all objects have this method.
   * @param _defs - All parsed object definitions.
   */
  validate(_defs: Definitions): Generator<WebIDLErrorData> {
    return (function* () {})();
  }

  /**
   * Convert the object to WebIDL.
   * @param w - Writer instance.
   */
  abstract write(w: Writer): string;
}
