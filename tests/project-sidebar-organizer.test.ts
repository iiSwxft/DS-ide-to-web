import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectContextState } from '../core/types';
import {
  renderProjectSidebar,
  startDeepSeekProjectSidebarOrganizer,
  type ProjectSidebarOrganizerLabels,
} from '../entrypoints/content/adapters/project-sidebar-organizer';

const NOW = 1_700_000_000_000;

const labels: ProjectSidebarOrganizerLabels = {
  title: 'Projects',
  empty: 'No projects yet',
  expandProject: (name) => `Expand project: ${name}`,
  collapseProject: (name) => `Collapse project: ${name}`,
  showMore: 'Show more',
  showLess: 'Show less',
  moveCurrentToProject: (name) => `Move current chat to ${name}`,
  removeCurrentFromProject: (name) => `Remove current chat from ${name}`,
  joinProject: 'Add to project',
  joinProjectNamed: (name) => `Add to project: ${name}`,
  moveToProjectNamed: (name) => `Move to project: ${name}`,
  currentProjectNamed: (name) => `Already in project: ${name}`,
  removeFromProjectNamed: (name) => `Remove from project: ${name}`,
  conversationActions: 'Conversation actions',
  newConversationInProject: (name) => `New chat in ${name}`,
  useNextConversation: (name) => `Use ${name} for next new chat`,
  cancelNextConversation: (name) => `Cancel using ${name} for next new chat`,
  pendingNextConversation: 'The next new chat will use this project',
  untitledConversation: 'Untitled conversation',
  operationFailed: (message) => `Project action failed: ${message}`,
  age: (timestamp) => `${Math.floor((NOW - timestamp) / 60000)} min`,
};

let sendMessage: ReturnType<typeof vi.fn>;
let runtimeListeners: Set<(
  message: { type?: string; state?: unknown },
  sender: chrome.runtime.MessageSender,
) => void>;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  runtimeListeners = new Set();
  sendMessage = vi.fn();
  vi.stubGlobal('chrome', {
    runtime: {
      id: 'extension-id',
      getURL: vi.fn((path: string) => `chrome-extension://extension-id${path}`),
      sendMessage,
      onMessage: {
        addListener: vi.fn((listener: (
          message: { type?: string; state?: unknown },
          sender: chrome.runtime.MessageSender,
        ) => void) => {
          runtimeListeners.add(listener);
        }),
        removeListener: vi.fn((listener: (
          message: { type?: string; state?: unknown },
          sender: chrome.runtime.MessageSender,
        ) => void) => {
          runtimeListeners.delete(listener);
        }),
      },
    },
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
  document.head.innerHTML = '';
  window.history.pushState({}, '', '/');
  document.title = '';
});

describe('DeepSeek project sidebar organizer', () => {
  it('renders projects inside the native history sidebar and hides project conversations from the raw list', () => {
    const state = createProjectState();
    mountHistoryDom();

    const section = renderProjectSidebar(document, createRenderOptions({
      state,
      expandedProjectIds: new Set(['project-deepseek']),
    }));

    expect(section?.querySelector('.dpp-project-sidebar__section-title')?.textContent).toBe('Projects');
    expect(section?.querySelector('.dpp-project-sidebar__project-name')?.textContent).toBe('deepseek-pp');
    expect(section?.querySelector('[data-dpp-project-conversation-id="session-one"]')?.textContent).toContain('Release version 0.7.3');
    expect(document.querySelector<HTMLElement>('[data-testid="session-one-row"]')?.hidden).toBe(true);
    expect(document.querySelector<HTMLElement>('[data-testid="session-one-row"]')?.style.getPropertyValue('display')).toBe('none');
    expect(document.querySelector<HTMLElement>('[data-testid="session-two-row"]')?.hidden).toBe(false);
    expect(section?.nextElementSibling?.textContent).toBe('Today');
  });

  it('keeps injected project links out of history extraction on repeated renders', () => {
    const state = createProjectState();
    mountHistoryDom();
    const expandedProjectIds = new Set(['project-deepseek']);

    renderProjectSidebar(document, createRenderOptions({
      state,
      expandedProjectIds,
    }));
    renderProjectSidebar(document, createRenderOptions({
      state,
      expandedProjectIds,
    }));

    expect(document.querySelectorAll('#dpp-project-sidebar')).toHaveLength(1);
    expect(document.querySelectorAll('a[data-dpp-project-conversation-id="session-one"]')).toHaveLength(1);
  });

  it('normalizes stale project conversation urls to the matching history route', () => {
    const state = createProjectState({
      conversations: [{
        conversationId: 'session-one',
        projectId: 'project-deepseek',
        title: 'Release version 0.7.3',
        url: 'https://chat.deepseek.com/a/chat/new',
        addedAt: NOW - 60_000,
        lastSeenAt: NOW - 60_000,
      }],
    });
    mountHistoryDom();

    const section = renderProjectSidebar(document, createRenderOptions({
      state,
      expandedProjectIds: new Set(['project-deepseek']),
    }));

    expect(section?.querySelector<HTMLAnchorElement>('a[data-dpp-project-conversation-id="session-one"]')?.href)
      .toBe('http://localhost:3000/a/chat/s/session-one');
  });

  it('opens project conversations through the matching native history link', async () => {
    const state = createProjectState();
    sendMessage.mockImplementation(async (message) => {
      if (message.type === 'GET_PROJECT_CONTEXT_STATE') return state;
      return { ok: true };
    });
    mountHistoryDom();
    const nativeOpen = vi.fn((event: Event) => event.preventDefault());
    document.querySelector<HTMLAnchorElement>('[data-testid="session-one-link"]')?.addEventListener('click', nativeOpen);

    const controller = startDeepSeekProjectSidebarOrganizer(() => labels);
    await flushProjectSidebar();

    document.querySelector<HTMLAnchorElement>('a[data-dpp-project-conversation-id="session-one"]')?.click();

    expect(nativeOpen).toHaveBeenCalledTimes(1);
    controller.stop();
  });

  it('does not reschedule renders from its own injected project DOM mutations', async () => {
    const state = createProjectState({ conversations: [] });
    sendMessage.mockImplementation(async (message) => {
      if (message.type === 'GET_PROJECT_CONTEXT_STATE') return state;
      return { ok: true };
    });
    mountHistoryDom();

    const controller = startDeepSeekProjectSidebarOrganizer(() => labels);
    await flushProjectSidebar();
    const row = document.querySelector('.dpp-project-sidebar__project-row');

    await flushProjectSidebar();

    expect(row).not.toBeNull();
    expect(document.querySelector('.dpp-project-sidebar__project-row')).toBe(row);
    controller.stop();
  });

  it('projects invalid repository responses through the shared Project codec', async () => {
    sendMessage.mockImplementation(async (message) => {
      if (message.type === 'GET_PROJECT_CONTEXT_STATE') {
        return {
          schemaVersion: 2,
          projects: [{ id: 'incomplete-project' }],
          conversations: [],
          pendingProjectId: null,
        };
      }
      return { ok: true };
    });
    mountHistoryDom();

    const controller = startDeepSeekProjectSidebarOrganizer(() => labels);
    await flushProjectSidebar();

    expect(document.getElementById('dpp-project-sidebar')?.textContent)
      .toContain('Project action failed: projectSidebarState.projects[0].name must be a non-empty string');
    controller.stop();
  });

  it('keeps the last valid Project sidebar state when a corrupt update is broadcast', async () => {
    const state = createProjectState();
    sendMessage.mockImplementation(async (message) => {
      if (message.type === 'GET_PROJECT_CONTEXT_STATE') return state;
      return { ok: true };
    });
    mountHistoryDom();
    const controller = startDeepSeekProjectSidebarOrganizer(() => labels);
    await flushProjectSidebar();

    for (const listener of runtimeListeners) {
      listener({
        type: 'PROJECT_CONTEXT_UPDATED',
        state: {
          schemaVersion: 2,
          projects: [{ id: 'incomplete-project' }],
          conversations: [],
          pendingProjectId: null,
        },
      }, {
        id: 'extension-id',
        url: 'chrome-extension://extension-id/background.js',
      });
    }
    await flushProjectSidebar();

    expect(document.getElementById('dpp-project-sidebar')?.textContent)
      .toContain('Project action failed: projectSidebarUpdate.projects[0].name must be a non-empty string');
    expect(document.querySelector('.dpp-project-sidebar__project-name')?.textContent)
      .toBe('deepseek-pp');
    controller.stop();
  });

  it('moves the current conversation from the project sidebar action', async () => {
    const state = createProjectState({ conversations: [] });
    sendMessage.mockImplementation(async (message) => {
      if (message.type === 'GET_PROJECT_CONTEXT_STATE') return state;
      return { ok: true };
    });
    mountHistoryDom();
    window.history.pushState({}, '', '/a/chat/s/session-two');
    document.title = 'Check uncommitted changes - DeepSeek';

    const controller = startDeepSeekProjectSidebarOrganizer(() => labels);
    await flushProjectSidebar();

    document.querySelector<HTMLButtonElement>('[data-dpp-project-action="move-current"]')?.click();
    await Promise.resolve();

    expect(sendMessage).toHaveBeenCalledWith({
      type: 'ADD_CONVERSATION_TO_PROJECT',
      payload: {
        projectId: 'project-deepseek',
        conversation: {
          conversationId: 'session-two',
          title: 'Check uncommitted changes',
          url: 'http://localhost:3000/a/chat/s/session-two',
        },
      },
    });
    controller.stop();
  });

  it('injects project actions into DeepSeek native conversation menus', async () => {
    const state = createProjectState({ conversations: [] });
    sendMessage.mockImplementation(async (message) => {
      if (message.type === 'GET_PROJECT_CONTEXT_STATE') return state;
      return { ok: true };
    });
    mountHistoryDom();

    const controller = startDeepSeekProjectSidebarOrganizer(() => labels);
    await flushProjectSidebar();
    document.querySelector<HTMLButtonElement>('[data-testid="session-two-menu"]')?.click();
    document.body.insertAdjacentHTML('beforeend', `
      <div role="menu" data-testid="native-menu">
        <button>Rename</button>
        <button>Pin</button>
        <button>Share</button>
        <button>Delete</button>
      </div>
    `);
    await flushProjectSidebar();

    expect(document.querySelector('[data-dpp-project-native-menu="true"]')?.textContent).toContain('Add to project');
    document.querySelector<HTMLButtonElement>('[data-dpp-project-native-action="join"]')?.click();
    await Promise.resolve();

    expect(sendMessage).toHaveBeenCalledWith({
      type: 'ADD_CONVERSATION_TO_PROJECT',
      payload: {
        projectId: 'project-deepseek',
        conversation: {
          conversationId: 'session-two',
          title: 'Check uncommitted changes',
          url: 'https://chat.deepseek.com/a/chat/s/session-two',
        },
      },
    });
    controller.stop();
  });

  it('handles native project actions before the host menu can swallow click events', async () => {
    const state = createProjectState({ conversations: [] });
    sendMessage.mockImplementation(async (message) => {
      if (message.type === 'GET_PROJECT_CONTEXT_STATE') return state;
      return { ok: true };
    });
    mountHistoryDom();

    const controller = startDeepSeekProjectSidebarOrganizer(() => labels);
    await flushProjectSidebar();
    document.querySelector<HTMLButtonElement>('[data-testid="session-two-menu"]')?.click();
    document.body.insertAdjacentHTML('beforeend', `
      <div role="menu" data-testid="native-menu">
        <button>Rename</button>
        <button>Pin</button>
        <button>Share</button>
        <button>Delete</button>
      </div>
    `);
    await flushProjectSidebar();

    const swallowHostClick = (event: Event) => {
      event.stopPropagation();
    };
    document.addEventListener('click', swallowHostClick, true);
    try {
      const join = document.querySelector<HTMLButtonElement>('[data-dpp-project-native-action="join"]')!;
      join.dispatchEvent(new Event('pointerdown', { bubbles: true, cancelable: true }));
      join.click();
      await Promise.resolve();
    } finally {
      document.removeEventListener('click', swallowHostClick, true);
      controller.stop();
    }

    const addCalls = sendMessage.mock.calls.filter(([message]) => message.type === 'ADD_CONVERSATION_TO_PROJECT');
    expect(addCalls).toHaveLength(1);
    expect(addCalls[0][0]).toMatchObject({
      payload: {
        projectId: 'project-deepseek',
        conversation: { conversationId: 'session-two' },
      },
    });
  });

  it('removes a conversation from its project through the project row menu', async () => {
    const state = createProjectState();
    sendMessage.mockImplementation(async (message) => {
      if (message.type === 'GET_PROJECT_CONTEXT_STATE') return state;
      return { ok: true };
    });
    mountHistoryDom();

    const controller = startDeepSeekProjectSidebarOrganizer(() => labels);
    await flushProjectSidebar();

    document.querySelector<HTMLButtonElement>('[data-dpp-project-conversation-menu="true"]')?.click();
    await flushProjectSidebar();
    expect(document.querySelector('.dpp-project-sidebar__conversation-menu')?.textContent).toContain('Remove from project: deepseek-pp');

    document.querySelector<HTMLButtonElement>('[data-dpp-project-remove-conversation="true"]')?.click();
    await Promise.resolve();

    expect(sendMessage).toHaveBeenCalledWith({
      type: 'REMOVE_CONVERSATION_FROM_PROJECT',
      payload: { conversationId: 'session-one' },
    });
    controller.stop();
  });

  it('opens the project conversation menu before host sidebar click handlers can swallow the event', async () => {
    const state = createProjectState();
    sendMessage.mockImplementation(async (message) => {
      if (message.type === 'GET_PROJECT_CONTEXT_STATE') return state;
      return { ok: true };
    });
    mountHistoryDom();

    const controller = startDeepSeekProjectSidebarOrganizer(() => labels);
    await flushProjectSidebar();

    const swallowHostClick = (event: Event) => {
      event.stopPropagation();
    };
    document.addEventListener('click', swallowHostClick, true);
    try {
      const menuButton = document.querySelector<HTMLButtonElement>('[data-dpp-project-conversation-menu="true"]')!;
      menuButton.dispatchEvent(new Event('pointerdown', { bubbles: true, cancelable: true }));
      menuButton.click();
      await flushProjectSidebar();
      expect(document.querySelector('.dpp-project-sidebar__conversation-menu')?.textContent).toContain('Remove from project: deepseek-pp');
    } finally {
      document.removeEventListener('click', swallowHostClick, true);
      controller.stop();
    }
  });

  it('removes injected UI and restores hidden history rows on stop', async () => {
    const state = createProjectState();
    sendMessage.mockResolvedValue(state);
    mountHistoryDom();

    const controller = startDeepSeekProjectSidebarOrganizer(() => labels);
    await flushProjectSidebar();
    expect(document.getElementById('dpp-project-sidebar')).not.toBeNull();
    expect(document.querySelector<HTMLElement>('[data-testid="session-one-row"]')?.hidden).toBe(true);

    controller.stop();

    expect(document.getElementById('dpp-project-sidebar')).toBeNull();
    expect(document.querySelector<HTMLElement>('[data-testid="session-one-row"]')?.hidden).toBe(false);
    expect(document.querySelector<HTMLElement>('[data-testid="session-one-row"]')?.style.getPropertyValue('display')).toBe('');
  });

  it('finishes teardown when an extension reload has invalidated the runtime listener', async () => {
    const state = createProjectState();
    sendMessage.mockResolvedValue(state);
    mountHistoryDom();

    const controller = startDeepSeekProjectSidebarOrganizer(() => labels);
    await flushProjectSidebar();
    const removeListener = chrome.runtime.onMessage.removeListener as ReturnType<typeof vi.fn>;
    removeListener.mockImplementationOnce(() => {
      throw new Error('Extension context invalidated.');
    });

    expect(() => controller.stop()).not.toThrow();
    expect(document.getElementById('dpp-project-sidebar')).toBeNull();
    expect(document.querySelector<HTMLElement>('[data-testid="session-one-row"]')?.hidden).toBe(false);
  });

  it('toggles a project as the pending context for the next new conversation', async () => {
    const state = createProjectState({ conversations: [] });
    sendMessage.mockImplementation(async (message) => {
      if (message.type === 'GET_PROJECT_CONTEXT_STATE') return state;
      return { ok: true };
    });
    mountHistoryDom();

    const controller = startDeepSeekProjectSidebarOrganizer(() => labels);
    await flushProjectSidebar();

    document.querySelector<HTMLButtonElement>('[data-dpp-project-action="toggle-pending"]')?.click();
    await Promise.resolve();

    expect(sendMessage).toHaveBeenCalledWith({
      type: 'SET_PENDING_PROJECT_CONTEXT',
      payload: { projectId: 'project-deepseek' },
    });
    controller.stop();
  });

  it('renders the pending banner and reflects pending state on the toggle button', () => {
    const state = createProjectState({ conversations: [], pendingProjectId: 'project-deepseek' });
    mountHistoryDom();

    const section = renderProjectSidebar(document, createRenderOptions({
      state,
      expandedProjectIds: new Set(['project-deepseek']),
    }));

    expect(section?.querySelector('.dpp-project-sidebar__pending')?.textContent).toBe('The next new chat will use this project');
    const toggleButton = section?.querySelector<HTMLButtonElement>('[data-dpp-project-action="toggle-pending"]');
    expect(toggleButton?.dataset.active).toBe('true');
    expect(toggleButton?.getAttribute('aria-label')).toBe('Cancel using deepseek-pp for next new chat');
  });

  it('exposes a one-step action to start a new conversation in a project', () => {
    const state = createProjectState({ conversations: [] });
    const onNewProjectConversation = vi.fn();
    mountHistoryDom();

    const section = renderProjectSidebar(document, createRenderOptions({
      state,
      onNewProjectConversation,
    }));

    const button = section?.querySelector<HTMLButtonElement>('[data-dpp-project-action="new-project-conversation"]');
    expect(button?.getAttribute('aria-label')).toBe('New chat in deepseek-pp');
    button?.click();

    expect(onNewProjectConversation).toHaveBeenCalledWith('project-deepseek');
  });

  it('uses the native history title when a project conversation still has the default DeepSeek title', () => {
    const state = createProjectState({
      conversations: [{
        conversationId: 'session-one',
        projectId: 'project-deepseek',
        title: 'DeepSeek-探索未至之境',
        url: 'https://chat.deepseek.com/a/chat/s/session-one',
        addedAt: NOW - 60_000,
        lastSeenAt: NOW - 60_000,
      }],
    });
    mountHistoryDom();

    const section = renderProjectSidebar(document, createRenderOptions({
      state,
      expandedProjectIds: new Set(['project-deepseek']),
    }));

    expect(section?.querySelector('[data-dpp-project-conversation-id="session-one"]')?.textContent)
      .toContain('Release version 0.7.3');
  });

  it('localizes stored untitled project conversation placeholders', () => {
    const state = createProjectState({
      conversations: [{
        conversationId: 'session-missing',
        projectId: 'project-deepseek',
        title: 'Untitled conversation',
        url: 'https://chat.deepseek.com/a/chat/s/session-missing',
        addedAt: NOW - 60_000,
        lastSeenAt: NOW - 60_000,
      }],
    });
    mountHistoryDom();

    const section = renderProjectSidebar(document, createRenderOptions({
      state,
      expandedProjectIds: new Set(['project-deepseek']),
    }));

    expect(section?.querySelector('[data-dpp-project-conversation-id="session-missing"]')?.textContent)
      .toContain('Untitled conversation');
  });

  it('shows a toggle to expand conversations beyond the project limit', () => {
    const conversations = Array.from({ length: 6 }, (_, index) => ({
      conversationId: `session-${index}`,
      projectId: 'project-deepseek',
      title: `Task ${index}`,
      url: `https://chat.deepseek.com/a/chat/s/session-${index}`,
      addedAt: NOW - index * 1000,
      lastSeenAt: NOW - index * 1000,
    }));
    const state = createProjectState({ conversations });
    mountHistoryDom();

    const collapsed = renderProjectSidebar(document, createRenderOptions({
      state,
      expandedProjectIds: new Set(['project-deepseek']),
    }));
    expect(collapsed?.querySelectorAll('.dpp-project-sidebar__conversation-row')).toHaveLength(5);
    expect(collapsed?.querySelector('[data-dpp-project-show-all]')?.textContent).toBe('Show more');

    const onToggleShowAll = vi.fn();
    const expanded = renderProjectSidebar(document, createRenderOptions({
      state,
      expandedProjectIds: new Set(['project-deepseek']),
      showAllProjectIds: new Set(['project-deepseek']),
      onToggleShowAll,
    }));
    expect(expanded?.querySelectorAll('.dpp-project-sidebar__conversation-row')).toHaveLength(6);
    expect(expanded?.querySelector('[data-dpp-project-show-all]')?.textContent).toBe('Show less');

    expanded?.querySelector<HTMLButtonElement>('[data-dpp-project-show-all]')?.click();
    expect(onToggleShowAll).toHaveBeenCalledWith('project-deepseek');
  });
});

function mountHistoryDom() {
  document.body.innerHTML = `
    <nav data-testid="sidebar">
      <button>New chat</button>
      <div>Today</div>
      <div data-testid="session-one-row"><a data-testid="session-one-link" href="https://chat.deepseek.com/a/chat/s/session-one">Release version 0.7.3</a><button data-testid="session-one-menu">...</button></div>
      <div data-testid="session-two-row"><a data-testid="session-two-link" href="https://chat.deepseek.com/a/chat/s/session-two">Check uncommitted changes</a><button data-testid="session-two-menu">...</button></div>
    </nav>
  `;
}

function createRenderOptions(
  overrides: Partial<Parameters<typeof renderProjectSidebar>[1]> & {
    state: ProjectContextState;
  },
): Parameters<typeof renderProjectSidebar>[1] {
  return {
    labels,
    statusMessage: '',
    expandedProjectIds: new Set(),
    showAllProjectIds: new Set(),
    onToggleProject: vi.fn(),
    onToggleShowAll: vi.fn(),
    onOpenProjectConversation: vi.fn(),
    onOpenProjectConversationMenu: vi.fn(),
    onRemoveConversationFromProject: vi.fn(),
    onMoveCurrent: vi.fn(),
    onNewProjectConversation: vi.fn(),
    onTogglePending: vi.fn(),
    ...overrides,
  };
}

function createProjectState(overrides: Partial<ProjectContextState> = {}): ProjectContextState {
  return {
    schemaVersion: 2,
    projects: [{
      id: 'project-deepseek',
      name: 'deepseek-pp',
      description: '',
      instructions: 'Keep release context.',
      createdAt: NOW - 100_000,
      updatedAt: NOW - 90_000,
    }],
    conversations: [{
      conversationId: 'session-one',
      projectId: 'project-deepseek',
      title: 'Release version 0.7.3',
      url: 'https://chat.deepseek.com/a/chat/s/session-one',
      addedAt: NOW - 60_000,
      lastSeenAt: NOW - 60_000,
    }],
    pendingProjectId: null,
    ...overrides,
  };
}

async function flushProjectSidebar() {
  await Promise.resolve();
  vi.advanceTimersByTime(120);
  await Promise.resolve();
}
