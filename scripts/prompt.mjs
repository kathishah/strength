// Reads a line from the terminal without echoing it (raw mode). Falls back to a plain line
// read when stdin is not a terminal (piped input).
import { createInterface } from 'node:readline';

export function askHidden(question, input = process.stdin, output = process.stdout) {
  output.write(question);
  if (!input.isTTY) {
    return new Promise((resolve) => {
      const rl = createInterface({ input });
      rl.once('line', (line) => { rl.close(); resolve(line); });
    });
  }
  return new Promise((resolve) => {
    let buf = '';
    input.setRawMode(true);
    input.setEncoding('utf8');
    input.resume();
    const finish = () => {
      input.removeListener('data', onData);
      input.setRawMode(false);
      input.pause();
      output.write('\n');
    };
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') { finish(); resolve(buf); return; }
        if (ch === '\u0003') { finish(); process.exit(130); } // Ctrl-C
        if (ch === '\u007f' || ch === '\b') buf = buf.slice(0, -1);
        else if (ch >= ' ') buf += ch;
      }
    };
    input.on('data', onData);
  });
}
