import { validationError, WebIDLErrorData } from "../error";
import {
  idlTypeIncludesDictionary,
  idlTypeIncludesEnforceRange,
} from "../validators/helpers";
import { Base } from "./base";
import {
  type_with_extended_attributes,
  unescape,
  autoParenter,
} from "./helpers";
import { Token, Tokeniser } from "../tokeniser";
import { Writer } from "../writer";
import { Definitions } from "../validator";
import { ExtendedAttributes } from "./extended-attributes";
import { Type } from "./type";

export class Attribute extends Base {
  /** Object type. */
  readonly type = "attribute";

  /** An IDL Type for the attribute. */
  idlType!: Type;
  /** Recorded tokens. */
  tokens!: {
    base: Token;
    name: Token;
    readonly: Token;
    special: Token;
    termination: Token;
  };

  /**
   * Factory function for creating an Attribute instance.
   * @param tokeniser - Tokeniser instance.
   * @param opts - Attribute parse options.
   * @param [opts.special] - Token for nameless members.
   * @param [opts.noInherit] - No inherit flag/
   * @param [opts.readonly] - Readonly flag.
   */
  static parse(
    tokeniser: Tokeniser,
    {
      special,
      noInherit = false,
      readonly = false,
    }: {
      special?: Token;
      noInherit?: boolean;
      readonly?: boolean;
    } = {},
  ) {
    const start_position = tokeniser.position;
    const tokens: Record<string, Token | undefined> = { special };
    const ret = autoParenter(
      new Attribute({ source: tokeniser.source, tokens }),
    )!;
    if (!special && !noInherit) {
      tokens.special = tokeniser.consume("inherit");
    }
    if (ret.special === "inherit" && tokeniser.probe("readonly")) {
      tokeniser.error("Inherited attributes cannot be read-only");
    }
    tokens.readonly = tokeniser.consume("readonly");
    if (readonly && !tokens.readonly && tokeniser.probe("attribute")) {
      tokeniser.error("Attributes must be readonly in this context");
    }
    tokens.base = tokeniser.consume("attribute");
    if (!tokens.base) {
      tokeniser.unconsume(start_position);
      return;
    }
    ret.idlType =
      type_with_extended_attributes(tokeniser, "attribute-type") ||
      tokeniser.error("Attribute lacks a type");
    tokens.name =
      tokeniser.consumeKind("identifier") ||
      tokeniser.consume("async", "required") ||
      tokeniser.error("Attribute lacks a name");
    tokens.termination =
      tokeniser.consume(";") ||
      tokeniser.error("Unterminated attribute, expected `;`");
    return ret.this;
  }

  /** Special modifier if exists */
  get special() {
    if (!this.tokens.special) {
      return "";
    }
    return this.tokens.special.value;
  }

  /** True if it's a read-only attribute. */
  get readonly() {
    return !!this.tokens.readonly;
  }

  /** The attribute's name. */
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

    if (this.idlType) {
      yield* this.idlType.validate(defs);
    }

    if (["sequence", "record"].includes(this.idlType.generic)) {
      const message = `Attributes cannot accept ${this.idlType.generic} types.`;
      yield validationError(
        this.tokens.name,
        this,
        "attr-invalid-type",
        message,
      );
    }

    {
      const { reference } = idlTypeIncludesDictionary(this.idlType, defs) || {};
      if (reference) {
        const targetToken = (this.idlType.union ? reference : this.idlType)
          .tokens.base;
        const message = "Attributes cannot accept dictionary types.";
        yield validationError(targetToken, this, "attr-invalid-type", message);
      }
    }

    if (this.readonly) {
      if (idlTypeIncludesEnforceRange(this.idlType, defs)) {
        const targetToken = this.idlType.tokens.base as Token;
        const message =
          "Readonly attributes cannot accept [EnforceRange] extended attribute.";
        yield validationError(targetToken, this, "attr-invalid-type", message);
      }
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
        w.token(this.tokens.special),
        w.token(this.tokens.readonly),
        w.token(this.tokens.base),
        w.ts.type(this.idlType.write(w)),
        w.name_token(this.tokens.name, { data: this, parent }),
        w.token(this.tokens.termination),
      ]),
      { data: this, parent },
    );
  }
}
