import { Base } from "./base";
import { const_data, const_value } from "./helpers";
import { Token, Tokeniser } from "../tokeniser";
import { Writer } from "../writer";

export class Default extends Base {
  /** Tokens representing the default value. */
  expression!: Token[];

  /**
   * Factory function for creating a Default instance.
   * @param tokeniser - Tokeniser instance.
   */
  static parse(tokeniser: Tokeniser) {
    const assign = tokeniser.consume("=");
    if (!assign) {
      return null;
    }
    const def: Token =
      const_value(tokeniser) ||
      tokeniser.consumeKind("string") ||
      tokeniser.consume("null", "[", "{") ||
      tokeniser.error("No value for default");
    const expression = [def];
    if (def.value === "[") {
      const close =
        tokeniser.consume("]") ||
        tokeniser.error("Default sequence value must be empty");
      expression.push(close);
    } else if (def.value === "{") {
      const close =
        tokeniser.consume("}") ||
        tokeniser.error("Default dictionary value must be empty");
      expression.push(close);
    }
    return new Default({
      source: tokeniser.source,
      tokens: { assign },
      expression,
    });
  }

  /**
   * @param source - All tokens for the current input.
   * @param tokens - Additional tokens.
   * @param expression - Tokens representing the default value.
   */
  constructor({
    source,
    tokens,
    expression,
  }: {
    source: Token[];
    tokens: Record<string, Token | undefined>;
    expression: Token[];
  }) {
    super({ source, tokens });
    // ToDo: This is a bug?  Expression is Token[]
    //   expression.parent = this;
    Object.defineProperty(this, "expression", { value: expression });
  }

  /** The value type. */
  get type() {
    return const_data(this.expression[0]).type;
  }

  /** The default value. */
  get value() {
    return const_data(this.expression[0]).value;
  }

  /** Flag indicating if the value is negative. */
  get negative() {
    return const_data(this.expression[0]).negative;
  }

  /**
   * Convert the object to WebIDL.
   * @param w - Writer instance.
   */
  write(w: Writer) {
    return w.ts.wrap([
      w.token(this.tokens.assign),
      ...this.expression.map((t) => w.token(t)),
    ]);
  }
}
