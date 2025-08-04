import { validationError as error, WebIDLError } from "./error";
import { IDLRootNamedType, IDLRootType } from "./webidl2";
import { Includes } from "./productions/includes";
import { Mixin } from "./productions/mixin";
import { Container, Type } from "./productions/index.js";
import { Typedef } from "./productions/typedef";
import { Dictionary } from "./productions/dictionary";

export type TypedefDictionaryReference = {
  reference: Type;
  dictionary: Dictionary;
};

export type Definitions = {
  all: IDLRootType[];
  unique: Map<string, IDLRootNamedType>;
  partials: Map<string, Container[]>;
  duplicates: Set<IDLRootNamedType>;
  mixinMap: Map<string, Mixin[]>;
  cache: {
    typedefIncludesDictionary: WeakMap<
      Typedef,
      TypedefDictionaryReference | undefined
    >;
    dictionaryIncludesRequiredField: WeakMap<Dictionary, boolean | undefined>;
  };
};

function getMixinMap(all: IDLRootType[], unique: Map<string, IDLRootType>) {
  const map: Map<string, Mixin[]> = new Map();
  const includes = all.filter(
    (def): def is Includes => def.type === "includes",
  );
  for (const include of includes) {
    const mixin = unique.get(include.includes);
    if (!(mixin instanceof Mixin)) {
      continue;
    }
    const array = map.get(include.target);
    if (array) {
      array.push(mixin);
    } else {
      map.set(include.target, [mixin]);
    }
  }
  return map;
}

function groupDefinitions(all: IDLRootType[]): Definitions {
  const unique: Map<string, IDLRootNamedType> = new Map();
  const duplicates: Set<IDLRootNamedType> = new Set();
  const partials: Map<string, Container[]> = new Map();
  for (const def of all) {
    if ("partial" in def) {
      const array = partials.get(def.name);
      if (array) {
        array.push(def);
      } else {
        partials.set(def.name, [def]);
      }
      continue;
    }
    if (!("name" in def)) {
      continue;
    }
    if (!unique.has(def.name)) {
      unique.set(def.name, def);
    } else {
      duplicates.add(def);
    }
  }
  return {
    all,
    unique,
    partials,
    duplicates,
    mixinMap: getMixinMap(all, unique),
    cache: {
      typedefIncludesDictionary: new WeakMap(),
      dictionaryIncludesRequiredField: new WeakMap(),
    },
  };
}

function* checkDuplicatedNames({
  unique,
  duplicates,
}: {
  unique: Map<string, IDLRootNamedType>;
  duplicates: Set<IDLRootNamedType>;
}) {
  for (const dup of duplicates) {
    const { name } = dup;
    const message = `The name "${name}" of type "${
      unique.get(name)?.type
    }" was already seen`;
    yield error(dup.tokens.name, dup, "no-duplicate", message);
  }
}

function* validateIterable(ast: IDLRootType[]) {
  const defs = groupDefinitions(ast);
  for (const def of defs.all) {
    if ("validate" in def) {
      yield* def.validate(defs);
    }
  }
  yield* checkDuplicatedNames(defs);
}

export function validate(ast: IDLRootType[]): WebIDLError[] {
  return [...validateIterable(ast.flat())];
}
