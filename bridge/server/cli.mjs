#!/usr/bin/env node
/**
 * Single entry point.
 *   ds-ide-to-web          MCP server on stdio (starts the bridge app in the background if needed)
 *   ds-ide-to-web daemon   run the bridge app in the foreground (OpenAI-compatible API + extension link)
 *   ds-ide-to-web stop     stop a running bridge app
 */
const command = process.argv[2];

if (command === 'daemon') {
  const { startDaemon } = await import('./daemon.mjs');
  await startDaemon();
} else if (command === 'stop') {
  const { stopDaemon } = await import('./autostart.mjs');
  console.log((await stopDaemon()) ? 'Bridge app stopped.' : 'No bridge app was running.');
} else if (command === '--help' || command === '-h' || command === 'help') {
  console.log([
    'ds-ide-to-web: use your logged-in DeepSeek web chat from any AI tool.',
    '',
    'Usage:',
    '  ds-ide-to-web          start the MCP server on stdio (add this to your MCP client)',
    '  ds-ide-to-web daemon   run the bridge app in the foreground',
    '  ds-ide-to-web stop     stop a running bridge app',
    '',
    'Environment: DS_BRIDGE_PORT (default 8787), DS_BRIDGE_TOKEN, DS_BRIDGE_SYSTEM, DS_BRIDGE_HOME',
    'Docs: https://github.com/iiSwxft/DS-ide-to-web#readme',
  ].join('\n'));
} else {
  const { ensureDaemon } = await import('./autostart.mjs');
  await ensureDaemon(import.meta.url);
  const { runMcp } = await import('./mcp-stdio.mjs');
  await runMcp();
}
