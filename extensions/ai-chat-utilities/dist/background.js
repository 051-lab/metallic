"use strict";
(() => {
  // src/core/archive-db.ts
  var DB_NAME = "ai-chat-utilities";
  var STORE = "conversations";
  var DB_VERSION = 1;
  function openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        const store = database.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("capturedAt", "capturedAt");
        store.createIndex("platformId", "platformId");
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  async function storeRequest(mode, operation) {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE, mode);
      const request = operation(transaction.objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      transaction.oncomplete = () => database.close();
    });
  }
  async function saveSnapshot(snapshot) {
    const id = snapshot.id || crypto.randomUUID();
    await storeRequest("readwrite", (store) => store.put({ ...snapshot, id }));
    return id;
  }
  async function getSnapshot(id) {
    return storeRequest("readonly", (store) => store.get(id));
  }
  async function deleteSnapshot(id) {
    await storeRequest("readwrite", (store) => store.delete(id));
  }
  async function listSnapshots(query = "", platformId = "") {
    const records = await storeRequest(
      "readonly",
      (store) => store.getAll()
    );
    const normalizedQuery = query.trim().toLowerCase();
    return records.filter(
      (record) => (!platformId || record.platformId === platformId) && (!normalizedQuery || record.title.toLowerCase().includes(normalizedQuery) || record.renderedMarkdown.toLowerCase().includes(normalizedQuery) || Object.values(record.context).some((value) => value.toLowerCase().includes(normalizedQuery)))
    ).sort((a, b) => b.capturedAt.localeCompare(a.capturedAt)).map(({ id, platformId: platformId2, platformName, title, capturedAt, context, completeness }) => ({
      id,
      platformId: platformId2,
      platformName,
      title,
      capturedAt,
      context,
      completeness
    }));
  }
  function legacyMessages(markdown) {
    const marker = /\*\*(User|Gemini):\*\*\s*\n([\s\S]*?)(?=\n---\n|\s*$)/g;
    const messages = [];
    let match;
    while (match = marker.exec(markdown)) {
      messages.push({
        role: match[1] === "User" ? "user" : "assistant",
        markdown: match[2]?.trim() || "",
        plainText: match[2]?.trim() || "",
        citations: [],
        attachments: []
      });
    }
    return messages.length ? messages : [{
      role: "unknown",
      markdown,
      plainText: markdown,
      citations: [],
      attachments: []
    }];
  }
  async function migrateLegacyArchive() {
    const { archiveSchemaVersion, conversations = [] } = await chrome.storage.local.get({
      archiveSchemaVersion: 0,
      conversations: []
    });
    if (archiveSchemaVersion >= 2 || !Array.isArray(conversations)) return 0;
    let migrated = 0;
    for (const legacy of conversations) {
      const markdown = String(legacy.markdownContent || "");
      const snapshot = {
        schemaVersion: 2,
        id: `legacy-${legacy.id || crypto.randomUUID()}`,
        platformId: "gemini",
        platformName: "Gemini",
        adapterVersion: 0,
        title: legacy.title || "Legacy Gemini conversation",
        sourceUrl: "https://gemini.google.com/",
        capturedAt: legacy.date || (/* @__PURE__ */ new Date()).toISOString(),
        context: legacy.notebookContext ? { notebook: legacy.notebookContext } : {},
        messages: legacyMessages(markdown),
        renderedMarkdown: markdown,
        completeness: "complete",
        warnings: ["Migrated from the Gemini Utilities v1 archive."]
      };
      await saveSnapshot(snapshot);
      migrated += 1;
    }
    await chrome.storage.local.set({
      archiveSchemaVersion: 2,
      legacyConversationsBackup: conversations
    });
    return migrated;
  }

  // src/core/platforms.ts
  var PLATFORMS = [
    {
      id: "gemini",
      name: "Gemini",
      origins: ["https://gemini.google.com/*"],
      matches: ["https://gemini.google.com/*"]
    },
    {
      id: "chatgpt",
      name: "ChatGPT",
      origins: ["https://chatgpt.com/*"],
      matches: ["https://chatgpt.com/*"]
    },
    {
      id: "claude",
      name: "Claude",
      origins: ["https://claude.ai/*"],
      matches: ["https://claude.ai/*"]
    },
    {
      id: "qwen",
      name: "Qwen",
      origins: ["https://chat.qwen.ai/*"],
      matches: ["https://chat.qwen.ai/*"]
    },
    {
      id: "google-ai-mode",
      name: "Google AI Mode",
      origins: ["https://www.google.com/*", "https://google.com/*"],
      matches: ["https://www.google.com/*", "https://google.com/*"]
    }
  ];
  function platformForUrl(value) {
    let url;
    try {
      url = new URL(value);
    } catch {
      return void 0;
    }
    return PLATFORMS.find(
      (platform) => platform.origins.some((origin) => url.href.startsWith(origin.replace("*", "")))
    );
  }

  // src/core/permissions.ts
  function desiredPlatformScripts(enabledPlatforms2, grantedOrigins, persistentOrigins = []) {
    const origins = new Set(grantedOrigins);
    const platformScripts = PLATFORMS.filter(
      (platform) => enabledPlatforms2.includes(platform.id) && platform.origins.every((origin) => origins.has(origin))
    ).map((platform) => ({
      id: `ai-chat-${platform.id}`,
      matches: platform.matches,
      js: ["dist/content.js"],
      runAt: "document_idle",
      persistAcrossSessions: true
    }));
    const siteScripts = persistentOrigins.filter((origin) => origins.has(`${origin}/*`)).map((origin) => ({
      id: `ai-chat-site-${origin.replace(/[^a-z0-9]/gi, "-").slice(0, 80)}`,
      matches: [`${origin}/*`],
      js: ["dist/content.js"],
      runAt: "document_idle",
      persistAcrossSessions: true
    }));
    return [...platformScripts, ...siteScripts];
  }
  async function reconcilePlatformScripts(api, enabledPlatforms2, grantedOrigins, persistentOrigins = []) {
    const desired = desiredPlatformScripts(enabledPlatforms2, grantedOrigins, persistentOrigins);
    const existing = await api.getRegisteredContentScripts();
    const managedIds = existing.filter((script) => script.id.startsWith("ai-chat-")).map((script) => script.id);
    if (managedIds.length) {
      await api.unregisterContentScripts({ ids: managedIds });
    }
    if (desired.length) {
      await api.registerContentScripts(desired);
    }
  }

  // src/core/site-profiles.ts
  var STORAGE_KEY = "siteProfilesV1";
  var MAX_PROFILES = 100;
  var MAX_SELECTOR_LENGTH = 500;
  var now = () => (/* @__PURE__ */ new Date()).toISOString();
  function validSelector(selector) {
    if (typeof selector !== "string" || !selector.trim() || selector.length > MAX_SELECTOR_LENGTH) {
      return false;
    }
    if (/[{};]/.test(selector)) return false;
    if ((selector.match(/\[/g) || []).length !== (selector.match(/\]/g) || []).length) return false;
    if (typeof document === "undefined") return true;
    try {
      document.createDocumentFragment().querySelector(selector);
      return true;
    } catch {
      return false;
    }
  }
  function validateSiteProfile(value, source = "local") {
    if (!value || typeof value !== "object") throw new Error("Profile must be an object.");
    const input = value;
    if (input.schemaVersion !== 1) throw new Error("Unsupported profile schema.");
    if (!/^[a-z0-9][a-z0-9-]{1,63}$/.test(input.id || "")) throw new Error("Invalid profile ID.");
    if (typeof input.name !== "string" || !input.name.trim() || input.name.length > 80) {
      throw new Error("Invalid profile name.");
    }
    const origins = Array.isArray(input.origins) ? input.origins.filter((origin) => {
      if (typeof origin !== "string") return false;
      try {
        const url = new URL(origin);
        return ["http:", "https:"].includes(url.protocol) && url.origin === origin;
      } catch {
        return false;
      }
    }) : [];
    if (!origins.length || origins.length > 10) throw new Error("Profile needs valid HTTP origins.");
    const paths = Array.isArray(input.pathPatterns) ? input.pathPatterns.filter((path) => typeof path === "string" && path.startsWith("/") && path.length <= 200) : [];
    if (!paths.length) throw new Error("Profile needs a path pattern.");
    const selectors = input.selectors;
    if (!selectors || !Array.isArray(selectors.messages) || !selectors.messages.length || !selectors.messages.every(validSelector)) {
      throw new Error("Profile needs valid message selectors.");
    }
    for (const selector of [selectors.conversation, selectors.content, selectors.title]) {
      if (selector !== void 0 && !validSelector(selector)) throw new Error("Invalid selector.");
    }
    if (selectors.exclude && !selectors.exclude.every(validSelector)) {
      throw new Error("Invalid exclusion selector.");
    }
    const roles = input.roles;
    if (!roles || !["attribute", "selectors", "alternating"].includes(roles.strategy)) {
      throw new Error("Invalid role strategy.");
    }
    if (roles.strategy === "attribute" && (!roles.attribute || roles.attribute.length > 100)) {
      throw new Error("Attribute role profiles require an attribute.");
    }
    if (roles.strategy === "selectors") {
      if (!Array.isArray(roles.userSelectors) || !Array.isArray(roles.assistantSelectors) || !roles.userSelectors.length || !roles.assistantSelectors.length || ![...roles.userSelectors, ...roles.assistantSelectors].every(validSelector)) {
        throw new Error("Invalid role selector.");
      }
    }
    for (const values of [roles.userValues, roles.assistantValues]) {
      if (values !== void 0 && (!Array.isArray(values) || values.some((value2) => typeof value2 !== "string" || value2.length > 80))) {
        throw new Error("Invalid role values.");
      }
    }
    return {
      schemaVersion: 1,
      id: input.id,
      name: input.name.trim(),
      source,
      origins,
      pathPatterns: paths,
      selectors: {
        conversation: selectors.conversation,
        messages: [...selectors.messages],
        content: selectors.content,
        title: selectors.title,
        exclude: selectors.exclude ? [...selectors.exclude] : void 0
      },
      roles: {
        strategy: roles.strategy,
        attribute: roles.attribute,
        userValues: roles.userValues ? [...roles.userValues] : void 0,
        assistantValues: roles.assistantValues ? [...roles.assistantValues] : void 0,
        userSelectors: roles.userSelectors ? [...roles.userSelectors] : void 0,
        assistantSelectors: roles.assistantSelectors ? [...roles.assistantSelectors] : void 0,
        startsWith: roles.startsWith
      },
      confidence: Math.max(0, Math.min(1, Number(input.confidence) || 0.7)),
      createdAt: input.createdAt || now(),
      updatedAt: input.updatedAt || now(),
      needsRepair: Boolean(input.needsRepair)
    };
  }
  async function listLocalProfiles() {
    const result = await chrome.storage.local.get({ [STORAGE_KEY]: [] });
    const values = Array.isArray(result[STORAGE_KEY]) ? result[STORAGE_KEY] : [];
    return values.flatMap((value) => {
      try {
        return [validateSiteProfile(value)];
      } catch {
        return [];
      }
    });
  }
  async function deleteLocalProfile(id) {
    const profiles = await listLocalProfiles();
    await chrome.storage.local.set({
      [STORAGE_KEY]: profiles.filter((profile) => profile.id !== id)
    });
  }
  async function importLocalProfiles(json) {
    if (json.length > 5e5) throw new Error("Profile import is too large.");
    const parsed = JSON.parse(json);
    const values = Array.isArray(parsed) ? parsed : [parsed];
    if (!values.length || values.length > MAX_PROFILES) throw new Error("Invalid profile count.");
    const imported = values.map((value) => validateSiteProfile(value));
    const current = await listLocalProfiles();
    const ids = new Set(imported.map((profile) => profile.id));
    await chrome.storage.local.set({
      [STORAGE_KEY]: [...imported, ...current.filter((profile) => !ids.has(profile.id))].slice(0, MAX_PROFILES)
    });
    return imported.length;
  }
  function exportProfiles(profiles) {
    return JSON.stringify(profiles.map((profile) => ({ ...profile, source: "local" })), null, 2);
  }

  // src/entries/background.ts
  var DEFAULT_ENABLED = ["gemini"];
  async function enabledPlatforms() {
    const { enabledPlatforms: enabledPlatforms2 = DEFAULT_ENABLED } = await chrome.storage.sync.get({
      enabledPlatforms: DEFAULT_ENABLED
    });
    return enabledPlatforms2;
  }
  async function reconcileContentScripts() {
    const enabled = await enabledPlatforms();
    const { persistentOrigins = [] } = await chrome.storage.local.get({ persistentOrigins: [] });
    const granted = await chrome.permissions.getAll();
    await reconcilePlatformScripts(
      chrome.scripting,
      enabled,
      granted.origins || [],
      persistentOrigins
    );
  }
  chrome.runtime.onInstalled.addListener(async () => {
    const { enabledPlatforms: enabledPlatforms2 } = await chrome.storage.sync.get("enabledPlatforms");
    if (!enabledPlatforms2) await chrome.storage.sync.set({ enabledPlatforms: DEFAULT_ENABLED });
    await migrateLegacyArchive();
    await reconcileContentScripts();
  });
  chrome.runtime.onStartup.addListener(async () => {
    await migrateLegacyArchive();
    await reconcileContentScripts();
  });
  chrome.permissions.onAdded.addListener(reconcileContentScripts);
  chrome.permissions.onRemoved.addListener(reconcileContentScripts);
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const handle = async () => {
      switch (message.type) {
        case "RECONCILE_SCRIPTS":
          await reconcileContentScripts();
          return { ok: true };
        case "ENABLE_SITE": {
          const origin = new URL(message.origin).origin;
          const pattern = `${origin}/*`;
          const granted = await chrome.permissions.contains({ origins: [pattern] });
          if (!granted) return { ok: false, error: "Site access was not granted." };
          const state = await chrome.storage.local.get({ persistentOrigins: [] });
          const persistentOrigins = [.../* @__PURE__ */ new Set([...state.persistentOrigins, origin])];
          await chrome.storage.local.set({ persistentOrigins });
          await reconcileContentScripts();
          return { ok: true };
        }
        case "DISABLE_SITE": {
          const origin = new URL(message.origin).origin;
          await chrome.permissions.remove({ origins: [`${origin}/*`] });
          const state = await chrome.storage.local.get({ persistentOrigins: [] });
          await chrome.storage.local.set({
            persistentOrigins: state.persistentOrigins.filter((item) => item !== origin)
          });
          await reconcileContentScripts();
          return { ok: true };
        }
        case "PROFILE_LIST":
          return { ok: true, profiles: await listLocalProfiles() };
        case "PROFILE_DELETE":
          await deleteLocalProfile(message.id);
          return { ok: true };
        case "PROFILE_IMPORT":
          return { ok: true, count: await importLocalProfiles(message.json) };
        case "PROFILE_EXPORT":
          return { ok: true, json: exportProfiles(await listLocalProfiles()) };
        case "ARCHIVE_SAVE":
          return { ok: true, id: await saveSnapshot(message.snapshot) };
        case "ARCHIVE_LIST":
          return { ok: true, items: await listSnapshots(message.query, message.platformId) };
        case "ARCHIVE_GET":
          return { ok: true, snapshot: await getSnapshot(message.id) };
        case "ARCHIVE_DELETE":
          await deleteSnapshot(message.id);
          return { ok: true };
        case "START_CAPTURE": {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (!tab?.id || !tab.url) return { ok: false, error: "No active web page." };
          const platform = platformForUrl(tab.url);
          try {
            await chrome.tabs.sendMessage(tab.id, { type: "PING" });
          } catch {
            await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["dist/content.js"] });
          }
          await chrome.tabs.sendMessage(tab.id, { type: "SHOW_OVERLAY" });
          return { ok: true, platform: platform?.name || "Generic chatbot" };
        }
        default:
          return { ok: false, error: "Unknown request." };
      }
    };
    handle().then(sendResponse).catch(
      (error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) })
    );
    return true;
  });
})();
//# sourceMappingURL=background.js.map
