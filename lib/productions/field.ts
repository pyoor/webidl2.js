import { Base } from "./base";
import {
  unescape,
  type_with_extended_attributes,
  autoParenter,
} from "./helpers";
import { ExtendedAttributes } from "./extended-attributes";
import { Default } from "./default";
import { Token, Tokeniser } from "../tokeniser";
import { Writer } from "../writer";
import { Definitions } from "../validator";
import { WebIDLErrorData } from "../error";
import { Type } from "./type";

export class Field extends Base {
  /** Object type. */
  readonly type = "field";

  /** A default value, absent if there is none. */
  default!: Default | null;
  /** An IDL Type for the field. */
  idlType!: Type;
  /** Recorded tokens. */
  tokens!: {
    name: Token;
    required: Token;
    termination: Token;
  };

  /**
   * Factory function for creating a Field instance.
   * @param tokeniser - Tokeniser instance.
   */
  static parse(tokeniser: Tokeniser) {
    const tokens: Record<string, Token | undefined> = {};
    const ret = autoParenter(
      new Field({ source: tokeniser.source, tokens }),
    )!;
    ret.extAttrs = ExtendedAttributes.parse(tokeniser);
    tokens.required = tokeniser.consume("required");
    ret.idlType =
      type_with_extended_attributes(tokeniser, "dictionary-type") ||
      tokeniser.error("Dictionary member lacks a type");
    tokens.name =
      tokeniser.consumeKind("identifier") ||
      tokeniser.error("Dictionary member lacks a name");
    ret.default = Default.parse(tokeniser);
    if (tokens.required && ret.default)
      tokeniser.error("Required member must not have a default");
    tokens.termination =
      tokeniser.consume(";") ||
      tokeniser.error("Unterminated dictionary member, expected `;`");
    return ret.this;
  }

  /** The name of the field. */
  get name() {
    return unescape(this.tokens.name.value);
  }

  /** Boolean indicating whether this is a required field. */
  get required() {
    return !!this.tokens.required;
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
    const { parent } = this;
    return w.ts.definition(
      w.ts.wrap([
        this.extAttrs ? this.extAttrs.write(w) : "",
        w.token(this.tokens.required),
        w.ts.type(this.idlType.write(w)),
        w.name_token(this.tokens.name, { data: this, parent }),
        this.default ? this.default.write(w) : "",
        w.token(this.tokens.termination),
      ]),
      { data: this, parent },
    );
  }
}
