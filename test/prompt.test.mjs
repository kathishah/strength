import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { askHidden } from '../scripts/prompt.mjs';

test('askHidden reads a piped line and prints only the question', async () => {
  const input = new PassThrough();
  const chunks = [];
  const output = new PassThrough();
  output.on('data', (c) => chunks.push(String(c)));
  const p = askHidden('PIN: ', input, output);
  input.write('123456\n');
  assert.equal(await p, '123456');
  assert.equal(chunks.join(''), 'PIN: ');
});
