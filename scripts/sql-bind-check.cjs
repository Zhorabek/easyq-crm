// Every .prepare(...).bind(...) must agree on how many parameters there are.
//
// D1's bind() is variadic and untyped, so a mismatch compiles, typechecks, and then either
// throws at runtime or — worse — silently shifts every argument after the missing one, writing
// the right values into the wrong columns.
//
// This is not hypothetical. Removing a plaintext password from an UPDATE by replacing its `?`
// with a literal, and forgetting to drop the matching bind argument, left `accessRole` landing
// in the `staffId` position. Nothing in the toolchain noticed.

const fs = require('fs');

const FILES = [
  'src/worker.ts',
  'src/server/publicBooking.ts',
  'src/server/rateLimit.ts',
  'src/server/verification.ts',
];

let pass = 0;
let fail = 0;

/** Count `?` placeholders that are actually parameters, ignoring those inside string literals. */
function countPlaceholders(sql) {
  // `${placeholders}` expands to a generated list, so it cannot be counted statically. Those
  // call sites are checked by hand and skipped here rather than reported as false failures.
  if (/\$\{/.test(sql)) return null;
  return (sql.match(/\?/g) || []).length;
}

/**
 * Strip JS comments before counting.
 *
 * bind() calls in this codebase carry explanatory comments between arguments, and prose
 * contains commas — "first service, total money and time" read as two extra arguments and
 * reported a mismatch on code that was correct.
 */
function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

/** Split a bind() argument list on top-level commas. */
function countArgs(rawArgs) {
  const args = stripComments(rawArgs);
  const trimmed = args.trim();
  if (!trimmed) return 0;
  let depth = 0;
  let count = 1;
  let inStr = null;
  for (let i = 0; i < trimmed.length; i += 1) {
    const ch = trimmed[i];
    if (inStr) {
      if (ch === '\\') i += 1;
      else if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') inStr = ch;
    else if ('([{'.includes(ch)) depth += 1;
    else if (')]}'.includes(ch)) depth -= 1;
    else if (ch === ',' && depth === 0) count += 1;
  }
  return count;
}

/** Read a balanced (...) starting at the index of the opening paren. */
function readParens(src, open) {
  let depth = 0;
  let inStr = null;
  for (let i = open; i < src.length; i += 1) {
    const ch = src[i];
    if (inStr) {
      if (ch === '\\') i += 1;
      else if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') inStr = ch;
    else if (ch === '(') depth += 1;
    else if (ch === ')') {
      depth -= 1;
      if (depth === 0) return { text: src.slice(open + 1, i), end: i + 1 };
    }
  }
  return null;
}

let checked = 0;
let skipped = 0;

for (const file of FILES) {
  if (!fs.existsSync(file)) continue;
  const src = fs.readFileSync(file, 'utf8');

  let at = 0;
  while ((at = src.indexOf('.prepare(', at)) !== -1) {
    const prep = readParens(src, at + '.prepare'.length);
    if (!prep) break;
    at = prep.end;

    // The chained .bind() has to follow immediately (whitespace and newlines aside).
    const rest = src.slice(prep.end, prep.end + 4000);
    const bindAt = rest.search(/^\s*\.bind\(/);
    if (bindAt !== 0) continue;

    const bind = readParens(src, prep.end + rest.indexOf('('));
    if (!bind) continue;

    const line = src.slice(0, at).split('\n').length;
    const holes = countPlaceholders(prep.text);
    if (holes === null) {
      skipped += 1;
      continue;
    }
    const args = countArgs(bind.text);
    checked += 1;
    if (holes === args) {
      pass += 1;
    } else {
      fail += 1;
      console.log(`FAIL  ${file}:${line} — ${holes} placeholder(s) but ${args} bound argument(s)`);
      console.log(`        ${prep.text.replace(/\s+/g, ' ').trim().slice(0, 110)}`);
    }
  }
}

console.log(`\nchecked ${checked} prepare/bind pairs (${skipped} skipped: generated placeholder lists)`);
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
