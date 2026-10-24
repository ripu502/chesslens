import { cp, mkdir, readdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const root = path.dirname(require.resolve('stockfish/package.json'));
const target = path.resolve('public', 'engine');
const files = await readdir(path.join(root, 'bin'));
const script = files.find((name) => /^stockfish-.*-lite-single\.js$/.test(name));
if (!script) throw new Error('Pinned Stockfish package has no lite single-threaded engine.');
const wasm = script.replace(/\.js$/, '.wasm');
if (!files.includes(wasm)) throw new Error('Matching Stockfish WASM is missing.');
await mkdir(target, { recursive: true });
for (const file of [script, wasm]) {
  await cp(path.join(root, 'bin', file), path.join(target, file));
}
const license = (await readdir(root)).find((name) => /^(copying|license)(\.txt)?$/i.test(name));
if (!license) throw new Error('Stockfish license missing; refusing to distribute without it.');
await cp(path.join(root, license), path.join(target, 'COPYING.txt'));
await writeFile(
  path.join(target, 'manifest.json'),
  JSON.stringify(
    {
      id: 'stockfish-19.0.1-lite-single',
      script,
      source: 'https://github.com/nmrugg/stockfish.js/tree/v19.0.1',
    },
    null,
    2,
  ),
);
console.log(`Prepared ${script}, ${wasm}, license and engine manifest.`);
