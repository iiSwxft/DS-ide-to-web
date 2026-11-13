#!/usr/bin/env node
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const tempDir = path.join(root, '.tmp-product-assets');

await fs.rm(tempDir, { recursive: true, force: true });
await fs.mkdir(tempDir, { recursive: true });

// README header is curated from the original logo artwork; do not regenerate it
// from synthetic UI panels when refreshing product screenshots.
const outputs = [
  ['docs/chrome-web-store/assets/small-promo.png', promoSvg()],
  ['docs/chrome-web-store/assets/screenshot-inline-tools-1280x800.png', storeScreenshotSvg()],
  ['assets/screenshot-inline-tools.png', inlineToolsSvg()],
  ['assets/screenshot-sidepanel-memory.png', sidepanelSvg({
    activeTab: 'Library',
    activeSubTab: 'Memory',
    title: 'Memory',
    meta: '4 memories',
    description: 'User preferences, feedback, topic background, and references that shape DeepSeek++ replies over time.',
    filters: ['All', 'User', 'Feedback', 'Topic', 'Reference'],
    cards: [
      ['User', 'Documentation style preference', 'Public README covers only user-visible value and never exposes internal APIs, protocols, or implementation details.', ['README', 'public copy'], true],
      ['Feedback', 'Ask less, act more on severe fixes', 'When a bug is classed as a severe blocker, trace the root cause, fix, and verify first, then report the result.', ['Collaboration', 'Quality'], true],
      ['Topic', 'DeepSeek++ product direction', 'A workbench in the DeepSeek web sidebar that manages memory, projects, Skills, MCP, and automation.', ['Product', 'Release'], false],
      ['Reference', 'Chrome Web Store release check', 'Store images, permission notes, privacy policy, zip assets, and release notes must be checked together.', ['store', 'release'], false],
    ],
  })],
  ['assets/screenshot-sidepanel-saved.png', sidepanelSvg({
    activeTab: 'Library',
    activeSubTab: 'Saved',
    title: 'Saved',
    meta: '3 saved items',
    description: 'Save frequent prompts, reference links, and conversation snippets to insert straight into the next chat.',
    filters: ['Snippet', 'Bookmark', 'Markdown', 'JSON'],
    cards: [
      ['Snippet', 'Release notes outline', 'The theme of this release: extend DeepSeek web from one-off chat into a workbench with memory, projects, tools, and automation.', ['release', 'README'], false],
      ['Bookmark', 'Chrome Web Store submission process', 'docs/chrome-web-store/submission.md', ['store', 'checklist'], false],
      ['Snippet', 'Macro daily brief prompt', 'List fact sources and latest dates first, then judge whether the risk signal strengthens, holds, eases, or fails, and finish with the discipline impact.', ['prompt', 'macro'], false],
    ],
  })],
  ['assets/screenshot-sidepanel-projects.png', sidepanelSvg({
    activeTab: 'Projects',
    title: 'Projects',
    meta: '2 projects · 2 sessions',
    description: 'Bind conversations, project instructions, and project memory together so DeepSeek++ keeps context on the same task line.',
    filters: ['Investment Research', 'DeepSeek++ Release'],
    cards: [
      ['Project', 'Investment Research', 'Track portfolio, trading discipline, and macro assumptions over time. Confirm fact sources first, then narrow conclusions to positions, risk, and next actions.', ['1 session', '1 project memory'], true],
      ['Session', 'Jensen Huang five-layer pyramid structure', 'Bound to "Investment Research"; the next new chat can keep reusing the project instructions.', ['2 hours ago'], false],
      ['Project', 'DeepSeek++ Release', 'README, store copy, release verification, and user feedback. Public copy only covers user-visible capabilities.', ['release', 'docs'], false],
    ],
  })],
  ['assets/screenshot-sidepanel-skill.png', sidepanelSvg({
    activeTab: 'Capabilities',
    activeSubTab: 'Skills',
    title: 'Skills',
    meta: '16 Skills · 15 enabled',
    description: 'Save reusable instruction templates for fixed workflows, or import team-shared Skills from GitHub.',
    filters: ['Built-in', 'Official', 'Custom', 'GitHub'],
    cards: [
      ['Built-in', 'memory-manager', 'Distill stable preferences, project background, and long-term references and write them to memory automatically.', ['Enabled', 'Built-in'], true],
      ['Official', 'officecli', 'Create, analyze, and edit Office documents, ideal for reports, spreadsheets, and presentations.', ['Docs', 'Tools'], false],
      ['Custom', 'release-copy', 'Distill the release thesis first, then organize release copy around user-visible capabilities.', ['README', 'store'], false],
      ['GitHub', 'store-listing', 'Check store screenshots, short description, permission notes, privacy policy, and release notes.', ['Chrome Web Store'], false],
    ],
  })],
  ['assets/screenshot-sidepanel-mcp.png', sidepanelSvg({
    activeTab: 'Capabilities',
    activeSubTab: 'MCP',
    title: 'MCP',
    meta: '2 servers · 5 tools',
    description: 'Connect the local Shell Host, HTTP/SSE, or Native MCP servers to bring external tools into DeepSeek chats.',
    filters: ['All', 'Enabled', 'Shell Host', 'HTTP'],
    cards: [
      ['Native', 'DeepSeek++ Shell Host', 'ready · 3 tools · 42 ms. Shell, Python, and status checks are available.', ['auto', 'Local'], true],
      ['HTTP', 'Market Data MCP', 'ready · 2 tools · 118 ms. Only quote_snapshot and macro_calendar are allowed.', ['confirm', 'allowlist'], false],
      ['History', 'python_exec', 'Python completed in 0.8s · rows=128, anomalies=3, saved=report.csv', ['9 minutes ago'], false],
    ],
  })],
  ['assets/screenshot-sidepanel-tools.png', sidepanelSvg({
    activeTab: 'Capabilities',
    activeSubTab: 'Tools',
    title: 'Tools',
    meta: 'Web + Python + run history',
    description: 'Manage built-in Web tools, Python execution, and recent tool call history.',
    filters: ['Web Search', 'Web Fetch', 'Python', 'Diagnostics'],
    cards: [
      ['Built-in', 'web_search', 'Search the web in chat and return citable summaries.', ['Enabled'], true],
      ['Built-in', 'web_fetch', 'Read the content of a given page, useful for adding fact sources and context.', ['Enabled'], false],
      ['MCP', 'Python Execution', 'Shell Host discovered python_exec; run short Python snippets in chat.', ['ready', 'local'], false],
      ['History', 'web_search', 'Search complete · 5 results organized into a chat summary.', ['24 minutes ago'], false],
    ],
  })],
  ['assets/screenshot-sidepanel-browser.png', sidepanelSvg({
    activeTab: 'Capabilities',
    activeSubTab: 'Browser',
    title: 'Browser Control',
    meta: 'Enabled · target tab 12',
    description: 'Expose the current browser tab to the model so it can read page structure, click, type, and take snapshot actions.',
    filters: ['Target', 'Snapshot', 'Action', 'Safety'],
    cards: [
      ['Status', 'Control enabled', 'Target tab: DeepSeek - Explore the Unknown. A page snapshot is attached after each action.', ['enabled', 'tab 12'], true],
      ['Snapshot', 'Node and text budget', 'Up to 400 nodes and 24,000 bytes of text, keeping it readable within context.', ['snapshot'], false],
      ['Action', 'Available browser tools', 'Actions such as navigate, click, fill, key, wait_for, and snapshot can be exposed on demand.', ['browser tools'], false],
    ],
  })],
  ['assets/screenshot-sidepanel-automation.png', sidepanelSvg({
    activeTab: 'Capabilities',
    activeSubTab: 'Automation',
    title: 'Automation',
    meta: '2 tasks · 1 enabled',
    description: 'Schedule fixed prompts as manual or timed tasks that open DeepSeek chats automatically and keep run history.',
    filters: ['All', 'Enabled', 'Paused', 'Scheduled'],
    cards: [
      ['Scheduled', 'Pre-market briefing', 'Runs weekdays at 08:30. Reads US stocks, the dollar, long bonds, and macro events, then outputs the risk signal and discipline impact.', ['active', 'Asia/Shanghai'], true],
      ['Run', 'Last run succeeded', 'Risk signal holds neutral-to-cautious. The chat was written back to DeepSeek history.', ['3 hours ago'], false],
      ['Manual', 'Weekly project review', "Summarize this week's project context, key conclusions, and questions to follow up next week.", ['paused'], false],
    ],
  })],
  ['assets/screenshot-sidepanel-settings.png', sidepanelSvg({
    activeTab: 'Settings',
    title: 'Settings',
    meta: 'v0.7.4',
    description: 'Configure sync, language, expert mode, background, the little whale pet, official API chat, and prompt injection strategy.',
    filters: ['Sync', 'Language', 'Appearance', 'Model'],
    cards: [
      ['Mode', 'Expert mode', 'When enabled, DeepSeek++ uses stronger context and tool configuration by default.', ['enabled'], true],
      ['Sync', 'WebDAV sync', 'Sync memory, Skills, projects, saved items, and presets to your own WebDAV folder.', ['DeepSeekPP'], false],
      ['Appearance', 'Little whale pet', 'Adjust position, size, opacity, and animation for clear status feedback on enhanced features.', ['pet', 'theme'], false],
    ],
  })],
  ['assets/screenshot-skill-popup.png', skillPopupSvg()],
];

for (const [relativePath, svg] of outputs) {
  await renderPng(relativePath, svg);
}

await fs.copyFile(
  path.join(root, 'docs/chrome-web-store/assets/screenshot-inline-tools-1280x800.png'),
  path.join(root, 'assets/screenshot-inline-tools.png'),
);

await fs.rm(tempDir, { recursive: true, force: true });
console.log(`Rendered ${outputs.length} product assets.`);

async function renderPng(relativePath, svg) {
  const svgPath = path.join(tempDir, relativePath.replace(/[\\/]/g, '__').replace(/\.png$/, '.svg'));
  const outPath = path.join(root, relativePath);
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(svgPath, svg, 'utf8');
  await execFileAsync('sips', ['-s', 'format', 'png', svgPath, '--out', outPath]);
}

function promoSvg() {
  return svg(440, 280, `
    ${defs()}
    <rect width="440" height="280" fill="url(#bgPromo)"/>
    <circle cx="374" cy="54" r="72" fill="#dce9ff"/>
    <g transform="translate(34 32)">
      ${brandMark(0, 0, 38)}
      <text x="50" y="27" class="brand">DeepSeek++</text>
      <text x="0" y="92" class="promoTitle">Let DeepSeek</text>
      <text x="0" y="134" class="promoTitle">remember context</text>
      <text x="0" y="176" class="promoTitle">and use real tools</text>
      <text x="0" y="218" class="bodyStrong">Memory · Projects · Skills · MCP · Automation</text>
    </g>
  `);
}

function storeScreenshotSvg() {
  return svg(1280, 800, `
    ${defs()}
    <rect width="1280" height="800" fill="#f5f8ff"/>
    <path d="M0 0H1280V800H0Z" fill="url(#bgStore)"/>
    <g transform="translate(72 72)">
      ${brandMark(0, 0, 46)}
      <text x="60" y="33" class="brandLarge">DeepSeek++</text>
      <text x="0" y="130" class="storeTitle">Turn DeepSeek into</text>
      <text x="0" y="188" class="storeTitle">a workbench that</text>
      <text x="0" y="246" class="storeTitle">remembers and acts.</text>
      <text x="0" y="306" class="storeBody">One sidebar manages memory, projects, Skills,</text>
      <text x="0" y="340" class="storeBody">MCP tools, and automation. Call them from chat;</text>
      <text x="0" y="374" class="storeBody">results stay in the same DeepSeek conversation.</text>
      ${chip(0, 404, 'Memory', 18)}
      ${chip(100, 404, 'Projects', 18)}
      ${chip(200, 404, 'MCP tools', 18)}
      ${chip(335, 404, 'Automation', 18)}
    </g>
    <g transform="translate(640 44)">
      ${miniSidepanel(0, 0, 'Memory', ['Documentation style preference', 'Ask less, act more on severe fixes', 'DeepSeek++ product direction', 'Chrome Web Store release check'], '#4f6fff', 430, 710)}
      ${miniSidepanel(300, 58, 'MCP', ['DeepSeek++ Shell Host', 'Market Data MCP', 'python_exec'], '#16a34a', 330, 520)}
      ${miniSidepanel(250, 430, 'Automation', ['Pre-market briefing', 'Last run succeeded', 'Weekly project review'], '#7c3aed', 360, 300)}
    </g>
  `);
}

function inlineToolsSvg() {
  return storeScreenshotSvg();
}

function skillPopupSvg() {
  return svg(1440, 900, `
    ${defs()}
    <rect width="1440" height="900" fill="#f7f9ff"/>
    <g transform="translate(76 72)">
      <text x="0" y="0" class="pageKicker">DeepSeek chat input</text>
      <rect x="0" y="36" width="980" height="178" rx="24" fill="#ffffff" stroke="#dce4f5"/>
      <text x="34" y="96" class="inputGhost">/release</text>
      <rect x="34" y="132" width="124" height="36" rx="18" fill="#edf4ff" stroke="#bfd2ff"/>
      <text x="62" y="156" class="blueSmall">DeepThink</text>
      <rect x="176" y="132" width="126" height="36" rx="18" fill="#edf4ff" stroke="#bfd2ff"/>
      <text x="204" y="156" class="blueSmall">Search</text>
      <circle cx="922" cy="148" r="28" fill="#84a2ff"/>
      <text x="913" y="158" class="sendIcon">↑</text>
    </g>
    <g transform="translate(156 286)">
      <rect width="880" height="468" rx="24" fill="#ffffff" stroke="#dce4f5" filter="url(#shadow)"/>
      <text x="30" y="52" class="popupTitle">Skill autocomplete</text>
      <text x="30" y="84" class="popupHint">Type / to pick a common workflow; DeepSeek++ injects the template and context into the current chat.</text>
      ${popupRow(30, 122, 'release-copy', 'Rewrite release changes as user-facing release copy', ['README', 'store'], true)}
      ${popupRow(30, 218, 'store-listing', 'Check that Chrome Web Store listing materials are complete', ['Chrome Web Store'], false)}
      ${popupRow(30, 314, 'memory-manager', 'Distill stable preferences and project background', ['Built-in', 'Memory'], false)}
    </g>
    <g transform="translate(1110 106)">
      ${miniSidepanel(0, 0, 'Skills', ['memory-manager', 'officecli', 'release-copy', 'store-listing'], '#4f6fff', 280, 640)}
    </g>
  `);
}

function sidepanelSvg({
  activeTab,
  activeSubTab,
  title,
  meta,
  description,
  filters,
  cards,
}) {
  const subTabs = activeTab === 'Library'
    ? ['Memory', 'Saved']
    : activeTab === 'Capabilities'
      ? ['Skills', 'MCP', 'Tools', 'Browser', 'Presets', 'Automation']
      : [];
  return svg(760, 1600, `
    ${defs()}
    <rect width="760" height="1600" fill="#f7f9ff"/>
    <rect width="760" height="92" fill="#ffffff"/>
    ${brandMark(32, 23, 44)}
    <text x="92" y="58" class="sideBrand">DeepSeek++</text>
    <line x1="0" y1="92" x2="760" y2="92" stroke="#e3e8f3"/>
    ${topNav(activeTab)}
    ${subTabs.length ? subNav(subTabs, activeSubTab ?? subTabs[0]) : ''}
    <g transform="translate(40 ${subTabs.length ? 262 : 220})">
      <text x="0" y="0" class="pageTitle">${esc(title)}</text>
      <text x="0" y="38" class="pageMeta">${esc(meta)}</text>
      ${wrapText(description, 0, 82, 68, 28, 'pageDesc')}
      ${filterRow(0, 152, filters)}
      ${cards.map((card, index) => cardSvg(0, 216 + index * 220, ...card)).join('')}
    </g>
  `);
}

function topNav(active) {
  const tabs = ['Library', 'Projects', 'Capabilities', 'Settings'];
  return `<g transform="translate(0 92)">
    <rect width="760" height="78" fill="#ffffff"/>
    ${tabs.map((tab, index) => {
      const x = 72 + index * 166;
      const isActive = tab === active;
      return `
        <text x="${x}" y="49" class="${isActive ? 'navActive' : 'nav'}">${tab}</text>
        ${isActive ? `<rect x="${x - 18}" y="70" width="76" height="4" rx="2" fill="#4f6fff"/>` : ''}
      `;
    }).join('')}
    <line x1="0" y1="78" x2="760" y2="78" stroke="#e3e8f3"/>
  </g>`;
}

function subNav(tabs, active) {
  return `<g transform="translate(0 170)">
    <rect width="760" height="50" fill="#f1f5ff"/>
    ${tabs.map((tab, index) => {
      const x = 40 + index * (tabs.length > 3 ? 104 : 130);
      const isActive = tab === active;
      return `
        <text x="${x}" y="32" class="${isActive ? 'subActive' : 'sub'}">${tab}</text>
        ${isActive ? `<rect x="${x - 6}" y="46" width="${Math.max(42, tab.length * 11)}" height="4" rx="2" fill="#4f6fff"/>` : ''}
      `;
    }).join('')}
  </g>`;
}

function filterRow(x, y, labels) {
  let cursor = x;
  return `<g transform="translate(${x} ${y})">
    ${labels.map((label, index) => {
      const width = Math.max(76, label.length * 11 + 36);
      const markup = `<rect x="${cursor}" y="0" width="${width}" height="46" rx="23" fill="${index === 0 ? '#edf4ff' : '#ffffff'}" stroke="${index === 0 ? '#bfd2ff' : '#dce4f5'}"/>
        <text x="${cursor + 18}" y="31" class="${index === 0 ? 'filterActive' : 'filter'}">${esc(label)}</text>`;
      cursor += width + 12;
      return markup;
    }).join('')}
  </g>`;
}

function cardSvg(x, y, type, title, body, tags, pinned = false) {
  const colors = typeColors(type);
  const badgeWidth = Math.max(68, type.length * 11 + 28);
  const titleX = 28 + badgeWidth + 24;
  return `<g transform="translate(${x} ${y})">
    <rect width="680" height="190" rx="22" fill="#ffffff" stroke="#dce4f5" filter="url(#softShadow)"/>
    <rect x="28" y="28" width="${badgeWidth}" height="38" rx="10" fill="${colors.bg}" stroke="${colors.border}"/>
    <text x="43" y="54" class="badge" fill="${colors.text}">${esc(type)}</text>
    <text x="${titleX}" y="55" class="cardTitle">${esc(title)}</text>
    ${pinned ? '<text x="610" y="55" class="star">★</text>' : ''}
    ${wrapText(body, 28, 96, 56, 29, 'cardBody')}
    ${tags.map((tag, index) => tagPill(28 + index * 130, 150, tag)).join('')}
  </g>`;
}

function tagPill(x, y, tag) {
  const width = Math.max(68, tag.length * 9 + 30);
  return `<rect x="${x}" y="${y}" width="${width}" height="30" rx="8" fill="#f3f6fb"/>
    <text x="${x + 15}" y="${y + 21}" class="tag">${esc(tag)}</text>`;
}

function miniSidepanel(x, y, title, items, color, width = 310, height = 300) {
  const itemY = 96;
  return `<g transform="translate(${x} ${y})">
    <rect width="${width}" height="${height}" rx="22" fill="#ffffff" stroke="#dce4f5" filter="url(#shadow)"/>
    <rect width="${width}" height="64" rx="22" fill="#ffffff"/>
    <text x="24" y="42" class="miniTitle">${esc(title)}</text>
    <rect x="24" y="72" width="${width - 48}" height="3" rx="1.5" fill="${color}"/>
    ${items.map((item, index) => `
      <rect x="24" y="${itemY + index * 72}" width="${width - 48}" height="52" rx="14" fill="${index === 0 ? '#edf4ff' : '#f7f9ff'}" stroke="${index === 0 ? '#bfd2ff' : '#e3e8f3'}"/>
      <circle cx="48" cy="${itemY + 26 + index * 72}" r="8" fill="${color}"/>
      <text x="66" y="${itemY + 34 + index * 72}" class="miniItem">${esc(item)}</text>
    `).join('')}
  </g>`;
}

function popupRow(x, y, title, body, tags, active) {
  return `<g transform="translate(${x} ${y})">
    <rect width="820" height="76" rx="16" fill="${active ? '#edf4ff' : '#f8fafc'}" stroke="${active ? '#bfd2ff' : '#e3e8f3'}"/>
    <text x="24" y="31" class="popupRowTitle">/${esc(title)}</text>
    <text x="24" y="58" class="popupRowBody">${esc(body)}</text>
    ${tags.map((tag, index) => tagPill(580 + index * 120, 22, tag)).join('')}
  </g>`;
}

function brandMark(x, y, size) {
  const radius = Math.round(size * 0.28);
  const textSize = Math.round(size * 0.38);
  return `<g transform="translate(${x} ${y})">
    <rect width="${size}" height="${size}" rx="${radius}" fill="#4f6fff"/>
    <text x="${size * 0.18}" y="${size * 0.62}" font-size="${textSize}" font-weight="850" fill="#ffffff">D++</text>
  </g>`;
}

function chip(x, y, text, fontSize = 15) {
  const width = Math.max(88, text.length * fontSize * 0.55 + 34);
  return `<rect x="${x}" y="${y}" width="${width}" height="38" rx="19" fill="#ffffff" stroke="#bfd2ff"/>
    <text x="${x + 17}" y="${y + 25}" class="chip">${esc(text)}</text>`;
}

function wrapText(text, x, y, maxChars, lineHeight, className) {
  const lines = [];
  let current = '';
  for (const word of text.split(' ')) {
    const next = current ? current + ' ' + word : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 2).map((line, index) =>
    `<text x="${x}" y="${y + index * lineHeight}" class="${className}">${esc(line)}</text>`
  ).join('');
}

function typeColors(type) {
  if (['Feedback', 'HTTP', 'Official', 'Run'].includes(type)) return { bg: '#fff7ed', border: '#fed7aa', text: '#ea580c' };
  if (['Topic', 'Project', 'MCP', 'Scheduled'].includes(type)) return { bg: '#f5f3ff', border: '#ddd6fe', text: '#7c3aed' };
  if (['Reference', 'Native', 'Built-in', 'Status'].includes(type)) return { bg: '#ecfdf5', border: '#bbf7d0', text: '#16a34a' };
  return { bg: '#edf4ff', border: '#bfd2ff', text: '#2563eb' };
}

function defs() {
  return `<defs>
    <linearGradient id="bgHeader" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#ffffff"/><stop offset="100%" stop-color="#edf5ff"/>
    </linearGradient>
    <linearGradient id="bgPromo" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#ffffff"/><stop offset="100%" stop-color="#edf5ff"/>
    </linearGradient>
    <linearGradient id="bgStore" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#ffffff"/><stop offset="100%" stop-color="#edf5ff"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="18" stdDeviation="20" flood-color="#1f3f82" flood-opacity=".18"/>
    </filter>
    <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="8" stdDeviation="10" flood-color="#2c4778" flood-opacity=".08"/>
    </filter>
  </defs>`;
}

function svg(width, height, content) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <style>
    text{font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Hiragino Sans GB","Microsoft YaHei",Arial,sans-serif;letter-spacing:0}
    .brand{font-size:23px;font-weight:800;fill:#2563eb}
    .brandLarge{font-size:28px;font-weight:850;fill:#2563eb}
    .sideBrand{font-size:27px;font-weight:800;fill:#111827}
    .h1{font-size:34px;font-weight:850;fill:#111827}
    .storeTitle{font-size:46px;font-weight:850;fill:#111827}
    .promoTitle{font-size:34px;font-weight:850;fill:#111827}
    .storeBody{font-size:20px;font-weight:450;fill:#4b5563}
    .body{font-size:15px;font-weight:450;fill:#4b5563}
    .bodyStrong{font-size:16px;font-weight:700;fill:#4b5563}
    .chip{font-size:15px;font-weight:650;fill:#2456d6}
    .nav{font-size:23px;font-weight:650;fill:#6b7280}
    .navActive{font-size:23px;font-weight:760;fill:#4f6fff}
    .sub{font-size:20px;font-weight:650;fill:#6b7280}
    .subActive{font-size:20px;font-weight:760;fill:#4f6fff}
    .pageTitle{font-size:32px;font-weight:850;fill:#111827}
    .pageMeta{font-size:16px;font-weight:650;fill:#9aa3b2}
    .pageDesc{font-size:18px;font-weight:450;fill:#687386}
    .filter{font-size:18px;font-weight:600;fill:#687386}
    .filterActive{font-size:18px;font-weight:760;fill:#4f6fff}
    .badge{font-size:18px;font-weight:760}
    .cardTitle{font-size:24px;font-weight:800;fill:#111827}
    .cardBody{font-size:21px;font-weight:450;fill:#687386}
    .tag{font-size:15px;font-weight:600;fill:#98a1b2}
    .star{font-size:24px;font-weight:800;fill:#f59e0b}
    .miniTitle{font-size:22px;font-weight:800;fill:#111827}
    .miniItem{font-size:17px;font-weight:650;fill:#4b5563}
    .pageKicker{font-size:28px;font-weight:850;fill:#111827}
    .inputGhost{font-size:32px;font-weight:650;fill:#4f6fff}
    .blueSmall{font-size:16px;font-weight:700;fill:#4f6fff}
    .sendIcon{font-size:28px;font-weight:850;fill:#ffffff}
    .popupTitle{font-size:28px;font-weight:850;fill:#111827}
    .popupHint{font-size:18px;font-weight:450;fill:#687386}
    .popupRowTitle{font-size:22px;font-weight:800;fill:#4f6fff}
    .popupRowBody{font-size:16px;font-weight:450;fill:#687386}
  </style>
  ${content}
</svg>`;
}

function esc(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
