import { Base } from "./base";
import {
  type_with_extended_attributes,
  autoParenter,
  argument_list,
} from "./helpers";
import { Token, Tokeniser } from "../tokeniser";
import { Writer } from "../writer";
import { Definitions } from "../validator";
import { WebIDLErrorData } from "../error";
import { Type } from "./type";
import { Argument } from "./argument";
import { ExtendedAttributes } from "./extended-attributes";

export class IterableLike extends Base {
  /** An array of arguments for the iterable declaration. */
  arguments!: Argument[];
  /** An IDL Type for the iterable-like. */
  idlType!: Type[];
  /** Recorded tokens. */
  tokens!: {
    argsClose?: Token;
    argsOpen?: Token;
    async?: Token;
    base: Token;
    close: Token;
    open: Token;
    readonly?: Token;
    termination: Token;
  };

  /**
   * Factory function for creating an Iterable instance.
   * @param tokeniser - Tokeniser instance.
   */
  static parse(tokeniser: Tokeniser) {
    const start_position = tokeniser.position;
    const ret = autoParenter(
      new IterableLike({ source: tokeniser.source, tokens: {} }),
    )!;
    const { tokens } = ret;
    tokens.readonly = tokeniser.consume("readonly");
    if (!tokens.readonly) {
      tokens.async = tokeniser.consume("async");
    }
    const base = tokens.readonly
      ? tokeniser.consume("maplike", "setlike")
      : tokens.async
        ? tokeniser.consume("iterable")
        : tokeniser.consume("iterable", "maplike", "setlike");
    if (!base) {
      tokeniser.unconsume(start_position);
      return;
    }
    tokens.base = base;

    const { type } = ret;
    const secondTypeRequired = type === "maplike";
    const secondTypeAllowed = secondTypeRequired || type === "iterable";
    const argumentAllowed = ret.async && type === "iterable";

    tokens.open =
      tokeniser.consume("<") ||
      tokeniser.error(`Missing less-than sign \`<\` in ${type} declaration`);
    const first =
      type_with_extended_attributes(tokeniser) ||
      tokeniser.error(`Missing a type argument in ${type} declaration`);
    ret.idlType = [first];
    ret.arguments = [];

    if (secondTypeAllowed) {
      first.tokens.separator = tokeniser.consume(",");
      if (first.tokens.separator) {
        const idlType = type_with_extended_attributes(tokeniser);
        if (!idlType) {
          tokeniser.error(
            `Failed to parse first type argument in ${type} declaration`,
          );
        }
        ret.idlType.push();
      } else if (secondTypeRequired) {
        tokeniser.error(`Missing second type argument in ${type} declaration`);
      }
    }

    tokens.close =
      tokeniser.consume(">") ||
      tokeniser.error(`Missing greater-than sign \`>\` in ${type} declaration`);

    if (tokeniser.probe("(")) {
      if (argumentAllowed) {
        tokens.argsOpen = tokeniser.consume("(");
        ret.arguments.push(...argument_list(tokeniser));
        tokens.argsClose =
          tokeniser.consume(")") ||
          tokeniser.error("Unterminated async iterable argument list");
      } else {
        tokeniser.error(`Arguments are only allowed for \`async iterable\``);
      }
    }

    tokens.termination =
      tokeniser.consume(";") ||
      tokeniser.error(`Missing semicolon after ${type} declaration`);

    return ret.this;
  }

  /** Object type. */
  get type() {
    return this.tokens.base.value;
  }

  /** True if it's a read-only attribute. */
  get readonly() {
    return !!this.tokens.readonly;
  }

  /** Whether the iterable is declared as async. */
  get async() {
    return !!this.tokens.async;
  }

  /**
   * Validate the object.
   * @param defs - All parsed object definitions.
   */
  *validate(defs: Definitions): Generator<WebIDLErrorData> {
    for (const type of this.idlType) {
      yield* type.validate(defs);
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
    return w.ts.definition(
      w.ts.wrap([
        this.extAttrs ? this.extAttrs.write(w) : "",
        w.token(this.tokens.readonly),
        w.token(this.tokens.async),
        w.token(this.tokens.base, w.ts.generic),
        w.token(this.tokens.open),
        w.ts.wrap(this.idlType.map((t) => t.write(w))),
        w.token(this.tokens.close),
        w.token(this.tokens.argsOpen),
        w.ts.wrap(this.arguments.map((arg) => arg.write(w))),
        w.token(this.tokens.argsClose),
        w.token(this.tokens.termination),
      ]),
      { data: this, parent: this.parent },
    );
  }
}
