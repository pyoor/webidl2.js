import { Base } from "./base";
import { unescape } from "./helpers";
import { Token, Tokeniser } from "../tokeniser";
import { Writer } from "../writer";

export class WrappedToken extends Base {
  /** Recorded tokens. */
  tokens!: {
    separator: Token;
    value: Token;
  };

  static parser(tokeniser: Tokeniser, type: string) {
    return () => {
      const value = tokeniser.consumeKind(type);
      if (value) {
        return new WrappedToken({
          source: tokeniser.source,
          tokens: { value },
        });
      }
    };
  }

  get value() {
    return unescape(this.tokens.value.value);
  }

  write(w: Writer) {
    return w.ts.wrap([
      w.token(this.tokens.value),
      w.token(this.tokens.separator),
    ]);
  }
}

export class Eof extends WrappedToken {
  static parse(tokeniser: Tokeniser) {
    const value = tokeniser.consumeKind("eof");
    if (value) {
      return new Eof({ source: tokeniser.source, tokens: { value } });
    }
  }

  get type() {
    return "eof";
  }
}
