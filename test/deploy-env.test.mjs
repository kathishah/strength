// private/deploy.env and the stack outputs: how the shell scripts (aws-env.sh) and the Node scripts (stack-config.mjs) read them.
import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  StackConfigError, deployEnvProblems, injectSiteConfig, loadStackConfig, parseDeployEnv, parseOutputsText, readStackOutputs,
} from '../scripts/stack-config.mjs';
import { DEPLOY_ENV, OUTPUTS, REGION, STACK, createSandbox } from '../test-support/aws-sandbox.mjs';

const sandboxes = [];
const sandbox = (opts) => {
  const s = createSandbox(opts);
  sandboxes.push(s);
  return s;
};
afterEach(() => {
  while (sandboxes.length) sandboxes.pop().cleanup();
});

const ENV_SCRIPTS = ['deploy-stack.sh', 'deploy-app.sh', 'create-owner.sh', 'teardown.sh'];

describe('aws-env.sh', () => {
  test('loads the settings from private/deploy.env and adds the stack outputs', () => {
    const sb = sandbox({ deployEnv: `${DEPLOY_ENV}AWS_PROFILE=my-profile\n` });
    const r = sb.bash('source scripts/aws-env.sh >/dev/null && for v in STACK AWS_REGION AWS_PROFILE SITE_BUCKET DIST_ID SITE_URL API_URL USER_POOL_ID USER_POOL_CLIENT_ID DATA_BUCKET; do eval "echo $v=\\$$v"; done');
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(r.stdout.trim().split('\n'), [
      `STACK=${STACK}`, `AWS_REGION=${REGION}`, 'AWS_PROFILE=my-profile',
      `SITE_BUCKET=${OUTPUTS.SiteBucketName}`, `DIST_ID=${OUTPUTS.DistributionId}`, `SITE_URL=${OUTPUTS.SiteUrl}`, `API_URL=${OUTPUTS.ApiUrl}`,
      `USER_POOL_ID=${OUTPUTS.UserPoolId}`, `USER_POOL_CLIENT_ID=${OUTPUTS.UserPoolClientId}`, `DATA_BUCKET=${OUTPUTS.DataBucketName}`,
    ]);
    const [call] = sb.callsMatching('describe-stacks');
    assert.equal(call.profile, 'my-profile');
    assert.deepEqual(call.args.slice(0, 6), ['cloudformation', 'describe-stacks', '--stack-name', STACK, '--region', REGION]);
  });

  test('can be sourced from another directory, and exports the values to child processes', () => {
    const sb = sandbox();
    const r = sb.bash(`cd /tmp && source "${sb.path('scripts/aws-env.sh')}" >/dev/null && sh -c 'echo "$STACK $DIST_ID"'`);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout.trim(), `${STACK} ${OUTPUTS.DistributionId}`);
  });

  test('the file decides: values already exported in the terminal are discarded, and an empty profile means default credentials', () => {
    const sb = sandbox();
    const r = sb.bash('source scripts/aws-env.sh >/dev/null && echo "$STACK|$AWS_REGION|${AWS_PROFILE-unset}|$DOMAIN"', {
      env: { STACK: 'someone-elses-stack', AWS_REGION: 'ap-south-1', AWS_PROFILE: 'other', DOMAIN: 'other.example.com' },
    });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout.trim(), `${STACK}|${REGION}|unset|`);
    assert.equal(sb.callsMatching('describe-stacks')[0].profile, null);
  });

  test('stops with a message when private/deploy.env is missing', () => {
    const sb = sandbox({ deployEnv: null });
    const r = sb.bash('source scripts/aws-env.sh; echo "reached"');
    assert.equal(r.status, 0);
    assert.match(r.stderr, /private\/deploy\.env is missing/);
    assert.match(r.stderr, /init-deploy\.sh/);
    assert.equal(sb.calls().length, 0, 'nothing is called without settings');
  });

  test('stops when STACK or AWS_REGION is empty, or CERT_ARN is missing with a DOMAIN', () => {
    const cases = [
      ['STACK=\nAWS_REGION=us-west-2\n', /missing: STACK/],
      ['STACK=x\n', /missing: AWS_REGION/],
      ['STACK=x\nAWS_REGION=us-west-2\nDOMAIN=strength.example.com\nCERT_ARN=\n', /CERT_ARN\(required with DOMAIN\)/],
    ];
    for (const [deployEnv, message] of cases) {
      const sb = sandbox({ deployEnv });
      const r = sb.bash('source scripts/aws-env.sh');
      assert.equal(r.status, 1, deployEnv);
      assert.match(r.stderr, /incomplete/);
      assert.match(r.stderr, message);
      assert.equal(sb.calls().length, 0);
    }
  });

  test('accepts a domain with its certificate, and a stack that does not exist is reported with the AWS message', () => {
    const arn = 'arn:aws:acm:us-east-1:123456789012:certificate/abc';
    const ok = sandbox({ deployEnv: `${DEPLOY_ENV}DOMAIN=strength.example.com\nCERT_ARN=${arn}\n` });
    const good = ok.bash('source scripts/aws-env.sh >/dev/null && echo "$DOMAIN $CERT_ARN"');
    assert.equal(good.stdout.trim(), `strength.example.com ${arn}`);

    const gone = sandbox({ scenario: { outputs: null } });
    const r = gone.bash('source scripts/aws-env.sh');
    assert.equal(r.status, 1);
    assert.match(r.stderr, new RegExp(`Could not read the outputs of stack ${STACK}`));
    assert.match(r.stderr, /does not exist/);
  });

  test('a stack missing an output is reported by name', () => {
    const { SiteUrl, ...rest } = OUTPUTS; // eslint-disable-line no-unused-vars
    const sb = sandbox({ scenario: { outputs: rest } });
    const r = sb.bash('source scripts/aws-env.sh');
    assert.equal(r.status, 1);
    assert.match(r.stderr, /no output for: SiteUrl/);
  });

  test('STRENGTH_SKIP_OUTPUTS=1 loads only the settings (for scripts that run before the stack exists)', () => {
    const sb = sandbox({ scenario: { outputs: null } });
    const r = sb.bash('STRENGTH_SKIP_OUTPUTS=1; source scripts/aws-env.sh >/dev/null && echo "$STACK ${SITE_BUCKET-none}"');
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout.trim(), `${STACK} none`);
    assert.equal(sb.calls().length, 0);
  });
});

describe('every script that targets a stack stops without a complete private/deploy.env', () => {
  for (const script of ENV_SCRIPTS) {
    test(`${script}: missing file`, () => {
      const sb = sandbox({ deployEnv: null });
      const r = sb.run(script, script === 'create-owner.sh' ? ['me@example.com'] : []);
      assert.notEqual(r.status, 0);
      assert.match(r.stderr, /private\/deploy\.env is missing/);
      assert.equal(sb.calls().length, 0, 'no aws, sam or npm call was made');
    });
    test(`${script}: incomplete file`, () => {
      const sb = sandbox({ deployEnv: 'STACK=only-a-stack\n' });
      const r = sb.run(script, script === 'create-owner.sh' ? ['me@example.com'] : []);
      assert.notEqual(r.status, 0);
      assert.match(r.stderr, /incomplete; missing: AWS_REGION/);
      assert.equal(sb.calls().length, 0);
    });
  }
});

describe('no script has a built-in stack, region or domain', () => {
  test('the shell and Node scripts do not name the owner\'s stack, region or domain', async () => {
    const { readdirSync, readFileSync } = await import('node:fs');
    const dir = new URL('../scripts/', import.meta.url);
    const bad = [];
    for (const name of readdirSync(dir)) {
      if (!/\.(sh|mjs)$/.test(name)) continue;
      const text = readFileSync(new URL(name, dir), 'utf8');
      const lines = text.split('\n').filter((l) => !/for example/.test(l)); // prompts may give an example
      if (lines.some((l) => /strength-prod|logbook\.me|us-west-2/.test(l))) bad.push(name);
    }
    assert.deepEqual(bad, []);
  });
});

describe('stack-config.mjs', () => {
  const tmp = [];
  const envFile = (text) => {
    const dir = mkdtempSync(join(tmpdir(), 'strength-cfg-'));
    tmp.push(dir);
    const file = join(dir, 'deploy.env');
    if (text !== null) writeFileSync(file, text);
    return file;
  };
  afterEach(() => {
    while (tmp.length) rmSync(tmp.pop(), { recursive: true, force: true });
  });

  test('parseDeployEnv reads KEY=value lines, quotes and comments', () => {
    assert.deepEqual(parseDeployEnv('# c\n\nSTACK=a\nexport AWS_REGION="us-west-2"\nDOMAIN=\nCERT_ARN=arn:x # note\nbad line\n'), {
      STACK: 'a', AWS_REGION: 'us-west-2', DOMAIN: '', CERT_ARN: 'arn:x',
    });
  });

  test('deployEnvProblems: stack and region are required, a certificate only with a domain', () => {
    assert.deepEqual(deployEnvProblems({}), ['STACK', 'AWS_REGION']);
    assert.deepEqual(deployEnvProblems({ STACK: 's', AWS_REGION: 'r' }), []);
    assert.deepEqual(deployEnvProblems({ STACK: 's', AWS_REGION: 'r', DOMAIN: 'd.example.com' }), ['CERT_ARN (required with DOMAIN)']);
  });

  test('loadStackConfig with injected outputs never calls AWS and gives the config the scripts need', () => {
    const run = () => assert.fail('AWS must not be called when outputs are injected');
    const cfg = loadStackConfig({ envFile: envFile(DEPLOY_ENV), outputs: OUTPUTS, run });
    assert.equal(cfg.STACK, STACK);
    assert.equal(cfg.SITE_URL, OUTPUTS.SiteUrl);
    assert.equal(cfg.DATA_BUCKET, OUTPUTS.DataBucketName);
    assert.deepEqual(cfg.config, { region: REGION, userPoolClientId: OUTPUTS.UserPoolClientId, apiUrl: OUTPUTS.ApiUrl });
  });

  test('loadStackConfig explains a missing or incomplete file and missing outputs', () => {
    assert.throws(() => loadStackConfig({ envFile: envFile(null), outputs: OUTPUTS }), (e) => e instanceof StackConfigError && /missing.*init-deploy\.sh/.test(e.message));
    assert.throws(() => loadStackConfig({ envFile: envFile('STACK=x\n'), outputs: OUTPUTS }), /incomplete; missing: AWS_REGION/);
    assert.throws(() => loadStackConfig({ envFile: envFile(DEPLOY_ENV), outputs: { SiteUrl: 'https://x' } }), /no output for: .*ApiUrl.*deploy-stack\.sh/);
  });

  test('readStackOutputs asks for the named stack, region and profile only, and reports AWS errors', () => {
    let seen;
    const out = readStackOutputs({ STACK: 's1', AWS_REGION: 'eu-west-2', AWS_PROFILE: 'p' }, (args, env) => {
      seen = { args, profile: env.AWS_PROFILE };
      return 'SiteUrl\thttps://x\nApiUrl\thttps://y\n';
    });
    assert.deepEqual(out, { SiteUrl: 'https://x', ApiUrl: 'https://y' });
    assert.deepEqual(seen.args.slice(0, 6), ['cloudformation', 'describe-stacks', '--stack-name', 's1', '--region', 'eu-west-2']);
    assert.equal(seen.profile, 'p');
    process.env.AWS_PROFILE = 'ambient';
    try {
      readStackOutputs({ STACK: 's1', AWS_REGION: 'r', AWS_PROFILE: '' }, (args, env) => {
        assert.equal(env.AWS_PROFILE, undefined, 'an empty AWS_PROFILE in deploy.env means default credentials, not the terminal\'s');
        return '';
      });
    } finally {
      delete process.env.AWS_PROFILE;
    }
    assert.throws(
      () => readStackOutputs({ STACK: 's1', AWS_REGION: 'r', AWS_PROFILE: '' }, () => { throw Object.assign(new Error('x'), { stderr: 'Stack does not exist' }); }),
      /Could not read the outputs of stack s1 in r: Stack does not exist/,
    );
    assert.deepEqual(parseOutputsText('A\t1\n\nB\tx\ty\n'), { A: '1', B: 'x\ty' });
  });
});

describe('injectSiteConfig', () => {
  const values = { region: 'eu-west-2', userPoolClientId: 'cid', apiUrl: 'https://api.example.com' };

  test('replaces only the config object, whatever it held, and keeps the rest of the file', () => {
    const filled = "// head\nexport const config = {\n  region: 'x', // a } brace\n  userPoolClientId: 'y',\n  apiUrl: 'z',\n};\n\nexport const isConfigured = () => true;\n";
    const empty = "export const config = {\n  region: '',\n  userPoolClientId: '',\n  apiUrl: '',\n};\nexport const isConfigured = () => true;\n";
    for (const source of [filled, empty]) {
      const out = injectSiteConfig(source, values);
      assert.match(out, /region: "eu-west-2",\n  userPoolClientId: "cid",\n  apiUrl: "https:\/\/api\.example\.com",\n};/);
      assert.match(out, /export const isConfigured = \(\) => true;/);
      assert.ok(!out.includes("'x'") && !out.includes('a } brace'));
    }
    assert.ok(injectSiteConfig(filled, values).startsWith('// head\n'));
  });

  test('works on the real app/js/config.js, and the result has the values in the shape the app reads', async () => {
    const { readFileSync } = await import('node:fs');
    const source = readFileSync(new URL('../app/js/config.js', import.meta.url), 'utf8');
    const out = injectSiteConfig(source, values);
    const mod = await import(`data:text/javascript;base64,${Buffer.from(out).toString('base64')}`);
    assert.deepEqual({ ...mod.config }, values);
    assert.equal(mod.isConfigured(), true);
  });

  test('refuses empty values, a non-https API URL, and a file without a config object', () => {
    const source = 'export const config = {\n};\n';
    assert.throws(() => injectSiteConfig(source, { ...values, region: '' }), /region is empty/);
    assert.throws(() => injectSiteConfig(source, { ...values, apiUrl: 'http://x' }), /not an https URL/);
    assert.throws(() => injectSiteConfig(source, { ...values, userPoolClientId: undefined }), /userPoolClientId is empty/);
    assert.throws(() => injectSiteConfig('const x = 1;\n', values), /Cannot find/);
  });
});
