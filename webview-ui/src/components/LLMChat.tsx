import { useRef, useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { vscode } from "../vscodeApi";

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

type LoadingState = 'idle' | 'thinking' | 'tool-executing';

interface LoadingInfo {
  state: LoadingState;
  toolName?: string; // Name of tool being executed
}

// Typing/loading indicator component
function TypingIndicator({ loadingInfo }: { loadingInfo: LoadingInfo }) {
  const getMessage = () => {
    switch (loadingInfo.state) {
      case 'thinking':
        return 'Thinking';
      case 'tool-executing':
        return loadingInfo.toolName 
          ? `Executing ${loadingInfo.toolName}` 
          : 'Executing tool';
      default:
        return '';
    }
  };

  if (loadingInfo.state === 'idle') return null;

  return (
    <div className="mt-2 flex items-center gap-2">
      <strong>Lecture-Pilot:</strong>
      <span className="flex items-center">
        <span>{getMessage()}</span>
        <span className="inline-flex ml-1">
          <span className="typing-dot">.</span>
          <span className="typing-dot">.</span>
          <span className="typing-dot">.</span>
        </span>
      </span>
    </div>
  );
}

export default function LLMChatComponent() {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingInfo, setLoadingInfo] = useState<LoadingInfo>({ state: 'idle' });

  // Auto-scroll to bottom when messages change or loading state changes
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages, loadingInfo]);

  const clearInput = () => {
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  };

  const askAI = () => {
    const textInput = inputRef.current?.value || "";

    if (!textInput.trim()) return;

    // Add user message to chat
    setMessages(prev => [...prev, { role: 'user', content: textInput }]);
    
    // Start loading indicator
    setLoadingInfo({ state: 'thinking' });
    
    clearInput();

    vscode.postMessage({ command: "askLLM", userPrompt: textInput });
  };

  const clearChat = () => {
    setMessages([]);
    setLoadingInfo({ state: 'idle' });
    vscode.postMessage({ command: "clearContext" });
  };

  useEffect(() => {
    const listener = (event: MessageEvent) => {
      const message = event.data;
      
      switch (message.command) {
        case "SendChatToReact":
          // Regular complete message - stop any loading state
          setLoadingInfo({ state: 'idle' });
          setMessages(prev => [...prev, { role: 'assistant', content: message.content }]);
          break;
          
        case "startLoading":
          // Start showing thinking indicator
          setLoadingInfo({ state: 'thinking' });
          break;
          
        case "stopLoading":
          // Stop all loading indicators
          setLoadingInfo({ state: 'idle' });
          break;
          
        case "toolExecuting":
          // Show tool execution state with tool name
          setLoadingInfo({ state: 'tool-executing', toolName: message.toolName });
          break;
      }
    };
    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
  }, []);

  return (
    <div className="flex flex-col h-full w-full">
      {/* Chat history - scrollable */}
      <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-4">
        {messages.map((msg, index) => (
          <div key={index} className="mt-2">
            <strong>{msg.role === 'user' ? 'You:' : 'Lecture-Pilot:'}</strong>
            <div className="markdown-content">
              <ReactMarkdown>{msg.content}</ReactMarkdown>
            </div>
          </div>
        ))}
        <TypingIndicator loadingInfo={loadingInfo} />
      </div>

      {/* Fixed input area at bottom */}
      <div className="flex-shrink-0 p-4">
        <textarea
          ref={inputRef}
          rows={6}
          placeholder="Ask LLM"
          disabled={loadingInfo.state !== 'idle'}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              askAI();
            }
          }}
        />
        <button className="mt-4" onClick={askAI} disabled={loadingInfo.state !== 'idle'}>
          Chat
        </button>
        <button className="mt-4" onClick={clearChat}>
          Clear
        </button>
      </div>
    </div>
  );
}
