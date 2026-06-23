// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { chatgptAdapter } from "../src/adapters/chatgpt";
import { claudeAdapter } from "../src/adapters/claude";
import { geminiAdapter } from "../src/adapters/gemini";
import { qwenAdapter } from "../src/adapters/qwen";

const cases = [
  {
    adapter: geminiAdapter,
    html: `<main id="chat-history"><user-query-content>Hello</user-query-content><bot-response-content><pre><code>World</code></pre></bot-response-content></main>`
  },
  {
    adapter: chatgptAdapter,
    html: `<main><article data-testid="conversation-turn-1" data-message-author-role="user">Hello</article><article data-testid="conversation-turn-2" data-message-author-role="assistant">World</article></main>`
  },
  {
    adapter: claudeAdapter,
    html: `<main><div data-testid="user-message">Hello</div><div data-testid="assistant-message">World</div></main>`
  },
  {
    adapter: qwenAdapter,
    html: `<main>
      <div class="qwen-chat-message qwen-chat-message-user"><p class="user-message-content">Hello</p></div>
      <div class="qwen-chat-message qwen-chat-message-assistant"><div class="response-message-content">World</div></div>
    </main>`
  }
];

describe("official adapters", () => {
  it.each(cases)("$adapter.displayName extracts ordered roles", async ({ adapter, html }) => {
    document.body.innerHTML = html;
    document.title = `${adapter.displayName} fixture`;
    const draft = await adapter.extract(document);
    expect(draft.messages).toHaveLength(2);
    expect(draft.messages.map((message) => message.role)).toEqual(["user", "assistant"]);
    expect(draft.messages.map((message) => message.plainText)).toEqual(["Hello", "World"]);
  });

  it("preserves code, citations, attachment references, and avoids nested duplicates", async () => {
    document.body.innerHTML = `
      <main>
        <article data-testid="conversation-turn-1" data-message-author-role="user">Analyze this</article>
        <article data-testid="conversation-turn-2" data-message-author-role="assistant">
          <div data-message-author-role="assistant">
            Result <a href="https://example.com/source">[1]</a>
            <pre><code class="language-python">print("ok")</code></pre>
            <a class="attachment" href="https://example.com/report.pdf">report.pdf</a>
          </div>
        </article>
      </main>`;
    const draft = await chatgptAdapter.extract(document);
    expect(draft.messages).toHaveLength(2);
    expect(draft.messages[1]?.markdown).toContain("```python");
    expect(draft.messages[1]?.citations).toContainEqual({
      label: "[1]",
      url: "https://example.com/source"
    });
    expect(draft.messages[1]?.attachments[0]?.name).toBe("report.pdf");
  });

  it("warns when a thread appears virtualized", async () => {
    document.body.innerHTML = `
      <main data-virtualized>
        <article data-testid="conversation-turn-1" data-message-author-role="user">Hello</article>
        <article data-testid="conversation-turn-2" data-message-author-role="assistant">World</article>
      </main>`;
    const draft = await chatgptAdapter.extract(document);
    expect(draft.completeness).toBe("possibly-truncated");
    expect(draft.warnings).toHaveLength(1);
  });
});
