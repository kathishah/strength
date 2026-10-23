// A small CloudFormation-aware YAML reader and evaluator for testing infra/template.yaml without dependencies.
//
// parseTemplate(text) understands the YAML subset the template uses: block mappings and sequences, flow sequences and maps, quoted and
// plain scalars, comments, and the short tags (!Ref, !Sub, !GetAtt, !If, !Not, !Equals, ...), which become { Ref }, { 'Fn::Sub' }, ...
// It is not a general YAML parser: block scalars, anchors and multi-line plain scalars throw.
//
// resolve(node, { params, conditions }) evaluates Ref to parameters, Fn::If / Fn::Not / Fn::Equals and Fn::Sub (resource references
// stay as readable placeholders such as "<Distribution.DomainName>"), and drops AWS::NoValue, the way CloudFormation does.

const fail = (msg) => { throw new Error(`cfn-yaml: ${msg}`); };

// ---- scalars and flow collections ----

function scalar(text) {
  if (/^'.*'$/s.test(text)) return text.slice(1, -1).replaceAll("''", "'");
  if (/^".*"$/s.test(text)) return JSON.parse(text);
  if (text === 'true') return true;
  if (text === 'false') return false;
  if (text === 'null' || text === '~') return null;
  if (/^-?\d+(\.\d+)?$/.test(text)) return Number(text);
  return text;
}

function tagged(tag, value) {
  if (tag === 'Ref') return { Ref: value };
  if (tag === 'GetAtt') {
    if (typeof value !== 'string') return { 'Fn::GetAtt': value };
    const dot = value.indexOf('.');
    return { 'Fn::GetAtt': [value.slice(0, dot), value.slice(dot + 1)] };
  }
  if (tag === 'Condition') return { Condition: value };
  return { [`Fn::${tag}`]: value };
}

// Parses one value that starts at s[pos]; stops at a top-level "," "]" "}" when inFlow. Returns [value, nextPos].
function flowValue(s, pos, inFlow) {
  while (s[pos] === ' ') pos++;
  if (s[pos] === '!') {
    const m = /^!([A-Za-z]+)\s*/.exec(s.slice(pos));
    const [value, next] = flowValue(s, pos + m[0].length, inFlow);
    return [tagged(m[1], value), next];
  }
  if (s[pos] === '[') {
    const items = [];
    pos++;
    for (;;) {
      while (s[pos] === ' ') pos++;
      if (s[pos] === ']') return [items, pos + 1];
      const [v, next] = flowValue(s, pos, true);
      items.push(v);
      pos = next;
      while (s[pos] === ' ') pos++;
      if (s[pos] === ',') pos++;
      else if (s[pos] !== ']') fail(`expected "," or "]" in ${s}`);
    }
  }
  if (s[pos] === '{') {
    const obj = {};
    pos++;
    for (;;) {
      while (s[pos] === ' ') pos++;
      if (s[pos] === '}') return [obj, pos + 1];
      const m = /^([^:,}]+):\s*/.exec(s.slice(pos));
      if (!m) fail(`bad flow mapping in ${s}`);
      const [v, next] = flowValue(s, pos + m[0].length, true);
      obj[scalar(m[1].trim())] = v;
      pos = next;
      while (s[pos] === ' ') pos++;
      if (s[pos] === ',') pos++;
      else if (s[pos] !== '}') fail(`expected "," or "}" in ${s}`);
    }
  }
  if (s[pos] === "'" || s[pos] === '"') {
    const q = s[pos];
    let end = pos + 1;
    while (end < s.length) {
      if (s[end] === q && s[end + 1] === q && q === "'") end += 2;
      else if (s[end] === '\\' && q === '"') end += 2;
      else if (s[end] === q) break;
      else end++;
    }
    return [scalar(s.slice(pos, end + 1)), end + 1];
  }
  let end = pos;
  while (end < s.length && !(inFlow && ',]}'.includes(s[end]))) end++;
  return [scalar(s.slice(pos, end).trim()), end];
}

const inline = (text) => flowValue(text, 0, false)[0];

// ---- block structure ----

function stripComment(line) {
  let q = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === q) q = null;
    } else if (c === "'" || c === '"') {
      if (i === 0 || /[\s:[,{-]/.test(line[i - 1])) q = c;
    } else if (c === '#' && (i === 0 || /\s/.test(line[i - 1]))) {
      return line.slice(0, i);
    }
  }
  return line;
}

export function parseTemplate(text) {
  const lines = [];
  for (const raw of text.split('\n')) {
    const body = stripComment(raw).replace(/\s+$/, '');
    if (body.trim() === '') continue;
    if (/^\s*(\||>)/.test(body) || /:\s+[|>][-+]?$/.test(body)) fail(`block scalars are not supported: ${raw}`);
    lines.push({ indent: body.length - body.trimStart().length, text: body.trim() });
  }
  let i = 0;

  const KEY = /^(.+?):(?:\s+(.*))?$/;

  function block(indent) {
    const line = lines[i];
    if (line.text === '-' || line.text.startsWith('- ')) return sequence(indent);
    if (KEY.test(line.text) && !/^[!['"{]/.test(line.text)) return mapping(indent);
    i++;
    return inline(line.text);
  }

  // The value that follows "key:" or a bare tag at the end of a line: nested lines, or nothing.
  function nested(parentIndent, tag) {
    const next = lines[i];
    if (!next) return tag ? tagged(tag, null) : null;
    const isSeq = next.text === '-' || next.text.startsWith('- ');
    if (next.indent > parentIndent || (next.indent === parentIndent && isSeq && !tag)) {
      const v = block(next.indent);
      return tag ? tagged(tag, v) : v;
    }
    return tag ? tagged(tag, null) : null;
  }

  function mapping(indent) {
    const obj = {};
    while (i < lines.length && lines[i].indent === indent && KEY.test(lines[i].text) && !lines[i].text.startsWith('- ')) {
      const [, key, rest] = KEY.exec(lines[i].text);
      i++;
      if (rest === undefined || rest === '') {
        obj[scalar(key)] = nested(indent);
      } else {
        const tag = /^!([A-Za-z]+)$/.exec(rest);
        obj[scalar(key)] = tag ? nested(indent, tag[1]) : inline(rest);
      }
    }
    return obj;
  }

  function sequence(indent) {
    const items = [];
    while (i < lines.length && lines[i].indent === indent && (lines[i].text === '-' || lines[i].text.startsWith('- '))) {
      const rest = lines[i].text.slice(1).trimStart();
      if (rest === '') {
        i++;
        items.push(nested(indent));
      } else {
        // "- key: value" starts a mapping whose later keys line up under "key".
        const offset = lines[i].text.length - rest.length;
        lines[i] = { indent: indent + offset, text: rest };
        const tag = /^!([A-Za-z]+)$/.exec(rest);
        if (tag) {
          i++;
          items.push(nested(indent, tag[1]));
        } else {
          items.push(block(indent + offset));
        }
      }
    }
    return items;
  }

  const doc = lines.length ? block(lines[0].indent) : {};
  if (i < lines.length) fail(`could not parse line: ${lines[i].text}`);
  return doc;
}

// ---- evaluation ----

export const NO_VALUE = Symbol('AWS::NoValue');

export function resolve(node, ctx) {
  const { params, conditions = {}, stackName = 'test-stack' } = ctx;
  const evalNode = (n) => resolve(n, ctx);
  const truthy = (n) => {
    if (n && typeof n === 'object' && 'Condition' in n) return conditionValue(n.Condition);
    return evalNode(n);
  };
  const conditionValue = (name) => {
    if (!(name in conditions)) fail(`unknown condition ${name}`);
    return truthy(conditions[name]);
  };
  if (Array.isArray(node)) return node.map(evalNode).filter((v) => v !== NO_VALUE);
  if (node === null || typeof node !== 'object') return node;
  const keys = Object.keys(node);
  if (keys.length === 1) {
    const [k] = keys;
    const v = node[k];
    switch (k) {
      case 'Ref':
        if (v === 'AWS::NoValue') return NO_VALUE;
        if (v === 'AWS::StackName') return stackName;
        if (v in params) return params[v];
        return `<${v}>`;
      case 'Condition': return conditionValue(v);
      case 'Fn::If': return conditionValue(v[0]) ? evalNode(v[1]) : evalNode(v[2]);
      case 'Fn::Not': return !truthy(v[0]);
      case 'Fn::And': return v.every(truthy);
      case 'Fn::Or': return v.some(truthy);
      case 'Fn::Equals': return evalNode(v[0]) === evalNode(v[1]);
      case 'Fn::GetAtt': return `<${v.join('.')}>`;
      case 'Fn::Sub': {
        const text = typeof v === 'string' ? v : v[0];
        return text.replace(/\$\{([^}]+)\}/g, (_, name) => {
          if (name === 'AWS::StackName') return stackName;
          if (name in params) return params[name];
          return `<${name}>`;
        });
      }
      default:
    }
  }
  const out = {};
  for (const [k, v] of Object.entries(node)) {
    const r = evalNode(v);
    if (r !== NO_VALUE) out[k] = r;
  }
  return out;
}

// Every resource a node refers to (Ref, GetAtt, Sub variables, DependsOn), for checking the dependency graph.
export function references(node, resourceIds, found = new Set()) {
  if (Array.isArray(node)) {
    node.forEach((n) => references(n, resourceIds, found));
  } else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (k === 'Ref' && typeof v === 'string' && resourceIds.has(v)) found.add(v);
      else if (k === 'Fn::GetAtt' && resourceIds.has(v[0])) found.add(v[0]);
      else if (k === 'Fn::Sub') {
        for (const m of (typeof v === 'string' ? v : v[0]).matchAll(/\$\{([A-Za-z0-9]+)(?:\.[A-Za-z.]+)?\}/g)) if (resourceIds.has(m[1])) found.add(m[1]);
        if (Array.isArray(v)) references(v[1], resourceIds, found);
      } else references(v, resourceIds, found);
    }
  }
  return found;
}
