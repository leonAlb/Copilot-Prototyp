import * as vscode from 'vscode';
import { GoogleProvider } from './GoogleProvider';
import { AbstractLLMProvider } from './AbstractLLMProvider';
import { OpenAIProvider } from './OpenAIProvider';
import { ThinkingOptions } from '../../ExtensionManager/SettingsManager';
import { Logger } from '../../Utils/Logger';

/**
 * Central routing factory for LLM providers.
 * 
 * Responsibilities:
 * - Routes requests to the correct provider based on selected model
 * - Lazy-loads provider instances (only creates when needed)
 * - Manages provider lifecycle (caching, clearing)
 * 
 * Adding a new provider:
 * 1. Add to PROVIDER_REGISTRY below
 * 2. Create provider class extending AbstractLLMProvider
 * 3. Done! Registry handles routing automatically
 */
export class ProviderRegistry implements vscode.Disposable {
    private providerInstances: Map<string, AbstractLLMProvider> = new Map();
    private currentModelId: string = '';
    private readonly logger = new Logger('ProviderRegistry');

    // Registry of available providers (keyed by provider name)
    private readonly PROVIDER_REGISTRY: Map<string, () => AbstractLLMProvider> = new Map([
        ['Google Gemini', (): AbstractLLMProvider => new GoogleProvider()],
        ['OpenAI', (): AbstractLLMProvider => new OpenAIProvider()],
        // Future providers:
        // ['Anthropic', () => new AnthropicProvider()],
    ]);

    constructor() {
        // Initialize with first available model as default
        const models = this.getAllAvailableModels();
        if (models.length > 0) {
            this.currentModelId = models[0];
        }
    }

    // Returns the active provider based on the current model.
    public getCurrentProvider(): AbstractLLMProvider | null {
        const provider = this.findProviderForModel(this.currentModelId);

        if (!provider) {
            vscode.window.showErrorMessage(`Model "${this.currentModelId}" is not supported.`);
            return null;
        }

        return provider;
    }

    // Returns all available models from all providers.
    public getAllAvailableModels(): string[] {
        const models: string[] = [];

        for (const [providerKey] of this.PROVIDER_REGISTRY) {
            const provider = this.getOrCreateProvider(providerKey);
            if (provider) {
                models.push(...provider.getSupportedModels());
            }
        }

        return models;
    }

    // Get the currently selected model ID.
    public getCurrentModel(): string | undefined {
        return this.currentModelId;
    }

    // Sets the model for the registry and the underlying provider.
    public setCurrentModel(modelId: string): boolean {
        const provider = this.findProviderForModel(modelId);

        if (!provider) {
            this.logger.error(`Model ${modelId} not found`);
            return false;
        }

        // Update registry's current model
        this.currentModelId = modelId;

        // Update provider's internal model
        provider.setModel(modelId);

        this.logger.log(`Model set to: ${modelId}`);
        return true;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SETTINGS METHODS
    // ─────────────────────────────────────────────────────────────────────────

    public getThinkingLevel(): ThinkingOptions | null {
        const provider = this.findProviderForModel(this.currentModelId);
        if (provider) {
            return provider.getThinkingLevel();
        } else {
            this.logger.error(`Cannot get thinking level, provider not found for model: ${this.currentModelId}`);
            return null;
        }
    }

    public setThinkingLevel(level: ThinkingOptions): void {
        const provider = this.findProviderForModel(this.currentModelId);
        if (provider) {
            provider.setThinkingLevel(level);
            this.logger.log(`Thinking level set to: ${level}`);
        } else {
            this.logger.error(`Cannot set thinking level, provider not found for model: ${this.currentModelId}`);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // HELPER METHODS
    // ─────────────────────────────────────────────────────────────────────────
    // Get or create a provider by key.
    private getOrCreateProvider(providerKey: string): AbstractLLMProvider | null {
        if (this.providerInstances.has(providerKey)) {
            return this.providerInstances.get(providerKey)!;
        }

        const factory = this.PROVIDER_REGISTRY.get(providerKey);
        if (!factory) {
            this.logger.error(`Unknown provider: ${providerKey}`);
            return null;
        }

        const provider = factory();
        this.providerInstances.set(providerKey, provider);
        this.logger.log(`Initialized ${providerKey} provider`);

        return provider;
    }

    // Find the provider that supports the given model ID. Needed for routing.
    private findProviderForModel(modelId: string): AbstractLLMProvider | null {
        // Check already-loaded providers first
        for (const provider of this.providerInstances.values()) {
            if (provider.supportsModel(modelId)) {
                return provider;
            }
        }

        // Check remaining providers
        for (const [providerKey] of this.PROVIDER_REGISTRY) {
            if (!this.providerInstances.has(providerKey)) {
                const provider = this.getOrCreateProvider(providerKey);
                if (provider?.supportsModel(modelId)) {
                    return provider;
                }
            }
        }

        return null;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CLEAN UP METHODS
    // ─────────────────────────────────────────────────────────────────────────

    // Dispose of all provider instances
    public dispose(): void {
        this.providerInstances.clear();
        this.logger.log('Disposed all providers');
    }
}
