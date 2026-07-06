/** Shared message-type constants for content <-> background <-> popup communication. */
export const MessageType = {
  TOGGLE: "TOGGLE",
  UPDATE_PREFS: "UPDATE_PREFS",
  PING: "PING",
  RECONCILE_SCRIPTS: "RECONCILE_SCRIPTS"
} as const;

export type MessageTypeName = (typeof MessageType)[keyof typeof MessageType];
