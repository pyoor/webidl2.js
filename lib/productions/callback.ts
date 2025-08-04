import { Base } from "./base";
import { return_type, argument_list, unescape, autoParenter } from "./helpers";
import { Token, Tokeniser } from "../tokeniser";
import { Writer } from "../writer";
import { Definitions } from "../validator";
import { Argument } from "./argument";
import { WebIDLErrorData } from "../error";
import { Type } from "./type";

export class CallbackFunction extends Base {
  /** Object type. */
  readonly type = "callback";

  /** A list of arguments, as in function parameters. */
  arguments!: Argument[];
  /** An IDL Type for the callback function. */
  idlType!: Type;
  /** Recorded tokens. */
  tokens!: {
    arguments: Token;
    assign: Token;
    base: Token;
    close: Token;
    open: Token;
    name: Token;
    termination: Token;
  };

  /**
   * Factory function for creating a CallbackFunction instance.
   * @param tokeniser - Tokeniser instance.
   * @param base - Base token.
   */
  static parse(tokeniser: Tokeniser, base: Token) {
    const tokens: Record<string, Token | undefined> = { base };
    const ret = autoParenter(
      new CallbackFunction({ source: tokeniser.source, tokens }),
    )!;
    tokens.name =
      tokeniser.consumeKind("identifier") ||
      tokeniser.error("Callback lacks a name");
    tokeniser.current = ret.this;
    tokens.assign =
      tokeniser.consume("=") || tokeniser.error("Callback lacks an assignment");
    ret.idlType =
      return_type(tokeniser) || tokeniser.error("Callback lacks a return type");
    tokens.open =
      tokeniser.consume("(") ||
      tokeniser.error("Callback lacks parentheses for arguments");
    ret.arguments = argument_list(tokeniser);
    tokens.close =
      tokeniser.consume(")") || tokeniser.error("Unterminated callback");
    tokens.termination =
      tokeniser.consume(";") ||
      tokeniser.error("Unterminated callback, expected `;`");
    return ret.this;
  }

  /** The callback function's name. */
  get name() {
    return unescape(this.tokens.name.value);
  }

  /**
   * Validate the object.
   * @param defs - All parsed object definitions.
   */
  *validate(defs: Definitions): Generator<WebIDLErrorData> {
    if (this.extAttrs) {
      yield* this.extAttrs.validate(defs);
    }

    yield* this.idlType.validate(defs);
  }

  /**
   * Convert the object to WebIDL.
   * @param w - Writer instance.
   */
  write(w: Writer) {
    return w.ts.definition(
      w.ts.wrap([
        this.extAttrs ? this.extAttrs.write(w) : "",
        w.token(this.tokens.base),
        w.name_token(this.tokens.name, { data: this }),
        w.token(this.tokens.assign),
        w.ts.type(this.idlType.write(w)),
        w.token(this.tokens.open),
        ...this.arguments.map((arg) => arg.write(w)),
        w.token(this.tokens.close),
        w.token(this.tokens.termination),
      ]),
      { data: this },
    );
  }
}
