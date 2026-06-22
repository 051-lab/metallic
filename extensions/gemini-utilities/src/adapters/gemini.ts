import { createSelectorAdapter } from "./selector-adapter";

export const geminiAdapter = createSelectorAdapter({
  id: "gemini",
  displayName: "Gemini",
  hosts: ["gemini.google.com"],
  messageSelectors: [
    "#chat-history user-query-content",
    "#chat-history bot-response-content",
    "#chat-history model-response"
  ],
  titleSelectors: [
    "h1",
    "h2[data-sourcepos]",
    "[data-test-id='conversation-title']"
  ],
  contextSelectors: {
    notebook: [
      "[data-test-id='notebook-title']",
      "[data-testid='notebook-title']",
      "[aria-label^='Notebook:']"
    ]
  },
  newChatSelectors: ["a[aria-label='New chat']", "a[href='/app']"]
});
