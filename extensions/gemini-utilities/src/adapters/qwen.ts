import { createSelectorAdapter } from "./selector-adapter";

export const qwenAdapter = createSelectorAdapter({
  id: "qwen",
  displayName: "Qwen",
  hosts: ["chat.qwen.ai"],
  messageSelectors: [
    ".qwen-chat-message-user",
    ".qwen-chat-message-assistant",
    "[data-role='user']",
    "[data-role='assistant']",
    "[data-message-role]"
  ],
  titleSelectors: [
    "[data-testid='conversation-title']",
    "header h1",
    "h1"
  ],
  contextSelectors: {
    model: ["[data-testid='model-selector']", "[aria-label*='model' i]"]
  },
  role: (element, index) => {
    if (element.classList.contains("qwen-chat-message-user")) return "user";
    if (element.classList.contains("qwen-chat-message-assistant")) return "assistant";
    return index % 2 === 0 ? "user" : "assistant";
  },
  newChatSelectors: ["a[href='/']", "a[aria-label='New chat']"]
});
