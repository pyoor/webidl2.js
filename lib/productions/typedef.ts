import { Base } from "./base";
import {
  type_with_extended_attributes,
  unescape,
  autoParenter,
} from "./helpers";
import { Token, Tokeniser } from "../tokeniser";
import { Writer } from "../writer";
import { Definitions } from "../validator";
import { ExtendedAttributes } from "./extended-attributes";
import { WebIDLErrorData } from "../error";
import { Type } from "./type";

export class Typedef extends Base {
  /** Object type. */
  readonly type = "typedef";

  /** A list of extended attributes. */
  extAttrs!: ExtendedAttributes;
  /** An IDL Type for the typedef. */
  idlType!: Type;
  /** Recorded tokens. */
  tokens!: {
    base: Token;
    name: Token;
    termination: Token;
  };

  /**
   * Create a new Typedef instance.
   * @param tokeniser - Tokeniser instance.
   */
  static parse(tokeniser: Tokeniser) {
    const tokens: Record<string, Token | undefined> = {};
    const ret = autoParenter(
      new Typedef({ source: tokeniser.source, tokens }),
    )!;
    tokens.base = tokeniser.consume("typedef");
    if (!tokens.base) {
      return;
    }
    ret.idlType =
      type_with_extended_attributes(tokeniser, "typedef-type") ||
      tokeniser.error("Typedef lacks a type");
    tokens.name =
      tokeniser.consumeKind("identifier") ||
      tokeniser.error("Typedef lacks a name");
    tokeniser.current = ret.this;
    tokens.termination =
      tokeniser.consume(";") ||
      tokeniser.error("Unterminated typedef, expected `;`");
    return ret.this;
  }

  /** The typedef's name. */
  get name() {
    return unescape(this.tokens.name.value);
  }

  /**
   * Validate the object.
   * @param defs - All parsed object definitions.
   */
  *validate(defs: Definitions): Generator<WebIDLErrorData> {
    yield* this.idlType.validate(defs);
  }

  /**
   * Convert the object to WebIDL.
   * @param w - Writer instance.
   */
  write(w: Writer) {
    return w.ts.definition(
      w.ts.wrap([
        this.extAttrs.write(w),
        w.token(this.tokens.base),
        w.ts.type(this.idlType.write(w)),
        w.name_token(this.tokens.name, { data: this }),
        w.token(this.tokens.termination),
      ]),
      { data: this },
    );
  }
}
