import { Base } from "./base";
import {
  return_type,
  argument_list,
  unescape,
  autoParenter,
} from "./helpers";
import { validationError, WebIDLErrorData } from "../error";
import { Token, Tokeniser } from "../tokeniser";
import { Writer } from "../writer";
import { Definitions } from "../validator";
import { Type } from "./type";
import { Argument } from "./argument";

export class Operation extends Base {
  /** Object type. */
  readonly type = "attribute";

  /** An array of arguments for the operation. */
  arguments!: Argument[];
  /** An IDL Type for the operation. */
  idlType!: Type;
  /** Recorded tokens. */
  tokens!: {
    close: Token;
    name: Token;
    open: Token;
    special: Token;
    termination: Token;
  };

  /**
   * Factory function for creating an Operation instance.
   * @param tokeniser - Tokeniser instance.
   * @param opts - Operation parse options.
   * @param special - Special operation modifier.
   * @param regular - Boolean indicating if it's a regular operation.
   */
  static parse(
    tokeniser: Tokeniser,
    { special, regular }: { special?: Token; regular?: Token } = {},
  ) {
    const tokens: Record<string, Token | undefined> = { special };
    const ret = autoParenter(
      new Operation({ source: tokeniser.source, tokens }),
    )!;
    if (special && special.value === "stringifier") {
      tokens.termination = tokeniser.consume(";");
      if (tokens.termination) {
        ret.arguments = [];
        return ret;
      }
    }
    if (!special && !regular) {
      tokens.special = tokeniser.consume("getter", "setter", "deleter");
    }
    ret.idlType =
      return_type(tokeniser) || tokeniser.error("Missing return type");
    tokens.name =
      tokeniser.consumeKind("identifier") || tokeniser.consume("includes");
    tokens.open =
      tokeniser.consume("(") || tokeniser.error("Invalid operation");
    ret.arguments = argument_list(tokeniser);
    tokens.close =
      tokeniser.consume(")") || tokeniser.error("Unterminated operation");
    tokens.termination =
      tokeniser.consume(";") ||
      tokeniser.error("Unterminated operation, expected `;`");
    return ret.this;
  }

  /** The name of the operation. If a stringifier, may be null. */
  get name() {
    const { name } = this.tokens;
    if (!name) {
      return "";
    }
    return unescape(name.value);
  }

  /** Special modifier if exists */
  get special() {
    if (!this.tokens.special) {
      return "";
    }
    return this.tokens.special.value;
  }

  /**
   * Validate the object.
   * @param defs - All parsed object definitions.
   */
  *validate(defs: Definitions): Generator<WebIDLErrorData> {
    if (this.extAttrs) {
      yield* this.extAttrs.validate(defs);
    }

    if (!this.name && ["", "static"].includes(this.special)) {
      const message = `Regular or static operations must have both a return type and an identifier.`;
      yield validationError(this.tokens.open, this, "incomplete-op", message);
    }
    if (this.idlType) {
      yield* this.idlType.validate(defs);
    }
    for (const argument of this.arguments) {
      yield* argument.validate(defs);
    }
  }

  /**
   * Convert the object to WebIDL.
   * @param w - Writer instance.
   */
  write(w: Writer) {
    const { parent } = this;
    const body = this.idlType
      ? [
          w.ts.type(this.idlType.write(w)),
          w.name_token(this.tokens.name, { data: this, parent }),
          w.token(this.tokens.open),
          w.ts.wrap(this.arguments.map((arg) => arg.write(w))),
          w.token(this.tokens.close),
        ]
      : [];
    return w.ts.definition(
      w.ts.wrap([
        this.extAttrs ? this.extAttrs.write(w) : "",
        this.tokens.name
          ? w.token(this.tokens.special)
          : w.token(this.tokens.special, w.ts.nameless, { data: this, parent }),
        ...body,
        w.token(this.tokens.termination),
      ]),
      { data: this, parent },
    );
  }
}
