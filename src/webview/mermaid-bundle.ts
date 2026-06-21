// Self-contained IIFE entry for dist/mermaid.js — Mermaid's runtime import() chunks fail under vscode-webview://.
import mermaid from 'mermaid';

declare global {
  interface Window {
    PlainmarkMermaid?: typeof mermaid;
  }
}

mermaid.initialize({
  startOnLoad: false,
  securityLevel: 'strict',
  suppressErrorRendering: true,
  theme: 'base',
  deterministicIds: true,
});

window.PlainmarkMermaid = mermaid;
