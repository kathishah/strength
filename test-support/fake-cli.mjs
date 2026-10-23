// A pretend `aws`, `sam` and `npm` for testing the deployment scripts. The scripts run unchanged; only these programs are swapped in on
// PATH (see aws-sandbox.mjs), so no test can reach a real AWS account.
//
// Every call is appended to the file named by $FAKE_LOG as one JSON line { cmd, args, cwd, profile, snapshot? }. Answers come from the
// scenario file named by $FAKE_SCENARIO (JSON, rewritten when a call changes it, for example creating a user):
//   stack, region        the one stack that exists; describe-stacks and list-stack-resources fail for any other name or region
//   outputs              { OutputKey: value } for that stack, or null if the stack does not exist
//   resources            [[LogicalResourceId, ResourceType], ...]
//   acm                  what `acm list-certificates` prints (a certificate ARN, or "None")
//   configuredRegion     what `aws configure get region` prints (omit for "not set")
//   users                [{ email, sub }]
//   fail                 [{ match, code, message }]: a call whose "<cmd> <args...>" contains `match` prints message to stderr and exits `code`
// Unknown commands exit 99, so a script that starts using a new command shows up as a failing test.

import { appendFileSync, existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const [cmd, ...args] = process.argv.slice(2);
const scenarioFile = process.env.FAKE_SCENARIO;
const scenario = scenarioFile && existsSync(scenarioFile) ? JSON.parse(readFileSync(scenarioFile, 'utf8')) : {};
const saveScenario = () => writeFileSync(scenarioFile, JSON.stringify(scenario));

const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const die = (code, message) => {
  if (message) process.stderr.write(`${message}\n`);
  process.exit(code);
};

const filesUnder = (dir) => {
  const out = [];
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else out.push(relative(dir, p));
    }
  };
  walk(dir);
  return out.sort();
};

const entry = { cmd, args, cwd: process.cwd(), profile: process.env.AWS_PROFILE ?? null };

// `aws s3 sync <dir> ...`: remember what was in the folder and the staged config.js at the time of the call.
if (cmd === 'aws' && args[0] === 's3' && ['sync', 'cp'].includes(args[1]) && existsSync(args[2]) && statSync(args[2]).isDirectory()) {
  entry.snapshot = { files: filesUnder(args[2]) };
  const configJs = join(args[2], 'js/config.js');
  if (existsSync(configJs)) entry.snapshot.config = readFileSync(configJs, 'utf8');
}
// `--cli-input-json file://...`: the file is deleted by the script afterwards, so keep its content.
const inputJson = flag('--cli-input-json');
if (inputJson?.startsWith('file://')) entry.inputJson = JSON.parse(readFileSync(inputJson.slice(7), 'utf8'));
appendFileSync(process.env.FAKE_LOG, `${JSON.stringify(entry)}\n`);

const line = `${cmd} ${args.join(' ')}`;
for (const f of scenario.fail ?? []) if (line.includes(f.match)) die(f.code ?? 1, f.message ?? 'injected failure');

const stackMissing = () => die(254, `An error occurred (ValidationError) when calling the DescribeStacks operation: Stack with id ${flag('--stack-name')} does not exist`);
const stackOk = () => scenario.outputs && flag('--stack-name') === scenario.stack && flag('--region') === scenario.region;

if (cmd === 'aws') {
  const [svc, op] = args;
  if (svc === 'configure' && op === 'get') {
    if (scenario.configuredRegion) console.log(scenario.configuredRegion);
    process.exit(scenario.configuredRegion ? 0 : 1);
  } else if (svc === 'cloudformation' && op === 'describe-stacks') {
    if (!stackOk()) stackMissing();
    for (const [k, v] of Object.entries(scenario.outputs)) console.log(`${k}\t${v}`);
  } else if (svc === 'cloudformation' && op === 'list-stack-resources') {
    if (!stackOk()) stackMissing();
    for (const [id, type] of scenario.resources ?? []) console.log(`${id}\t${type}`);
  } else if (svc === 'cloudformation' && (op === 'delete-stack' || op === 'wait')) {
    // recorded only
  } else if (svc === 'acm' && op === 'list-certificates') {
    console.log(scenario.acm ?? 'None');
  } else if (svc === 'cognito-idp') {
    const username = flag('--username');
    const users = (scenario.users ??= []);
    if (op === 'list-users') {
      console.log(users.map((u) => u.email).join('\t'));
    } else if (op === 'admin-get-user') {
      const u = users.find((x) => x.email.toLowerCase() === username.toLowerCase());
      if (!u) die(254, 'An error occurred (UserNotFoundException) when calling the AdminGetUser operation: User does not exist.');
      if (args.includes('--query')) console.log(u.sub);
      else console.log(JSON.stringify({ Username: u.sub, UserAttributes: [{ Name: 'sub', Value: u.sub }, { Name: 'email', Value: u.email }] }));
    } else if (op === 'admin-create-user') {
      users.push({ email: username, sub: `sub-${users.length + 1}-0000` });
      saveScenario();
    } else if (op === 'admin-set-user-password') {
      // recorded only
    } else {
      die(99, `fake aws: unhandled ${line}`);
    }
  } else if (svc === 's3' && ['sync', 'cp', 'rm'].includes(op)) {
    // recorded only
  } else if (svc === 'cloudfront' && op === 'create-invalidation') {
    console.log('I0TESTINVALIDATION\tInProgress');
  } else {
    die(99, `fake aws: unhandled ${line}`);
  }
} else if (cmd === 'sam') {
  if (!['validate', 'build', 'deploy'].includes(args[0])) die(99, `fake sam: unhandled ${line}`);
} else if (cmd === 'npm') {
  if (args[0] !== 'ci') die(99, `fake npm: unhandled ${line}`);
} else {
  die(99, `fake-cli: unknown program ${cmd}`);
}
