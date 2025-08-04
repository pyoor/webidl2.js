import { AllowedMember, Container } from "./container";
import { Attribute } from "./attribute";
import { Operation } from "./operation";
import { Constant } from "./constant";
import { IterableLike } from "./iterable";
import {
  stringifier,
  autofixAddExposedWindow,
  getMemberIndentation,
  getLastIndentation,
  getFirstToken,
  findLastIndex,
  autoParenter,
} from "./helpers";
import { validationError, WebIDLErrorData } from "../error";
import { checkInterfaceMemberDuplication } from "../validators/interface";
import { Constructor } from "./constructor";
import { Token, Tokeniser } from "../tokeniser";
import {
  ExtendedAttributes,
  SimpleExtendedAttribute,
} from "./extended-attributes";
import { Definitions } from "../validator";

function static_member(tokeniser: Tokeniser) {
  const special = tokeniser.consume("static");
  if (!special) return;
  const member =
    Attribute.parse(tokeniser, { special }) ||
    Operation.parse(tokeniser, { special }) ||
    tokeniser.error("No body in static member");
  return member;
}

export class Interface extends Container {
  /** Object type. */
  readonly type = "interface";

  /** Interface members. */
  members!: (Attribute | Constant | Constructor | IterableLike | Operation)[];

  /**
   * Factory function for creating an Interface instance.
   * @param tokeniser - Tokeniser instance.
   * @param base - Identifier token.
   * @param opts - Interface parse options.
   * @param opts.extMembers - Array of factory functions for non-standard members.
   * @param opts.partial - A boolean indicating whether this Interface is partial.
   */
  static parse(
    tokeniser: Tokeniser,
    base: Token,
    {
      extMembers = [],
      partial,
    }: { extMembers?: AllowedMember[]; partial?: Token | undefined } = {},
  ) {
    const tokens: Record<string, Token | undefined> = { partial, base };
    return Container._parse(
      tokeniser,
      new Interface({ source: tokeniser.source, tokens }),
      {
        inheritable: !partial,
        allowedMembers: [
          ...extMembers,
          [Constant.parse],
          [Constructor.parse],
          [static_member],
          [stringifier],
          [IterableLike.parse],
          [Attribute.parse],
          [Operation.parse],
        ],
      },
    );
  }

  /**
   * Validate the object.
   * @param defs - All parsed object definitions.
   */
  *validate(defs: Definitions): Generator<WebIDLErrorData> {
    if (this.extAttrs) {
      yield* this.extAttrs.validate(defs);
      if (
        !this.partial &&
        this.extAttrs.every((extAttr) => extAttr.name !== "Exposed")
      ) {
        const message = `Interfaces must have \`[Exposed]\` extended attribute. \
To fix, add, for example, \`[Exposed=Window]\`. Please also consider carefully \
if your interface should also be exposed in a Worker scope. Refer to the \
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
      const oldConstructors = this.extAttrs.filter(
        (extAttr) => extAttr.name === "Constructor",
      );
      for (const constructor of oldConstructors) {
        const message = `Constructors should now be represented as a \`constructor()\` operation on the interface \
instead of \`[Constructor]\` extended attribute. Refer to the \
[WebIDL spec section on constructor operations](https://heycam.github.io/webidl/#idl-constructors) \
for more information.`;
        yield validationError(
          constructor.tokens.name,
          this,
          "constructor-member",
          message,
          {
            autofix: autofixConstructor(this, constructor),
          },
        );
      }

      const isGlobal = this.extAttrs.some(
        (extAttr) => extAttr.name === "Global",
      );
      if (isGlobal) {
        const factoryFunctions = this.extAttrs.filter(
          (extAttr) => extAttr.name === "LegacyFactoryFunction",
        );
        for (const named of factoryFunctions) {
          const message = `Interfaces marked as \`[Global]\` cannot have factory functions.`;
          yield validationError(
            named.tokens.name,
            this,
            "no-constructible-global",
            message,
          );
        }

        const constructors = this.members.filter(
          (member) => member.type === "constructor",
        ) as Constructor[];
        for (const named of constructors) {
          const message = `Interfaces marked as \`[Global]\` cannot have constructors.`;
          yield validationError(
            named.tokens.base,
            this,
            "no-constructible-global",
            message,
          );
        }
      }

      yield* super.validate(defs);
      if (!this.partial) {
        yield* checkInterfaceMemberDuplication(defs, this);
      }
    }
  }
}

function autofixConstructor(
  interfaceDef: Interface,
  constructorExtAttr: SimpleExtendedAttribute,
) {
  interfaceDef = autoParenter(interfaceDef)!;
  return () => {
    const indentation = getLastIndentation(
      interfaceDef.extAttrs?.tokens.open?.trivia || "",
    );
    const memberIndent = interfaceDef.members.length
      ? getLastIndentation(getFirstToken(interfaceDef.members[0]).trivia)
      : getMemberIndentation(indentation);
    const constructorOp = Constructor.parse(
      new Tokeniser(`\n${memberIndent}constructor();`),
    )!;
    constructorOp.extAttrs = new ExtendedAttributes({
      source: interfaceDef.source,
      tokens: {},
    });
    autoParenter(constructorOp)!.arguments = constructorExtAttr.arguments;

    const existingIndex = findLastIndex(
      interfaceDef.members,
      (m) => m.type === "constructor",
    );
    interfaceDef.members.splice(existingIndex + 1, 0, constructorOp);

    const { close } = interfaceDef.tokens;
    if (close) {
      if (!close.trivia.includes("\n")) {
        close.trivia += `\n${indentation}`;
      }
    }

    const { extAttrs } = interfaceDef;
    if (extAttrs) {
      const index = extAttrs.indexOf(constructorExtAttr);
      const removed = extAttrs.splice(index, 1);
      if (!extAttrs.length) {
        extAttrs.tokens.open = extAttrs.tokens.close = undefined;
      } else if (extAttrs.length === index) {
        extAttrs[index - 1].tokens.separator = undefined;
      } else if (!extAttrs[index].tokens.name.trivia.trim()) {
        extAttrs[index].tokens.name.trivia = removed[0].tokens.name.trivia;
      }
    }
  };
}
