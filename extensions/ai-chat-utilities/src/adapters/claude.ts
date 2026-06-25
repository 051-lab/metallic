import { createSelectorAdapter } from "./selector-adapter";

export const claudeAdapter = createSelectorAdapter({
  id: "claude",
  displayName: "Claude",
  hosts: ["claude.ai"],
  messageSelectors: [
    "[data-testid='user-message']",
    "[data-testid='assistant-message']",
    "[data-is-streaming]",
    ".font-claude-message"
  ],
  titleSelectors: [
    "[data-testid='conversation-title']",
    "header h1",
    "h1"
  ],
  contextSelectors: {
    project: ["[data-testid='project-name']", "[aria-label^='Project']"]
  },
  newChatSelectors: ["a[href='/new']", "a[aria-label='New chat']"]
});
