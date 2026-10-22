// Follows static `import ... from` / `export ... from` / `import 'x'` statements between files, the way a browser loads a page's
// module graph before running it. import() calls are not followed: they load later, and only when reached.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const STATIC = /(?:^|\n)\s*(?:import\s+(?:[\w*{}\s,$]+?\s+from\s+)?|export\s+(?:\*|\{[^}]*\})\s+from\s+)['"]([^'"]+)['"]/g;
const DYNAMIC = /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g;

const specifiers = (source, re) => [...source.matchAll(re)].map((m) => m[1]);

// Absolute paths of every file reachable from `entry` through static imports (including `entry`). Only relative specifiers are followed.
export function staticImports(entry) {
  const seen = new Set();
  const visit = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    for (const spec of specifiers(readFileSync(file, 'utf8'), STATIC)) {
      if (spec.startsWith('.')) visit(resolve(dirname(file), spec));
    }
  };
  visit(resolve(entry));
  return seen;
}

// The relative specifiers a file loads with import(), resolved to absolute paths.
export function dynamicImports(file) {
  return specifiers(readFileSync(file, 'utf8'), DYNAMIC).filter((s) => s.startsWith('.')).map((s) => resolve(dirname(file), s));
}
