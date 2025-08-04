import { validationError } from "../error";
import { Definitions } from "../validator";
import { Container, Operation } from "../productions/index.js";

/**
 * @param {import("../validator.js").Definitions} defs
 * @param {import("../productions/container.js").Container} i
 */
export function* checkInterfaceMemberDuplication(
  defs: Definitions,
  i: Container,
) {
  const opNames = groupOperationNames(i);
  const partials = defs.partials.get(i.name) || [];
  const mixins = defs.mixinMap.get(i.name) || [];
  for (const ext of [...partials, ...mixins]) {
    const additions = getOperations(ext);
    const statics = additions.filter((a) => a.special === "static");
    const nonstatics = additions.filter((a) => a.special !== "static");
    yield* checkAdditions(statics, opNames.statics, ext, i);
    yield* checkAdditions(nonstatics, opNames.nonstatics, ext, i);
    statics.forEach((op) => opNames.statics.add(op.name));
    nonstatics.forEach((op) => opNames.nonstatics.add(op.name));
  }

  /**
   * @param {import("../productions/operation.js").Operation[]} additions
   * @param {Set<string>} existings
   * @param {import("../productions/container.js").Container} ext
   * @param {import("../productions/container.js").Container} base
   */
  function* checkAdditions(
    additions: Operation[],
    existings: Set<string>,
    ext: Container,
    base: Container,
  ) {
    for (const addition of additions) {
      const { name } = addition;
      if (name && existings.has(name)) {
        const isStatic = addition.special === "static" ? "static " : "";
        const message = `The ${isStatic}operation "${name}" has already been defined for the base interface "${base.name}" either in itself or in a mixin`;
        yield validationError(
          addition.tokens.name,
          ext,
          "no-cross-overload",
          message,
        );
      }
    }
  }

  /**
   * Return a list of operations associated with a container.
   * @param i - Container instance.
   */
  function getOperations(i: Container): Operation[] {
    return i.members.filter((m): m is Operation => {
      return "type" in m && m.type === "operation";
    });
  }

  /**
   * Group operations by type.
   * @param i - Container instance.
   */
  function groupOperationNames(i: Container) {
    const ops = getOperations(i);
    return {
      statics: new Set(
        ops.filter((op) => op.special === "static").map((op) => op.name),
      ),
      nonstatics: new Set(
        ops.filter((op) => op.special !== "static").map((op) => op.name),
      ),
    };
  }
}
