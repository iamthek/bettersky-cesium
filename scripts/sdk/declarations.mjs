import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { parseSync } from 'oxc-parser';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(import.meta.url);

// Parse TypeScript syntax rather than imposing a particular declaration layout.
export function inspectPublicDeclarations(source, path = 'dist/index.d.ts') {
  const { program, comments, errors } = parseSync(path.endsWith('.ts') ? path : `${path}.d.ts`, source);
  const fail = (node, message) => {
    const line = source.slice(0, node.start ?? 0).split('\n').length;
    throw new Error(`${path}:${line}: ${message}`);
  };
  if (errors.length) fail({ start: errors[0].labels?.[0]?.span?.start ?? 0 }, `Invalid public TypeScript: ${errors[0].message}`);
  const parameterName = node => {
    if (node.type === 'Identifier') return node.name;
    if (node.type === 'RestElement') return parameterName(node.argument);
    if (node.type === 'AssignmentPattern') return parameterName(node.left);
    if (node.type === 'TSParameterProperty') return parameterName(node.parameter);
    fail(node, 'Public parameters must have explicit names.');
  };
  const requireDoc = (node, name, parameters = []) => {
    const comment = comments.findLast(item => item.end <= node.start);
    if (!comment || comment.type !== 'Block' || !source.startsWith('/**', comment.start) || source.slice(comment.end, node.start).trim()) fail(node, `Missing JSDoc for ${name}.`);
    const doc = comment.value.slice(1).replace(/^[\t ]*\*[\t ]?/gm, '').trim();
    const sections = doc.split(/\n[\t ]*(?=@[A-Za-z])/);
    if (/^@[A-Za-z]/.test(doc) || !sections[0].trim()) fail(node, `Empty JSDoc description for ${name}.`);
    const documented = new Set();
    for (const section of sections.slice(1)) {
      const parameter = section.match(/^@param[\t ]+(?:\{[^}]+\}[\t ]+)?(\[[^\]\r\n]+\]|[\w$]+)([\s\S]*)$/);
      if (parameter && parameter[2].replace(/^\s*-\s*/, '').trim()) documented.add(parameter[1].replace(/^\[|\]$/g, '').split('=')[0]);
    }
    for (const parameter of parameters.map(parameterName)) if (!documented.has(parameter)) fail(node, `Missing @param description for ${name}.${parameter}.`);
  };
  const inspectMembers = (members, owner) => {
    for (const member of members) {
      const name = member.key?.name ?? member.key?.value ?? (member.type === 'TSConstructSignatureDeclaration' ? 'constructor' : 'call');
      requireDoc(member, `${owner}.${name}`, member.params ?? member.value?.params ?? member.parameters ?? []);
      inspectNested(member.typeAnnotation?.typeAnnotation, `${owner}.${name}`);
    }
  };
  const inspectNested = (node, owner) => {
    if (!node) return;
    if (node.type === 'TSTypeLiteral') inspectMembers(node.members, owner);
    // Union/intersection members can contain documented object shapes too.
    if (node.types) for (const type of node.types) inspectNested(type, owner);
  };
  let declarations = 0;
  for (const statement of program.body) {
    if (statement.type === 'ImportDeclaration' || statement.type === 'ExportDefaultDeclaration') continue;
    const node = statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement;
    if (!node) continue;
    if (node.type === 'VariableDeclaration') {
      for (const item of node.declarations) {
        requireDoc(statement, item.id.name);
        if (!item.id.typeAnnotation) fail(item, 'Public values require explicit types.');
      }
    } else {
      const name = node.id?.name;
      if (!name) fail(node, `Unsupported public declaration: ${node.type}.`);
      requireDoc(statement, name, node.params ?? []);
      if (node.type === 'TSInterfaceDeclaration' || node.type === 'ClassDeclaration') inspectMembers(node.body.body, name);
      if (node.type === 'TSTypeAliasDeclaration') inspectNested(node.typeAnnotation, name);
    }
    declarations++;
  }
  if (!declarations) throw new Error(`${path}: No public declarations.`);
  return { declarations };
}

// Packing/publishing checks the source contract without running the compiler again.
export function validateDeclarationContract(declarations, facade) {
  const omitted = new Set(['start', 'end', 'raw', 'declare', 'exportKind', 'init']);
  const canonical = node => {
    if (Array.isArray(node)) return node.map(canonical);
    if (node === null || typeof node !== 'object') return node;
    return Object.fromEntries(Object.entries(node).filter(([key]) => !omitted.has(key)).map(([key, value]) => [key, canonical(value)]));
  };
  const snapshot = source => {
    const { program, comments, errors } = parseSync('public-api.ts', source);
    if (errors.length) throw new Error(`Invalid public TypeScript: ${errors[0].message}`);
    return {
      body: canonical(program.body.filter(node => !(node.type === 'ImportDeclaration' && node.source.value !== 'cesium'))),
      docs: comments.filter(comment => comment.type === 'Block' && comment.value.startsWith('*'))
        .map(comment => comment.value.slice(1).replace(/^[\t ]*\*[\t ]?/gm, '').replace(/\s+/g, ' ').trim()),
    };
  };
  inspectPublicDeclarations(declarations);
  inspectPublicDeclarations(facade, 'src/index.ts');
  if (!isDeepStrictEqual(snapshot(declarations), snapshot(facade))) throw new Error('Packaged public declarations differ from the reviewed typed API or its JSDoc.');
}

function runTypeScript(cli, configFile) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(process.execPath, [cli, '--project', configFile], { cwd: repoRoot, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', data => { output += data; });
    child.stderr.on('data', data => { output += data; });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolveRun() : reject(new Error(`Public API declaration compilation failed:\n${output.trim()}`)));
  });
}

// Only this explicitly typed facade is emitted. Internal JS/shaders remain opaque.
export async function emitPublicDeclarations() {
  const scratch = await mkdtemp(join(repoRoot, '.sdk-declarations-'));
  try {
    const manifestPath = require.resolve('typescript/package.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    const cli = resolve(dirname(manifestPath), typeof manifest.bin === 'string' ? manifest.bin : manifest.bin.tsc);
    const configFile = join(scratch, 'tsconfig.json');
    await writeFile(configFile, JSON.stringify({
      compilerOptions: {
        target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler', lib: ['ES2022', 'DOM'],
        strict: true, skipLibCheck: false, types: [], allowJs: false, isolatedDeclarations: true,
        declaration: true, emitDeclarationOnly: true, declarationMap: false, removeComments: false,
        noEmitOnError: true, newLine: 'lf', rootDir: join(repoRoot, 'src'), outDir: join(scratch, 'output'),
      },
      files: [join(repoRoot, 'src/index.ts')],
    }, null, 2));
    await runTypeScript(cli, configFile);
    const bytes = await readFile(join(scratch, 'output/index.d.ts'));
    const source = bytes.toString('utf8');
    validateDeclarationContract(source, await readFile(join(repoRoot, 'src/index.ts'), 'utf8'));
    if (/from\s+['"](?:\.|\/)|(?:Library\/|sourceMappingURL|sourceURL)/.test(source)) throw new Error('Internal implementation or mapping path exposed in generated public declarations.');
    return bytes;
  } finally {
    // mkdtemp owns this exact child; never accept a caller-supplied cleanup path.
    const difference = relative(repoRoot, scratch);
    if (difference.startsWith('.sdk-declarations-') && !difference.includes('/') && !difference.includes('\\')) await rm(scratch, { recursive: true, force: true });
  }
}
