import type { ToolRiskLevel } from '../tool/types';

export const SHELL_MCP_SERVER_NAME = 'Shell Local';
export const SHELL_MCP_NATIVE_HOST = 'com.deepseek_pp.shell';

export const OFFICECLI_BIN_PATH = 'officecli';

export const SHELL_TOOL_NAMES = ['shell_exec', 'shell_status', 'python_status', 'python_exec', 'local_skill_preview', 'local_folder_pick', 'local_file_stat', 'local_file_read', 'local_file_write', 'shell_session_begin', 'shell_session_exec', 'shell_session_end'] as const;
export type ShellToolName = typeof SHELL_TOOL_NAMES[number];

export interface ShellToolSpec {
  name: ShellToolName;
  title: string;
  description: string;
  risk: ToolRiskLevel;
}

export const SHELL_TOOL_SPECS: readonly ShellToolSpec[] = [
  {
    name: 'shell_exec',
    title: 'Run command',
    description: 'Run a shell command on the local system and return stdout, stderr, and the exit code.',
    risk: 'high',
  },
  {
    name: 'shell_status',
    title: 'Host status',
    description: 'Report the Native Host health status, platform, shell type, and working directory.',
    risk: 'low',
  },
  {
    name: 'python_status',
    title: 'Python status',
    description: 'Report the local Python interpreter, its version, and the libraries available for quick verification.',
    risk: 'low',
  },
  {
    name: 'python_exec',
    title: 'Run Python',
    description: 'Run short Python code for quickly verifying ideas, complex calculations, and small data-processing tasks.',
    risk: 'high',
  },
  {
    name: 'local_skill_preview',
    title: 'Preview local Skill',
    description: 'Read-only scan of a local Skill directory, returning SKILL.md, text resources, and a script list; no local code is executed.',
    risk: 'medium',
  },
  {
    name: 'local_folder_pick',
    title: 'Pick local folder',
    description: 'Open the system folder picker and return the absolute local path the user selected.',
    risk: 'low',
  },
  {
    name: 'local_file_stat',
    title: 'Inspect local file info',
    description: 'Return whether a local file exists, along with its size, type, and modification time; the file body is not read.',
    risk: 'medium',
  },
  {
    name: 'local_file_read',
    title: 'Read local text file',
    description: 'Read a local UTF-8 text file by character window, supporting chunked reads of large files.',
    risk: 'medium',
  },
  {
    name: 'local_file_write',
    title: 'Write local text file',
    description: 'Write UTF-8 text verbatim to a local file, supporting overwrite or append, and creating parent directories automatically.',
    risk: 'high',
  },
  {
    name: 'shell_session_begin',
    title: 'Begin persistent Shell session',
    description: 'Start a long-lived Shell session whose working directory, environment variables, and resident child processes (for example OfficeCLI resident mode) persist across later shell_session_exec calls. Suited to multi-step workflows, avoiding state loss between separate shell_exec calls. Returns a session_id for later calls.',
    risk: 'high',
  },
  {
    name: 'shell_session_exec',
    title: 'Run command in persistent session',
    description: 'Run a command in a previously started persistent Shell session. State (working directory, exported variables, resident processes) persists between calls. Returns stdout, stderr, and the exit code, consistent with shell_exec. The session closes automatically after being idle for a while.',
    risk: 'high',
  },
  {
    name: 'shell_session_end',
    title: 'End persistent Shell session',
    description: 'Close a persistent Shell session started by shell_session_begin and release its child processes. The session_id is no longer valid afterwards.',
    risk: 'medium',
  },
] as const;
