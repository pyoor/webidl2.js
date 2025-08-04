import { AllowedMember, Container } from "./container";
import { Attribute } from "./attribute";
import { Operation } from "./operation";
import { validationError, WebIDLErrorData } from "../error";
import { autofixAddExposedWindow } from "./helpers";
import { Constant } from "./constant";
import { Token, Tokeniser } from "../tokeniser";
import { Definitions } from "../validator";

export class Namespace extends Container {
  /** Object type. */
  readonly type = "namespace";

  /**
   * Factory function for creating a Namespace instance.
   * @param tokeniser - Tokeniser instance.
   * @param opts - Namespace parse options.
   * @param opts.extMembers - Array of factory functions for non-standard members.
   * @param opts.partial - A boolean indicating whether this Dictionary is partial.
   */
  static parse(
    tokeniser: Tokeniser,
    {
      extMembers = [],
      partial,
    }: {
      extMembers?: AllowedMember[];
      partial?: Token;
    } = {},
  ) {
    const tokens: Record<string, Token | undefined> = { partial };
    tokens.base = tokeniser.consume("namespace");
    if (!tokens.base) {
      return;
    }
    return Container._parse(
      tokeniser,
      new Namespace({ source: tokeniser.source, tokens }),
      {
        allowedMembers: [
          ...extMembers,
          [Attribute.parse, { noInherit: true, readonly: true }],
          [Constant.parse],
          [Operation.parse, { regular: true }],
        ],
      },
    );
  }

  /**
   * Validate the object.
   * @param defs - All parsed object definitions.
   */
  *validate(defs: Definitions): Generator<WebIDLErrorData> {
    if (
      !this.partial &&
      this.extAttrs &&
      this.extAttrs.every((extAttr) => extAttr.name !== "Exposed")
    ) {
      const message = `Namespaces must have [Exposed] extended attribute. \
To fix, add, for example, [Exposed=Window]. Please also consider carefully \
if your namespace should also be exposed in a Worker scope. Refer to the \
[WebIDL spec section on Exposed](https://heycam.github.io/webidl/#Exposed) \
for more information.`;
      yield validationError(
        this.tokens.name,
        this,
        "require-exposed",
        message,
        {
          autofix: autofixAddExposedWindow(this),
        },
      );
    }
    yield* super.validate(defs);
  }
}
