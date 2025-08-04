import { AllowedMember, Container } from "./container";
import { Constant } from "./constant";
import { Attribute } from "./attribute";
import { Operation } from "./operation";
import { stringifier } from "./helpers";
import { Token, Tokeniser } from "../tokeniser";

export class Mixin extends Container {
  /** Object type. */
  readonly type = "mixin";

  /** Mixin members. */
  members!: (Attribute | Constant | Operation)[];

  /**
   * Factory function for creating a Mixin instance.
   * @param tokeniser - Tokeniser instance.
   * @param base - Identifier token.
   * @param opts - Mixin parse options.
   * @param opts.extMembers - Array of factory functions for non-standard members.
   * @param opts.partial - A boolean indicating whether this Interface is partial.
   */
  static parse(
    tokeniser: Tokeniser,
    base: Token,
    {
      extMembers = [],
      partial,
    }: {
      extMembers?: AllowedMember[];
      partial?: Token;
    } = {},
  ) {
    const tokens: Record<string, Token | undefined> = { partial, base };
    tokens.mixin = tokeniser.consume("mixin");
    if (!tokens.mixin) {
      return;
    }
    return Container._parse(
      tokeniser,
      new Mixin({ source: tokeniser.source, tokens }),
      {
        allowedMembers: [
          ...extMembers,
          [Constant.parse],
          [stringifier],
          [Attribute.parse, { noInherit: true }],
          [Operation.parse, { regular: true }],
        ],
      },
    );
  }
}
