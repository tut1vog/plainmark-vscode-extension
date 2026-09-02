// Self-contained IIFE entry for dist/mermaid.js — Mermaid's runtime import() chunks fail under vscode-webview://.
import mermaid from 'mermaid';
import { MERMAID_SECURE_KEYS } from './widgets/mermaid_secure.js';

declare global {
  interface Window {
    PlainmarkMermaid?: typeof mermaid;
  }
}

mermaid.initialize({
  startOnLoad: false,
  securityLevel: 'strict',
  secure: MERMAID_SECURE_KEYS,
  suppressErrorRendering: true,
  theme: 'base',
  deterministicIds: true,
});

window.PlainmarkMermaid = mermaid;
