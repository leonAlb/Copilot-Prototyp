import * as vscode from 'vscode';
import { ProviderRegistry } from '../LLM/Provider/ProviderRegistry';
import { GeneralInstructions } from '../LLM/Instructions/GeneralInstructions';
import { StatusbarManager } from './StatusbarManager';
import { Logger } from '../Utils/Logger';

export enum ThinkingOptions {
  LOW = 'Low',
  MEDIUM = 'Medium',
  HIGH = 'High',
}

/**
 * Manages settings related to LLM models and languages within the VSCode extension
 * If more settings are added in the future, they should be managed here as well
 */
export class SettingsManager implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];
  private statusbarManager: StatusbarManager;
  private providerRegistry: ProviderRegistry;
  private readonly logger = new Logger('SettingsManager');

  constructor(statusbarManager: StatusbarManager, providerRegistry: ProviderRegistry) {
    this.statusbarManager = statusbarManager;
    this.providerRegistry = providerRegistry;
    this.registerCommands();
    this.loadSettings();
  }

  private registerCommands(): void {
    this.disposables.push(
      vscode.commands.registerCommand('lecturepilot.setModelForLLM', () => {
        this.setLLMModel();
      })
    );

    this.disposables.push(
      vscode.commands.registerCommand('lecturepilot.setLanguageForLLM', () => {
        this.setLLMLanguage();
      })
    );

    this.disposables.push(
      vscode.commands.registerCommand('lecturepilot.setThinkingLevelForLLM', () => {
        this.setThinkingLevel();
      })
    );
  }

  private loadSettings(): void {
    this.loadModelSetting();
    this.loadLLMLanguage();
    this.loadThinkingLevel();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // MODEL SETTINGS
  // ─────────────────────────────────────────────────────────────────────────
  private async setLLMModel() {
    const availableModels = this.providerRegistry.getAllAvailableModels();

    if (!availableModels || availableModels.length === 0) {
      vscode.window.showErrorMessage('No available LLM models found. Please check your provider configurations.');
      return;
    }

    const choices = availableModels.map(modelId => ({
      label: modelId,
    }));

    const pick = await vscode.window.showQuickPick(choices, {
      placeHolder: 'Select model for LLM',
      matchOnDetail: true
    });

    // If a model was picked, persist and set it
    if (pick) {
      await vscode.workspace.getConfiguration('lecturepilot').update('model', pick.label, vscode.ConfigurationTarget.Global);
      this.providerRegistry.setCurrentModel(pick.label);

      // Update status bar model text
      this.statusbarManager.updateModelText();

      this.logger.log(`Set LLM model to: ${pick.label}`);
    }
  }

  // Load persisted model setting from configuration
  private loadModelSetting() {
    const configModel = vscode.workspace.getConfiguration('lecturepilot').get<string>('model');
    if (configModel) {
      const success = this.providerRegistry.setCurrentModel(configModel);
      if (success) {
        this.logger.log(`Loaded LLM model from configuration: ${configModel}`);
      } else {
        this.logger.warn(`Failed to load model ${configModel}, defaulting to ${this.providerRegistry.getCurrentModel()}`);
      }
    }
    // Update status bar to show current model (loaded or default)
    this.statusbarManager.updateModelText();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // LANGUAGE SETTINGS
  // ─────────────────────────────────────────────────────────────────────────
  private async setLLMLanguage() {
    const choices = GeneralInstructions.getAvailableLanguages().map(language => ({ label: language.label, description: language.code }));
    const pick = await vscode.window.showQuickPick(choices, { placeHolder: 'Select language for LLM' });

    // If a language was picked, persist and set it
    if (pick) {
      await vscode.workspace.getConfiguration('lecturepilot').update('language', pick.description, vscode.ConfigurationTarget.Global);
      GeneralInstructions.setLanguage(pick.description);

      // Update status bar language text
      this.statusbarManager.updateLanguageText();

      this.logger.log(`Set LLM language to: ${pick.description}`);
    }
  }

  // Load persisted language setting from configuration
  private loadLLMLanguage() {
    const configLang = vscode.workspace.getConfiguration('lecturepilot').get<string>('language');
    if (configLang) {
      GeneralInstructions.setLanguage(configLang);
      this.logger.log(`Loaded LLM language from configuration: ${configLang}`);
    }
    // Update status bar to show current language (loaded or default)
    this.statusbarManager.updateLanguageText();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // THINKING LEVEL SETTINGS
  // ─────────────────────────────────────────────────────────────────────────
  private async setThinkingLevel() {
    const choices = Object.values(ThinkingOptions).map(level => ({ label: level }));
    const pick = await vscode.window.showQuickPick(choices, { placeHolder: 'Select thinking level for LLM' });

    // If a level was picked, persist and set it
    if (pick) {
      await vscode.workspace.getConfiguration('lecturepilot').update('thinking', pick.label, vscode.ConfigurationTarget.Global);
      this.providerRegistry.setThinkingLevel(pick.label as ThinkingOptions);

      this.statusbarManager.updateThinkingText(this.providerRegistry.getThinkingLevel()!);
      this.logger.log(`Set LLM thinking level to: ${pick.label}`);
    }
  }

  // Load persisted language setting from configuration
  private loadThinkingLevel() {
    const configThinking = vscode.workspace.getConfiguration('lecturepilot').get<string>('thinking');
    if (configThinking) {
      this.providerRegistry.setThinkingLevel(configThinking as ThinkingOptions);
      this.logger.log(`Loaded LLM thinking level from configuration: ${configThinking}`);
    }
    // Update status bar to show current language (loaded or default)
    this.statusbarManager.updateThinkingText(this.providerRegistry.getThinkingLevel()!);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // COMPLEXITY WATCHER SETTINGS
  // ─────────────────────────────────────────────────────────────────────────
  public static getComplexityChangesUntilAnalysis(): number {
    return vscode.workspace.getConfiguration('lecturepilot').get<number>('complexityChangesUntilAnalysis', 250)!;
  }

  public static getComplexityMinAnalysisIntervalMs(): number {
    const seconds = vscode.workspace.getConfiguration('lecturepilot').get<number>('complexityMinAnalysisIntervalSeconds', 300)!;
    return seconds * 1000;
  }

  public static getComplexityAnalysisGenerationAttempts(): number {
    return vscode.workspace.getConfiguration('lecturepilot').get<number>('complexityAnalysisGenerationAttempts', 3)!;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // FORMAT WATCHER SETTINGS
  // ─────────────────────────────────────────────────────────────────────────
  public static getMaxNumberOfCharsInLine(): number {
    return vscode.workspace.getConfiguration('lecturepilot').get<number>('maxNumberOfCharsInLine', 80)!;
  }

  public static getFormatChangesUntilAnalysis(): number {
    return vscode.workspace.getConfiguration('lecturepilot').get<number>('formatChangesUntilAnalysis', 500)!;
  }

  public static getFormatMinAnalysisIntervalMs(): number {
    const seconds = vscode.workspace.getConfiguration('lecturepilot').get<number>('formatMinAnalysisIntervalSeconds', 300)!;
    return seconds * 1000;
  }

  public static getFormatAnalysisGenerationAttempts(): number {
    return vscode.workspace.getConfiguration('lecturepilot').get<number>('formatAnalysisGenerationAttempts', 3)!;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // DISPOSABLES
  // ─────────────────────────────────────────────────────────────────────────
  public dispose(): void {
    this.disposables.forEach(d => d.dispose());
  }
}