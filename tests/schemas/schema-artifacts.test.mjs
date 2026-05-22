import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import test from 'node:test';
import {
  completeCli,
  createCompletionPayload,
  createHelpDocument,
  defineCli,
  describeCli,
  parseCli,
  resolveCliConfig,
  runCli,
  validateCli
} from '../../dist/index.js';
import {
  createCompletionCommand,
  createCompletionInstallPlan,
  createCompletionRequest,
  createCompletionScript
} from '../../dist/completion/index.js';
import {
  createMemoryConfigDiscoveryHost,
  discoverCliConfigInput
} from '../../dist/config/index.js';
import {
  applyCliEffects,
  createMemoryEffectHost
} from '../../dist/effects/index.js';
import { createVersionDocument } from '../../dist/help/index.js';
import {
  applyCliPluginCommands,
  defineCliPluginManifest
} from '../../dist/plugins/index.js';
import { suggestRepairs } from '../../dist/repair/index.js';
import {
  createCliFailureEnvelope,
  createCliSchemaEnvelope,
  createUnsupportedSchemaDiagnostic,
  describeCliSchemas,
  redactCliSecretsWithReport
} from '../../dist/schema/index.js';

const execFileAsync = promisify(execFile);
const repoRoot = new URL('../..', import.meta.url);

test('schema artifact index matches the public schema registry', async () => {
  const index = await readJson(new URL('../../schemas/index.json', import.meta.url));
  const registry = new Map(describeCliSchemas().map((schema) => [schema.name, schema.version]));
  const paths = new Set();

  assert.equal(index.schemaIndexVersion, 'cli-core.schema-artifacts.v1');
  assert.equal(index.artifacts.length, registry.size);

  for (const artifact of index.artifacts) {
    assert.equal(registry.get(artifact.name), artifact.version);
    assert.equal(paths.has(artifact.path), false);
    paths.add(artifact.path);

    const schema = await readSchema(artifact.path);
    assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
    assert.equal(typeof schema.$id, 'string');
    assert.match(schema.$id, /^urn:ismail-elkorchi:cli-core:schema:/);
    assert.equal(typeof schema.title, 'string');
    assert.ok(schema.title.includes('cli-core'));
  }
});

test('current public outputs validate against shipped schema artifacts', async () => {
  const samples = await createPublicSamples();
  const index = await readJson(new URL('../../schemas/index.json', import.meta.url));

  for (const artifact of index.artifacts) {
    const schema = await readSchema(artifact.path);
    const sample = samples.get(artifact.name);
    assert.notEqual(sample, undefined, `missing sample for ${artifact.name}`);
    const errors = validateJsonSchema(schema, toJsonValue(sample));
    assert.deepEqual(errors, [], `${artifact.path} rejected the current ${artifact.name} output`);
  }
});

test('npm pack dry-run includes concrete schema artifacts', async () => {
  const index = await readJson(new URL('../../schemas/index.json', import.meta.url));
  const { stdout } = await execFileAsync('npm', ['pack', '--dry-run', '--json'], {
    cwd: fileURLToPath(repoRoot)
  });
  const [pack] = JSON.parse(stdout);
  const packedFiles = new Set(pack.files.map((file) => file.path));

  assert.equal(packedFiles.has('schemas/index.json'), true);
  for (const artifact of index.artifacts) {
    assert.equal(packedFiles.has(`schemas/${artifact.path.slice(2)}`), true, artifact.path);
  }
});

async function createPublicSamples() {
  const program = defineCli({
    name: 'ship',
    version: '2.0.0',
    description: 'Deployment command.',
    config: {
      version: '2',
      fields: [
        { name: 'profile', type: 'string', default: 'default', env: 'SHIP_PROFILE' },
        { name: 'dryRun', type: 'boolean', default: false }
      ],
      migrations: [{ from: '1', to: '2', rename: { environment: 'profile' } }]
    },
    options: [{ name: 'verbose', type: 'boolean', flags: ['--verbose'] }],
    commands: [
      {
        name: 'deploy',
        aliases: ['d'],
        description: 'Deploy a service.',
        positionals: [{ name: 'service', required: true }],
        options: [{ name: 'region', type: 'string', flags: ['--region'] }],
        allowPassThrough: true
      }
    ]
  });
  const plugin = defineCliPluginManifest({
    name: 'ship-audit',
    version: '1.0.0',
    capabilities: ['audit'],
    commands: [{ name: 'audit', aliases: ['a'], description: 'Inspect deployment history.' }]
  });
  const application = applyCliPluginCommands(program, [plugin], { allowedCapabilities: ['audit'] });
  const extendedProgram = application.program;
  const invocation = parseCli(extendedProgram, { argv: ['deploy', '--region', 'eu', 'api'] });
  const validation = await validateCli(extendedProgram, invocation);
  const help = createHelpDocument(extendedProgram);
  const version = createVersionDocument(extendedProgram);
  const manifest = describeCli(extendedProgram);
  const memoryConfig = createMemoryConfigDiscoveryHost({
    files: { '/workspace/.shiprc.json': { version: '1', values: { environment: 'file' } } },
    env: { SHIP_PROFILE: 'env' }
  });
  const discovered = await discoverCliConfigInput(extendedProgram, {
    host: memoryConfig.host,
    scope: 'cwd_only',
    cwd: '/workspace',
    filenames: ['.shiprc.json'],
    environment: { includeConfigFields: true }
  });
  const config = resolveCliConfig(extendedProgram, { ...discovered.input, argv: { profile: 'cli' } });
  const completion = createCompletionPayload(extendedProgram, { word: 'a' });
  const completionRequest = createCompletionRequest({ words: ['ship', '__complete', 'deploy', '--r'] });
  const completionResponse = completeCli(extendedProgram, completionRequest);
  const completionCommand = createCompletionCommand(extendedProgram);
  const completionScript = createCompletionScript(extendedProgram, 'bash');
  const completionInstallPlan = createCompletionInstallPlan(extendedProgram, 'fish');
  const unknown = parseCli(extendedProgram, { argv: ['deply'] });
  const repairs = suggestRepairs(unknown, extendedProgram);
  const run = await runCli(extendedProgram, {
    mode: 'apply',
    invocation,
    effects: [{ kind: 'spawn', command: 'ship', argv: ['deploy', 'api'], env: { SHIP_TOKEN: 'abc123' } }],
    handlers: {
      deploy: () => ({
        artifacts: [{ id: 'deploy-summary', kind: 'json', payload: { service: 'api' } }],
        effects: [{ kind: 'write_file', path: 'deploy.json', content: '{"ok":true}' }]
      })
    }
  });
  const memoryEffect = createMemoryEffectHost();
  const effectReport = await applyCliEffects({
    effects: [{ kind: 'write_file', path: 'deploy.json', content: '{"ok":true}' }],
    host: memoryEffect.host,
    policy: { allowWriteFile: true }
  });
  const diagnostic = createUnsupportedSchemaDiagnostic('cli-core.old.v1');
  const envelope = createCliSchemaEnvelope({ payloadSchemaVersion: run.schemaVersion, payload: run });
  const failure = createCliFailureEnvelope({ kind: 'internal_error', diagnostics: [diagnostic], payload: { token: 'abc123' } });
  const redaction = redactCliSecretsWithReport({ password: 'secret', safe: 'visible' });

  return new Map([
    ['program', extendedProgram],
    ['invocation', invocation],
    ['semantic-validation', validation],
    ['help', help],
    ['version', version],
    ['manifest', manifest],
    ['config-resolution', config],
    ['config-discovery', discovered],
    ['completion', completion],
    ['completion-protocol', completionCommand.protocol],
    ['completion-request', completionRequest],
    ['completion-response', completionResponse],
    ['completion-command', completionCommand],
    ['completion-script', completionScript],
    ['completion-install-plan', completionInstallPlan],
    ['repair-suggestions', repairs],
    ['plugin', plugin],
    ['plugin-command-application', application],
    ['run-result', run],
    ['run-event', run.events[0]],
    ['run-effect', run.effects[0]],
    ['artifact', run.artifacts[0]],
    ['diagnostic', diagnostic],
    ['effect-application', effectReport],
    ['schema-envelope', envelope],
    ['failure', failure],
    ['redaction', redaction]
  ]);
}

async function readSchema(path) {
  return readJson(new URL(`../../schemas/${path.slice(2)}`, import.meta.url));
}

async function readJson(url) {
  return JSON.parse(await readFile(url, 'utf8'));
}

function toJsonValue(value) {
  return JSON.parse(JSON.stringify(value));
}

function validateJsonSchema(schema, value, path = '$') {
  const errors = [];
  validateOne(schema, value, path, errors);
  return errors;
}

function validateOne(schema, value, path, errors) {
  if (schema === true || Object.keys(schema).length === 0) return;
  if (schema.const !== undefined && value !== schema.const) {
    errors.push(`${path}: expected const ${JSON.stringify(schema.const)}`);
  }
  if (schema.enum !== undefined && !schema.enum.includes(value)) {
    errors.push(`${path}: expected one of ${schema.enum.join(', ')}`);
  }
  if (schema.type !== undefined && !matchesType(schema.type, value)) {
    errors.push(`${path}: expected type ${Array.isArray(schema.type) ? schema.type.join('|') : schema.type}`);
    return;
  }
  if (schema.pattern !== undefined && (typeof value !== 'string' || !matchesPattern(schema.pattern, value))) {
    errors.push(`${path}: expected pattern ${schema.pattern}`);
  }
  if (schema.minimum !== undefined && typeof value === 'number' && value < schema.minimum) {
    errors.push(`${path}: expected minimum ${schema.minimum}`);
  }
  if (schema.required !== undefined && isRecord(value)) {
    for (const key of schema.required) {
      if (!Object.hasOwn(value, key)) errors.push(`${path}.${key}: missing required property`);
    }
  }
  if (schema.properties !== undefined && isRecord(value)) {
    for (const [key, propertySchema] of Object.entries(schema.properties)) {
      const propertyEntry = Object.entries(value).find(([entryKey]) => entryKey === key);
      if (propertyEntry !== undefined) {
        const [, propertyValue] = propertyEntry;
        validateOne(propertySchema, propertyValue, `${path}.${key}`, errors);
      }
    }
  }
  if (schema.items !== undefined && Array.isArray(value)) {
    value.forEach((item, index) => validateOne(schema.items, item, `${path}[${index}]`, errors));
  }
}

function matchesType(type, value) {
  const types = Array.isArray(type) ? type : [type];
  return types.some((candidate) => {
    if (candidate === 'array') return Array.isArray(value);
    if (candidate === 'object') return isRecord(value);
    if (candidate === 'integer') return Number.isInteger(value);
    return typeof value === candidate;
  });
}

function matchesPattern(pattern, value) {
  if (pattern === '^CLI_') return value.startsWith('CLI_');
  if (pattern === '^REPAIR_') return value.startsWith('REPAIR_');
  if (pattern === '^cli-core\\.') return value.startsWith('cli-core.');
  return false;
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
