const HTML_TEXT_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtmlText(value: string): string {
  return value.replace(/[&<>"']/g, (character) => HTML_TEXT_ESCAPES[character]);
}
