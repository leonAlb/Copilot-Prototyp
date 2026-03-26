/**
 * Test Suite: ChatSessionManager
 *
 * Tests the chat session management logic including session isolation,
 * message operations, and default session ID behavior.
 */

import * as assert from 'assert';
import {
    ChatSessionManager,
    CHAT_SESSION_ID,
    MILESTONE_SESSION_ID,
    WATCHER_SESSION_ID,
} from '../../Utils/ChatSessionManager';

// ─────────────────────────────────────────────────────────────────────────────
// TEST SUITE: Session ID Constants
// ─────────────────────────────────────────────────────────────────────────────

suite('ChatSessionManager Constants', () => {
    test('CHAT_SESSION_ID is "chat"', () => {
        assert.strictEqual(CHAT_SESSION_ID, 'chat');
    });

    test('MILESTONE_SESSION_ID is "milestone"', () => {
        assert.strictEqual(MILESTONE_SESSION_ID, 'milestone');
    });

    test('WATCHER_SESSION_ID is "watcher"', () => {
        assert.strictEqual(WATCHER_SESSION_ID, 'watcher');
    });

    test('all session IDs are unique', () => {
        const ids = [CHAT_SESSION_ID, MILESTONE_SESSION_ID, WATCHER_SESSION_ID];
        const unique = new Set(ids);
        assert.strictEqual(unique.size, ids.length, 'Session IDs must be unique');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// TEST SUITE: addMessage
// ─────────────────────────────────────────────────────────────────────────────

suite('ChatSessionManager addMessage', () => {
    let manager: ChatSessionManager;

    setup(() => {
        manager = new ChatSessionManager();
    });

    test('adds a message to the default (chat) session', () => {
        manager.addMessage({ role: 'user', content: 'Hello' });
        const contents = manager.getContents();
        assert.strictEqual(contents.length, 1);
        assert.deepStrictEqual(contents[0], { role: 'user', content: 'Hello' });
    });

    test('adds a message to the default session when explicitly passing CHAT_SESSION_ID', () => {
        manager.addMessage({ role: 'user', content: 'A' });
        manager.addMessage({ role: 'user', content: 'B' }, CHAT_SESSION_ID);

        const contents = manager.getContents(CHAT_SESSION_ID);
        assert.strictEqual(contents.length, 2);
        assert.deepStrictEqual(contents[0], { role: 'user', content: 'A' });
        assert.deepStrictEqual(contents[1], { role: 'user', content: 'B' });
    });

    test('adds a message to a named session', () => {
        manager.addMessage({ role: 'system', content: 'init' }, MILESTONE_SESSION_ID);
        const contents = manager.getContents(MILESTONE_SESSION_ID);
        assert.strictEqual(contents.length, 1);
        assert.deepStrictEqual(contents[0], { role: 'system', content: 'init' });
    });

    test('adds multiple messages sequentially', () => {
        manager.addMessage({ role: 'user', content: '1' });
        manager.addMessage({ role: 'assistant', content: '2' });
        manager.addMessage({ role: 'user', content: '3' });

        const contents = manager.getContents();
        assert.strictEqual(contents.length, 3);
        assert.strictEqual(contents[2].content, '3');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// TEST SUITE: addMessages (bulk)
// ─────────────────────────────────────────────────────────────────────────────

suite('ChatSessionManager addMessages', () => {
    let manager: ChatSessionManager;

    setup(() => {
        manager = new ChatSessionManager();
    });

    test('adds multiple messages at once to the default session', () => {
        const msgs = [
            { role: 'user', content: 'A' },
            { role: 'assistant', content: 'B' },
        ];
        manager.addMessages(msgs);
        const contents = manager.getContents();
        assert.strictEqual(contents.length, 2);
        assert.deepStrictEqual(contents, msgs);
    });

    test('adds multiple messages to a named session', () => {
        const msgs = [
            { role: 'system', content: 'X' },
            { role: 'user', content: 'Y' },
        ];
        manager.addMessages(msgs, WATCHER_SESSION_ID);
        assert.strictEqual(manager.getContents(WATCHER_SESSION_ID).length, 2);
        assert.strictEqual(manager.getContents(CHAT_SESSION_ID).length, 0);
    });

    test('appends to existing messages', () => {
        manager.addMessage({ role: 'user', content: 'first' });
        manager.addMessages([
            { role: 'assistant', content: 'second' },
            { role: 'user', content: 'third' },
        ]);
        assert.strictEqual(manager.getContents().length, 3);
    });

    test('adding an empty array does not affect session', () => {
        manager.addMessage({ role: 'user', content: 'existing' });
        manager.addMessages([]);
        assert.strictEqual(manager.getContents().length, 1);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// TEST SUITE: Session Isolation
// ─────────────────────────────────────────────────────────────────────────────

suite('ChatSessionManager Session Isolation', () => {
    let manager: ChatSessionManager;

    setup(() => {
        manager = new ChatSessionManager();
    });

    test('chat and milestone sessions are independent', () => {
        manager.addMessage({ role: 'user', content: 'chat msg' }, CHAT_SESSION_ID);
        manager.addMessage({ role: 'user', content: 'milestone msg' }, MILESTONE_SESSION_ID);

        const chatContents = manager.getContents(CHAT_SESSION_ID);
        const milestoneContents = manager.getContents(MILESTONE_SESSION_ID);

        assert.strictEqual(chatContents.length, 1);
        assert.strictEqual(milestoneContents.length, 1);
        assert.strictEqual(chatContents[0].content, 'chat msg');
        assert.strictEqual(milestoneContents[0].content, 'milestone msg');
    });

    test('all three standard sessions are fully isolated', () => {
        manager.addMessage({ content: 'c' }, CHAT_SESSION_ID);
        manager.addMessage({ content: 'm' }, MILESTONE_SESSION_ID);
        manager.addMessage({ content: 'w' }, WATCHER_SESSION_ID);

        assert.strictEqual(manager.getContents(CHAT_SESSION_ID).length, 1);
        assert.strictEqual(manager.getContents(MILESTONE_SESSION_ID).length, 1);
        assert.strictEqual(manager.getContents(WATCHER_SESSION_ID).length, 1);

        assert.strictEqual(manager.getContents(CHAT_SESSION_ID)[0].content, 'c');
        assert.strictEqual(manager.getContents(MILESTONE_SESSION_ID)[0].content, 'm');
        assert.strictEqual(manager.getContents(WATCHER_SESSION_ID)[0].content, 'w');
    });

    test('clearing one session does not affect others', () => {
        manager.addMessage({ content: 'chat' }, CHAT_SESSION_ID);
        manager.addMessage({ content: 'milestone' }, MILESTONE_SESSION_ID);
        manager.addMessage({ content: 'watcher' }, WATCHER_SESSION_ID);

        manager.clearSession(MILESTONE_SESSION_ID);

        assert.strictEqual(manager.getContents(CHAT_SESSION_ID).length, 1);
        assert.strictEqual(manager.getContents(MILESTONE_SESSION_ID).length, 0);
        assert.strictEqual(manager.getContents(WATCHER_SESSION_ID).length, 1);
    });

    test('custom session IDs are also isolated', () => {
        manager.addMessage({ content: 'custom' }, 'my-custom-session');
        manager.addMessage({ content: 'chat' }, CHAT_SESSION_ID);

        assert.strictEqual(manager.getContents('my-custom-session').length, 1);
        assert.strictEqual(manager.getContents(CHAT_SESSION_ID).length, 1);
        assert.strictEqual(manager.getContents('my-custom-session')[0].content, 'custom');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// TEST SUITE: setContents
// ─────────────────────────────────────────────────────────────────────────────

suite('ChatSessionManager setContents', () => {
    let manager: ChatSessionManager;

    setup(() => {
        manager = new ChatSessionManager();
    });

    test('replaces existing session contents', () => {
        manager.addMessage({ content: 'old' });
        manager.setContents([{ content: 'new1' }, { content: 'new2' }]);

        const contents = manager.getContents();
        assert.strictEqual(contents.length, 2);
        assert.strictEqual(contents[0].content, 'new1');
    });

    test('sets contents on a new session', () => {
        manager.setContents([{ content: 'a' }], 'fresh');
        assert.strictEqual(manager.getContents('fresh').length, 1);
    });

    test('setting empty array effectively clears the session', () => {
        manager.addMessage({ content: 'data' });
        manager.setContents([]);
        assert.strictEqual(manager.getContents().length, 0);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// TEST SUITE: clearSession / clearAllSessions
// ─────────────────────────────────────────────────────────────────────────────

suite('ChatSessionManager Clear Operations', () => {
    let manager: ChatSessionManager;

    setup(() => {
        manager = new ChatSessionManager();
    });

    test('clearSession empties only the specified session', () => {
        manager.addMessage({ content: 'a' }, CHAT_SESSION_ID);
        manager.addMessage({ content: 'b' }, MILESTONE_SESSION_ID);

        manager.clearSession(CHAT_SESSION_ID);

        assert.strictEqual(manager.getContents(CHAT_SESSION_ID).length, 0);
        assert.strictEqual(manager.getContents(MILESTONE_SESSION_ID).length, 1);
    });

    test('clearSession on non-existent session does not throw', () => {
        assert.doesNotThrow(() => manager.clearSession('nonexistent'));
        assert.strictEqual(manager.getContents('nonexistent').length, 0);
    });

    test('clearAllSessions empties every session', () => {
        manager.addMessage({ content: 'a' }, CHAT_SESSION_ID);
        manager.addMessage({ content: 'b' }, MILESTONE_SESSION_ID);
        manager.addMessage({ content: 'c' }, WATCHER_SESSION_ID);
        manager.addMessage({ content: 'd' }, 'custom');

        manager.clearAllSessions();

        // After clearAll, getContents creates fresh empty sessions
        assert.strictEqual(manager.getContents(CHAT_SESSION_ID).length, 0);
        assert.strictEqual(manager.getContents(MILESTONE_SESSION_ID).length, 0);
        assert.strictEqual(manager.getContents(WATCHER_SESSION_ID).length, 0);
        assert.strictEqual(manager.getContents('custom').length, 0);
    });

    test('session is usable again after clearing', () => {
        manager.addMessage({ content: 'before' });
        manager.clearSession(CHAT_SESSION_ID);
        manager.addMessage({ content: 'after' });

        const contents = manager.getContents();
        assert.strictEqual(contents.length, 1);
        assert.strictEqual(contents[0].content, 'after');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// TEST SUITE: getContents Reference Behavior
// ─────────────────────────────────────────────────────────────────────────────

suite('ChatSessionManager getContents Reference', () => {
    let manager: ChatSessionManager;

    setup(() => {
        manager = new ChatSessionManager();
    });

    test('getContents returns a live reference (mutations visible)', () => {
        manager.addMessage({ content: 'first' });
        const ref = manager.getContents();
        manager.addMessage({ content: 'second' });

        // Since getContents returns the internal array, the reference should reflect additions
        assert.strictEqual(ref.length, 2);
    });

    test('getContents on empty session returns empty array', () => {
        const contents = manager.getContents('never-used');
        assert.ok(Array.isArray(contents));
        assert.strictEqual(contents.length, 0);
    });
});
