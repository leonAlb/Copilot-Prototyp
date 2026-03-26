import { Logger } from './Logger';

/** Default session ID for general chat */
export const CHAT_SESSION_ID = 'chat';
/** Session ID for milestone operations */
export const MILESTONE_SESSION_ID = 'milestone';
/** Session ID for watcher operations */
export const WATCHER_SESSION_ID = 'watcher';

/**
 * Manages multiple named chat sessions with independent message histories.
 * Supports separate sessions for general chat and milestones.
 */
export class ChatSessionManager {
    private readonly logger = new Logger('ChatSessionManager');

    private sessions: Map<string, any[]> = new Map();

    /**
     * Gets or creates a session by ID.
     */
    private getSession(sessionId: string): any[] {
        if (!this.sessions.has(sessionId)) {
            this.sessions.set(sessionId, []);
        }
        return this.sessions.get(sessionId)!;
    }

    /**
     * Adds a new message to the specified session.
     * @param message The message to add
     * @param sessionId The session to add to (defaults to 'chat')
     */
    public addMessage(message: any, sessionId: string = CHAT_SESSION_ID): void {
        this.getSession(sessionId).push(message);
    }

    /**
     * Adds multiple messages to the specified session.
     * @param messages Array of messages to add
     * @param sessionId The session to add to (defaults to 'chat')
     */
    public addMessages(messages: any[], sessionId: string = CHAT_SESSION_ID): void {
        this.getSession(sessionId).push(...messages);
    }

    /**
     * Gets the current conversation history for a session.
     * @param sessionId The session to get (defaults to 'chat')
     * @returns Array of all messages in the session
     */
    public getContents(sessionId: string = CHAT_SESSION_ID): any[] {
        return this.getSession(sessionId);
    }

    /**
     * Sets the contents of a specific session.
     * @param contents The messages to set
     * @param sessionId The session to update (defaults to 'chat')
     */
    public setContents(contents: any[], sessionId: string = CHAT_SESSION_ID): void {
        this.sessions.set(sessionId, contents);
    }

    /**
     * Clears all messages from a specific session.
     * @param sessionId The session to clear (defaults to 'chat')
     */
    public clearSession(sessionId: string = CHAT_SESSION_ID): void {
        this.sessions.set(sessionId, []);
        this.logger.log(`Session '${sessionId}' cleared`);
    }

    /**
     * Clears all sessions.
     */
    public clearAllSessions(): void {
        this.sessions.clear();
        this.logger.log('All sessions cleared');
    }
}
