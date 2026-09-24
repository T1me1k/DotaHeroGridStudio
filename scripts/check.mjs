import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
for (const file of readdirSync('src').filter(f=>f.endsWith('.mjs'))) {
  const result=spawnSync(process.execPath,['--check',`src/${file}`],{stdio:'inherit'});
  if(result.status)process.exit(result.status);
}
console.log('All JavaScript modules passed syntax checks (not a TypeScript type check).');
