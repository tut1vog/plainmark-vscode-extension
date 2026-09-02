// Mermaid's default `secure` list plus `themeCSS`: a `%%{init}%%` directive
// may otherwise inject document-wide CSS through the diagram's own <style>,
// which strict-mode DOMPurify keeps and the webview CSP allows.
export const MERMAID_SECURE_KEYS = [
  'secure',
  'securityLevel',
  'startOnLoad',
  'maxTextSize',
  'suppressErrorRendering',
  'maxEdges',
  'themeCSS',
];
