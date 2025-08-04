import { Type } from "./type";
import { Argument } from "./argument";
import {
  ExtendedAttributes,
  SimpleExtendedAttribute,
} from "./extended-attributes";
import { Operation } from "./operation";
import { Attribute } from "./attribute";
import { Token, Tokeniser } from "../tokeniser";
import { Interface } from "./interface";

import { Base } from "./base";
import { Container } from "./container";
import { Constant } from "./constant";
import { Constructor } from "./constructor";
import { IterableLike } from "./iterable";

/**
 * Strip preceding underscore.
 * @param identifier - Identifier.
 */
export function unescape(identifier: string) {
  return identifier.startsWith("_") ? identifier.slice(1) : identifier;
}

/**
 * Parses comma-separated list
 * @param tokeniser
 * @param args
 * @param args.parser parser function for each item
 * @param [args.allowDangler] whether to allow dangling comma
 * @param [args.listName] the name to be shown on error messages
 */
export function list<T extends Base>(
  tokeniser: Tokeniser,
  {
    parser,
    allowDangler,
    listName = "list",
  }: {
    parser: (arg: Tokeniser) => T | void;
    allowDangler?: boolean;
    listName?: string;
  },
) {
  const first = parser(tokeniser);
  if (!first) {
    return [];
  }
  first.tokens.separator = tokeniser.consume(",");
  const items = [first];
  while (first.tokens.separator) {
    const item = parser(tokeniser);
    if (!item) {
      if (!allowDangler) {
        tokeniser.error(`Trailing comma in ${listName}`);
      }
      break;
    }
    item.tokens.separator = tokeniser.consume(",");
    items.push(item);
    if (!item.tokens.separator) break;
  }
  return items;
}

export function const_value(tokeniser: Tokeniser) {
  return (
    tokeniser.consumeKind("decimal", "integer") ||
    tokeniser.consume("true", "false", "Infinity", "-Infinity", "NaN")
  );
}

export function const_data({ type, value }: Pick<Token, "type" | "value">) {
  switch (type) {
    case "decimal":
    case "integer":
      return { type: "number", value };
    case "string":
      return { type: "string", value: value.slice(1, -1) };
  }

  switch (value) {
    case "true":
    case "false":
      return { type: "boolean", value: value === "true" };
    case "Infinity":
    case "-Infinity":
      return { type: "Infinity", negative: value.startsWith("-") };
    case "[":
      return { type: "sequence", value: [] };
    case "{":
      return { type: "dictionary" };
    default:
      return { type: value };
  }
}

export function primitive_type(tokeniser: Tokeniser): Type | undefined {
  function integer_type() {
    const prefix = tokeniser.consume("unsigned");
    const base = tokeniser.consume("short", "long");
    if (base) {
      const postfix = tokeniser.consume("long");
      return new Type({ source, tokens: { prefix, base, postfix } });
    }
    if (prefix) tokeniser.error("Failed to parse integer type");
  }

  function decimal_type(): Type | undefined {
    const prefix = tokeniser.consume("unrestricted");
    const base = tokeniser.consume("float", "double");
    if (base) {
      return new Type({ source, tokens: { prefix, base } });
    }
    if (prefix) tokeniser.error("Failed to parse float type");
  }

  const { source } = tokeniser;
  const num_type = integer_type() || decimal_type();
  if (num_type) return num_type;
  const base = tokeniser.consume(
    "bigint",
    "boolean",
    "byte",
    "octet",
    "undefined",
  );
  if (base) {
    return new Type({ source, tokens: { base } });
  }
}

export function argument_list(tokeniser: Tokeniser) {
  return list<Argument>(tokeniser, {
    parser: Argument.parse,
    listName: "arguments list",
  });
}

export function type_with_extended_attributes(
  tokeniser: Tokeniser,
  typeName?: string,
) {
  const extAttrs = ExtendedAttributes.parse(tokeniser);
  const ret = Type.parse(tokeniser, typeName);
  if (ret) autoParenter(ret)!.extAttrs = extAttrs;
  return ret;
}

export function return_type(tokeniser: Tokeniser, typeName?: string) {
  const typ = Type.parse(tokeniser, typeName || "return-type");
  if (typ) {
    return typ;
  }
  const voidToken = tokeniser.consume("void");
  if (voidToken) {
    const ret = new Type({
      source: tokeniser.source,
      tokens: { base: voidToken },
    });
    ret.type = "return-type";
    return ret;
  }
}

export function stringifier(tokeniser: Tokeniser) {
  const special = tokeniser.consume("stringifier");
  if (!special) return;
  return (
    Attribute.parse(tokeniser, { special }) ||
    Operation.parse(tokeniser, { special }) ||
    tokeniser.error("Unterminated stringifier")
  );
}

export function getLastIndentation(str: string) {
  const lines = str.split("\n");
  // the first line visually binds to the preceding token
  if (lines.length) {
    const match = lines[lines.length - 1].match(/^\s+/);
    if (match) {
      return match[0];
    }
  }
  return "";
}

export function getMemberIndentation(parentTrivia: string) {
  const indentation = getLastIndentation(parentTrivia);
  const indentCh = indentation.includes("\t") ? "\t" : "  ";
  return indentation + indentCh;
}

export function autofixAddExposedWindow(def: Container) {
  return () => {
    if (def.extAttrs && def.extAttrs.length) {
      const tokeniser = new Tokeniser("Exposed=Window,");
      const exposed = SimpleExtendedAttribute.parse(
        tokeniser,
      ) as SimpleExtendedAttribute;
      exposed.tokens.separator = tokeniser.consume(",");
      const existing = def.extAttrs[0];
      if (!/^\s/.test(existing.tokens.name.trivia)) {
        existing.tokens.name.trivia = ` ${existing.tokens.name.trivia}`;
      }
      def.extAttrs.unshift(exposed);
    } else {
      autoParenter(def)!.extAttrs = ExtendedAttributes.parse(
        new Tokeniser("[Exposed=Window]"),
      );
      const trivia = def.tokens.base.trivia;
      def.extAttrs!.tokens.open!.trivia = trivia;
      def.tokens.base.trivia = `\n${getLastIndentation(trivia)}`;
    }
  };
}

/**
 * Get the first syntax token for the given IDL object.
 * @param {*} data
 */
export function getFirstToken(
  data: Attribute | Constant | Constructor | IterableLike | Operation | Type,
) {
  if (data.extAttrs && data.extAttrs.length && data.extAttrs.tokens.open) {
    return data.extAttrs.tokens.open;
  }
  if (data instanceof Operation && !data.special) {
    return getFirstToken(data.idlType);
  }
  const tokens = Object.values(data.tokens)
    .filter((t): t is Token => t !== undefined)
    .sort((x, y) => x.index - y.index);
  return tokens[0];
}

/**
 * @template T
 * @param {T[]} array
 * @param {(item: T) => boolean} predicate
 */
export function findLastIndex<T>(array: T[], predicate: (item: T) => boolean) {
  const index = array.slice().reverse().findIndex(predicate);
  if (index === -1) {
    return index;
  }
  return array.length - index - 1;
}

/**
 * Returns a proxy that auto-assign `parent` field.
 * @template {Record<string | symbol, any>} T
 * @param {T} data
 * @param {*} [parent] The object that will be assigned to `parent`.
 *                    If absent, it will be `data` by default.
 * @return {T}
 */
export function autoParenter<T extends object>(
  data: T | undefined,
  parent?: unknown,
): T | undefined {
  if (!parent) {
    // Defaults to `data` unless specified otherwise.
    parent = data;
  }
  if (!data) {
    // ToDo: Is the following really necessary?  If so, it forces us to cast
    //  or check the return value of autoParenter every time.
    // This allows `autoParenter(undefined)` which again allows
    // `autoParenter(parse())` where the function may return nothing.
    return data;
  }

  return new Proxy(data, {
    get(target, p: string | symbol, _receiver: unknown): unknown {
      if (typeof p === "string" && p in target) {
        const value = target[p as keyof T];
        if (Array.isArray(value) && p !== "source") {
          // Wraps the array so that any added items will also automatically
          // get their `parent` values.
          return autoParenter(value, target);
        }
        return value;
      }

      // fallback for symbol or unknown keys
      return Reflect.get(target, p);
    },

    set(
      target,
      p: string | symbol,
      value: unknown,
      _receiver: unknown,
    ): boolean {
      if (typeof p === "string") {
        (target as T)[p as keyof T] = value as T[keyof T];
      } else {
        Reflect.set(target, p, value);
      }

      if (!value) return true;

      if (Array.isArray(value)) {
        for (const item of value) {
          if (item && typeof item === "object" && "parent" in item) {
            (item as { parent: unknown }).parent = parent;
          }
        }
      } else if (typeof value === "object" && "parent" in value) {
        (value as { parent: unknown }).parent = parent;
      }

      return true;
    },
  });
}
