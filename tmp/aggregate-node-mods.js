const fs = require('fs');
const path = require('path');
const inPath = path.resolve(process.cwd(), 'tmp', 'node-mods-scan.json');
const outPath = path.resolve(process.cwd(), 'tmp', 'node-mods-priority.json');
try {
  const data = JSON.parse(fs.readFileSync(inPath, 'utf8'));
  const counts = new Map();
  for (const entry of data) {
    let rel = entry.file.replace(/^node_modules[\\/]/, '');
    const parts = rel.split(/[\\/]/);
    let pkg;
    if (parts[0] && parts[0].startsWith('@')) {
      if (parts.length >= 2) pkg = parts.slice(0,2).join('/');
      else pkg = parts[0];
    } else {
      pkg = parts[0] || rel;
    }
    const prev = counts.get(pkg) || { files: 0, hits: 0 };
    prev.files += 1;
    prev.hits += (entry.hits && entry.hits.length) || 0;
    counts.set(pkg, prev);
  }
  const arr = Array.from(counts.entries()).map(([pkg, v]) => ({ package: pkg, files: v.files, hits: v.hits }));
  arr.sort((a,b) => b.files - a.files || b.hits - a.hits || a.package.localeCompare(b.package));
  fs.writeFileSync(outPath, JSON.stringify(arr, null, 2), 'utf8');
  console.log(`Wrote prioritized results to ${outPath}`);
  console.log('Top 40 packages:');
  console.log(JSON.stringify(arr.slice(0,40), null, 2));
} catch (err) {
  console.error('Failed to aggregate:', err && err.message ? err.message : err);
  process.exit(1);
}
