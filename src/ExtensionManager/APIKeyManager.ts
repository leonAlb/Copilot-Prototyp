import * as vscode from 'vscode';
import { ProviderRegistry } from '../LLM/Provider/ProviderRegistry';

/**
 * Manages API keys for different LLM providers within the VSCode extension.
 * Supports setting and retrieving API keys securely using VSCode's SecretStorage.
 * 
 * Singleton pattern: Use APIKeyManager.getInstance() to access the manager.
 */
export class APIKeyManager implements vscode.Disposable {
    private static instance: APIKeyManager | null = null;
    private context: vscode.ExtensionContext;
    private providerRegistry: ProviderRegistry;
    private disposables: vscode.Disposable[] = [];

    private constructor(context: vscode.ExtensionContext, providerRegistry: ProviderRegistry) {
        this.context = context;
        this.providerRegistry = providerRegistry;
        this.registerCommands();
    }

    /**
     * Initialize the singleton instance (call once during extension activation)
     */
    public static initialize(context: vscode.ExtensionContext, providerRegistry: ProviderRegistry): APIKeyManager {
        if (!APIKeyManager.instance) {
            APIKeyManager.instance = new APIKeyManager(context, providerRegistry);
        }
        return APIKeyManager.instance;
    }

    // Get the singleton instance (throws error if not initialized)
    public static getInstance(): APIKeyManager {
        if (!APIKeyManager.instance) {
            throw new Error('APIKeyManager not initialized. Call initialize() first during extension activation.');
        }
        return APIKeyManager.instance;
    }

    // Register VSCode commands for setting and clearing API keys
    private registerCommands(): void {
        this.disposables.push(
            vscode.commands.registerCommand('lecturepilot.setApiKey', () => this.setApiKeyForCurrentProvider())
        );
        this.disposables.push(
            vscode.commands.registerCommand('lecturepilot.clearApiKey', () => this.clearApiKeyForCurrentProvider())
        );
    }

    // Derive the secret storage key from a provider name
    private secretKeyFor(providerName: string): string {
        return `${providerName.toLowerCase().replace(/\s+/g, '_')}_api_key`;
    }

    // Set the API key for the currently active provider
    private async setApiKeyForCurrentProvider(): Promise<string | undefined> {
        const provider = this.providerRegistry.getCurrentProvider();
        if (!provider) {
            vscode.window.showErrorMessage('No active LLM provider. Please select a model first.');
            return undefined;
        }
        const providerName = provider.getProviderName();

        const apiKey = await vscode.window.showInputBox({
            prompt: `Enter your ${providerName} API Key`,
            password: false,
            ignoreFocusOut: true,
            title: `Configure ${providerName} API Key`
        });

        if (apiKey) {
            await this.context.secrets.store(this.secretKeyFor(providerName), apiKey);
            vscode.window.showInformationMessage(`✓ ${providerName} API Key saved!`);
        } else {
            vscode.window.showWarningMessage(`✗ ${providerName} API Key not set.`);
        }
        return apiKey;
    }

    // Clear the API key for the currently active provider
    private async clearApiKeyForCurrentProvider(): Promise<void> {
        const provider = this.providerRegistry.getCurrentProvider();
        if (!provider) {
            vscode.window.showErrorMessage('No active LLM provider. Please select a model first.');
            return;
        }
        const providerName = provider.getProviderName();

        await this.context.secrets.delete(this.secretKeyFor(providerName));
        vscode.window.showInformationMessage(`✓ ${providerName} API Key cleared!`);
    }

    // Get API key for a given provider (used internally by providers)
    public async getApiKey(providerName: string): Promise<string | undefined> {
        const apiKey = await this.context.secrets.get(this.secretKeyFor(providerName));
        if (!apiKey) {
            vscode.window.showWarningMessage(`API Key for ${providerName} not configured. Please set it via the "Set API Key for Current Provider" command.`);
            return undefined;
        }
        return apiKey;
    }

    // Dispose of all registered disposables
    public dispose(): void {
        this.disposables.forEach(d => d.dispose());
    }
}