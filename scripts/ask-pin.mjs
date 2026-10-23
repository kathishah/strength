// Asks for a new 6-digit PIN without echoing it (a terminal asks twice) and prints it on stdout; the prompts go to stderr, so
// PIN="$(node scripts/ask-pin.mjs)" captures only the PIN. Used by scripts/create-owner.sh. Exits 1 if the PIN is not exactly 6 digits
// or the two entries differ.
import { askHidden } from './prompt.mjs';

const PIN_RE = /^[0-9]{6}$/;

const first = (await askHidden('PIN (6 digits): ', process.stdin, process.stderr)).trim();
if (!PIN_RE.test(first)) {
  console.error('The PIN must be exactly 6 digits.');
  process.exit(1);
}
if (process.stdin.isTTY) {
  const again = (await askHidden('Same PIN again: ', process.stdin, process.stderr)).trim();
  if (again !== first) {
    console.error('The two entries differ.');
    process.exit(1);
  }
}
process.stdout.write(first);
