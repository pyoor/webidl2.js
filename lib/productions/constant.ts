import { Base } from "./base";
import { Type } from "./type";
import {
  const_data,
  const_value,
  primitive_type,
  autoParenter,
  unescape,
} from "./helpers";
import { Token, Tokeniser } from "../tokeniser";
import { Writer } from "../writer";

export class Constant extends Base {
  /** Object type. */
  readonly type = "const";

  /** An IDL Type for the constant. */
  idlType!: Type;
  /** Recorded tokens. */
  tokens!: {
    assign: Token;
    base: Token;
    name: Token;
    value: Token;
    termination: Token;
  };

  /**
   * Factory function for creating a Constant instance.
   * @param tokeniser - Tokeniser instance.
   */
  static parse(tokeniser: Tokeniser) {
    const tokens: Record<string, Token | undefined> = {};
    tokens.base = tokeniser.consume("const");
    if (!tokens.base) {
      return;
    }
    let idlType = primitive_type(tokeniser);
    if (!idlType) {
      const base =
        tokeniser.consumeKind("identifier") ||
        tokeniser.error("Const lacks a type");
      idlType = new Type({ source: tokeniser.source, tokens: { base } });
    }
    if (tokeniser.probe("?")) {
      tokeniser.error("Unexpected nullable constant type");
    }
    idlType.type = "const-type";
    tokens.name =
      tokeniser.consumeKind("identifier") ||
      tokeniser.error("Const lacks a name");
    tokens.assign =
      tokeniser.consume("=") || tokeniser.error("Const lacks value assignment");
    tokens.value =
      const_value(tokeniser) || tokeniser.error("Const lacks a value");
    tokens.termination =
      tokeniser.consume(";") ||
      tokeniser.error("Unterminated const, expected `;`");
    const ret = autoParenter(
      new Constant({ source: tokeniser.source, tokens }),
    )!;
    ret.idlType = idlType;
    return ret;
  }

  /** The constant's name. */
  get name() {
    return unescape(this.tokens.name.value);
  }

  /** The constant's value */
  get value() {
    return const_data(this.tokens.value);
  }

  /**
   * Convert the object to WebIDL.
   * @param w - Writer instance.
   */
  write(w: Writer) {
    const { parent } = this;
    return w.ts.definition(
      w.ts.wrap([
        this.extAttrs ? this.extAttrs.write(w) : "",
        w.token(this.tokens.base),
        w.ts.type(this.idlType.write(w)),
        w.name_token(this.tokens.name, { data: this, parent }),
        w.token(this.tokens.assign),
        w.token(this.tokens.value),
        w.token(this.tokens.termination),
      ]),
      { data: this, parent },
    );
  }
}
