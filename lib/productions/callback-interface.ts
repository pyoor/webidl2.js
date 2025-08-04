import { AllowedMember, Container } from "./container";
import { Operation } from "./operation";
import { Constant } from "./constant";
import { Token, Tokeniser } from "../tokeniser";

export class CallbackInterface extends Container {
  /** Object type. */
  readonly type = "callback-interface";

  /** Callback interface members. */
  members!: (Constant | Operation)[];

  /**
   * Factory function for creating a CallbackInterface instance.
   * @param tokeniser - Tokeniser instance.
   * @param callback - Callback token.
   * @param extMembers - Array of factory functions for non-standard members.
   */
  static parse(
    tokeniser: Tokeniser,
    callback: Token,
    { extMembers = [] }: { extMembers?: AllowedMember[] } = {},
  ): CallbackInterface | undefined {
    const tokens: Record<string, Token | undefined> = { callback };
    tokens.base = tokeniser.consume("interface");
    if (!tokens.base) {
      return;
    }
    return Container._parse(
      tokeniser,
      new CallbackInterface({ source: tokeniser.source, tokens }),
      {
        allowedMembers: [
          ...extMembers,
          [Constant.parse],
          [Operation.parse, { regular: true }],
        ],
      },
    );
  }
}
