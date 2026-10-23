// The AWS shell scripts, run for real in a throwaway copy of the repository with a fake `aws`, `sam` and `npm` on PATH
// (test-support/aws-sandbox.mjs). Nothing here can reach AWS.
import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
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

const argsOf = (call) => call.args.join(' ');
const ARN = 'arn:aws:acm:us-east-1:123456789012:certificate/11111111-2222-3333-4444-555555555555';
const OWNER = 'a1b2c3d4-0000-4000-8000-000000000001';

test('the fake programs are the only aws, sam and npm the sandbox can reach', () => {
  const sb = sandbox();
  const r = sb.bash('command -v aws sam npm node');
  assert.deepEqual(r.stdout.trim().split('\n'), ['aws', 'sam', 'npm', 'node'].map((n) => sb.path('.fakebin', n)));
  assert.equal(sb.bash('echo "${AWS_PROFILE-}${AWS_ACCESS_KEY_ID-}"').stdout.trim(), '');
});

describe('deploy-stack.sh', () => {
  test('installs the Lambda, validates, builds and deploys with every parameter and a change set to confirm', () => {
    const sb = sandbox({ deployEnv: `${DEPLOY_ENV}AWS_PROFILE=my-profile\nOWNER_SUB=${OWNER}\n` });
    const r = sb.run('deploy-stack.sh');
    assert.equal(r.status, 0, r.output);
    const calls = sb.calls().map((c) => `${c.cmd} ${argsOf(c)}`);
    assert.deepEqual(calls.slice(0, 3), ['npm ci', `sam validate --lint --template-file infra/template.yaml --region ${REGION}`, 'sam build --template-file infra/template.yaml']);
    assert.equal(sb.calls()[0].cwd.endsWith('/lambda/events'), true, 'npm ci runs in lambda/events');
    const deploy = sb.callsMatching('sam deploy')[0];
    assert.equal(deploy.profile, 'my-profile');
    const a = deploy.args;
    assert.equal(a[a.indexOf('--stack-name') + 1], STACK);
    assert.equal(a[a.indexOf('--region') + 1], REGION);
    assert.ok(a.includes('--confirm-changeset'));
    assert.ok(a.includes('--capabilities') && a.includes('CAPABILITY_IAM'));
    // sam needs an empty value quoted; it must see every parameter every time.
    assert.deepEqual(a.slice(a.indexOf('--parameter-overrides') + 1), ['DomainName=""', 'CertificateArn=""', `OwnerSub="${OWNER}"`]);
    assert.equal(sb.callsMatching('describe-stacks').length, 0, 'the stack may not exist yet, so its outputs are not read');
  });

  test('passes the domain and certificate, and notes the empty owner on a first deploy', () => {
    const sb = sandbox({ deployEnv: `${DEPLOY_ENV}DOMAIN=strength.example.com\nCERT_ARN=${ARN}\n` });
    const r = sb.run('deploy-stack.sh');
    assert.equal(r.status, 0, r.output);
    assert.match(r.stdout, /OWNER_SUB is empty/);
    const a = sb.callsMatching('sam deploy')[0].args;
    assert.deepEqual(a.slice(a.indexOf('--parameter-overrides') + 1), ['DomainName="strength.example.com"', `CertificateArn="${ARN}"`, 'OwnerSub=""']);
  });

  test('a failing validate or build stops before anything is deployed', () => {
    for (const match of ['npm ci', 'sam validate', 'sam build']) {
      const sb = sandbox({ scenario: { fail: [{ match, code: 3, message: 'boom' }] } });
      const r = sb.run('deploy-stack.sh');
      assert.notEqual(r.status, 0, match);
      assert.equal(sb.callsMatching('sam deploy').length, 0, match);
    }
  });
});

describe('create-owner.sh', () => {
  const owner = 'me@example.com';

  test('creates the user, sets a permanent PIN from a private file, saves OWNER_SUB and redeploys the stack', () => {
    const sb = sandbox();
    const r = sb.run('create-owner.sh', [owner], { input: '123456\n' });
    assert.equal(r.status, 0, r.output);
    const calls = sb.calls();
    const create = sb.callsMatching('admin-create-user')[0];
    assert.equal(create.args[create.args.indexOf('--user-pool-id') + 1], OUTPUTS.UserPoolId);
    assert.ok(create.args.includes('--message-action') && create.args.includes('SUPPRESS'));
    assert.ok(create.args.includes(`Name=email,Value=${owner}`));

    const setPassword = sb.callsMatching('admin-set-user-password')[0];
    assert.deepEqual(setPassword.inputJson, { UserPoolId: OUTPUTS.UserPoolId, Username: owner, Password: '123456', Permanent: true });
    assert.ok(!calls.some((c) => JSON.stringify(c.args).includes('123456')), 'the PIN is never on a command line');
    assert.ok(!r.output.includes('123456'), 'the PIN is never printed');

    const sub = sb.scenario().users[0].sub;
    assert.match(sb.read('private/deploy.env'), new RegExp(`^OWNER_SUB=${sub}$`, 'm'));
    assert.match(sb.read('private/deploy.env'), new RegExp(`^STACK=${STACK}$`, 'm'));
    const deploy = sb.callsMatching('sam deploy')[0];
    assert.ok(deploy.args.includes(`OwnerSub="${sub}"`), 'the redeploy carries the new owner');
    const order = calls.map((c) => `${c.cmd} ${c.args[0]} ${c.args[1]}`);
    assert.ok(order.findIndex((o) => o.startsWith('sam deploy')) > order.findIndex((o) => o.includes('admin-set-user-password')), 'redeploys after the PIN is set');
  });

  test('is safe to rerun: an existing user only gets a new PIN, and OWNER_SUB is not duplicated', () => {
    const sb = sandbox();
    sb.run('create-owner.sh', [owner], { input: '123456\n' });
    const r = sb.run('create-owner.sh', [owner.toUpperCase()], { input: '654321\n' });
    assert.equal(r.status, 0, r.output);
    assert.match(r.stdout, /User exists/);
    assert.equal(sb.callsMatching('admin-create-user').length, 1);
    assert.equal(sb.callsMatching('admin-set-user-password')[1].inputJson.Password, '654321');
    assert.equal(sb.read('private/deploy.env').split('\n').filter((l) => l.startsWith('OWNER_SUB=')).length, 1);
  });

  test('refuses a pool that already has a different user, and a bad PIN or email, without changing anything', () => {
    const other = sandbox({ scenario: { users: [{ email: 'someone@example.com', sub: 'sub-9' }] } });
    const r = other.run('create-owner.sh', [owner], { input: '123456\n' });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /already has a different user/);
    assert.equal(other.callsMatching('admin-create-user').length, 0);

    const badPin = sandbox();
    for (const pin of ['12345', '1234567', 'abcdef', '']) {
      const p = badPin.run('create-owner.sh', [owner], { input: `${pin}\n` });
      assert.equal(p.status, 1, `pin "${pin}"`);
    }
    assert.equal(badPin.callsMatching('admin-create-user').length, 0);
    assert.equal(badPin.callsMatching('admin-set-user-password').length, 0);
    assert.equal(badPin.read('private/deploy.env'), DEPLOY_ENV);

    for (const bad of [[], ['not-an-email'], ['a@b.com', 'extra']]) {
      assert.equal(sandbox().run('create-owner.sh', bad).status, 2);
    }
  });

  test('does not touch deploy.env or deploy when the password cannot be set', () => {
    const sb = sandbox({ scenario: { fail: [{ match: 'admin-set-user-password', code: 254, message: 'denied' }] } });
    const r = sb.run('create-owner.sh', [owner], { input: '123456\n' });
    assert.notEqual(r.status, 0);
    assert.equal(sb.read('private/deploy.env'), DEPLOY_ENV);
    assert.equal(sb.callsMatching('sam deploy').length, 0);
  });
});

describe('init-deploy.sh', () => {
  const answers = (...lines) => `${lines.join('\n')}\n`;

  test('asks for stack, region, profile and no domain, shows the file, and writes private/deploy.env', () => {
    const sb = sandbox({ deployEnv: null });
    const r = sb.run('init-deploy.sh', [], { input: answers('strength-jo', 'eu-west-2', 'jo-profile', '', 'y') });
    assert.equal(r.status, 0, r.output);
    assert.match(r.stdout, /STACK=strength-jo/);
    assert.equal(sb.read('private/deploy.env').split('\n').filter((l) => !l.startsWith('#')).join('\n'),
      'STACK=strength-jo\nAWS_REGION=eu-west-2\nAWS_PROFILE=jo-profile\nDOMAIN=\nCERT_ARN=\nOWNER_SUB=\n');
    assert.equal(sb.callsMatching('acm').length, 0, 'no certificate lookup without a domain');
  });

  test('suggests strength-<your name> and the configured region, with no built-in defaults', () => {
    const sb = sandbox({ deployEnv: null, scenario: { configuredRegion: 'ap-southeast-2' } });
    const r = sb.run('init-deploy.sh', [], { input: answers('', '', '', '', 'y'), env: { USER: 'x' } });
    assert.match(r.stdout, /Stack name \[strength-[a-z0-9-]+\]/);
    assert.match(r.stdout, /AWS region for the stack \(for example us-west-2\) \[ap-southeast-2\]/);
    assert.equal(r.status, 0, r.output);

    const none = sandbox({ deployEnv: null });
    const blank = none.run('init-deploy.sh', [], { input: answers('strength-a', '') });
    assert.notEqual(blank.status, 0, 'a region is required');
    assert.match(blank.stderr, /does not look like an AWS region/);
    assert.equal(none.exists('private/deploy.env'), false);
  });

  test('with a domain it looks the certificate up in us-east-1 and records it', () => {
    const sb = sandbox({ deployEnv: null, scenario: { acm: ARN } });
    const r = sb.run('init-deploy.sh', [], { input: answers('strength-jo', 'eu-west-2', '', 'strength.example.com', 'y') });
    assert.equal(r.status, 0, r.output);
    const [lookup] = sb.callsMatching('acm list-certificates');
    assert.equal(lookup.args[lookup.args.indexOf('--region') + 1], 'us-east-1');
    assert.match(lookup.args[lookup.args.indexOf('--query') + 1], /strength\.example\.com/);
    assert.match(sb.read('private/deploy.env'), new RegExp(`^DOMAIN=strength\\.example\\.com\\nCERT_ARN=${ARN}$`, 'm'));
  });

  test('with a domain and no issued certificate it explains how to request one and writes nothing', () => {
    const sb = sandbox({ deployEnv: null, scenario: { acm: 'None' } });
    const r = sb.run('init-deploy.sh', [], { input: answers('strength-jo', 'eu-west-2', '', 'strength.example.com', 'y') });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /No issued ACM certificate for strength\.example\.com/);
    assert.match(r.stderr, /us-east-1/);
    assert.equal(sb.exists('private/deploy.env'), false);
  });

  test('asks before overwriting; no leaves the old file, yes replaces it and keeps OWNER_SUB only for the same stack', () => {
    const old = `STACK=strength-jo\nAWS_REGION=eu-west-2\nAWS_PROFILE=\nDOMAIN=\nCERT_ARN=\nOWNER_SUB=${OWNER}\n`;
    const no = sandbox({ deployEnv: old });
    const declined = no.run('init-deploy.sh', [], { input: answers('strength-other', 'eu-west-2', '', '', 'n') });
    assert.equal(declined.status, 0);
    assert.match(declined.stdout, /Overwrite the existing private\/deploy\.env\?/);
    assert.equal(no.read('private/deploy.env'), old);

    const same = sandbox({ deployEnv: old });
    same.run('init-deploy.sh', [], { input: answers('', '', '', '', 'y') }); // accept every offered default
    assert.equal(same.read('private/deploy.env').includes(`OWNER_SUB=${OWNER}`), true);

    const moved = sandbox({ deployEnv: old });
    moved.run('init-deploy.sh', [], { input: answers('strength-other', 'eu-west-2', '', '', 'y') });
    assert.match(moved.read('private/deploy.env'), /^STACK=strength-other$/m);
    assert.match(moved.read('private/deploy.env'), /^OWNER_SUB=$/m, 'another stack has another user pool, so the old owner id is dropped');
  });

  test('rejects names that are not valid', () => {
    for (const input of [answers('1bad', 'eu-west-2'), answers('ok-name', 'eu-west-2', 'bad profile'), answers('ok-name', 'eu-west-2', '', 'Not_A_Host')]) {
      const sb = sandbox({ deployEnv: null });
      assert.equal(sb.run('init-deploy.sh', [], { input }).status, 1, input);
      assert.equal(sb.exists('private/deploy.env'), false);
    }
  });
});

describe('deploy-app.sh', () => {
  const SKIP = ['--skip-tests'];
  const syncs = (sb) => sb.callsMatching('s3 sync');

  test('stages app/ with a config.js from the stack outputs, uploads the staged copy and refreshes CloudFront', () => {
    const sb = sandbox();
    const r = sb.run('deploy-app.sh', SKIP);
    assert.equal(r.status, 0, r.output);

    const [site] = syncs(sb);
    assert.deepEqual(site.args.slice(0, 4), ['s3', 'sync', '.deploy/site', `s3://${OUTPUTS.SiteBucketName}`]);
    assert.ok(site.args.includes('--delete') && site.args.includes('--cache-control'));
    assert.deepEqual(site.snapshot.files, ['css/app.css', 'index.html', 'js/config.js', 'js/main.js', 'manifest.webmanifest', 'sw.js']);
    assert.match(site.snapshot.config, new RegExp(`region: "${REGION}"`));
    assert.match(site.snapshot.config, new RegExp(`userPoolClientId: "${OUTPUTS.UserPoolClientId}"`));
    assert.match(site.snapshot.config, new RegExp(`apiUrl: "${OUTPUTS.ApiUrl}"`));
    assert.ok(site.args.includes('img/*') && site.args[site.args.indexOf('--exclude')] === '--exclude', 'remote images are excluded from --delete');

    assert.equal(sb.read('.deploy/site/js/config.js'), site.snapshot.config);
    assert.notEqual(sb.read('app/js/config.js'), site.snapshot.config, 'the checked-in config is not modified');
    assert.equal(sb.callsMatching('cp .deploy/site/manifest.webmanifest').length, 1);
    const inval = sb.callsMatching('create-invalidation')[0];
    assert.equal(inval.args[inval.args.indexOf('--distribution-id') + 1], OUTPUTS.DistributionId);
    assert.match(r.stdout, new RegExp(`Deployed to ${OUTPUTS.SiteUrl}`));
    assert.equal(syncs(sb).length, 1, 'no image sync without --include-images');
  });

  test('runs the tests first and does not upload when they fail', () => {
    const sb = sandbox();
    sb.write('test/fail.test.mjs', "import { test } from 'node:test';\ntest('fails', () => { throw new Error('no'); });\n");
    const r = sb.run('deploy-app.sh', []);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /Tests failed: not deploying/);
    assert.equal(sb.callsMatching('s3 ').length, 0);
    assert.equal(sb.exists('.deploy'), false);

    const ok = sandbox();
    const passed = ok.run('deploy-app.sh', []);
    assert.equal(passed.status, 0, passed.output);
    assert.match(passed.stdout, /Tests pass/);
  });

  test('--dry-run only lists: --dryrun on every sync, no upload, no invalidation, no tests', () => {
    const sb = sandbox({ images: ['a.gif'] });
    sb.write('test/fail.test.mjs', "import { test } from 'node:test';\ntest('fails', () => { throw new Error('no'); });\n");
    const r = sb.run('deploy-app.sh', ['--dry-run', '--include-images']);
    assert.equal(r.status, 0, r.output);
    assert.equal(syncs(sb).length, 2);
    for (const c of syncs(sb)) assert.ok(c.args.includes('--dryrun'), argsOf(c));
    assert.equal(sb.callsMatching('s3 cp').length, 0);
    assert.equal(sb.callsMatching('s3 rm').length, 0);
    assert.equal(sb.callsMatching('create-invalidation').length, 0);
    assert.ok(sb.calls().every((c) => !/s3 (cp|mv)/.test(`${c.cmd} ${argsOf(c)}`)), 'nothing is downloaded or copied');
    assert.match(r.stdout, /Dry run: nothing is downloaded, uploaded, or deleted/);
  });

  test('without --include-images the images already on the site are left alone, even when app/img exists', () => {
    const sb = sandbox({ images: ['a.gif', 'b.gif'] });
    const r = sb.run('deploy-app.sh', SKIP);
    assert.equal(r.status, 0, r.output);
    assert.equal(syncs(sb).length, 1);
    assert.ok(!syncs(sb)[0].snapshot.files.some((f) => f.startsWith('img/')));
    assert.match(r.stdout, /Leaving the images on the site as they are/);
  });

  test('--include-images makes the site\'s img/ match local app/img/, deletions included', () => {
    const sb = sandbox({ images: ['a.gif', 'b.gif'] });
    const r = sb.run('deploy-app.sh', [...SKIP, '--include-images']);
    assert.equal(r.status, 0, r.output);
    const [site, img] = syncs(sb);
    assert.ok(site.args.includes('img/*') && site.args[site.args.indexOf('img/*') - 1] === '--exclude', 'the main sync leaves img/ to the image sync');
    assert.deepEqual(img.args.slice(0, 4), ['s3', 'sync', '.deploy/site/img', `s3://${OUTPUTS.SiteBucketName}/img`]);
    assert.ok(img.args.includes('--delete'));
    assert.deepEqual(img.snapshot.files, ['a.gif', 'b.gif']);
    assert.ok(img.args.includes('public, max-age=604800'));
  });

  test('--include-images with a missing or empty app/img skips the image sync and deletes nothing', () => {
    for (const images of [null, []]) {
      const sb = sandbox({ images });
      const r = sb.run('deploy-app.sh', [...SKIP, '--include-images']);
      assert.equal(r.status, 0, r.output);
      assert.match(r.stdout, /skipping the image sync/);
      assert.equal(syncs(sb).length, 1);
      assert.ok(syncs(sb).every((c) => !argsOf(c).includes('/img')), 'no sync touches the remote img/ folder');
    }
  });

  test('a failure before the upload (staging, config, stack lookup) leaves the site and its images untouched', () => {
    // The stack lookup fails.
    const gone = sandbox({ scenario: { outputs: null }, images: ['a.gif'] });
    assert.notEqual(gone.run('deploy-app.sh', [...SKIP, '--include-images']).status, 0);
    assert.equal(gone.callsMatching('s3 ').length, 0);

    // A config.js the script cannot write values into.
    const odd = sandbox({ images: ['a.gif'] });
    odd.write('app/js/config.js', 'export const nothing = 1;\n');
    const r = odd.run('deploy-app.sh', [...SKIP, '--include-images']);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /Cannot find "export const config/);
    assert.equal(odd.callsMatching('s3 ').length, 0);
    assert.equal(odd.callsMatching('create-invalidation').length, 0);

    // The site upload itself fails: the image sync (and its --delete) never starts.
    const failing = sandbox({ images: ['a.gif'], scenario: { fail: [{ match: 's3 sync .deploy/site s3', code: 1, message: 'upload failed' }] } });
    assert.notEqual(failing.run('deploy-app.sh', [...SKIP, '--include-images']).status, 0);
    assert.equal(syncs(failing).length, 1);
    assert.equal(failing.callsMatching('create-invalidation').length, 0);
  });

  test('uses the profile from deploy.env for every aws call', () => {
    const sb = sandbox({ deployEnv: `${DEPLOY_ENV}AWS_PROFILE=deployer\n` });
    assert.equal(sb.run('deploy-app.sh', SKIP).status, 0);
    assert.ok(sb.calls().every((c) => c.profile === 'deployer'));
  });

  test('--help and unknown options', () => {
    const sb = sandbox({ deployEnv: null });
    const help = sb.run('deploy-app.sh', ['--help']);
    assert.equal(help.status, 0);
    assert.match(help.stdout, /--include-images/);
    assert.match(help.stdout, /private\/deploy\.env/);
    assert.equal(sb.run('deploy-app.sh', ['--nope']).status, 2);
  });
});

describe('teardown.sh', () => {
  const RESOURCES = [
    ['SiteBucket', 'AWS::S3::Bucket'], ['Distribution', 'AWS::CloudFront::Distribution'], ['HttpApi', 'AWS::ApiGatewayV2::Api'],
    ['DataBucket', 'AWS::S3::Bucket'], ['DataBucketPolicy', 'AWS::S3::BucketPolicy'], ['UserPool', 'AWS::Cognito::UserPool'],
  ];
  const stubExport = (sb, exitCode = 0) => sb.write('scripts/export-data.mjs',
    `import { appendFileSync } from 'node:fs';\nappendFileSync(process.env.FAKE_LOG, JSON.stringify({ cmd: 'export-data', args: process.argv.slice(2) }) + '\\n');\nprocess.exit(${exitCode});\n`);

  test('shows what is deleted and what is kept, then needs the typed stack name; anything else cancels', () => {
    const sb = sandbox({ scenario: { resources: RESOURCES } });
    const r = sb.run('teardown.sh', [], { input: 'yes\n' });
    assert.equal(r.status, 1);
    assert.match(r.stdout, new RegExp(`Stack:  ${STACK}`));
    assert.match(r.stdout, new RegExp(`Region: ${REGION}`));
    assert.match(r.stdout, /SiteBucket \(AWS::S3::Bucket\)/);
    assert.match(r.stdout, /Distribution \(AWS::CloudFront::Distribution\)/);
    const [deleted, kept] = r.stdout.split('These are kept');
    assert.ok(!/DataBucket|UserPool/.test(deleted.replace(OUTPUTS.DataBucketName, '')), 'retained resources are not listed as deleted');
    assert.match(kept, new RegExp(OUTPUTS.DataBucketName));
    assert.match(kept, new RegExp(OUTPUTS.UserPoolId));
    assert.match(r.stdout, /Cancelled\. Nothing was deleted/);
    assert.equal(sb.callsMatching('s3 rm').length + sb.callsMatching('delete-stack').length, 0);
  });

  test('offers the export first, then empties the site bucket and deletes the stack, and lists what remains', () => {
    const sb = sandbox({ scenario: { resources: RESOURCES } });
    stubExport(sb);
    const r = sb.run('teardown.sh', [], { input: `${STACK}\ny\nme@example.com\n` });
    assert.equal(r.status, 0, r.output);
    const names = sb.calls().map((c) => (c.cmd === 'export-data' ? 'export' : `${c.args[0]} ${c.args[1]}`)).filter((n) => !n.startsWith('cloudformation describe') && !n.startsWith('cloudformation list'));
    assert.deepEqual(names, ['export', 's3 rm', 'cloudformation delete-stack', 'cloudformation wait']);
    assert.deepEqual(sb.calls().find((c) => c.cmd === 'export-data').args, ['me@example.com']);
    assert.deepEqual(sb.callsMatching('s3 rm')[0].args.slice(0, 3), ['s3', 'rm', `s3://${OUTPUTS.SiteBucketName}`]);
    const del = sb.callsMatching('delete-stack')[0];
    assert.equal(del.args[del.args.indexOf('--stack-name') + 1], STACK);
    assert.match(r.stdout, new RegExp(`data bucket ${OUTPUTS.DataBucketName}`));
    assert.match(r.stdout, new RegExp(`user pool   ${OUTPUTS.UserPoolId}`));
  });

  test('a failed export stops before anything is deleted; declining the export deletes without it', () => {
    const failed = sandbox({ scenario: { resources: RESOURCES } });
    stubExport(failed, 1);
    const r = failed.run('teardown.sh', [], { input: `${STACK}\ny\nme@example.com\n` });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /export did not finish/);
    assert.equal(failed.callsMatching('s3 rm').length + failed.callsMatching('delete-stack').length, 0);

    const skipped = sandbox({ scenario: { resources: RESOURCES } });
    stubExport(skipped);
    const s = skipped.run('teardown.sh', [], { input: `${STACK}\nn\n` });
    assert.equal(s.status, 0, s.output);
    assert.equal(skipped.calls().filter((c) => c.cmd === 'export-data').length, 0);
    assert.equal(skipped.callsMatching('delete-stack').length, 1);
  });

  test('only ever acts on the stack in deploy.env', () => {
    const sb = sandbox({ scenario: { resources: RESOURCES } });
    stubExport(sb);
    sb.run('teardown.sh', [], { input: `${STACK}\nn\n` });
    for (const c of sb.calls().filter((x) => x.args.includes('--stack-name'))) {
      assert.equal(c.args[c.args.indexOf('--stack-name') + 1], STACK);
    }
    // Typing a different stack name does not select it.
    const other = sandbox({ scenario: { resources: RESOURCES } });
    assert.equal(other.run('teardown.sh', [], { input: 'strength-someone-else\n' }).status, 1);
    assert.equal(other.callsMatching('delete-stack').length, 0);
  });
});

describe('shell hygiene', () => {
  const scripts = ['aws-env.sh', 'init-deploy.sh', 'deploy-stack.sh', 'create-owner.sh', 'deploy-app.sh', 'teardown.sh'];
  test('every script parses with bash -n and is executable (except the sourced aws-env.sh)', () => {
    const sb = sandbox();
    for (const name of scripts) {
      execFileSync('bash', ['-n', sb.path('scripts', name)]);
    }
    for (const name of scripts.slice(1)) {
      const out = execFileSync('ls', ['-l', sb.path('scripts', name)], { encoding: 'utf8' });
      assert.match(out, /^-rwx/, name);
    }
  });

  test('aws-env.sh works when sourced from zsh (the macOS default shell), if zsh is installed', (t) => {
    try {
      execFileSync('zsh', ['-c', 'true']);
    } catch {
      t.skip('zsh is not installed');
      return;
    }
    const sb = sandbox();
    const r = execFileSync('zsh', ['-c', `cd /tmp && source "${sb.path('scripts/aws-env.sh')}" >/dev/null && echo "$STACK $SITE_BUCKET"`], {
      encoding: 'utf8', env: { PATH: `${sb.path('.fakebin')}:/usr/bin:/bin`, HOME: sb.path('.home'), FAKE_LOG: sb.path('.fake.log'), FAKE_SCENARIO: sb.path('.fake.scenario.json') },
    });
    assert.equal(r.trim(), `${STACK} ${OUTPUTS.SiteBucketName}`);
  });
});
