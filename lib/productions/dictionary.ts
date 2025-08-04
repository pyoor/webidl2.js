import { AllowedMember, Container } from "./container";
import { Field } from "./field";
import { Token, Tokeniser } from "../tokeniser";

export class Dictionary extends Container {
  /** Object type. */
  readonly type = "dictionary";

  /** Dictionary members. */
  members!: Field[];

  /**
   * Factory function for creating a CallbackInterface instance.
   * @param tokeniser - Tokeniser instance.
   * @param opts - Dictionary parse options.
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
    tokens.base = tokeniser.consume("dictionary");
    if (!tokens.base) {
      return;
    }
    return Container._parse(
      tokeniser,
      new Dictionary({ source: tokeniser.source, tokens }),
      {
        inheritable: !partial,
        allowedMembers: [...extMembers, [Field.parse]],
      },
    );
  }
}
