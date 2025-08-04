import { Base, SimpleExtendedAttribute } from "./productions/index.js";
import { Token } from "./tokeniser";
import { WrappedToken } from "./productions/token";
import { IDLRootType } from "./webidl2";

type Noop = (arg: string, ...rest: unknown[]) => string;

export interface WriteOptions {
  templates?: WriteTemplate;
}

export interface WriteTemplate {
  /**
   * A function that receives syntax strings plus anything the templates
   * returned.
   *
   * The items are guaranteed to be ordered.  The returned value may be again
   * passed to any template functions, or it may also be the final return value
   * of `write()`.
   * @param items - List of syntax strings.
   */
  wrap(items: string[]): string;

  /**
   * Modify the trivia string.
   */
  trivia: Noop;

  /**
   * The identifier for a container type.
   *
   * For example, the `Foo` part of `interface Foo {};`.
   */
  name: Noop;

  /**
   * Called for each type reference, e.g. `Window`, `DOMString`, or
   * `unsigned long`.
   * @param escaped - The referenced name.
   * @param unescaped - Unescaped reference.
   * @param context -
   */
  reference(escaped: string, unescaped: string, context: unknown): string;

  /**
   * Called for each generic-form syntax, e.g. `sequence`, `Promise`, or `maplike`.
   * @param name - The keyword for syntax.
   */
  generic(name: string): string;

  /**
   * Called for each nameless members, e.g. `stringifier` for `stringifier;` and
   * `constructor` for `constructor();`
   */
  nameless: Noop;

  /**
   * Called only once for each types, e.g. `Document`, `Promise<DOMString>`, or
   * `sequence<long>`.
   */
  type: Noop;

  /**
   * Receives the return value of `reference()`. String if it's absent.
   * @param inheritance - Inheritance value.
   */
  inheritance: Noop;

  /**
   * Called for each IDL type definition, e.g. an interface, an operation, or a typedef.
   * @param content - The wrapped value of everything the definition contains.
   * @param data - The original definition object
   * @param parent - The parent of the definition, undefined if absent
   */
  definition(
    content: string,
    { data, parent }: { data: unknown; parent?: unknown },
  ): string;

  /**
   * Called for each extended attribute annotation.
   * @param content - The wrapped value of everything the annotation contains.
   */
  extendedAttribute: Noop;

  /** The `Foo` part of `[Foo=Whatever]`.
   */
  extendedAttributeReference: Noop;
}

const noop = <T>(arg: T, ..._args: unknown[]): T => arg;

const templates = {
  wrap: (items: unknown[]) => items.join(""),
  trivia: noop,
  name: noop,
  reference: (escaped: string, _unescaped: string, _context: unknown) =>
    escaped,
  type: noop,
  generic: noop,
  nameless: noop,
  inheritance: noop,
  definition: noop,
  extendedAttribute: noop,
  extendedAttributeReference: noop,
};

export class Writer {
  ts: WriteTemplate;

  constructor(ts: WriteTemplate) {
    this.ts = Object.assign({}, templates, ts);
  }

  /**
   * @param {string} raw
   * @param {object} options
   * @param {string} [options.unescaped]
   * @param {import("./productions/base.js").Base} [options.context]
   * @returns
   */
  reference(
    raw: string,
    { unescaped, context }: { unescaped?: string; context?: Base },
  ): string {
    if (!unescaped) {
      unescaped = raw.startsWith("_") ? raw.slice(1) : raw;
    }
    return this.ts.reference(raw, unescaped, context);
  }

  token(t: Token | undefined, wrapper: Noop = noop, ...args: object[]) {
    if (!t) {
      return "";
    }
    const value = wrapper(t.value, ...args);
    return this.ts.wrap([this.ts.trivia(t.trivia), value]);
  }

  reference_token(t: Token | undefined, context: Base) {
    return this.token(t, (raw) => this.reference(String(raw), { context }));
  }

  name_token(t: Token, arg: object) {
    return this.token(t, this.ts.name, arg);
  }

  identifier(id: WrappedToken, context: Base) {
    return this.ts.wrap([
      this.reference_token(id.tokens.value, context),
      this.token(id.tokens.separator),
    ]);
  }
}

export function write(ast: IDLRootType[], { templates: ts = templates } = {}) {
  ts = Object.assign({}, templates, ts);

  const w = new Writer(ts);

  return ts.wrap(ast.map((it) => it.write(w)));
}
