import { Token, Tokeniser } from "./tokeniser";
import { Enum } from "./productions/enum";
import { Includes } from "./productions/includes";
import {
  ExtendedAttributes,
} from "./productions/index.js";
import { Typedef } from "./productions/typedef";
import { CallbackFunction } from "./productions/callback";
import { Interface } from "./productions/interface";
import { Mixin } from "./productions/mixin";
import { Dictionary } from "./productions/dictionary";
import { Namespace } from "./productions/namespace";
import { CallbackInterface } from "./productions/callback-interface";
import { autoParenter } from "./productions/index.js";
import { Eof } from "./productions/token";
import { AllowedMember } from "./productions/container";
import { Writer } from "./writer";

export type IDLRootType =
  | CallbackFunction
  | CallbackInterface
  | Dictionary
  | Enum
  | Includes
  | Mixin
  | Interface
  | Namespace
  | Typedef;

export type IDLRootNamedType = Exclude<IDLRootType, Includes>;

export type ExtendableInterfaces =
  | "callbackInterface"
  | "dictionary"
  | "interface"
  | "mixin"
  | "namespace";

export type Extension = {
  extMembers?: AllowedMember[];
};

type Extensions = Partial<Record<ExtendableInterfaces, Extension>>;

interface CustomProduction {
  extAttrs?: ExtendedAttributes;

  write(w: Writer): string;
}

type CustomProductionFactory = (tokeniser: Tokeniser) => CustomProduction;

export interface ParseOptions {
  /** Boolean indicating whether the result should include EOF node or not. */
  concrete?: boolean;
  /** The source name, typically a filename. Errors and validation objects can indicate their origin if you pass a value. */
  sourceName?: string;
  /** Extensions. */
  extensions?: Extensions;
  /** Custom productions. */
  productions?: CustomProductionFactory[];
}

function parseByTokens(tokeniser: Tokeniser, options: ParseOptions) {
  const source = tokeniser.source;

  function error(str: string) {
    tokeniser.error(str);
  }

  function consume(...candidates: string[]): Token | undefined {
    return tokeniser.consume(...candidates);
  }

  function callback() {
    const callback = consume("callback");
    if (!callback) return;
    if (tokeniser.probe("interface")) {
      return CallbackInterface.parse(tokeniser, callback, {
        ...options?.extensions?.callbackInterface,
      });
    }
    return CallbackFunction.parse(tokeniser, callback);
  }

  function interface_(opts?: { partial: Token }) {
    const base = consume("interface");
    if (!base) return;
    return (
      Mixin.parse(tokeniser, base, {
        ...opts,
        ...options?.extensions?.mixin,
      }) ||
      Interface.parse(tokeniser, base, {
        ...opts,
        ...options?.extensions?.interface,
      }) ||
      error("Interface has no proper body")
    );
  }

  function partial() {
    const partial = consume("partial");
    if (!partial) return;
    return (
      Dictionary.parse(tokeniser, {
        partial,
        ...options?.extensions?.dictionary,
      }) ||
      interface_({ partial }) ||
      Namespace.parse(tokeniser, {
        partial,
        ...options?.extensions?.namespace,
      }) ||
      error("Partial doesn't apply to anything")
    );
  }

  function definition(): CustomProduction | IDLRootType | undefined {
    if (options.productions) {
      for (const production of options.productions) {
        const result = production(tokeniser);
        if (result) {
          return result;
        }
      }
    }

    return (
      callback() ||
      interface_() ||
      partial() ||
      Dictionary.parse(tokeniser, options?.extensions?.dictionary) ||
      Enum.parse(tokeniser) ||
      Typedef.parse(tokeniser) ||
      Includes.parse(tokeniser) ||
      Namespace.parse(tokeniser, options?.extensions?.namespace)
    );
  }

  function definitions() {
    if (!source.length) return [];
    const defs: (CustomProduction | IDLRootType | Eof)[] = [];
    while (true) {
      const ea = ExtendedAttributes.parse(tokeniser);
      const def = definition();
      if (!def) {
        if (ea.length) error("Stray extended attributes");
        break;
      }
      autoParenter(def)!.extAttrs = ea;
      defs.push(def);
    }
    const eof = Eof.parse(tokeniser);
    if (options.concrete && eof) {
      defs.push(eof);
    }
    return defs;
  }

  const res = definitions();
  if (tokeniser.position < source.length) error("Unrecognised tokens");
  return res;
}

/**
 * Parser WebIDL text content into an AST.
 * @param str - WebIDL input.
 * @param options - Parsing options.
 */
export function parse(str: string, options: ParseOptions = {}) {
  const tokeniser = new Tokeniser(str);
  if (typeof options.sourceName !== "undefined") {
    tokeniser.source.name = options.sourceName;
  }
  return parseByTokens(tokeniser, options);
}
