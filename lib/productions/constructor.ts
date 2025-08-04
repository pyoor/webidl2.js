import { Token, Tokeniser } from "../tokeniser";
import { Base } from "./base";
import { argument_list, autoParenter } from "./helpers";
import { Writer } from "../writer";
import { Argument } from "./argument";
import { Definitions } from "../validator";
import { WebIDLErrorData } from "../error";

export class Constructor extends Base {
  /** Object type. */
  readonly type = "constructor";

  /** An array of arguments for the constructor operation. */
  arguments!: Argument[];
  /** Recorded tokens. */
  tokens!: {
    base: Token;
    close: Token;
    open: Token;
    termination: Token;
  };

  /**
   * Factory function for creating a Constructor instance.
   * @param tokeniser - Tokeniser instance.
   */
  static parse(tokeniser: Tokeniser) {
    const base = tokeniser.consume("constructor");
    if (!base) {
      return;
    }
    const tokens: Record<string, Token | undefined> = { base };
    tokens.open =
      tokeniser.consume("(") ||
      tokeniser.error("No argument list in constructor");
    const args = argument_list(tokeniser);
    tokens.close =
      tokeniser.consume(")") || tokeniser.error("Unterminated constructor");
    tokens.termination =
      tokeniser.consume(";") ||
      tokeniser.error("No semicolon after constructor");
    const ret = autoParenter(
      new Constructor({ source: tokeniser.source, tokens }),
    )!;
    ret.arguments = args;
    return ret;
  }

  /**
   * Validate the object.
   * @param defs - All parsed object definitions.
   */
  *validate(defs: Definitions): Generator<WebIDLErrorData> {
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
    return w.ts.definition(
      w.ts.wrap([
        this.extAttrs ? this.extAttrs.write(w) : "",
        w.token(this.tokens.base, w.ts.nameless, { data: this, parent }),
        w.token(this.tokens.open),
        w.ts.wrap(this.arguments.map((arg) => arg.write(w))),
        w.token(this.tokens.close),
        w.token(this.tokens.termination),
      ]),
      { data: this, parent },
    );
  }
}
