export type PlatformId =
  | "gemini"
  | "chatgpt"
  | "claude"
  | "qwen"
  | "generic"
  | `profile:${string}`;
export type MessageRole = "user" | "assistant" | "system" | "tool" | "unknown";
export type ProfileSource = "bundled" | "local";

export interface Citation {
  label: string;
  url?: string;
}

export interface AttachmentReference {
  name: string;
  url?: string;
  kind: "file" | "image" | "artifact" | "link";
}

export interface ConversationMessage {
  role: MessageRole;
  markdown: string;
  plainText: string;
  citations: Citation[];
  attachments: AttachmentReference[];
}

export interface ConversationSnapshot {
  schemaVersion: 2;
  id?: string;
  platformId: PlatformId;
  platformName: string;
  adapterVersion: number;
  title: string;
  sourceUrl: string;
  capturedAt: string;
  context: Record<string, string>;
  messages: ConversationMessage[];
  renderedMarkdown: string;
  completeness: "complete" | "possibly-truncated";
  warnings: string[];
}

export interface ConversationDraft {
  title: string;
  context?: Record<string, string>;
  messages: ConversationMessage[];
  completeness?: ConversationSnapshot["completeness"];
  warnings?: string[];
}

export interface AdapterDetection {
  confidence: number;
  reason: string;
}

export interface PlatformAdapter {
  id: PlatformId;
  displayName: string;
  adapterVersion: number;
  hostPatterns: string[];
  matches(url: URL): boolean;
  detect(document: Document): AdapterDetection;
  extract(document: Document): Promise<ConversationDraft>;
  getNewChatTarget?(document: Document): string | null;
}

export interface PlatformDefinition {
  id: "gemini" | "chatgpt" | "claude" | "qwen";
  name: string;
  origins: string[];
  matches: string[];
}

export interface SiteProfileSelectors {
  conversation?: string;
  messages: string[];
  content?: string;
  title?: string;
  exclude?: string[];
}

export interface SiteProfileRoles {
  strategy: "attribute" | "selectors" | "alternating";
  attribute?: string;
  userValues?: string[];
  assistantValues?: string[];
  userSelectors?: string[];
  assistantSelectors?: string[];
  startsWith?: "user" | "assistant";
}

export interface SiteProfile {
  schemaVersion: 1;
  id: string;
  name: string;
  source: ProfileSource;
  origins: string[];
  pathPatterns: string[];
  selectors: SiteProfileSelectors;
  roles: SiteProfileRoles;
  confidence: number;
  createdAt: string;
  updatedAt: string;
  needsRepair?: boolean;
}

export interface SemanticExtraction {
  elements: Element[];
  confidence: number;
  reasons: string[];
}

export interface ArchiveListItem {
  id: string;
  platformId: PlatformId;
  platformName: string;
  title: string;
  capturedAt: string;
  context: Record<string, string>;
  completeness: ConversationSnapshot["completeness"];
}
