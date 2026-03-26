import * as vscode from 'vscode';
import { GeneralInstructions } from '../LLM/Instructions/GeneralInstructions';
import { ProviderRegistry } from '../LLM/Provider/ProviderRegistry';
import { ThinkingOptions } from './SettingsManager';

/**
 * Manages status bar items for language and model selection.
 * Handles creation, updates, and cleanup of status bar items.
 */
export class StatusbarManager implements vscode.Disposable {
  private languageItem: vscode.StatusBarItem;
  private modelItem: vscode.StatusBarItem;
  private thinkingItem: vscode.StatusBarItem;
  private disposables: vscode.Disposable[] = [];
  private providerRegistry: ProviderRegistry;

  constructor(providerRegistry: ProviderRegistry) {
    this.providerRegistry = providerRegistry;
    // Higher priority = more to the left. Order: Language | Model | Thinking

    this.thinkingItem = this.createBaseItem('Select Thinking Level for LLM', 'lecturepilot.setThinkingLevelForLLM', 103);
    this.modelItem = this.createBaseItem('Select Model for LLM', 'lecturepilot.setModelForLLM', 102);
    this.languageItem = this.createBaseItem('Select Language for LLM', 'lecturepilot.setLanguageForLLM', 101);

    // Track items for disposal
    this.disposables.push(this.languageItem, this.modelItem, this.thinkingItem);
  }

  // Creates a base status bar item with common properties
  private createBaseItem(tooltip: string, command: string, priority: number): vscode.StatusBarItem {
    const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, priority);
    item.tooltip = tooltip;
    item.command = command;
    item.show();
    return item;
  }

  public updateLanguageText(): void {
    const label = GeneralInstructions.getCurrentLanguage();
    this.languageItem.text = `$(squirrel) ${label}`;
  }

  public updateModelText(): void {
    const model = this.providerRegistry.getCurrentModel() ?? 'No model';
    this.modelItem.text = `$(robot) ${model}`;
  }

  public updateThinkingText(thinking: ThinkingOptions): void {
    this.thinkingItem.text = `$(thinking) ${thinking}`;
  }

  public dispose(): void {
    this.disposables.forEach(d => d.dispose());
  }
}