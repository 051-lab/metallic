const WORKSPACE_TEMPLATES = [
  {
    id: 'chrome-extension-dev',
    name: 'Chrome Extension Dev',
    color: 'silver',
    nextAction: 'Define the MVP, open the repo, and start the first implementation pass.',
    notes: 'Use this workspace for Manifest V3 extension builds, browser API research, GitHub work, and local testing.',
    tasks: [
      'Open the GitHub repository',
      'Review manifest permissions',
      'Load unpacked in chrome://extensions',
      'Test the main user flow',
      'Capture bugs and next actions'
    ]
  },
  {
    id: 'ai-research',
    name: 'AI Research Sprint',
    color: 'purple',
    nextAction: 'Collect source tabs and summarize the strongest findings.',
    notes: 'Use this workspace for ChatGPT, Claude, Gemini, Qwen, papers, docs, YouTube references, and source notes.',
    tasks: [
      'Define the research question',
      'Collect primary sources',
      'Save useful AI chats',
      'Extract key claims and links',
      'Write the next-step summary'
    ]
  },
  {
    id: 'app-build-session',
    name: 'App Build Session',
    color: 'blue',
    nextAction: 'Open the app repo, local server, and AI coding tools.',
    notes: 'Use this workspace when building an application across GitHub, localhost, docs, issue trackers, and AI coding agents.',
    tasks: [
      'Open repo and current branch',
      'Start local dev server',
      'Open product notes or issues',
      'Make the next code change',
      'Run a smoke test'
    ]
  },
  {
    id: 'sound-design',
    name: 'Sound Design Lab',
    color: 'cyan',
    nextAction: 'Collect references and build the next patch/melody idea.',
    notes: 'Use this workspace for synth references, producer research, plugin docs, YouTube sound examples, and pack planning.',
    tasks: [
      'Collect reference tracks',
      'Open plugin documentation',
      'Write patch or melody targets',
      'Export test assets',
      'Document what worked'
    ]
  },
  {
    id: 'job-search',
    name: 'Job Search Command Center',
    color: 'green',
    nextAction: 'Pick one role and tailor the application materials.',
    notes: 'Use this workspace for job boards, resumes, portfolios, application drafts, company research, and follow-ups.',
    tasks: [
      'Open target role',
      'Research the company',
      'Tailor resume bullets',
      'Draft application answers',
      'Track follow-up date'
    ]
  }
];
