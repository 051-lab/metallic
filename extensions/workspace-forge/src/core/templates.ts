import type { WorkspaceTemplate } from "./models";

export const WORKSPACE_TEMPLATES: WorkspaceTemplate[] = [
  {
    id: "chrome-extension-dev",
    name: "Chrome Extension Dev",
    description: "Repository, Chrome APIs, testing, and local preview tabs.",
    color: "blue",
    notes: "Keep implementation decisions, browser constraints, and test findings here.",
    nextAction: "Define the smallest testable extension milestone.",
    tasks: ["Review manifest permissions", "Run typecheck and tests", "Load unpacked in Chrome"]
  },
  {
    id: "ai-research-sprint",
    name: "AI Research Sprint",
    description: "Sources, model tools, notes, and synthesis tasks.",
    color: "purple",
    notes: "Capture claims, source quality, open questions, and synthesis notes.",
    nextAction: "Write the research question and evidence standard.",
    tasks: ["Collect primary sources", "Compare findings", "Write a concise synthesis"]
  },
  {
    id: "app-build-session",
    name: "App Build Session",
    description: "Product planning, code, design references, and deployment.",
    color: "cyan",
    notes: "Track the product slice, architecture decisions, and validation results.",
    nextAction: "Choose the next vertical product slice.",
    tasks: ["Review current state", "Implement one slice", "Validate build and user flow"]
  },
  {
    id: "sound-design-lab",
    name: "Sound Design Lab",
    description: "DSP research, references, plugin docs, and listening notes.",
    color: "orange",
    notes: "Document signal flow, parameter choices, listening results, and revisions.",
    nextAction: "Define the target sound and one measurable experiment.",
    tasks: ["Collect references", "Build the processing chain", "Compare and document revisions"]
  },
  {
    id: "job-search-command-center",
    name: "Job Search Command Center",
    description: "Open roles, company research, applications, and follow-ups.",
    color: "green",
    notes: "Track role fit, company notes, contacts, application status, and follow-up dates.",
    nextAction: "Prioritize the strongest open role.",
    tasks: ["Research the company", "Tailor application materials", "Schedule follow-up"]
  }
];

export function templateById(templateId: string): WorkspaceTemplate | undefined {
  return WORKSPACE_TEMPLATES.find((template) => template.id === templateId);
}
