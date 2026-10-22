// A throwaway copy of the repository's deployment files plus a fake `aws`, `sam` and `npm` (fake-cli.mjs), for running the shell scripts
// for real without any chance of reaching AWS: PATH holds only the fake programs and /usr/bin:/bin, HOME and the environment are empty.

import { chmodSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const fakeCli = fileURLToPath(new URL('./fake-cli.mjs', import.meta.url));

export const STACK = 'strength-testing';
export const REGION = 'eu-west-2';
export const OUTPUTS = {
  CloudFrontDomain: 'd111111abcdef8.cloudfront.net',
  DistributionId: 'EDIST123TEST',
  SiteUrl: 'https://d111111abcdef8.cloudfront.net',
  ApiUrl: 'https://abc123test.execute-api.eu-west-2.amazonaws.com',
  UserPoolId: 'eu-west-2_TestPool1',
  UserPoolClientId: 'testclientid0123456789abcd',
  SiteBucketName: 'strength-testing-sitebucket-abc',
  DataBucketName: 'strength-testing-databucket-xyz',
};
export const DEPLOY_ENV = `STACK=${STACK}\nAWS_REGION=${REGION}\nAWS_PROFILE=\nDOMAIN=\nCERT_ARN=\nOWNER_SUB=\n`;

export function createSandbox({ scenario = {}, deployEnv = DEPLOY_ENV, images = null, nodeScripts = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'strength-sandbox-'));
  const binDir = join(root, '.fakebin');
  const home = join(root, '.home');
  const logFile = join(root, '.fake.log');
  const scenarioFile = join(root, '.fake.scenario.json');
  for (const d of [binDir, home]) mkdirSync(d, { recursive: true });
  writeFileSync(logFile, '');

  // The deployment files of the real repository.
  cpSync(join(repoRoot, 'scripts'), join(root, 'scripts'), { recursive: true });
  mkdirSync(join(root, 'infra'));
  cpSync(join(repoRoot, 'infra/template.yaml'), join(root, 'infra/template.yaml'));
  mkdirSync(join(root, 'lambda/events'), { recursive: true });
  writeFileSync(join(root, 'lambda/events/package.json'), '{"name":"events","private":true}\n');

  if (nodeScripts) {
    // What export-data.mjs and post-events.mjs import.
    for (const f of ['registry.mjs', 'time.mjs']) cpSync(join(repoRoot, 'lambda/events', f), join(root, 'lambda/events', f));
    cpSync(join(repoRoot, 'app/js'), join(root, 'app/js'), { recursive: true });
  }

  // A small pretend app, including the files that must not be deployed.
  const app = (path, text) => {
    mkdirSync(join(root, 'app', path, '..'), { recursive: true });
    writeFileSync(join(root, 'app', path), text);
  };
  app('index.html', '<!doctype html><title>t</title>\n');
  app('sw.js', '// sw\n');
  app('manifest.webmanifest', '{"name":"t"}\n');
  app('css/app.css', 'body{}\n');
  app('js/main.js', 'export {};\n');
  cpSync(join(repoRoot, 'app/js/config.js'), join(root, 'app/js/config.js'));
  app('.DS_Store', 'junk');
  for (const name of images ?? []) app(`img/${name}`, `image ${name}`);
  if (images !== null && images.length === 0) mkdirSync(join(root, 'app/img'), { recursive: true });

  // Something for `node --test` to run.
  writeFileSync(join(root, 'package.json'), '{"type":"module","private":true}\n');
  mkdirSync(join(root, 'test'));
  writeFileSync(join(root, 'test/pass.test.mjs'), "import { test } from 'node:test';\ntest('passes', () => {});\n");

  if (deployEnv !== null) {
    mkdirSync(join(root, 'private'));
    writeFileSync(join(root, 'private/deploy.env'), deployEnv);
  }

  const shim = (name, body) => {
    const file = join(binDir, name);
    writeFileSync(file, `#!/bin/sh\n${body}\n`);
    chmodSync(file, 0o755);
  };
  shim('node', `exec "${process.execPath}" "$@"`);
  for (const name of ['aws', 'sam', 'npm']) shim(name, `exec "${process.execPath}" "${fakeCli}" ${name} "$@"`);

  const setScenario = (s) => writeFileSync(scenarioFile, JSON.stringify(s));
  setScenario({ stack: STACK, region: REGION, outputs: OUTPUTS, resources: [], ...scenario });

  const sandbox = {
    root,
    path: (...parts) => join(root, ...parts),
    read: (path) => readFileSync(join(root, path), 'utf8'),
    exists: (path) => existsSync(join(root, path)),
    write: (path, text) => {
      mkdirSync(join(root, path, '..'), { recursive: true });
      writeFileSync(join(root, path), text);
    },
    setScenario,
    scenario: () => JSON.parse(readFileSync(scenarioFile, 'utf8')),
    // Everything the scripts asked the fake programs to do, in order.
    calls: () => readFileSync(logFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)),
    // The calls whose "<cmd> <args...>" text contains `text`.
    callsMatching: (text) => sandbox.calls().filter((c) => `${c.cmd} ${c.args.join(' ')}`.includes(text)),
    // Runs scripts/<name> (any extra env wins) with `input` as stdin.
    run: (name, args = [], { input = '', env = {} } = {}) => {
      const r = spawnSync(join(root, 'scripts', name), args, {
        cwd: root,
        input,
        encoding: 'utf8',
        env: {
          PATH: `${binDir}:/usr/bin:/bin`,
          HOME: home,
          FAKE_LOG: logFile,
          FAKE_SCENARIO: scenarioFile,
          ...env,
        },
      });
      return { status: r.status, stdout: r.stdout, stderr: r.stderr, output: `${r.stdout}${r.stderr}` };
    },
    // Runs `node <args>` (a Node script in scripts/) with the same restricted environment.
    node: (args, { input = '' } = {}) => {
      const r = spawnSync('node', args, {
        cwd: root,
        input,
        encoding: 'utf8',
        env: { PATH: `${binDir}:/usr/bin:/bin`, HOME: home, FAKE_LOG: logFile, FAKE_SCENARIO: scenarioFile },
      });
      return { status: r.status, stdout: r.stdout, stderr: r.stderr, output: `${r.stdout}${r.stderr}` };
    },
    // Runs a command through `bash -c` the way a user's terminal would (to try `source scripts/aws-env.sh`).
    bash: (command, { env = {} } = {}) => {
      const r = spawnSync('bash', ['-c', command], {
        cwd: root,
        encoding: 'utf8',
        env: { PATH: `${binDir}:/usr/bin:/bin`, HOME: home, FAKE_LOG: logFile, FAKE_SCENARIO: scenarioFile, ...env },
      });
      return { status: r.status, stdout: r.stdout, stderr: r.stderr };
    },
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
  return sandbox;
}
