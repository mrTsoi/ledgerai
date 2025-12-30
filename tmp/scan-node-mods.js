const fs = require('fs').promises;
const path = require('path');

const root = path.resolve(process.cwd(), 'node_modules');
const exts = new Set(['.js', '.cjs', '.mjs', '.ts', '.tsx']);
const substrings = [
  'process.version',
  'process.versions',
  'process.env',
  "require('fs'",
  'require("fs"',
  "require('net'",
  'require("net"',
  "from 'fs'",
  'from "fs"',
  "from 'net'",
  'from "net"',
  "import * from 'fs'",
  'import * from "fs"',
];

let matches = [];

async function walk(dir) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (e) {
    return;
  }
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      await walk(full);
    } else if (ent.isFile()) {
      const ext = path.extname(ent.name).toLowerCase();
      if (!exts.has(ext)) continue;
      let content;
      try {
        content = await fs.readFile(full, 'utf8');
      } catch (e) {
        continue;
      }
      const found = substrings.filter(s => content.indexOf(s) !== -1);
      if (found.length) {
        matches.push({ file: path.relative(process.cwd(), full), hits: found });
      }
    }
  }
}

(async () => {
  console.log('Scanning node_modules (this may take a while)...');
  await walk(root);
  console.log(`Found ${matches.length} files with matches (showing up to 200):`);
  for (let i = 0; i < Math.min(matches.length, 200); i++) {
    const m = matches[i];
    console.log(m.file + ' => ' + m.hits.join(', '));
  }
  if (matches.length > 200) console.log('... (truncated)');
})();
