import { createSelectorAdapter } from "./selector-adapter";

export const chatgptAdapter = createSelectorAdapter({
  id: "chatgpt",
  displayName: "ChatGPT",
  hosts: ["chatgpt.com"],
  messageSelectors: [
    "article[data-testid^='conversation-turn']",
    "[data-message-author-role]"
  ],
  titleSelectors: [
    "nav a[aria-current='page']",
    "h1",
    "title"
  ],
  contextSelectors: {
    project: ["[data-testid='project-title']", "[aria-label^='Project']"]
  },
  newChatSelectors: ["a[data-testid='create-new-chat-button']", "a[href='/']"]
});
