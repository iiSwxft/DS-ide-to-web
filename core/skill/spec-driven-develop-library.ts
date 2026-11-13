import { SHELL_MCP_NATIVE_HOST, SHELL_TOOL_NAMES } from '../shell';
import type { Skill } from '../types';
import { bundledSkillAssets } from './bundled-assets';

const SKILL_ORDER = [
  'spec-driven-develop',
  'deep-discuss',
  'review-spd',
] as const;

const SPEC_DRIVEN_DEVELOP_PROVIDER = 'spec-driven-develop';
const SPEC_DRIVEN_DEVELOP_HOMEPAGE = 'https://github.com/zhu1090093659/spec_driven_develop';
const DEFAULT_ENABLED_SKILLS = new Set(['deep-discuss']);

interface OfficialSkillDoc {
  name: string;
  description: string;
  body: string;
  version: string;
}

const officialSkillDocPromises = new Map<string, Promise<OfficialSkillDoc>>();

export async function loadThirdPartySpecDrivenDevelopSkills(
  requestedNames: readonly string[],
): Promise<Skill[]> {
  const requested = new Set(requestedNames);
  const knownNames = new Set<string>(SKILL_ORDER);
  for (const name of requested) {
    if (!knownNames.has(name)) {
      throw new Error(`Unknown bundled Spec-Driven Develop Skill: ${name}`);
    }
  }
  return Promise.all(
    SKILL_ORDER
      .filter((name) => requested.has(name))
      .map((name) => createThirdPartySpecDrivenDevelopSkill(name)),
  );
}

async function createThirdPartySpecDrivenDevelopSkill(name: string): Promise<Skill> {
  const doc = await getOfficialSkillDoc(name);
  return {
    name: doc.name,
    description: doc.description,
    instructions: await buildOfficialSkillInstructions(name, doc),
    source: 'third-party',
    memoryEnabled: false,
    enabled: DEFAULT_ENABLED_SKILLS.has(name),
    metadata: {
      provider: SPEC_DRIVEN_DEVELOP_PROVIDER,
      kind: 'spec-driven-develop-skill',
      version: doc.version,
      homepage: SPEC_DRIVEN_DEVELOP_HOMEPAGE,
    },
  };
}

async function buildOfficialSkillInstructions(
  name: string,
  doc: OfficialSkillDoc,
): Promise<string> {
  const [referenceDocs, scriptDocs] = await Promise.all([
    renderReferenceDocs(name),
    renderScriptDocs(name),
  ]);
  const officialDoc = renderOfficialDoc(doc.name, doc.body);

  const parts = [
    renderDeepSeekExecutionGuardrails(),
    officialDoc,
    ...referenceDocs,
  ];

  if (scriptDocs.length > 0) {
    parts.push(...scriptDocs);
  }

  return parts.filter(Boolean).join('\n\n---\n\n');
}

async function renderReferenceDocs(skillName: string): Promise<string[]> {
  const skillPrefix = `${skillName}/`;
  const paths = (await bundledSkillAssets.list('spec-driven-develop', skillPrefix))
    .filter((path) => path.endsWith('.md') && !path.endsWith('/SKILL.md'))
    .sort((a, b) => a.localeCompare(b));

  return Promise.all(paths.map(async (path) => {
    const relativePath = path.slice(skillPrefix.length);
    const body = await bundledSkillAssets.read('spec-driven-develop', path);
    return renderReferenceDoc(relativePath, body);
  }));
}

async function renderScriptDocs(skillName: string): Promise<string[]> {
  const skillPrefix = `${skillName}/`;
  const paths = (await bundledSkillAssets.list('spec-driven-develop', skillPrefix))
    .filter((path) => /\.(?:py|sh|js)$/.test(path))
    .sort((a, b) => a.localeCompare(b));

  return Promise.all(paths.map(async (path) => {
    const relativePath = path.slice(skillPrefix.length);
    const body = await bundledSkillAssets.read('spec-driven-develop', path);
    return renderScriptDoc(skillName, relativePath, body);
  }));
}

function renderOfficialDoc(title: string, body: string): string {
  return [`# Bundled Third-party Skill: ${title}`, body.trim()].join('\n\n');
}

function renderReferenceDoc(relativePath: string, body: string): string {
  return [
    `# Bundled Reference: ${relativePath}`,
    '',
    `Below is the full content of \`${relativePath}\`, inlined so the workflow can use it without filesystem access.`,
    '',
    body.trim(),
  ].join('\n');
}

function renderScriptDoc(skillName: string, relativePath: string, body: string): string {
  const fence = '```'.repeat(3);
  const trimmedBody = body.trim();
  const lineCount = trimmedBody.split('\n').length;
  return [
    `# Bundled Script: ${relativePath}`,
    '',
    `Below is the full content of \`${relativePath}\` (${lineCount} lines), inlined so the workflow can use it without filesystem access.`,
    '',
    'To execute this script in DeepSeek++, write the source shown below to a temporary file, then run it. Split the write into multiple shell_exec calls if the script is long:',
    '',
    '<shell_exec>{"command":"cat > /tmp/review-context.py <<\'DPP_EOF\'\\n[write the first chunk of the script source below]\\nDPP_EOF","timeout_ms":30000}</shell_exec>',
    '<shell_exec>{"command":"cat >> /tmp/review-context.py <<\'DPP_EOF\'\\n[append remaining chunks]\\nDPP_EOF","timeout_ms":30000}</shell_exec>',
    '<shell_exec>{"command":"python3 /tmp/review-context.py","timeout_ms":60000}</shell_exec>',
    '',
    'On Windows PowerShell, use Set-Content to write to a temp path and invoke with python instead of cat heredocs.',
    '',
    'Script source:',
    '',
    fence,
    trimmedBody,
    fence,
  ].join('\n');
}

function parseOfficialSkill(raw: string): OfficialSkillDoc {
  const frontmatter = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!frontmatter) {
    throw new Error('Spec-Driven Develop skill is missing frontmatter.');
  }

  const meta = frontmatter[1];
  const name = readFrontmatterValue(meta, 'name');
  const description = readFrontmatterValue(meta, 'description');
  const version = readFrontmatterValue(meta, 'version') || '0';
  if (!name || !description) {
    throw new Error('Spec-Driven Develop skill frontmatter must include name and description.');
  }

  return {
    name,
    description,
    body: raw.slice(frontmatter[0].length).trim(),
    version,
  };
}

function readFrontmatterValue(meta: string, key: string): string {
  const match = meta.match(new RegExp(`^${key}:\\s*(.*)$`, 'm'));
  if (!match) return '';
  const inline = match[1].trim();
  if (inline === '>-') {
    return readFoldedScalar(meta, key);
  }
  if (inline.startsWith('"') && inline.endsWith('"')) {
    return inline.slice(1, -1);
  }
  return inline;
}

function readFoldedScalar(meta: string, key: string): string {
  const lines = meta.split('\n');
  const keyIndex = lines.findIndex((line) => new RegExp(`^${key}:\\s*>-?`).test(line));
  if (keyIndex < 0) return '';
  const collected: string[] = [];
  for (let i = keyIndex + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.length === 0) {
      collected.push(' ');
      continue;
    }
    if (!/^\s+/.test(line)) break;
    collected.push(line.replace(/^\s+/, ''));
  }
  return collected.join(' ').replace(/\s+/g, ' ').trim();
}

function getOfficialSkillDoc(name: string): Promise<OfficialSkillDoc> {
  const existing = officialSkillDocPromises.get(name);
  if (existing) return existing;
  const promise = bundledSkillAssets
    .read('spec-driven-develop', `${name}/SKILL.md`)
    .then(parseOfficialSkill);
  officialSkillDocPromises.set(name, promise);
  void promise.catch(() => {
    if (officialSkillDocPromises.get(name) === promise) officialSkillDocPromises.delete(name);
  });
  return promise;
}

function renderDeepSeekExecutionGuardrails(): string {
  return `You are using the Spec-Driven Develop third-party skill series inside DeepSeek++. The Skill content is built in, but the execution boundary is overridden by DeepSeek++.

## DeepSeek++ Execution Boundary

- Available tools: ${SHELL_TOOL_NAMES.join(', ')}. Call shell_exec / shell_status only when they appear in the tool list; do not fabricate command results.
- Shell tools talk to the local host (${SHELL_MCP_NATIVE_HOST}) through Chrome Native Messaging.
- All shell operations run through shell_exec, for example <shell_exec>{"command":"gh --version"}</shell_exec>.
- Do not output pseudo-JSON calls; DeepSeek++ only executes the XML tag format <shell_exec>{"command":"..."}</shell_exec>.
- The default Windows shell is PowerShell: list directories with Get-ChildItem, and do not treat CMD's dir /b or Unix which/sed/find as PowerShell commands.
- In JSON, write Windows paths with double backslashes or forward slashes, and wrap the command string in only one layer of quotes.
- Do not use placeholder paths such as /home/user/Documents, /mnt/data, or ~/Documents. Use the real path the user gave, or first query the current directory/file location with shell_exec.
- If shell_exec / shell_status is not in the available tool list, the user has not installed the Native Host. In that case tell the user: the GitHub/script features of Spec-Driven Develop need the DeepSeek++ Shell MCP, while the pure planning and analysis phases can still be completed with the skill text alone.
- When the skill body below conflicts with this section, this DeepSeek++ execution boundary takes precedence.

## Platform Differences

The original body of this skill targets IDE coding agents such as Claude Code / Codex / OpenCode, and references the \`references/\` directory and \`scripts/\` scripts. In DeepSeek++, those files are inlined into this skill's instruction body (see the "Bundled Reference" / "Bundled Script" sections below), so the AI does not need to read them from the file system.

- Wherever the body says "read \`references/xxx.md\`" or "use the \`references/templates/xxx.md\` template", read the corresponding inlined section below instead.
- Wherever the body says "run \`scripts/review-context.py\`", use the inlined script source below and, following the note at the top of the script section, write it to a temporary file before running it.
- "Launch sub-agents" is not available in DeepSeek++; run the subtasks sequentially in the main conversation instead, with the same coverage.
- "The platform's native task tracking tool (such as TodoWrite)" is not available in DeepSeek++; progress tracking relies on docs/progress/MASTER.md.`;
}
