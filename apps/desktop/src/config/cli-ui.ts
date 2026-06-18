import defaultIcon from '../assets/icon/shob.png';
import { CLI_CATALOG, getCatalogItem } from './check';

export const CLI_LOGO_BY_ICON_KEY: Record<string, string> = {
  codex: defaultIcon,
  claude: defaultIcon,
  gemini: defaultIcon,
  shob: defaultIcon,
  droid: defaultIcon,
  kilo: defaultIcon,
  qwen: defaultIcon,
};

export const DEFAULT_CLI_ICON = defaultIcon;

export function getCliDisplayLabel(cliId?: string | null) {
  return getCatalogItem(cliId)?.label ?? null;
}

export function getCliIconAsset(cliId?: string | null) {
  const iconKey = getCatalogItem(cliId)?.iconKey;
  if (!iconKey) return DEFAULT_CLI_ICON;

  return CLI_LOGO_BY_ICON_KEY[iconKey] ?? DEFAULT_CLI_ICON;
}

export function getCliFallbackText(cliId?: string | null, sessionName?: string) {
  const label = getCliDisplayLabel(cliId) ?? sessionName ?? '';
  const parts = label
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 2);

  if (parts.length === 0) return 'CLI';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
}

export const CLI_OPTIONS = CLI_CATALOG;
