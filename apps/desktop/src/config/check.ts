export interface CliCatalogItem {
  id: string;
  label: string;
  iconKey: string;
  priority: number;
  default: boolean;
  commands: string[];
  installCommand: string;
  installCommandByOs?: Partial<Record<'windows' | 'macos' | 'linux', string>>;
}

export interface CliProbeResult {
  id: string;
  installed: boolean;
  resolvedPath: string | null;
  matchedCommand: string | null;
}

export const CLI_CATALOG: CliCatalogItem[] = [
  {
    id: 'codex',
    label: 'Codex',
    iconKey: 'codex',
    priority: 0,
    default: true,
    commands: ['codex', 'codex.cmd', 'codex.exe'],
    installCommand: 'npm install -g @openai/codex',
  },
  {
    id: 'droid',
    label: 'Droid',
    iconKey: 'droid',
    priority: 1,
    default: false,
    commands: ['droid', 'droid.cmd', 'droid.exe'],
    installCommand: 'npm install -g @factory-ai/droid',
  },
  {
    id: 'gemini',
    label: 'Gemini',
    iconKey: 'gemini',
    priority: 2,
    default: false,
    commands: ['gemini', 'gemini.cmd', 'gemini.exe'],
    installCommand: 'npm install -g @google/gemini-cli',
  },
  {
    id: 'shob',
    label: 'Shob',
    iconKey: 'shob',
    priority: 3,
    default: false,
    commands: ['shob', 'shob.cmd', 'shob.exe'],
    installCommand: 'npm install -g shob-ai',
  },
  {
    id: 'claude-code',
    label: 'Claude Code',
    iconKey: 'claude',
    priority: 4,
    default: false,
    commands: ['claude', 'claude-code', 'claude.cmd', 'claude.exe'],
    installCommand: 'npm install -g @anthropic-ai/claude-code',
  },
  {
    id: 'cursor-cli',
    label: 'Cursor CLI',
    iconKey: 'cursor',
    priority: 5,
    default: false,
    commands: ['cursor', 'cursor-cli', 'cursor.cmd', 'cursor.exe'],
    installCommand: 'npm install -g cursor-agent',
  },
  {
    id: 'amp',
    label: 'Amp',
    iconKey: 'amp',
    priority: 6,
    default: false,
    commands: ['amp', 'amp.cmd', 'amp.exe'],
    installCommand: 'curl -fsSL https://ampcode.com/install.sh | bash',
    installCommandByOs: {
      windows: 'powershell -c "irm https://ampcode.com/install.ps1 | iex"',
      macos: 'curl -fsSL https://ampcode.com/install.sh | bash',
      linux: 'curl -fsSL https://ampcode.com/install.sh | bash',
    },
  },
  {
    id: 'qodo-cli',
    label: 'Qodo CLI',
    iconKey: 'qodo',
    priority: 7,
    default: false,
    commands: ['qodo', 'qodo-cli', 'qodo.cmd', 'qodo.exe'],
    installCommand: 'npm install -g @qodo-ai/qodo-cli',
  },
  {
    id: 'cline-cli',
    label: 'Cline CLI',
    iconKey: 'cline',
    priority: 8,
    default: false,
    commands: ['cline', 'cline-cli', 'cline.cmd', 'cline.exe'],
    installCommand: 'npm install -g @cline-ai/cline',
  },
  {
    id: 'kilo-cli',
    label: 'Kilo',
    iconKey: 'kilo',
    priority: 9,
    default: false,
    commands: ['kilo', 'kilo-cli', 'kilo.cmd', 'kilo.exe'],
    installCommand: 'npm install -g @kilo-ai/cli',
  },
  {
    id: 'codebuff',
    label: 'Codebuff',
    iconKey: 'codebuff',
    priority: 10,
    default: false,
    commands: ['codebuff', 'codebuff.cmd', 'codebuff.exe'],
    installCommand: 'npm install -g codebuff',
  },
  {
    id: 'qwen',
    label: 'Qwen',
    iconKey: 'qwen',
    priority: 11,
    default: false,
    commands: ['qwen', 'qwen.cmd', 'qwen.exe'],
    installCommand: 'npm install -g @qwen-ai/qwen-code',
  },
  {
    id: 'freebuff',
    label: 'Freebuff',
    iconKey: 'freebuff',
    priority: 12,
    default: false,
    commands: ['freebuff', 'freebuff.cmd', 'freebuff.exe'],
    installCommand: 'npm install -g freebuff',
  },
];

export const CLI_ALIAS_TO_ID = Object.fromEntries(
  CLI_CATALOG.flatMap((item) =>
    item.commands.map((command) => [
      command.replace(/\.(cmd|exe|bat|ps1)$/i, '').toLowerCase(),
      item.id,
    ]),
  ),
) as Record<string, string>;

export const DEFAULT_CLI_ID = CLI_CATALOG.find((item) => item.default)?.id ?? 'codex';

export function getCatalogItem(cliId?: string | null) {
  if (!cliId) return null;
  return CLI_CATALOG.find((item) => item.id === cliId) ?? null;
}
