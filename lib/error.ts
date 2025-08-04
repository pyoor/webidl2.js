import { Token } from "./tokeniser";
import { Base } from "./productions/index.js";

export type ErrorLevel = "error" | "warning";

export interface WebIDLError {
  /** Raw error message. */
  bareMessage: string;
  /** Error message with context. */
  message: string;

  context: string;
  /** The line where the error occurred. */
  line: number;
  /** The source file name. */
  sourceName?: string;
  /** A short peek at the text at the point where the error happened */
  input: string;
  /** The five tokens at the point of error, as understood by the tokeniser */
  tokens: Token[];
}

export interface WebIDLErrorData extends WebIDLError {
  /** The level of error */
  level: ErrorLevel;

  /** A function to automatically fix the error */
  autofix?(): void;

  /** The name of the rule that threw the error */
  ruleName?: string;
}

function lastLine(text: string) {
  const splitted = text.split("\n");
  return splitted[splitted.length - 1];
}

function contextAsText(node: Base) {
  const hierarchy: Base[] = [node];
  while (node && node.parent) {
    const { parent } = node;
    hierarchy.unshift(parent);
    node = parent;
  }
  return hierarchy
    .map((n) => {
      // Maintains the previous behavior as there is no guarantee that name is defined
      const name = "name" in n ? n.name : "undefined";
      const type = "type" in n ? ` ${n.type}` : "";
      return `${name}${type}`;
    })
    .join(" -> ");
}

export type WebIDL2ErrorType = "Syntax" | "Validation";
export type WebIDL2ErrorLevel = "error" | "warning";

interface WebIDL2ErrorOptions {
  level?: WebIDL2ErrorLevel;
  autofix?: () => void;
  ruleName?: string;
}

function error(
  source: Token[] & { name?: string },
  position: number,
  current: Base | null | undefined,
  message: string,
  kind: WebIDL2ErrorType,
  { level = "error", autofix, ruleName }: WebIDL2ErrorOptions = {},
): WebIDLErrorData {
  /**
   * @param count - Number of tokens to slice.
   */
  function sliceTokens(count: number) {
    return count > 0
      ? source.slice(position, position + count)
      : source.slice(Math.max(position + count, 0), position);
  }

  function tokensToText(
    inputs: Token[],
    { precedes }: { precedes?: boolean } = {},
  ) {
    const text = inputs.map((t) => t.trivia + t.value).join("");
    const nextToken = source[position];
    if (nextToken.type === "eof") {
      return text;
    }
    if (precedes) {
      return text + nextToken.trivia;
    }
    return text.slice(nextToken.trivia.length);
  }

  const maxTokens = 5; // arbitrary but works well enough
  const line =
    source[position].type !== "eof"
      ? source[position].line
      : source.length > 1
        ? source[position - 1].line
        : 1;

  const precedingLastLine = lastLine(
    tokensToText(sliceTokens(-maxTokens), { precedes: true }),
  );

  const subsequentTokens = sliceTokens(maxTokens);
  const subsequentText = tokensToText(subsequentTokens);
  const subsequentFirstLine = subsequentText.split("\n")[0];

  const spaced = " ".repeat(precedingLastLine.length) + "^";
  const sourceContext = precedingLastLine + subsequentFirstLine + "\n" + spaced;

  const contextType = kind === "Syntax" ? "since" : "inside";
  const inSourceName = source.name ? ` in ${source.name}` : "";
  let grammaticalContext = "";
  if (current && "name" in current && typeof current.name === "string") {
    const partial = "partial" in current ? "partial " : "";
    grammaticalContext = `, ${contextType} \`${partial}${contextAsText(
      current,
    )}\``;
  }
  const context = `${kind} error at line ${line}${inSourceName}${grammaticalContext}:\n${sourceContext}`;
  return {
    message: `${context} ${message}`,
    bareMessage: message,
    context,
    line,
    sourceName: source.name,
    level,
    ruleName,
    autofix,
    input: subsequentText,
    tokens: subsequentTokens,
  };
}

export function syntaxError(
  source: Token[],
  position: number,
  current: null | undefined | Base,
  message: string,
): WebIDLError {
  return error(source, position, current, message, "Syntax");
}

export function validationError(
  token: Token,
  current: Base,
  ruleName: string,
  message: string,
  options: WebIDL2ErrorOptions = {},
) {
  options.ruleName = ruleName;
  return error(
    current.source,
    token.index,
    current,
    message,
    "Validation",
    options,
  );
}
