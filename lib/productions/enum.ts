import { list, unescape, autoParenter } from "./helpers";
import { WrappedToken } from "./token";
import { Base } from "./base";
import { Token, Tokeniser } from "../tokeniser";
import { Writer } from "../writer";
import { ExtendedAttributes } from "./extended-attributes";

export class EnumValue extends WrappedToken {
  /** Object type. */
  readonly type = "enum-value";

  /** A list of extended attributes. */
  extAttrs!: ExtendedAttributes;
  /** Recorded tokens. */
  tokens!: {
    name: Token;
    separator: Token;
    value: Token;
  };

  static parse(tokeniser: Tokeniser) {
    const value = tokeniser.consumeKind("string");
    if (value) {
      return new EnumValue({ source: tokeniser.source, tokens: { value } });
    }
  }

  get value() {
    return super.value.slice(1, -1);
  }

  write(w: Writer) {
    const { parent } = this;
    return w.ts.wrap([
      w.ts.trivia(this.tokens.value.trivia),
      w.ts.definition(
        w.ts.wrap(['"', w.ts.name(this.value, { data: this, parent }), '"']),
        { data: this, parent },
      ),
      w.token(this.tokens.separator),
    ]);
  }
}

export class Enum extends Base {
  /** Object type. */
  readonly type = "enum";

  /** Recorded tokens. */
  tokens!: {
    base: Token;
    close: Token;
    name: Token;
    open: Token;
    termination: Token;
  };
  /** An array of values (strings). */
  values!: EnumValue[];

  static parse(tokeniser: Tokeniser) {
    const tokens: Record<string, Token | undefined> = {};
    tokens.base = tokeniser.consume("enum");
    if (!tokens.base) {
      return;
    }
    tokens.name =
      tokeniser.consumeKind("identifier") ||
      tokeniser.error("No name for enum");
    const ret = autoParenter(new Enum({ source: tokeniser.source, tokens }))!;
    tokeniser.current = ret.this;
    tokens.open = tokeniser.consume("{") || tokeniser.error("Bodyless enum");
    ret.values = list<EnumValue>(tokeniser, {
      parser: EnumValue.parse,
      allowDangler: true,
      listName: "enumeration",
    });
    if (tokeniser.probeKind("string")) {
      tokeniser.error("No comma between enum values");
    }
    tokens.close =
      tokeniser.consume("}") || tokeniser.error("Unexpected value in enum");
    if (!ret.values.length) {
      tokeniser.error("No value in enum");
    }
    tokens.termination =
      tokeniser.consume(";") || tokeniser.error("No semicolon after enum");
    return ret.this;
  }

  get name() {
    return unescape(this.tokens.name.value);
  }

  write(w: Writer) {
    return w.ts.definition(
      w.ts.wrap([
        this.extAttrs ? this.extAttrs.write(w) : "",
        w.token(this.tokens.base),
        w.name_token(this.tokens.name, { data: this }),
        w.token(this.tokens.open),
        w.ts.wrap(this.values.map((v) => v.write(w))),
        w.token(this.tokens.close),
        w.token(this.tokens.termination),
      ]),
      { data: this },
    );
  }
}
