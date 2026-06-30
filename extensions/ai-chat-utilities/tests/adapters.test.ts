// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { chatgptAdapter } from "../src/adapters/chatgpt";
import { claudeAdapter } from "../src/adapters/claude";
import { geminiAdapter } from "../src/adapters/gemini";
import { googleAiModeAdapter } from "../src/adapters/google-ai-mode";
import { qwenAdapter } from "../src/adapters/qwen";
import { adapterForUrl } from "../src/adapters/registry";

const cases = [
  {
    adapter: geminiAdapter,
    html: `<main id="chat-history"><user-query-content>Hello</user-query-content><bot-response-content><pre><code>World</code></pre></bot-response-content></main>`,
    text: ["Hello", "World"]
  },
  {
    adapter: chatgptAdapter,
    html: `<main><article data-testid="conversation-turn-1" data-message-author-role="user">Hello</article><article data-testid="conversation-turn-2" data-message-author-role="assistant">World</article></main>`,
    text: ["Hello", "World"]
  },
  {
    adapter: claudeAdapter,
    html: `<main><div data-testid="user-message">Hello</div><div data-testid="assistant-message">World</div></main>`,
    text: ["Hello", "World"]
  },
  {
    adapter: qwenAdapter,
    html: `<main>
      <div class="qwen-chat-message qwen-chat-message-user"><p class="user-message-content">Hello</p></div>
      <div class="qwen-chat-message qwen-chat-message-assistant"><div class="response-message-content">World</div></div>
    </main>`,
    text: ["Hello", "World"]
  },
  {
    adapter: googleAiModeAdapter,
    html: `<main>
      <article class="user-query">How should I structure a Chrome extension library?</article>
      <article class="ai-mode-response"><p>Use one directory per extension and keep shared planning docs separate.</p></article>
    </main>`,
    text: [
      "How should I structure a Chrome extension library?",
      "Use one directory per extension and keep shared planning docs separate."
    ]
  }
];

describe("official adapters", () => {
  it.each(cases)("$adapter.displayName extracts ordered roles", async ({ adapter, html, text }) => {
    document.body.innerHTML = html;
    document.title = `${adapter.displayName} fixture`;
    const draft = await adapter.extract(document);
    expect(draft.messages).toHaveLength(2);
    expect(draft.messages.map((message) => message.role)).toEqual(["user", "assistant"]);
    expect(draft.messages.map((message) => message.plainText)).toEqual(text);
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

  it("matches current Google AI Mode URL shapes", () => {
    expect(adapterForUrl("https://www.google.com/ai").id).toBe("google-ai-mode");
    expect(adapterForUrl("https://www.google.com/ai/search?q=extensions").id).toBe("google-ai-mode");
    expect(adapterForUrl("https://www.google.com/search?q=extensions&udm=50").id).toBe("google-ai-mode");
    expect(adapterForUrl("https://www.google.com/search?q=extensions").id).toBe("generic");
  });

  it("extracts Google AI Mode visible content when message selectors are unavailable", async () => {
    window.history.pushState({}, "", "/search?q=Discontinuation+of+Free+Qwen+OAuth&udm=50");
    document.body.innerHTML = `<main>
      <div>AI Mode</div>
      <section>
        <h2>Discontinuation of Free Qwen OAuth</h2>
        <p>Qwen OAuth availability changed for free users.</p>
        <p>Developers should move to API keys or a provider-neutral auth layer.</p>
      </section>
      <form><textarea>Ask anything</textarea></form>
    </main>`;
    document.querySelectorAll<HTMLElement>("main, section, h2, p").forEach((element) => {
      element.getBoundingClientRect = () => ({
        x: 0,
        y: 0,
        width: 600,
        height: 80,
        top: 0,
        right: 600,
        bottom: 80,
        left: 0,
        toJSON: () => ({})
      });
    });

    const draft = await googleAiModeAdapter.extract(document);

    expect(draft.messages[0]?.role).toBe("user");
    expect(draft.messages[0]?.plainText).toBe("Discontinuation of Free Qwen OAuth");
    expect(draft.messages[1]?.role).toBe("assistant");
    expect(draft.messages[1]?.plainText).toContain("providerneutral auth layer");
  });

  it("extracts Google AI Mode answer text from composed shadow DOM text runs", async () => {
    window.history.pushState({}, "", "/search?q=Chrome+extension+planning&udm=50");
    document.body.innerHTML = `<main><ai-mode-shell></ai-mode-shell><textarea>Ask anything</textarea></main>`;
    const host = document.querySelector("ai-mode-shell")!;
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `
      <section>
        <span>Chrome extension libraries work best when each extension has isolated source, tests, and package metadata.</span>
        <span>Shared planning documents should live outside runtime bundles.</span>
      </section>`;

    const draft = await googleAiModeAdapter.extract(document);

    expect(draft.messages[0]?.plainText).toBe("Chrome extension planning");
    expect(draft.messages[1]?.plainText).toContain("isolated source");
    expect(draft.messages[1]?.plainText).toContain("Shared planning documents");
  });

  it("filters Google AI Mode UI, feedback, and search-result noise from fallback exports", async () => {
    window.history.pushState({}, "", "/search?q=What+is+grep%3F&udm=50");
    document.body.innerHTML = `<main>
      <section class="answer">
        <p>What Is Grep? - Google Search</p>
        <p>Skip to main content</p>
        <p>grep is a powerful command-line utility used to search for specific text patterns within files or terminal outputs.</p>
        <h2>How grep Works</h2>
        <p>By default, grep reads through text line-by-line.</p>
        <h2>Useful Flags and Options</h2>
        <p>grep -i "error" log.txt</p>
        <p>If you are trying to solve a specific problem right now, let me know.</p>
        <p>Share public link</p>
        <p>Your feedback will include a copy of this chat.</p>
        <p>Linux Crash Course - The grep Command</p>
        <p>Grep - Wikipedia</p>
      </section>
    </main>`;
    document.querySelectorAll<HTMLElement>("section, p, h2").forEach((element) => {
      element.getBoundingClientRect = () => ({
        x: 100,
        y: 0,
        width: 620,
        height: 40,
        top: 0,
        right: 720,
        bottom: 40,
        left: 100,
        toJSON: () => ({})
      });
    });

    const draft = await googleAiModeAdapter.extract(document);
    const assistant = draft.messages[1]?.plainText || "";

    expect(assistant).toContain("grep is a powerful commandline utility");
    expect(assistant).toContain("How grep Works");
    expect(assistant).toContain("Useful Flags and Options");
    expect(assistant).not.toContain("Google Search");
    expect(assistant).not.toContain("Share public link");
    expect(assistant).not.toContain("Grep - Wikipedia");
  });

  it("preserves short inline command tokens in Google AI Mode fallback exports", async () => {
    window.history.pushState({}, "", "/search?q=What+is+grep%3F&udm=50");
    document.body.innerHTML = `<main>
      <section>
        <p><code>grep</code> is a powerful command-line utility used to search text.</p>
        <p>The name stands for Global Regular Expression <strong>Print</strong>, from <code>g/re/p</code>.</p>
        <p><code>grep</code> reads through text line-by-line.</p>
      </section>
    </main>`;
    document.querySelectorAll<HTMLElement>("section, p, code, strong").forEach((element) => {
      element.getBoundingClientRect = () => ({
        x: 100,
        y: 0,
        width: 620,
        height: 40,
        top: 0,
        right: 720,
        bottom: 40,
        left: 100,
        toJSON: () => ({})
      });
    });

    const draft = await googleAiModeAdapter.extract(document);
    const assistant = draft.messages[1]?.plainText || "";

    expect(assistant).toContain("grep is a powerful");
    expect(assistant).toContain("Global Regular Expression Print");
    expect(assistant).toContain("g/re/p");
    expect(assistant).toContain("grep reads through");
  });

  it("prefers fallback candidates that avoid dropped-token artifacts", async () => {
    window.history.pushState({}, "", "/search?q=What+is+grep%3F&udm=50");
    document.body.innerHTML = `<main>
      <section>
        <div>
          <span>is a powerful command-line utility used to search for specific text patterns within files or terminal outputs.</span>
          <span>The name stands for</span>
          <span>rint, stemming from an early Unix text editor command (</span>
          <span>) that meant "globally search for a regular expression and print matching lines."</span>
        </div>
        <p><code>grep</code> is a powerful command-line utility used to search for specific text patterns within files or terminal outputs.</p>
        <p>The name stands for Global Regular Expression <strong>Print</strong>, stemming from <code>g/re/p</code>.</p>
        <p><code>grep</code> reads through text line-by-line.</p>
        <p>See my AI Mode history</p>
      </section>
    </main>`;
    document.querySelectorAll<HTMLElement>("section, div, span, p, code, strong").forEach((element) => {
      element.getBoundingClientRect = () => ({
        x: 100,
        y: 0,
        width: 620,
        height: 40,
        top: 0,
        right: 720,
        bottom: 40,
        left: 100,
        toJSON: () => ({})
      });
    });

    const draft = await googleAiModeAdapter.extract(document);
    const assistant = draft.messages[1]?.plainText || "";

    expect(assistant).toContain("grep is a powerful");
    expect(assistant).toContain("Global Regular Expression Print");
    expect(assistant).toContain("g/re/p");
    expect(assistant).not.toContain("The name stands for rint");
    expect(assistant).not.toContain("See my AI Mode history");
  });

  it("repairs Google AI Mode query-term gaps left by split inline chips", async () => {
    window.history.pushState({}, "", "/search?q=What+is+grep%3F&udm=50");
    document.body.innerHTML = `<main>
      <section>
        <p>Search Results</p>
        <p>AI Mode history</p>
        <p>Recent</p>
        <p>You said:</p>
        <p>4:39 PM</p>
        <p>is a powerful command-line utility used to search for specific text patterns within files or terminal outputs.</p>
        <p>The name stands for</p>
        <p>lobal</p>
        <p>egular</p>
        <p>xpression</p>
        <p>rint, stemming from an early Unix text editor command (</p>
        <p>g/re/p</p>
        <p>) that meant "globally search for a regular expression and print matching lines."</p>
        <h2>How</h2>
        <h2>Works</h2>
        <p>By default,</p>
        <p>reads through text line-by-line.</p>
        <h2>Common Ways to Use</h2>
        <p>You can use</p>
        <p>to scan standalone files, search entire folders, or filter live terminal data.</p>
        <p>Combine</p>
        <p>with other commands using the pipe operator.</p>
        <h2>Basic Regex Examples with</h2>
        <p>becomes incredibly flexible when you use regular expression symbols.</p>
      </section>
    </main>`;
    document.querySelectorAll<HTMLElement>("section, p, h2").forEach((element) => {
      element.getBoundingClientRect = () => ({
        x: 100,
        y: 0,
        width: 620,
        height: 40,
        top: 0,
        right: 720,
        bottom: 40,
        left: 100,
        toJSON: () => ({})
      });
    });

    const draft = await googleAiModeAdapter.extract(document);
    const assistant = draft.messages[1]?.plainText || "";

    expect(assistant).toContain("grep is a powerful commandline utility");
    expect(assistant).toContain("Global Regular Expression Print");
    expect(assistant).toContain("g/re/p");
    expect(assistant).toContain("How grep Works");
    expect(assistant).toContain("By default, grep reads");
    expect(assistant).toContain("You can use grep to scan");
    expect(assistant).toContain("Combine grep with other commands");
    expect(assistant).toContain("Basic Regex Examples with grep");
    expect(assistant).toContain("grep becomes incredibly flexible");
    expect(assistant).not.toContain("Search Results");
    expect(assistant).not.toContain("AI Mode history");
    expect(assistant).not.toContain("You said:");
  });
});
