import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const REPOSITORY = "qleager/proxy-routing-config";
const UPSTREAM_CONFIG_URL =
  "https://raw.githubusercontent.com/misha-tgshv/shadowrocket-configuration-file/main/conf/sr_ru_basic.conf";
const SHADOWROCKET_UPDATE_URL =
  `https://raw.githubusercontent.com/${REPOSITORY}/main/dist/shadowrocket.conf`;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RULE_TYPES = new Set([
  "DOMAIN",
  "DOMAIN-SUFFIX",
  "DOMAIN-KEYWORD",
  "IP-CIDR",
  "IP-CIDR6",
  "GEOIP",
]);

export function meaningfulLines(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
}

export function parseRule(line) {
  const parts = line.split(",").map((part) => part.trim());

  if (parts.length === 1) {
    const value = parts[0];
    return looksLikeIp(value)
      ? { ip: value }
      : { domain: `domain:${value}` };
  }

  const type = parts[0].toUpperCase();
  const value = parts[1];
  if (!RULE_TYPES.has(type) || !value) return null;

  switch (type) {
    case "DOMAIN":
      return { domain: `full:${value}` };
    case "DOMAIN-SUFFIX":
      return { domain: `domain:${value}` };
    case "DOMAIN-KEYWORD":
      return { domain: value };
    case "IP-CIDR":
    case "IP-CIDR6":
      return { ip: value };
    case "GEOIP":
      return { ip: `geoip:${value.toLowerCase()}` };
    default:
      return null;
  }
}

export function toShadowrocketRule(line, policy) {
  const parts = line.split(",").map((part) => part.trim());
  const type = parts[0]?.toUpperCase();
  const value = parts[1];
  if (!RULE_TYPES.has(type) || !value) {
    throw new Error(`Неподдерживаемое пользовательское правило: ${line}`);
  }

  const extras = parts.slice(2);
  return [type, value, policy, ...extras].join(",");
}

export function buildShadowrocketConfig(baseConfig, directLines, proxyLines) {
  const lines = baseConfig.split(/\r?\n/);
  const ruleSection = lines.findIndex((line) => line.trim() === "[Rule]");
  if (ruleSection === -1) {
    throw new Error("В базовом конфиге отсутствует секция [Rule]");
  }

  const cleaned = lines
    .filter((line) => !/^\s*include\s*=/i.test(line))
    .map((line) =>
      /^\s*update-url\s*=/i.test(line)
        ? `update-url = ${SHADOWROCKET_UPDATE_URL}`
        : line.trimEnd(),
    );

  const newRuleSection = cleaned.findIndex((line) => line.trim() === "[Rule]");
  const customRules = [
    "# Пользовательские DIRECT-правила",
    ...directLines.map((line) => toShadowrocketRule(line, "DIRECT")),
    "# Пользовательские PROXY-правила",
    ...proxyLines.map((line) => toShadowrocketRule(line, "PROXY")),
    "",
  ];

  cleaned.splice(newRuleSection + 1, 0, ...customRules);
  return `${cleaned.join("\n").trimEnd()}\n`;
}

function looksLikeIp(value) {
  return (
    value.includes(":") ||
    /^\d{1,3}(?:\.\d{1,3}){3}(?:\/\d{1,3})?$/.test(value)
  );
}

function unique(values) {
  return [...new Set(values)];
}

function collectRules(lines) {
  const domains = [];
  const ips = [];

  for (const line of lines) {
    const parsed = parseRule(line);
    if (parsed?.domain) domains.push(parsed.domain);
    if (parsed?.ip) ips.push(parsed.ip);
  }

  return { domains: unique(domains), ips: unique(ips) };
}

function routingEntries(remarks, outboundTag, rules) {
  const entries = [];
  if (rules.domains.length) {
    entries.push({
      port: "",
      outboundTag,
      domain: rules.domains,
      enabled: true,
      remarks: `${remarks}: домены`,
    });
  }
  if (rules.ips.length) {
    entries.push({
      port: "",
      outboundTag,
      ip: rules.ips,
      enabled: true,
      remarks: `${remarks}: IP`,
    });
  }
  return entries;
}

export function buildV2rayRouting({
  customDirect,
  customProxy,
  upstreamDirect,
  upstreamProxy,
}) {
  return [
    {
      port: "",
      outboundTag: "direct",
      ip: ["geoip:private"],
      enabled: true,
      remarks: "Локальные сети: напрямую",
    },
    ...routingEntries(
      "Пользовательские исключения",
      "direct",
      collectRules(customDirect),
    ),
    ...routingEntries(
      "Пользовательские прокси-правила",
      "proxy",
      collectRules(customProxy),
    ),
    ...routingEntries(
      "Правила автора: напрямую",
      "direct",
      collectRules(upstreamDirect),
    ),
    ...routingEntries(
      "Правила автора: через прокси",
      "proxy",
      collectRules(upstreamProxy),
    ),
    {
      port: "0-65535",
      outboundTag: "direct",
      enabled: true,
      remarks: "Остальной трафик: напрямую",
    },
  ];
}

function extractBaseRules(baseConfig) {
  const lines = baseConfig.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === "[Rule]");
  if (start === -1) throw new Error("В базовом конфиге отсутствует [Rule]");

  const direct = [];
  const proxy = [];
  const sources = [];

  for (const rawLine of lines.slice(start + 1)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || line.startsWith("FINAL,")) continue;
    if (line.startsWith("[")) break;

    const parts = line.split(",").map((part) => part.trim());
    const type = parts[0]?.toUpperCase();
    const policy = parts[2]?.toUpperCase();

    if (type === "RULE-SET" && /^https?:\/\//.test(parts[1] ?? "")) {
      if (policy === "DIRECT" || policy === "PROXY") {
        sources.push({ url: parts[1], policy });
      }
      continue;
    }

    if (RULE_TYPES.has(type) && (policy === "DIRECT" || policy === "PROXY")) {
      const withoutPolicy = [parts[0], parts[1], ...parts.slice(3)].join(",");
      (policy === "DIRECT" ? direct : proxy).push(withoutPolicy);
    }
  }

  return { direct, proxy, sources };
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: { "User-Agent": "qleager/proxy-routing-config" },
    redirect: "follow",
  });
  if (!response.ok) {
    throw new Error(`Не удалось скачать ${url}: HTTP ${response.status}`);
  }
  return response.text();
}

async function main() {
  const [baseConfig, customDirectText, customProxyText] = await Promise.all([
    fetchText(UPSTREAM_CONFIG_URL),
    readFile(path.join(ROOT, "custom/direct.list"), "utf8"),
    readFile(path.join(ROOT, "custom/proxy.list"), "utf8"),
  ]);

  const customDirect = meaningfulLines(customDirectText);
  const customProxy = meaningfulLines(customProxyText);
  const baseRules = extractBaseRules(baseConfig);
  const downloadedSources = await Promise.all(
    baseRules.sources.map(async ({ url, policy }) => ({
      policy,
      lines: meaningfulLines(await fetchText(url)),
    })),
  );

  const upstreamDirect = [...baseRules.direct];
  const upstreamProxy = [...baseRules.proxy];
  for (const source of downloadedSources) {
    (source.policy === "DIRECT" ? upstreamDirect : upstreamProxy).push(
      ...source.lines,
    );
  }

  const shadowrocket = buildShadowrocketConfig(
    baseConfig,
    customDirect,
    customProxy,
  );
  const v2ray = buildV2rayRouting({
    customDirect,
    customProxy,
    upstreamDirect,
    upstreamProxy,
  });

  const dist = path.join(ROOT, "dist");
  await mkdir(dist, { recursive: true });
  await Promise.all([
    writeFile(path.join(dist, "shadowrocket.conf"), shadowrocket),
    writeFile(
      path.join(dist, "v2rayn-routing.json"),
      `${JSON.stringify(v2ray, null, 2)}\n`,
    ),
  ]);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
