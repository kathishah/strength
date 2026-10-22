// infra/template.yaml, read with the inline CloudFormation-aware parser in test-support/cfn-yaml.mjs. This guards the self-hosting
// design (docs/SHOWCASE-AND-SELF-HOST-SPEC.md section 5): an optional domain, per-stack names, and CORS without a second deploy.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NO_VALUE, parseTemplate, references, resolve } from '../test-support/cfn-yaml.mjs';

const text = readFileSync(new URL('../infra/template.yaml', import.meta.url), 'utf8');
const tpl = parseTemplate(text);

const ARN = 'arn:aws:acm:us-east-1:123456789012:certificate/11111111-2222-3333-4444-555555555555';
const NO_DOMAIN = { DomainName: '', CertificateArn: '', OwnerSub: '' };
const WITH_DOMAIN = { DomainName: 'strength.example.com', CertificateArn: ARN, OwnerSub: 'sub-1' };

const at = (params, node) => resolve(node, { params, conditions: tpl.Conditions, stackName: 'strength-jo' });
const distribution = (params) => at(params, tpl.Resources.Distribution.Properties.DistributionConfig);
const corsOrigins = (params) => at(params, tpl.Resources.HttpApi.Properties.CorsConfiguration.AllowOrigins);
const output = (params, name) => at(params, tpl.Outputs[name].Value);

// CloudFormation rules: an assertion only applies when the rule condition holds.
function ruleViolations(params) {
  const bad = [];
  for (const [name, rule] of Object.entries(tpl.Rules ?? {})) {
    if (rule.RuleCondition && !resolve(rule.RuleCondition, { params, conditions: tpl.Conditions })) continue;
    for (const a of rule.Assertions) if (!resolve(a.Assert, { params, conditions: tpl.Conditions })) bad.push(`${name}: ${a.AssertDescription}`);
  }
  return bad;
}

describe('the template parses', () => {
  test('the reader understands the template (sanity check of the inline parser)', () => {
    assert.equal(tpl.Transform, 'AWS::Serverless-2016-10-31');
    assert.deepEqual(tpl.Resources.SiteBucketPolicy.Properties.Bucket, { Ref: 'SiteBucket' });
    assert.deepEqual(tpl.Resources.SiteBucketPolicy.Properties.PolicyDocument.Statement[0].Resource, { 'Fn::Sub': '${SiteBucket.Arn}/*' });
    assert.deepEqual(tpl.Resources.EventsFunction.Properties.Policies[0].Statement[1].Condition, { StringLike: { 's3:prefix': 'u/*' } });
    assert.equal(tpl.Resources.UserPool.DeletionPolicy, 'Retain');
    assert.deepEqual(Object.keys(tpl.Parameters), ['DomainName', 'CertificateArn', 'OwnerSub']);
  });

  test('the description names no single production stack and no DNS provider', () => {
    assert.ok(tpl.Description.length > 20);
    assert.doesNotMatch(tpl.Description, /prod|GoDaddy|single/i);
    assert.doesNotMatch(text, /GoDaddy|logbook\.me|strength-prod/i);
  });
});

describe('parameters', () => {
  test('DomainName and CertificateArn default to empty and accept empty or a valid value only', () => {
    const { DomainName, CertificateArn } = tpl.Parameters;
    assert.equal(DomainName.Default, '');
    assert.equal(CertificateArn.Default, '');
    const domain = new RegExp(DomainName.AllowedPattern);
    for (const ok of ['', 'strength.example.com', 'a.b.example.co.uk']) assert.ok(domain.test(ok), ok);
    for (const bad of ['http://x.com', 'Strength.Example.com', 'nodots', 'has space.example.com', '-a.example.com']) assert.ok(!domain.test(bad), bad);
    const cert = new RegExp(CertificateArn.AllowedPattern);
    assert.ok(cert.test('') && cert.test(ARN));
    for (const bad of ['arn:aws:acm:us-west-2:123456789012:certificate/abc', 'not-an-arn', 'arn:aws:acm:us-east-1:12345:certificate/abc']) {
      assert.ok(!cert.test(bad), bad);
    }
  });

  test('OwnerSub still defaults to empty, so a first deploy works and the Lambda answers 403 until it is set', () => {
    assert.equal(tpl.Parameters.OwnerSub.Default, '');
    assert.deepEqual(tpl.Resources.EventsFunction.Properties.Environment.Variables.OWNER_SUB, { Ref: 'OwnerSub' });
  });

  test('every parameter has a default, so a deploy that passes none still validates', () => {
    for (const [name, p] of Object.entries(tpl.Parameters)) assert.ok('Default' in p, name);
  });
});

describe('HasDomain', () => {
  test('is true exactly when DomainName is set', () => {
    assert.equal(resolve({ Condition: 'HasDomain' }, { params: NO_DOMAIN, conditions: tpl.Conditions }), false);
    assert.equal(resolve({ Condition: 'HasDomain' }, { params: WITH_DOMAIN, conditions: tpl.Conditions }), true);
    assert.equal(resolve({ Condition: 'HasDomain' }, { params: { ...WITH_DOMAIN, CertificateArn: '' }, conditions: tpl.Conditions }), true);
  });

  test('a rule requires CertificateArn whenever DomainName is set, and nothing when it is not', () => {
    assert.deepEqual(ruleViolations(NO_DOMAIN), []);
    assert.deepEqual(ruleViolations({ ...NO_DOMAIN, CertificateArn: ARN }), []);
    assert.deepEqual(ruleViolations(WITH_DOMAIN), []);
    const missing = ruleViolations({ ...WITH_DOMAIN, CertificateArn: '' });
    assert.equal(missing.length, 1);
    assert.match(missing[0], /CertificateArn is required when DomainName is set/);
  });
});

describe('CloudFront distribution', () => {
  test('without a domain it has no alias and uses the CloudFront certificate and address', () => {
    const d = distribution(NO_DOMAIN);
    assert.equal('Aliases' in d, false);
    assert.deepEqual(d.ViewerCertificate, { CloudFrontDefaultCertificate: true });
  });

  test('with a domain it has the alias and the ACM certificate', () => {
    const d = distribution(WITH_DOMAIN);
    assert.deepEqual(d.Aliases, ['strength.example.com']);
    assert.deepEqual(d.ViewerCertificate, { AcmCertificateArn: ARN, SslSupportMethod: 'sni-only', MinimumProtocolVersion: 'TLSv1.2_2021' });
  });

  test('the rest of the distribution does not depend on the domain', () => {
    const { Aliases, ViewerCertificate, ...a } = distribution(NO_DOMAIN); // eslint-disable-line no-unused-vars
    const { Aliases: A2, ViewerCertificate: V2, ...b } = distribution(WITH_DOMAIN); // eslint-disable-line no-unused-vars
    assert.deepEqual(a, b);
  });
});

describe('API CORS origins', () => {
  test('always include the CloudFront address; the custom domain is added only with a domain', () => {
    assert.deepEqual(corsOrigins(NO_DOMAIN), ['https://<Distribution.DomainName>']);
    assert.deepEqual(corsOrigins(WITH_DOMAIN), ['https://<Distribution.DomainName>', 'https://strength.example.com']);
  });

  test('allow no other origin, in particular not localhost, and only the methods and headers the app uses', () => {
    const cors = tpl.Resources.HttpApi.Properties.CorsConfiguration;
    assert.deepEqual(cors.AllowMethods, ['GET', 'POST', 'OPTIONS']);
    assert.deepEqual(cors.AllowHeaders, ['Authorization', 'Content-Type']);
    assert.ok(!JSON.stringify(corsOrigins(WITH_DOMAIN)).includes('localhost'));
    assert.ok(!JSON.stringify(corsOrigins(WITH_DOMAIN)).includes('*'));
  });
});

describe('dependencies', () => {
  const ids = new Set(Object.keys(tpl.Resources));
  const graph = new Map(Object.entries(tpl.Resources).map(([id, r]) => {
    const deps = references(r, ids);
    for (const d of [r.DependsOn ?? []].flat()) deps.add(d);
    deps.delete(id);
    return [id, deps];
  }));
  const reaches = (from, to, seen = new Set()) => {
    if (from === to) return true;
    if (seen.has(from)) return false;
    seen.add(from);
    return [...graph.get(from)].some((n) => reaches(n, to, seen));
  };

  test('the distribution does not depend on the API or the Lambda, so the API can use its address in the same deploy', () => {
    for (const later of ['HttpApi', 'EventsFunction', 'UserPool', 'UserPoolClient', 'DataBucket']) {
      assert.equal(reaches('Distribution', later), false, `Distribution reaches ${later}`);
    }
    assert.ok(graph.get('HttpApi').has('Distribution'), 'the API refers to the distribution for CORS');
  });

  test('there is no dependency cycle', () => {
    const state = new Map();
    const visit = (id, path) => {
      if (state.get(id) === 'done') return;
      assert.notEqual(state.get(id), 'active', `cycle: ${[...path, id].join(' -> ')}`);
      state.set(id, 'active');
      for (const n of graph.get(id)) visit(n, [...path, id]);
      state.set(id, 'done');
    };
    for (const id of ids) visit(id, []);
  });
});

describe('outputs', () => {
  test('SiteUrl is the custom domain with a domain, otherwise the CloudFront address', () => {
    assert.equal(output(NO_DOMAIN, 'SiteUrl'), 'https://<Distribution.DomainName>');
    assert.equal(output(WITH_DOMAIN, 'SiteUrl'), 'https://strength.example.com');
  });

  test('the outputs the scripts read exist (scripts/stack-config.mjs, scripts/aws-env.sh)', async () => {
    const { OUTPUT_VARIABLES } = await import('../scripts/stack-config.mjs');
    for (const name of Object.keys(OUTPUT_VARIABLES)) assert.ok(name in tpl.Outputs, name);
    assert.ok('CloudFrontDomain' in tpl.Outputs);
  });
});

describe('resource names come from the stack name', () => {
  const NAME_PROPERTIES = ['Name', 'UserPoolName', 'ClientName', 'LogGroupName', 'FunctionName', 'BucketName', 'RoleName', 'TableName'];

  test('every explicitly named resource includes AWS::StackName, so several stacks can share an account', () => {
    const named = [];
    const walk = (node, resourceId) => {
      if (Array.isArray(node)) {
        node.forEach((n) => walk(n, resourceId));
      } else if (node && typeof node === 'object') {
        for (const [k, v] of Object.entries(node)) {
          if (k === 'AccountRecoverySetting') continue; // its "Name: admin_only" is a mechanism, not a resource name
          if (NAME_PROPERTIES.includes(k)) named.push([resourceId, k, v]);
          walk(v, resourceId);
        }
      }
    };
    for (const [id, r] of Object.entries(tpl.Resources)) walk(r.Properties, id);
    assert.deepEqual(named.map(([id, key]) => `${id}.${key}`).sort(), [
      'EventsLogGroup.LogGroupName', 'SecurityHeadersPolicy.Name', 'SiteOriginAccessControl.Name', 'UserPool.UserPoolName', 'UserPoolClient.ClientName',
    ]);
    for (const [id, key, value] of named) {
      assert.ok(value && typeof value['Fn::Sub'] === 'string' && value['Fn::Sub'].includes('${AWS::StackName}'), `${id}.${key} is not derived from the stack name`);
    }
  });

  test('the bucket and the Lambda are unnamed, so CloudFormation derives their names from the stack', () => {
    for (const id of ['SiteBucket', 'DataBucket', 'EventsFunction']) {
      assert.ok(!('BucketName' in tpl.Resources[id].Properties) && !('FunctionName' in tpl.Resources[id].Properties), id);
    }
  });

  test('no literal deployment name appears anywhere', () => {
    assert.doesNotMatch(text, /strength-prod|recomp/i);
  });
});

describe('data survives a stack delete', () => {
  test('the resources scripts/teardown.sh says are kept are exactly the ones the template retains', () => {
    const retained = Object.entries(tpl.Resources).filter(([, r]) => r.DeletionPolicy === 'Retain').map(([id]) => id).sort();
    const script = readFileSync(new URL('../scripts/teardown.sh', import.meta.url), 'utf8');
    const listed = /RETAINED_RESOURCES="([^"]*)"/.exec(script)[1].split(' ').filter(Boolean).sort();
    assert.deepEqual(listed, retained);
    assert.deepEqual(retained, ['DataBucket', 'DataBucketPolicy', 'UserPool']);
    for (const id of retained) assert.equal(tpl.Resources[id].UpdateReplacePolicy, 'Retain', id);
  });

  test('the user pool allows no self-signup, and the PIN policy is unchanged', () => {
    const pool = tpl.Resources.UserPool.Properties;
    assert.equal(pool.AdminCreateUserConfig.AllowAdminCreateUserOnly, true);
    assert.equal(pool.Policies.PasswordPolicy.MinimumLength, 6);
  });
});

test('NO_VALUE is dropped from lists and objects the way CloudFormation does', () => {
  assert.deepEqual(resolve([1, { Ref: 'AWS::NoValue' }, 2], { params: {} }), [1, 2]);
  assert.deepEqual(resolve({ a: { Ref: 'AWS::NoValue' }, b: 1 }, { params: {} }), { b: 1 });
  assert.equal(typeof NO_VALUE, 'symbol');
});
