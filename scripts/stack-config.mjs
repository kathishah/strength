// What the Node scripts (export-data.mjs, post-events.mjs) know about the deployment: private/deploy.env plus that stack's outputs.
// It replaces importing app/js/config.js, which holds no deployment values in the repository. Like the shell scripts (aws-env.sh) it has
// no defaults for a stack, region or domain: a missing or incomplete private/deploy.env is an error with a message, never a guess.
//
//   loadStackConfig()                              reads private/deploy.env, then asks CloudFormation for the stack's outputs
//   loadStackConfig({ envFile, outputs })          tests pass the outputs ({ OutputKey: value }) so nothing calls AWS
//
// Command line (used by scripts/deploy-app.sh):
//   node scripts/stack-config.mjs site-config <file>   rewrites the config object in <file> from AWS_REGION, USER_POOL_CLIENT_ID and
//                                                        API_URL (exported by scripts/aws-env.sh)

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const DEPLOY_ENV_FILE = fileURLToPath(new URL('../private/deploy.env', import.meta.url));

export class StackConfigError extends Error {}

// stack output name -> variable name used by aws-env.sh
export const OUTPUT_VARIABLES = {
  SiteBucketName: 'SITE_BUCKET',
  DistributionId: 'DIST_ID',
  SiteUrl: 'SITE_URL',
  ApiUrl: 'API_URL',
  UserPoolId: 'USER_POOL_ID',
  UserPoolClientId: 'USER_POOL_CLIENT_ID',
  DataBucketName: 'DATA_BUCKET',
};

// KEY=value lines, as init-deploy.sh writes them. Blank lines and # comments are ignored; one pair of quotes around a value is removed.
export function parseDeployEnv(text) {
  const vars = {};
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
    if (!m) continue;
    let value = m[2].trim();
    const quoted = /^(["'])(.*)\1$/.exec(value);
    if (quoted) value = quoted[2];
    else value = value.replace(/\s+#.*$/, '');
    vars[m[1]] = value;
  }
  return vars;
}

// Problems with the settings, as readable fragments; an empty list means the file is complete.
export function deployEnvProblems(vars) {
  const problems = [];
  if (!vars.STACK) problems.push('STACK');
  if (!vars.AWS_REGION) problems.push('AWS_REGION');
  if (vars.DOMAIN && !vars.CERT_ARN) problems.push('CERT_ARN (required with DOMAIN)');
  return problems;
}

export function readDeployEnv(envFile = DEPLOY_ENV_FILE) {
  if (!existsSync(envFile)) {
    throw new StackConfigError('private/deploy.env is missing: no stack is selected. Run scripts/init-deploy.sh to create it.');
  }
  const vars = parseDeployEnv(readFileSync(envFile, 'utf8'));
  const problems = deployEnvProblems(vars);
  if (problems.length > 0) {
    throw new StackConfigError(`private/deploy.env is incomplete; missing: ${problems.join(', ')}. Run scripts/init-deploy.sh to fix it.`);
  }
  return {
    STACK: vars.STACK,
    AWS_REGION: vars.AWS_REGION,
    AWS_PROFILE: vars.AWS_PROFILE ?? '',
    DOMAIN: vars.DOMAIN ?? '',
    CERT_ARN: vars.CERT_ARN ?? '',
    OWNER_SUB: vars.OWNER_SUB ?? '',
  };
}

// "OutputKey<TAB>OutputValue" lines, as `aws ... --output text` prints them.
export function parseOutputsText(text) {
  const outputs = {};
  for (const line of String(text).split(/\r?\n/)) {
    const [key, ...rest] = line.split('\t');
    if (key && rest.length > 0) outputs[key] = rest.join('\t').trim();
  }
  return outputs;
}

// Default way to run the AWS CLI; tests replace it. Returns stdout.
function runAws(args, env) {
  return execFileSync('aws', args, { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

export function readStackOutputs({ STACK, AWS_REGION, AWS_PROFILE }, run = runAws) {
  const env = { ...process.env };
  delete env.AWS_PROFILE;
  if (AWS_PROFILE) env.AWS_PROFILE = AWS_PROFILE;
  const args = ['cloudformation', 'describe-stacks', '--stack-name', STACK, '--region', AWS_REGION,
    '--query', 'Stacks[0].Outputs[].[OutputKey,OutputValue]', '--output', 'text'];
  try {
    return parseOutputsText(run(args, env));
  } catch (err) {
    const detail = String(err.stderr ?? err.message ?? err).trim();
    throw new StackConfigError(
      `Could not read the outputs of stack ${STACK} in ${AWS_REGION}: ${detail}\n` +
      'Check the AWS credentials (AWS_PROFILE in private/deploy.env) and that scripts/deploy-stack.sh has created the stack.',
    );
  }
}

export function loadStackConfig({ envFile = DEPLOY_ENV_FILE, outputs, run } = {}) {
  const env = readDeployEnv(envFile);
  const found = outputs ?? readStackOutputs(env, run);
  const values = {};
  const missing = [];
  for (const [key, name] of Object.entries(OUTPUT_VARIABLES)) {
    if (found[key]) values[name] = found[key];
    else missing.push(key);
  }
  if (missing.length > 0) {
    throw new StackConfigError(`Stack ${env.STACK} in ${env.AWS_REGION} has no output for: ${missing.join(', ')}. Run scripts/deploy-stack.sh.`);
  }
  return {
    ...env,
    ...values,
    // The shape app/js/config.js has, for scripts that talk to Cognito and the API.
    config: { region: env.AWS_REGION, userPoolClientId: values.USER_POOL_CLIENT_ID, apiUrl: values.API_URL },
  };
}

// ---- the deployed copy of app/js/config.js ----

const CONFIG_OBJECT = /export const config = \{[\s\S]*?\n\};?/;

// Returns `source` (the text of app/js/config.js) with its config object replaced by these values; everything else in the file is kept.
export function injectSiteConfig(source, { region, userPoolClientId, apiUrl }) {
  for (const [name, value] of Object.entries({ region, userPoolClientId, apiUrl })) {
    if (typeof value !== 'string' || value === '') throw new StackConfigError(`Cannot write the site config: ${name} is empty.`);
  }
  if (!apiUrl.startsWith('https://')) throw new StackConfigError(`Cannot write the site config: apiUrl is not an https URL (${apiUrl}).`);
  if (!CONFIG_OBJECT.test(source)) throw new StackConfigError('Cannot find "export const config = { ... };" in the config file.');
  const literal = [
    'export const config = {',
    `  region: ${JSON.stringify(region)},`,
    `  userPoolClientId: ${JSON.stringify(userPoolClientId)},`,
    `  apiUrl: ${JSON.stringify(apiUrl)},`,
    '};',
  ].join('\n');
  return source.replace(CONFIG_OBJECT, () => literal);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [command, file] = process.argv.slice(2);
  try {
    if (command !== 'site-config' || !file) throw new StackConfigError('usage: node scripts/stack-config.mjs site-config <file>');
    const updated = injectSiteConfig(readFileSync(file, 'utf8'), {
      region: process.env.AWS_REGION,
      userPoolClientId: process.env.USER_POOL_CLIENT_ID,
      apiUrl: process.env.API_URL,
    });
    writeFileSync(file, updated);
  } catch (err) {
    if (!(err instanceof StackConfigError)) throw err;
    console.error(err.message);
    process.exit(2);
  }
}
