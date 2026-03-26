import * as vscode from 'vscode';
import { readFileSync } from 'fs';
import { join } from 'path';
import { ProviderRegistry } from './LLM/Provider/ProviderRegistry';
import { CHAT_SESSION_ID } from './Utils/ChatSessionManager';

/**
 * Converts extension paths to webview-safe URIs.
 */
function getUri(webview: vscode.Webview, extensionUri: vscode.Uri, pathList: string[]) {
    return webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, ...pathList));
}

export class LectureChatSideBar implements vscode.WebviewViewProvider {
    public static readonly viewType = 'lecturepilot.main';
    private _webviewView?: vscode.WebviewView;

    constructor(
        private readonly extensionUri: vscode.Uri,
        private readonly providerRegistry: ProviderRegistry
    ) { }

    public resolveWebviewView(webviewView: vscode.WebviewView) {
        this._webviewView = webviewView;
        const webview = webviewView.webview;

        webview.options = {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'media')],
        };

        this.setWebviewHtml(webview);

        webview.onDidReceiveMessage(async (message) => {
            switch (message.command) {
                case 'askLLM':
                    await this.handleAskLLM(message.userPrompt);
                    break;
                case 'clearContext':
                    await this.handleClearContext();
                    break;
            }
        });
    }

    // Loads the HTML content for the webview and replaces asset paths with webview URIs
    private setWebviewHtml(webview: vscode.Webview): void {
        const htmlPath = join(this.extensionUri.fsPath, 'media', 'lecture.html');
        let html = readFileSync(htmlPath, 'utf8');

        const assetsUri = getUri(webview, this.extensionUri, ['media', 'assets']).toString();

        // Replace occurrences of ./assets/, /assets/, or assets/ with the webview URI
        html = html.replace(/(\.?\.\/)?assets\//g, `${assetsUri}/`);

        webview.html = html;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // WEBVIEW MESSAGE HANDLERS
    // ─────────────────────────────────────────────────────────────────────────

    // Handles the 'askLLM' command from the webview
    private async handleAskLLM(userPrompt: any) {
        const provider = this.providerRegistry.getCurrentProvider();

        if (!provider) {
            vscode.window.showErrorMessage(
                'No LLM provider available for the selected model.'
            );
            this._webviewView?.webview.postMessage({
                command: 'SendChatToReact',
                content: '❌ Error: No provider available for the selected model.'
            });
            return;
        }

        provider.askChatLLM(userPrompt, this._webviewView?.webview!);
    }

    // Handles the 'clearContext' command from the webview
    private async handleClearContext() {
        const provider = this.providerRegistry.getCurrentProvider();
        if (!provider) {
            return;
        }

        // Clear the provider's chat session
        provider.clearChatSession(CHAT_SESSION_ID);
        this._webviewView?.webview.postMessage({
            command: 'SendChatToReact',
            content: '🗑️ Chat context cleared.'
        });
    }
}
