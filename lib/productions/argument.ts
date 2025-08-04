import { Base } from "./base";
import { Default } from "./default";
import {
  ExtendedAttributeParameters,
  ExtendedAttributes,
} from "./extended-attributes";
import {
  autoParenter,
  getFirstToken,
  type_with_extended_attributes,
  unescape,
} from "./helpers";
import { argumentNameKeywords, Token, Tokeniser } from "../tokeniser";
import { validationError, WebIDLErrorData } from "../error";
import {
  dictionaryIncludesRequiredField,
  idlTypeIncludesDictionary,
} from "../validators/helpers";
import { Writer } from "../writer";
import { Definitions } from "../validator";
import { Constructor } from "./constructor";
import { Operation } from "./operation";
import { CallbackFunction } from "./callback";
import { IterableLike } from "./iterable";
import { Type } from "./type";

export class Argument extends Base {
  /** Object type. */
  readonly type = "argument";

  /** Default values. */
  default!: Default | null;
  /** A list of extended attributes. */
  extAttrs!: ExtendedAttributes;
  /** An IDL Type describing the type of the argument. */
  idlType!: Type;
  /** Recorded tokens. */
  tokens!: {
    name: Token;
    optional: Token;
    separator: Token;
    variadic: Token;
  };

  /**
   * Factory function for creating an Argument instance.
   * @param tokeniser - Tokeniser instance.
   */
  static parse(tokeniser: Tokeniser) {
    const start_position = tokeniser.position;
    const tokens: Record<string, Token | undefined> = {};
    const ret = autoParenter(
      new Argument({ source: tokeniser.source, tokens }),
    )!;
    ret.extAttrs = ExtendedAttributes.parse(tokeniser);
    tokens.optional = tokeniser.consume("optional");

    const type = type_with_extended_attributes(tokeniser, "argument-type");
    if (!type) {
      return tokeniser.unconsume(start_position);
    }
    ret.idlType = type;
    if (!tokens.optional) {
      tokens.variadic = tokeniser.consume("...");
    }
    tokens.name =
      tokeniser.consumeKind("identifier") ||
      tokeniser.consume(...argumentNameKeywords);
    if (!tokens.name) {
      return tokeniser.unconsume(start_position);
    }
    ret.default = tokens.optional ? Default.parse(tokeniser) : null;
    return ret.this;
  }

  /** True if the argument is optional. */
  get optional() {
    return !!this.tokens.optional;
  }

  /** True if the argument is variadic. */
  get variadic() {
    return !!this.tokens.variadic;
  }

  /** The argument's name. */
  get name() {
    return unescape(this.tokens.name.value);
  }

  /**
   * Validate the object.
   * @param defs - All parsed object definitions.
   */
  *validate(defs: Definitions): Generator<WebIDLErrorData> {
    yield* this.extAttrs.validate(defs);
    yield* this.idlType.validate(defs);
    const result = idlTypeIncludesDictionary(this.idlType, defs, {
      useNullableInner: true,
    });
    if (result) {
      if (this.idlType.nullable) {
        const message = `Dictionary arguments cannot be nullable.`;
        yield validationError(
          this.tokens.name,
          this,
          "no-nullable-dict-arg",
          message,
        );
      } else if (!this.optional) {
        if (
          this.parent &&
          !dictionaryIncludesRequiredField(result.dictionary, defs) &&
          isLastRequiredArgument(this)
        ) {
          const message = `Dictionary argument must be optional if it has no required fields`;
          yield validationError(
            this.tokens.name,
            this,
            "dict-arg-optional",
            message,
            {
              autofix: autofixDictionaryArgumentOptionality(this),
            },
          );
        }
      } else if (!this.default) {
        const message = `Optional dictionary arguments must have a default value of \`{}\`.`;
        yield validationError(
          this.tokens.name,
          this,
          "dict-arg-default",
          message,
          {
            autofix: autofixOptionalDictionaryDefaultValue(this),
          },
        );
      }
    }
  }

  /**
   * Convert the object to WebIDL.
   * @param w - Writer instance.
   */
  write(w: Writer) {
    return w.ts.wrap([
      this.extAttrs.write(w),
      w.token(this.tokens.optional),
      w.ts.type(this.idlType.write(w)),
      w.token(this.tokens.variadic),
      w.name_token(this.tokens.name, { data: this }),
      this.default ? this.default.write(w) : "",
      w.token(this.tokens.separator),
    ]);
  }
}

/**
 * Determines if the given argument is the last required argument in its list.
 * @param arg - Argument instance.
 */
function isLastRequiredArgument(arg: Argument) {
  if (arg.parent) {
    const parent = arg.parent as unknown as
      | CallbackFunction
      | Constructor
      | ExtendedAttributeParameters
      | IterableLike
      | Operation;
    const list =
      "arguments" in parent ? parent.arguments : (parent.list as Argument[]);
    const index = list.indexOf(arg);
    const requiredExists = list
      .slice(index + 1)
      .some((a: Argument) => !a.optional);
    return !requiredExists;
  }
}

/**
 * Autofix to set an argument as optional.
 * @param arg - Argument instance.
 */
function autofixDictionaryArgumentOptionality(arg: Argument) {
  return () => {
    const firstToken = getFirstToken(arg.idlType);
    arg.tokens.optional = {
      ...firstToken,
      type: "optional",
      value: "optional",
    };
    firstToken.trivia = " ";
    autofixOptionalDictionaryDefaultValue(arg)();
  };
}

/**
 * Autofix to set the value for an optional dictionary argument.
 * @param arg - Argument instance.
 */
function autofixOptionalDictionaryDefaultValue(arg: Argument) {
  return () => {
    arg.default = Default.parse(new Tokeniser(" = {}"));
  };
}
