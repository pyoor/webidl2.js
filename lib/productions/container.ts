import { Base } from "./base";
import { ExtendedAttributes } from "./extended-attributes";
import { autoParenter, unescape } from "./helpers";
import { Token, Tokeniser } from "../tokeniser";
import { Writer } from "../writer";
import { Definitions } from "../validator";
import { WebIDLErrorData } from "../error";

export type ParserCallback = (
  tokeniser: Tokeniser,
  options?: object,
) => Base | undefined;

export type AllowedMember = [ParserCallback, object?];

function inheritance(tokeniser: Tokeniser) {
  const colon = tokeniser.consume(":");
  if (!colon) {
    return {};
  }
  const inheritance =
    tokeniser.consumeKind("identifier") ||
    tokeniser.error("Inheritance lacks a type");
  return { colon, inheritance };
}

export abstract class Container extends Base {
  /** The container type. */
  abstract get type(): string;

  /** The container's members. */
  members!: Base[];
  /** Recorded tokens. */
  tokens!: {
    base: Token;
    callback: Token;
    close?: Token;
    colon: Token;
    inheritance: Token;
    mixin: Token;
    name: Token;
    open: Token;
    partial?: Token;
    termination: Token;
  };

  /**
   * Factory function for creating a _parse instance.
   * @param tokeniser - Tokeniser instance.
   * @param instance - Extended type instance.
   * @param opts - Container parse options.
   * @param opts.inheritable - Flag indicating if type can be inherited.
   * @param opts.allowedMembers - Array of factory functions for supported members.
   */
  static _parse<T extends Container>(
    tokeniser: Tokeniser,
    instance: T,
    {
      inheritable,
      allowedMembers = [],
    }: {
      inheritable?: boolean;
      allowedMembers?: AllowedMember[];
    } = {},
  ): T {
    const { tokens, type } = instance;
    tokens.name =
      tokeniser.consumeKind("identifier") ||
      tokeniser.error(`Missing name in ${type}`);
    tokeniser.current = instance;
    instance = autoParenter(instance)!;
    if (inheritable) {
      Object.assign(tokens, inheritance(tokeniser));
    }
    tokens.open = tokeniser.consume("{") || tokeniser.error(`Bodyless ${type}`);
    instance.members = [];
    while (true) {
      tokens.close = tokeniser.consume("}");
      if (tokens.close) {
        tokens.termination =
          tokeniser.consume(";") ||
          tokeniser.error(`Missing semicolon after ${type}`);
        return instance.this;
      }
      const ea = ExtendedAttributes.parse(tokeniser);
      let mem: Base | undefined;
      for (const [parser, ...args] of allowedMembers) {
        mem = autoParenter(parser(tokeniser, ...args));
        if (mem) {
          break;
        }
      }
      if (!mem) {
        tokeniser.error("Unknown member");
      }
      mem.extAttrs = ea;
      instance.members.push(mem.this);
    }
  }

  /** A boolean indicating whether this container is partial. */
  get partial() {
    return !!this.tokens.partial;
  }

  /** The container's name. */
  get name() {
    return unescape(this.tokens.name.value);
  }

  /** A string giving the name of an interface this one inherits from, null otherwise. */
  get inheritance() {
    if (!this.tokens.inheritance) {
      return null;
    }
    return unescape(this.tokens.inheritance.value);
  }

  /**
   * Validate the object.
   * @param defs - All parsed object definitions.
   */
  *validate(defs: Definitions): Generator<WebIDLErrorData> {
    for (const member of this.members) {
      yield* member.validate(defs);
    }
  }

  /**
   * Convert the object to WebIDL.
   * @param w - Writer instance.
   */
  write(w: Writer) {
    const inheritance = () => {
      if (!this.tokens.inheritance) {
        return "";
      }
      return w.ts.wrap([
        w.token(this.tokens.colon),
        w.ts.trivia(this.tokens.inheritance.trivia),
        w.ts.inheritance(
          w.reference(this.tokens.inheritance.value, {
            context: this,
          }),
        ),
      ]);
    };

    return w.ts.definition(
      w.ts.wrap([
        this.extAttrs ? this.extAttrs.write(w) : "",
        w.token(this.tokens.callback),
        w.token(this.tokens.partial),
        w.token(this.tokens.base),
        w.token(this.tokens.mixin),
        w.name_token(this.tokens.name, { data: this }),
        inheritance(),
        w.token(this.tokens.open),
        w.ts.wrap(this.members.map((m) => m.write(w))),
        w.token(this.tokens.close),
        w.token(this.tokens.termination),
      ]),
      { data: this },
    );
  }
}
