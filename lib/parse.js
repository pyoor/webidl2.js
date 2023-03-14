#!/usr/bin/env node
import { parse } from "./webidl2.js";
import fs from "fs";
import path from "path";

const IDLDir = "/home/jkratzer/tools/gridl/data/idls";

function parseIDLs() {
  const entries = [];
  fs.readdirSync(IDLDir)
    .filter((filename) => !filename.startsWith("Test"))
    .forEach((filename) => {
      const filepath = path.join(IDLDir, filename);
      const raw = fs.readFileSync(filepath, "utf8");
      const parsed = parse(raw, { engine: "gecko" });
      if (parsed) {
        entries.push(...parsed);
      }
    });
}

parseIDLs();
