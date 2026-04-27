import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/tailwind.css'
import "./styles/reset.css";
import "./styles/vscode.css";
import "./styles/custom.css"
import LLMChatComponent from './components/LLMChat.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LLMChatComponent/>
  </StrictMode>,
)
