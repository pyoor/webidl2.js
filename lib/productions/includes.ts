import { Base } from "./base";
import { unescape } from "./helpers";
import { Token, Tokeniser } from "../tokeniser";
import { Writer } from "../writer";

export class Includes extends Base {
  /** Object type. */
  readonly type = "includes";

  /** Recorded tokens. */
  tokens!: Record<string, Token | undefined> & {
    mixin: Token;
    target: Token;
    termination: Token;
  };

  /**
   * Factory function for creating an Includes instance.
   * @param tokeniser - Tokeniser instance.
   */
  static parse(tokeniser: Tokeniser) {
    const target = tokeniser.consumeKind("identifier");
    if (!target) {
      return;
    }
    const tokens: Record<string, Token | undefined> = { target };
    tokens.includes = tokeniser.consume("includes");
    if (!tokens.includes) {
      tokeniser.unconsume(target.index);
      return;
    }
    tokens.mixin =
      tokeniser.consumeKind("identifier") ||
      tokeniser.error("Incomplete includes statement");
    tokens.termination =
      tokeniser.consume(";") ||
      tokeniser.error("No terminating ; for includes statement");
    return new Includes({ source: tokeniser.source, tokens });
  }

  /** The interface that includes an interface mixin. */
  get target() {
    return unescape(this.tokens.target.value);
  }

  /** The interface mixin that is being included by the target. */
  get includes() {
    return unescape(this.tokens.mixin.value);
  }

  /**
   * Convert the object to WebIDL.
   * @param w - Writer instance.
   */
  write(w: Writer) {
    return w.ts.definition(
      w.ts.wrap([
        this.extAttrs ? this.extAttrs.write(w) : "",
        w.reference_token(this.tokens.target, this),
        w.token(this.tokens.includes),
        w.reference_token(this.tokens.mixin, this),
        w.token(this.tokens.termination),
      ]),
      { data: this },
    );
  }
}
