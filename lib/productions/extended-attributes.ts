import { Base } from "./base";
import { ArrayBase } from "./array-base";
import { WrappedToken } from "./token";
import { list, argument_list, autoParenter, unescape } from "./helpers";
import { validationError, WebIDLErrorData } from "../error";
import { Token, Tokeniser } from "../tokeniser";
import { Writer } from "../writer";
import { Argument } from "./argument";
import { Definitions } from "../validator";

function tokens(tokeniser: Tokeniser, tokenName: string) {
  return list<WrappedToken>(tokeniser, {
    parser: WrappedToken.parser(tokeniser, tokenName),
    listName: `${tokenName} list`,
  });
}

const extAttrValueSyntax = ["identifier", "decimal", "integer", "string"];

const shouldBeLegacyPrefixed = [
  "NoInterfaceObject",
  "LenientSetter",
  "LenientThis",
  "TreatNonObjectAsNull",
  "Unforgeable",
];

const renamedLegacies = new Map([
  shouldBeLegacyPrefixed.map((name) => [name, `Legacy${name}`]),
  ["NamedConstructor", "LegacyFactoryFunction"],
  ["OverrideBuiltins", "LegacyOverrideBuiltIns"],
  ["TreatNullAs", "LegacyNullToEmptyString"],
] as [string, string][]);

function extAttrListItems(tokeniser: Tokeniser) {
  for (const syntax of extAttrValueSyntax) {
    const toks = tokens(tokeniser, syntax);
    if (toks.length) {
      return toks;
    }
  }
  tokeniser.error(
    `Expected identifiers, strings, decimals, or integers but none found`,
  );
}

export class ExtendedAttributeParameters extends Base {
  list!: Argument[] | WrappedToken[];
  /** Recorded tokens. */
  tokens!: {
    assign?: Token;
    asterisk?: Token;
    close?: Token;
    name?: Token;
    open?: Token;
    secondaryName?: Token;
    value?: Token;
  };

  /**
   * Factory function for creating an ExtendedAttributeParameters instance.
   * @param tokeniser - Tokeniser instance.
   */
  static parse(tokeniser: Tokeniser) {
    const tokens: Record<string, Token | undefined> = {
      assign: tokeniser.consume("="),
    };
    const ret = autoParenter(
      new ExtendedAttributeParameters({ source: tokeniser.source, tokens }),
    ) as ExtendedAttributeParameters;
    ret.list = [];
    if (tokens.assign) {
      tokens.asterisk = tokeniser.consume("*");
      if (tokens.asterisk) {
        return ret.this;
      }
      tokens.secondaryName = tokeniser.consumeKind(...extAttrValueSyntax);
    }
    tokens.open = tokeniser.consume("(");
    if (tokens.open) {
      ret.list = ret.rhsIsList
        ? // [Exposed=(Window,Worker)]
          extAttrListItems(tokeniser)
        : // [LegacyFactoryFunction=Audio(DOMString src)] or [Constructor(DOMString str)]
          argument_list(tokeniser);
      tokens.close =
        tokeniser.consume(")") ||
        tokeniser.error("Unexpected token in extended attribute argument list");
    } else if (tokens.assign && !tokens.secondaryName) {
      tokeniser.error("No right hand side to extended attribute assignment");
    }
    return ret.this;
  }

  /** Boolean indicating if right-hand side is a list. */
  get rhsIsList() {
    return (
      this.tokens.assign && !this.tokens.asterisk && !this.tokens.secondaryName
    );
  }

  /** Right-hand side type. */
  get rhsType() {
    if (this.rhsIsList) {
      return (this.list as WrappedToken[])[0].tokens.value.type + "-list";
    }
    if (this.tokens.asterisk) {
      return "*";
    }
    if (this.tokens.secondaryName) {
      return this.tokens.secondaryName.type;
    }
    return null;
  }

  /**
   * Convert the object to WebIDL.
   * @param w - Writer instance.
   */
  write(w: Writer): string {
    const { rhsType } = this;
    return w.ts.wrap([
      w.token(this.tokens.assign),
      w.token(this.tokens.asterisk),
      w.reference_token(this.tokens.secondaryName, this.parent as Base),
      w.token(this.tokens.open),
      ...this.list.map((p) => {
        return rhsType === "identifier-list"
          ? w.identifier(p as WrappedToken, this.parent as Base)
          : p.write(w);
      }),
      w.token(this.tokens.close),
    ]);
  }
}

export class SimpleExtendedAttribute extends Base {
  /** Object type. */
  readonly type = "extended-attribute";

  /** Recorded tokens. */
  tokens!: {
    name: Token;
    separator?: Token;
  };
  /** Extended attribute parameters. */
  params!: ExtendedAttributeParameters;

  /**
   * Factory function for creating an SimpleExtendedAttribute instance.
   * @param tokeniser - Tokeniser instance.
   */
  static parse(tokeniser: Tokeniser) {
    const name = tokeniser.consumeKind("identifier");
    if (name) {
      return new SimpleExtendedAttribute({
        source: tokeniser.source,
        tokens: { name },
        params: ExtendedAttributeParameters.parse(tokeniser),
      });
    }
  }

  /**
   * @param opts - SimpleExtendedAttribute options.
   * @param opts.source - All tokens for the current input.
   * @param opts.tokens - Required tokens.
   * @param opts.params - Extended attribute parameters.
   */
  constructor({
    source,
    tokens,
    params,
  }: {
    source: Token[];
    tokens: Record<string, Token | undefined>;
    params: ExtendedAttributeParameters;
  }) {
    super({ source, tokens });
    params.parent = this;
    Object.defineProperty(this, "params", { value: params });
  }

  /** The extended attribute's name. */
  get name() {
    return this.tokens.name?.value;
  }

  /** The right-hand side type and value. */
  get rhs() {
    const { rhsType: type, tokens, list } = this.params;
    if (!type) {
      return null;
    }
    const value = this.params.rhsIsList
      ? list
      : tokens.secondaryName
        ? unescape(tokens.secondaryName.value)
        : null;
    return { type, value };
  }

  /** The right-hand side arguments (if any). */
  get arguments() {
    const { rhsIsList, list } = this.params;
    if (!list || rhsIsList) {
      return [];
    }
    return list as Argument[];
  }

  /**
   * Validate the object.
   * @param defs - All parsed object definitions.
   */
  *validate(defs: Definitions): Generator<WebIDLErrorData> {
    const { name } = this;
    if (name === "LegacyNoInterfaceObject") {
      const message = `\`[LegacyNoInterfaceObject]\` extended attribute is an \
undesirable feature that may be removed from Web IDL in the future. Refer to the \
[relevant upstream PR](https://github.com/whatwg/webidl/pull/609) for more \
information.`;
      yield validationError(
        this.tokens.name,
        this,
        "no-nointerfaceobject",
        message,
        { level: "warning" },
      );
    } else if (renamedLegacies.has(name)) {
      const message = `\`[${name}]\` extended attribute is a legacy feature \
that is now renamed to \`[${renamedLegacies.get(name)}]\`. Refer to the \
[relevant upstream PR](https://github.com/whatwg/webidl/pull/870) for more \
information.`;
      yield validationError(this.tokens.name, this, "renamed-legacy", message, {
        level: "warning",
        autofix: renameLegacyExtendedAttribute(this),
      });
    }
    for (const arg of this.arguments) {
      yield* arg.validate(defs);
    }
  }

  /**
   * Convert the object to WebIDL.
   * @param w - Writer instance.
   */
  write(w: Writer) {
    return w.ts.wrap([
      w.ts.trivia(this.tokens.name.trivia),
      w.ts.extendedAttribute(
        w.ts.wrap([
          w.ts.extendedAttributeReference(this.name),
          this.params.write(w),
        ]),
      ),
      w.token(this.tokens.separator),
    ]);
  }
}

function renameLegacyExtendedAttribute(extAttr: SimpleExtendedAttribute) {
  return () => {
    const { name } = extAttr;
    const updatedName = renamedLegacies.get(name);
    if (!updatedName) {
      throw new Error("Unable to find a match for legacy attribute!");
    }

    extAttr.tokens.name.value = updatedName;
    if (name === "TreatNullAs") {
      extAttr.params.tokens = {};
    }
  };
}

// Note: we parse something simpler than the official syntax. It's all that ever
// seems to be used
export class ExtendedAttributes extends ArrayBase<SimpleExtendedAttribute> {
  /** Recorded tokens. */
  tokens!: {
    close?: Token;
    open?: Token;
  };

  /**
   * Factory function for creating an ExtendedAttributes instance.
   * @param tokeniser - Tokeniser instance.
   */
  static parse(tokeniser: Tokeniser) {
    const tokens: Record<string, Token | undefined> = {};
    tokens.open = tokeniser.consume("[");
    const ret = new ExtendedAttributes({ source: tokeniser.source, tokens });
    if (!tokens.open) return ret;
    ret.push(
      ...list<SimpleExtendedAttribute>(tokeniser, {
        parser: SimpleExtendedAttribute.parse,
        listName: "extended attribute",
      }),
    );
    tokens.close =
      tokeniser.consume("]") ||
      tokeniser.error(
        "Expected a closing token for the extended attribute list",
      );
    if (!ret.length) {
      tokeniser.unconsume(tokens.close.index);
      tokeniser.error("An extended attribute list must not be empty");
    }
    if (tokeniser.probe("[")) {
      tokeniser.error(
        "Illegal double extended attribute lists, consider merging them",
      );
    }
    return ret;
  }

  /**
   * Validate the object.
   * @param defs - All parsed object definitions.
   */
  *validate(defs: Definitions): Generator<WebIDLErrorData> {
    for (const extAttr of this) {
      yield* extAttr.validate(defs);
    }
  }

  /**
   * Convert the object to WebIDL.
   * @param w - Writer instance.
   */
  write(w: Writer) {
    if (!this.length) return "";
    return w.ts.wrap([
      w.token(this.tokens.open),
      ...this.map((ea) => ea.write(w)),
      w.token(this.tokens.close),
    ]);
  }
}
