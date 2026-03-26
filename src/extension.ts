// Copyright 2026 Leon Albert
// Licensed under the Apache License, Version 2.0

import * as vscode from 'vscode';
import { LectureChatSideBar } from './LectureChatSideBar';
import { StatusbarManager } from './ExtensionManager/StatusbarManager';
import { SettingsManager } from './ExtensionManager/SettingsManager';
import { APIKeyManager } from './ExtensionManager/APIKeyManager';
import { InitializeLecture } from './LLM/Milestones/1_InitializeLecture';
import { BrainstormLiterature } from './LLM/Milestones/2_BrainstormLiterature';
import { ProviderRegistry } from './LLM/Provider/ProviderRegistry';
import { ComplexityWatcher } from './LLM/Watchers/ComplexityWatcher';
import { GenerateSlidesFromTitles } from './LLM/Milestones/3_GenerateSlidesFromTitles';
import { GenerateTeleprompterFromSlides } from './LLM/Milestones/4_GenerateTeleprompterFromSlides';
import { GenerateQuizQuestions } from './LLM/Milestones/5_GenerateQuizQuestions';
import { FormatWatcher } from './LLM/Watchers/FormatWatcher';

export async function activate(context: vscode.ExtensionContext) {
  // ─────────────────────────────────────────────────────────────────────────
  // CORE PROVIDER REGISTRY
  // ─────────────────────────────────────────────────────────────────────────
  // Provider Registry - central LLM provider management
  const providerRegistry = new ProviderRegistry();
  context.subscriptions.push(providerRegistry);

  // ─────────────────────────────────────────────────────────────────────────
  // EXTENSION MANAGERS
  // ─────────────────────────────────────────────────────────────────────────
  // API Key Management
  const keyManager = APIKeyManager.initialize(context, providerRegistry);
  context.subscriptions.push(keyManager);

  // Status Bar Items
  const statusbarManager = new StatusbarManager(providerRegistry);
  context.subscriptions.push(statusbarManager);

  // Settings Manager
  const settingsManager = new SettingsManager(statusbarManager, providerRegistry);
  context.subscriptions.push(settingsManager);

  // ─────────────────────────────────────────────────────────────────────────
  // WEBVIEW PROVIDERS
  // ─────────────────────────────────────────────────────────────────────────
  // Sidebar Chat Provider needed for LLMS to interact with the Chat
  const lectureProvider = new LectureChatSideBar(context.extensionUri, providerRegistry);
  context.subscriptions.push(vscode.window.registerWebviewViewProvider(LectureChatSideBar.viewType, lectureProvider));

  // ─────────────────────────────────────────────────────────────────────────
  // MILESTONES
  // ─────────────────────────────────────────────────────────────────────────
  [
    InitializeLecture,
    BrainstormLiterature,
    GenerateSlidesFromTitles,
    GenerateTeleprompterFromSlides,
    GenerateQuizQuestions
  ].forEach(MilestoneClass => {
    const milestone = new MilestoneClass(providerRegistry);
    context.subscriptions.push(milestone);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // WATCHERS
  // ─────────────────────────────────────────────────────────────────────────
  [
    ComplexityWatcher,
    FormatWatcher
  ].forEach(WatcherClass => {
    const watcher = new WatcherClass(providerRegistry);
    context.subscriptions.push(watcher);
  });
}

export function deactivate() { }

