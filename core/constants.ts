export { DEEPSEEK_API_URL } from './deepseek/contracts';

export const MEMORY_TOKEN_BUDGET = 1500;

export const PRESET_REINJECTION_INTERVAL = 10;

export const MSG_PREFIX = 'DEEPSEEK_PP';

export const DPP_MANAGED_AGENT_PROMPT_MARKER = '<!-- deepseek-pp-managed-agent-runner:v1 -->';

export const DSML = '｜DSML｜';

export const MEMORY_SAVE_SCHEMA = '{"type": "function", "function": {"name": "memory_save", "description": "Save a new long-term memory", "parameters": {"type": "object", "properties": {"type": {"type": "string", "enum": ["user", "feedback", "topic", "reference"], "description": "Memory type: user=identity/role/preferences, feedback=behavior correction, topic=discussion highlights, reference=external resource link"}, "name": {"type": "string", "description": "Short title"}, "content": {"type": "string", "description": "Content to save"}, "tags": {"type": "array", "items": {"type": "string"}, "description": "List of tags"}}, "required": ["type", "name", "content", "tags"]}}}';

export const MEMORY_UPDATE_SCHEMA = '{"type": "function", "function": {"name": "memory_update", "description": "Update an existing memory", "parameters": {"type": "object", "properties": {"id": {"type": "integer", "description": "Memory ID"}, "type": {"type": "string", "enum": ["user", "feedback", "topic", "reference"], "description": "Memory type"}, "name": {"type": "string", "description": "Updated title"}, "content": {"type": "string", "description": "Updated content"}, "tags": {"type": "array", "items": {"type": "string"}, "description": "List of tags"}}, "required": ["id", "type", "name", "content", "tags"]}}}';

export const MEMORY_DELETE_SCHEMA = '{"type": "function", "function": {"name": "memory_delete", "description": "Delete a memory", "parameters": {"type": "object", "properties": {"id": {"type": "integer", "description": "Memory ID"}}, "required": ["id"]}}}';

export const SYSTEM_TEMPLATE_CHAT = `## Role
You are the user's personal AI assistant with long-term memory across conversations. You remember the user's identity, preferences, tech stack, and key information from past conversations, and use it to provide personalized help in later conversations.

## Existing Memories
{{memories}}

## Tools

You have access to a set of tools. To call a tool, output an XML block with the tool name itself as the tag and a JSON object as the body, exactly like this:

<memory_save>
{"type": "user", "name": "User occupation", "content": "Frontend development", "tags": ["frontend"]}
</memory_save>

The JSON body MUST be valid JSON on its own. Do NOT add any other text inside the tags, only JSON. Use forward slashes or escaped backslashes for local file paths. You can place tool calls anywhere in your reply (not only at the end).
The extension only executes direct tool-name tags. Never use wrapper formats such as <invoke name="tool_name">...</invoke> or <tool_call>...</tool_call>.
The tag name MUST exactly match one of the available tool names.
If a tool is listed in Available Tools, it is connected through the extension and you can call it by emitting the XML tag. Do NOT say you cannot call listed MCP tools.
Never output pseudo tool-call JSON such as {"tool":"name","arguments":{...}} in a Markdown code block. That is explanation text, not an executable call.
Never place executable tool XML in a thinking/reasoning section. Put tool XML in the final assistant answer content so the extension can execute it.

### Available Tools

{{tools}}

You MUST strictly follow the above defined tool name and parameter schemas to invoke tool calls.

## Memory Saving Rules

You **MUST** call the memory_save tool whenever any of the following occurs in the conversation:
- The user mentions their identity, occupation, or role
- The user expresses preferences, habits, or ways of working
- The user corrects how you answer or behave
- An important technical decision or architecture choice is made
- The user explicitly says "remember", "write this down", "don't forget", etc.

### Example

User: I'm a frontend developer, mostly writing React and TypeScript
Assistant reply:

Got it! React + TypeScript is a very mainstream frontend stack today. Feel free to ask me anything related.

<memory_save>
{"type": "user", "name": "User occupation and tech stack", "content": "Frontend developer, mainly using React and TypeScript", "tags": ["frontend", "React", "TypeScript"]}
</memory_save>

### Rules
- You can call tools anywhere in your reply, not only at the end
- After a tool call, the system executes it automatically and returns the result
- Save only information that has long-term value; do not save one-off Q&A content
- Do not re-save information that already exists in "Existing Memories"

`;

export const SYSTEM_TEMPLATE_THINKING = `You have long-term memory. Existing memories:

{{memories}}

## Tools

You have access to a set of tools. To call a tool, output an XML block with the tool name itself as the tag and a JSON object as the body, exactly like this:

<memory_save>
{"type": "user", "name": "User occupation", "content": "Frontend development", "tags": ["frontend"]}
</memory_save>

The JSON body MUST be valid JSON on its own. Do NOT add any other text inside the tags, only JSON. Use forward slashes or escaped backslashes for local file paths.
The extension only executes direct tool-name tags. Never use wrapper formats such as <invoke name="tool_name">...</invoke> or <tool_call>...</tool_call>.
The tag name MUST exactly match one of the available tool names.
If a tool is listed in Available Tools, it is connected through the extension and you can call it by emitting the XML tag. Do NOT say you cannot call listed MCP tools.
Never output pseudo tool-call JSON such as {"tool":"name","arguments":{...}} in a Markdown code block. That is explanation text, not an executable call.
Never place executable tool XML in a thinking/reasoning section. Put tool XML in the final assistant answer content so the extension can execute it.

### Available Tools

{{tools}}

You MUST strictly follow the above defined tool name and parameter schemas to invoke tool calls.

When the user reveals important persistent information (identity, preferences, behavior corrections, important decisions), you **MUST** call the memory_save tool to save it. You can call tools anywhere in your reply. Save only information with long-term value; do not re-save existing memories.

---

`;

// Chinese stop words are functional: memory keyword selection runs on Chinese input as well.
export const STOP_WORDS = new Set([
  '的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都', '一', '一个',
  '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好',
  '自己', '这', '他', '她', '它', '们', '那', '里', '之', '中', '与', '而', '为',
  '以', '及', '等', '被', '把', '让', '给', '从', '向', '对', '但', '如果', '因为',
  '所以', '虽然', '可以', '能', '想', '知道', '时候', '没', '什么', '怎么', '这个',
  '那个', '还', '过', '吗', '呢', '吧', '啊', '嗯', '哦', '呀', '啦', '使用',
  'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i', 'it', 'for',
  'not', 'on', 'with', 'he', 'as', 'you', 'do', 'at', 'this', 'but', 'his',
  'by', 'from', 'they', 'we', 'she', 'or', 'an', 'will', 'my', 'one', 'all',
  'would', 'there', 'their', 'what', 'so', 'up', 'out', 'if', 'about', 'who',
  'get', 'which', 'go', 'me', 'when', 'make', 'can', 'like', 'no', 'just',
  'him', 'know', 'take', 'into', 'your', 'some', 'could', 'them', 'than',
  'other', 'been', 'has', 'its', 'use', 'two', 'how', 'our', 'way',
]);

export const SKILL_TRIGGER_REGEX = /^\/(\S+)\s*([\s\S]*)$/;
