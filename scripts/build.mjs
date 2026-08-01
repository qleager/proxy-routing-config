import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const REPOSITORY = "qleager/proxy-routing-config";
const RAW_ROOT = `https://raw.githubusercontent.com/${REPOSITORY}/main`;
const SHADOWROCKET_AD_RULE_ROOT =
  "https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Shadowrocket/AdvertisingLite";
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
  const type = parts[0]?.toUpperCase();
  const value = parts[1];
  if (!RULE_TYPES.has(type) || !value) return null;

  switch (type) {
    case "DOMAIN":
      return { domain: `full:${value}` };
    case "DOMAIN-SUFFIX":
      return { domain: `domain:${normalizeDomain(value)}` };
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
    throw new Error(`Неподдерживаемое правило: ${line}`);
  }

  return [type, value, policy, ...parts.slice(2)].join(",");
}

function normalizeDomain(value) {
  return value === "рф" ? "xn--p1ai" : value;
}

function unique(values) {
  return [...new Set(values)];
}

function validateRules(lines) {
  for (const line of lines) {
    if (!parseRule(line)) throw new Error(`Неподдерживаемое правило: ${line}`);
  }
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

function privateNetworkEntry() {
  return {
    port: "",
    outboundTag: "direct",
    ip: ["geoip:private"],
    enabled: true,
    remarks: "Локальные сети: напрямую",
  };
}

function adBlockingEntry() {
  return {
    port: "",
    outboundTag: "block",
    domain: ["geosite:category-ads-all"],
    enabled: true,
    remarks: "Advertising: blocked",
  };
}

function finalEntry(outboundTag) {
  return {
    port: "0-65535",
    outboundTag,
    enabled: true,
    remarks:
      outboundTag === "direct"
        ? "Остальной трафик: напрямую"
        : "Остальной трафик: через прокси",
  };
}

export function buildV2rayBasic({ direct, proxy }) {
  return [
    privateNetworkEntry(),
    ...routingEntries(
      "Пользовательские исключения",
      "direct",
      collectRules(direct),
    ),
    adBlockingEntry(),
    ...routingEntries("Выбранные сервисы", "proxy", collectRules(proxy)),
    finalEntry("direct"),
  ];
}

export function buildV2rayGeo({ direct }) {
  return [
    privateNetworkEntry(),
    ...routingEntries(
      "Пользовательские исключения",
      "direct",
      collectRules(direct),
    ),
    adBlockingEntry(),
    {
      port: "",
      outboundTag: "direct",
      domain: ["domain:ru", "domain:su", "domain:xn--p1ai"],
      ip: ["geoip:ru"],
      enabled: true,
      remarks: "Российские домены и IP: напрямую",
    },
    finalEntry("proxy"),
  ];
}

export function buildV2rayNonRu({ direct, proxy }) {
  const russianRules = [
    "DOMAIN-SUFFIX,ru",
    "DOMAIN-SUFFIX,su",
    "DOMAIN-SUFFIX,рф",
  ];
  return [
    privateNetworkEntry(),
    ...routingEntries(
      "Пользовательские исключения",
      "direct",
      collectRules(direct),
    ),
    adBlockingEntry(),
    ...routingEntries(
      "Российские домены",
      "proxy",
      collectRules(russianRules),
    ),
    ...routingEntries(
      "Дополнительные прокси-правила",
      "proxy",
      collectRules(proxy),
    ),
    finalEntry("direct"),
  ];
}

export function buildV2rayBlocked({
  direct,
  blockedDomains,
  blockedIps,
  overrides = [],
}) {
  return [
    privateNetworkEntry(),
    ...routingEntries(
      "User-defined direct exceptions",
      "direct",
      collectRules(direct),
    ),
    adBlockingEntry(),
    ...routingEntries(
      "Blocked resources",
      "proxy",
      collectRules([
        ...blockedDomains.map((domain) => `DOMAIN-SUFFIX,${domain}`),
        ...blockedIps.map((ip) =>
          `${ip.includes(":") ? "IP-CIDR6" : "IP-CIDR"},${ip}`,
        ),
        ...overrides,
      ]),
    ),
    finalEntry("direct"),
  ];
}

function renderGeneral(general, outputName) {
  const updateUrl = `${RAW_ROOT}/dist/${outputName}`;
  return general
    .replaceAll("{{UPDATE_URL}}", updateUrl)
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .join("\n")
    .trimEnd();
}

function renderShadowrocket({
  general,
  outputName,
  direct,
  mode,
}) {
  const lines = [
    renderGeneral(general, outputName),
    "",
    "[Rule]",
    "# Личные исключения имеют наивысший приоритет",
    ...direct.map((line) => toShadowrocketRule(line, "DIRECT")),
    "# Блокировка рекламных и отслеживающих доменов",
    `RULE-SET,${SHADOWROCKET_AD_RULE_ROOT}/AdvertisingLite.list,REJECT`,
    `DOMAIN-SET,${SHADOWROCKET_AD_RULE_ROOT}/AdvertisingLite_Domain.list,REJECT`,
  ];

  if (mode === "basic") {
    lines.push(
      `RULE-SET,${RAW_ROOT}/rules/proxy.list,PROXY`,
      "FINAL,DIRECT",
    );
  } else if (mode === "geo") {
    lines.push(
      "GEOIP,RU,DIRECT",
      "DOMAIN-SUFFIX,ru,DIRECT",
      "DOMAIN-SUFFIX,su,DIRECT",
      "DOMAIN-SUFFIX,рф,DIRECT",
      "FINAL,PROXY",
    );
  } else if (mode === "nonru") {
    lines.push(
      "DOMAIN-SUFFIX,ru,PROXY",
      "DOMAIN-SUFFIX,su,PROXY",
      "DOMAIN-SUFFIX,рф,PROXY",
      `RULE-SET,${RAW_ROOT}/rules/proxy.list,PROXY`,
      "FINAL,DIRECT",
    );
  } else if (mode === "blocked") {
    lines.push(
      `RULE-SET,${RAW_ROOT}/rules/blocked-domains.list,PROXY`,
      `RULE-SET,${RAW_ROOT}/rules/blocked-ips.list,PROXY,no-resolve`,
      "FINAL,DIRECT",
    );
  } else {
    throw new Error(`Неизвестный режим: ${mode}`);
  }

  return `${lines.join("\n")}\n`;
}

function renderRuleList(lines, comments = []) {
  return [
    "# Generated by qleager/proxy-routing-config",
    ...comments.map((comment) => `# ${comment}`),
    "# Edit source/proxy.list and custom/proxy.list instead of this file.",
    ...unique(lines),
    "",
  ].join("\n");
}

export function normalizeBlockedDomains(texts) {
  const domains = texts
    .flatMap((text) => meaningfulLines(text))
    .map((domain) =>
      domain
        .toLowerCase()
        .replace(/^\|\|/, "")
        .replace(/^\+\./, "")
        .replace(/^\*\./, "")
        .replace(/^\./, "")
        .replace(/\^$/, ""),
    )
    .filter((domain) =>
      /^(?:[a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9_])?\.)+[a-z0-9-]{2,63}$/.test(
        domain,
      ),
    );
  return unique(domains).sort();
}

export function normalizeV2flyDomains(texts) {
  const domains = texts
    .flatMap((text) => text.split(/\r?\n/))
    .map((line) => line.replace(/\s+#.*$/, "").trim().toLowerCase())
    .filter(
      (line) =>
        line &&
        !line.startsWith("#") &&
        !line.startsWith("regexp:") &&
        !line.startsWith("keyword:") &&
        !line.startsWith("include:"),
    )
    .map((line) => line.replace(/\s+@[\w-]+.*$/, ""))
    .map((line) => line.replace(/^(?:domain:|full:)/, ""))
    .filter((domain) =>
      /^(?:[a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9_])?\.)+[a-z0-9-]{2,63}$/.test(
        domain,
      ),
    );
  return unique(domains).sort();
}

export function normalizeBlockedIps(texts) {
  const ips = texts
    .flatMap((text) => meaningfulLines(text))
    .filter((value) => /^[0-9a-f:.]+\/\d{1,3}$/i.test(value));
  return unique(ips).sort();
}

function partitionBlockedOverrides(lines) {
  validateRules(lines);
  const domains = [];
  const ips = [];

  for (const line of lines) {
    const parsed = parseRule(line);
    (parsed.domain ? domains : ips).push(line);
  }

  return { domains, ips };
}

function renderBlockedDomainList(domains, overrides) {
  return [
    "# Generated from Re:filter and v2fly/domain-list-community (MIT License).",
    "# Includes source/blocked-overrides.list.",
    "# See THIRD_PARTY_NOTICES.md.",
    ...unique([
      ...domains.map((domain) => `DOMAIN-SUFFIX,${domain}`),
      ...overrides,
    ]),
    "",
  ].join("\n");
}

function renderBlockedIpList(ips, overrides) {
  return [
    "# Generated from Re:filter lists (MIT License).",
    "# Includes source/blocked-overrides.list.",
    "# See THIRD_PARTY_NOTICES.md.",
    ...unique([
      ...ips.map(
        (ip) => `${ip.includes(":") ? "IP-CIDR6" : "IP-CIDR"},${ip}`,
      ),
      ...overrides,
    ]),
    "",
  ].join("\n");
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: { "User-Agent": "qleager/proxy-routing-config" },
    redirect: "follow",
  });
  if (!response.ok) {
    throw new Error(`Unable to download ${url}: HTTP ${response.status}`);
  }
  return response.text();
}

async function main() {
  const [
    general,
    sourceProxyText,
    customDirectText,
    customProxyText,
    blockedSourcesText,
    blockedOverridesText,
  ] =
    await Promise.all([
      readFile(path.join(ROOT, "source/general.conf"), "utf8"),
      readFile(path.join(ROOT, "source/proxy.list"), "utf8"),
      readFile(path.join(ROOT, "custom/direct.list"), "utf8"),
      readFile(path.join(ROOT, "custom/proxy.list"), "utf8"),
      readFile(path.join(ROOT, "source/blocked-sources.json"), "utf8"),
      readFile(path.join(ROOT, "source/blocked-overrides.list"), "utf8"),
    ]);

  const sourceProxy = meaningfulLines(sourceProxyText);
  const customDirect = meaningfulLines(customDirectText);
  const customProxy = meaningfulLines(customProxyText);
  const allProxy = unique([...sourceProxy, ...customProxy]);
  validateRules([...customDirect, ...allProxy]);
  const blockedSources = JSON.parse(blockedSourcesText);
  const [blockedDomainTexts, blockedIpTexts, v2flyDomainTexts] =
    await Promise.all([
      Promise.all(blockedSources.domains.map(fetchText)),
      Promise.all(blockedSources.ips.map(fetchText)),
      Promise.all((blockedSources.v2flyDomains ?? []).map(fetchText)),
    ]);
  const blockedDomains = unique([
    ...normalizeBlockedDomains(blockedDomainTexts),
    ...normalizeV2flyDomains(v2flyDomainTexts),
  ]).sort();
  const blockedIps = normalizeBlockedIps(blockedIpTexts);
  const blockedOverrides = meaningfulLines(blockedOverridesText);
  const partitionedOverrides = partitionBlockedOverrides(blockedOverrides);
  if (!blockedDomains.length || !blockedIps.length) {
    throw new Error("Blocked-resource sources returned no usable rules");
  }

  const shadowrocketBasic = renderShadowrocket({
    general,
    outputName: "shadowrocket.conf",
    direct: customDirect,
    mode: "basic",
  });
  const shadowrocketGeo = renderShadowrocket({
    general,
    outputName: "shadowrocket-geo.conf",
    direct: customDirect,
    mode: "geo",
  });
  const shadowrocketNonRu = renderShadowrocket({
    general,
    outputName: "shadowrocket-nonru.conf",
    direct: customDirect,
    mode: "nonru",
  });
  const shadowrocketBlocked = renderShadowrocket({
    general,
    outputName: "shadowrocket-blocked.conf",
    direct: customDirect,
    mode: "blocked",
  });
  const v2rayBasic = buildV2rayBasic({
    direct: customDirect,
    proxy: allProxy,
  });
  const v2rayGeo = buildV2rayGeo({ direct: customDirect });
  const v2rayNonRu = buildV2rayNonRu({
    direct: customDirect,
    proxy: allProxy,
  });
  const v2rayBlocked = buildV2rayBlocked({
    direct: customDirect,
    blockedDomains,
    blockedIps,
    overrides: blockedOverrides,
  });

  const dist = path.join(ROOT, "dist");
  const rules = path.join(ROOT, "rules");
  await Promise.all([
    mkdir(dist, { recursive: true }),
    mkdir(rules, { recursive: true }),
  ]);

  const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
  await Promise.all([
    writeFile(path.join(rules, "proxy.list"), renderRuleList(allProxy)),
    writeFile(
      path.join(rules, "blocked-domains.list"),
      renderBlockedDomainList(blockedDomains, partitionedOverrides.domains),
    ),
    writeFile(
      path.join(rules, "blocked-ips.list"),
      renderBlockedIpList(blockedIps, partitionedOverrides.ips),
    ),
    writeFile(path.join(dist, "shadowrocket.conf"), shadowrocketBasic),
    writeFile(
      path.join(dist, "shadowrocket-basic.conf"),
      shadowrocketBasic,
    ),
    writeFile(path.join(dist, "shadowrocket-geo.conf"), shadowrocketGeo),
    writeFile(
      path.join(dist, "shadowrocket-nonru.conf"),
      shadowrocketNonRu,
    ),
    writeFile(
      path.join(dist, "shadowrocket-blocked.conf"),
      shadowrocketBlocked,
    ),
    writeFile(path.join(dist, "v2rayn-routing.json"), json(v2rayBasic)),
    writeFile(path.join(dist, "v2rayn-basic.json"), json(v2rayBasic)),
    writeFile(path.join(dist, "v2rayn-geo.json"), json(v2rayGeo)),
    writeFile(path.join(dist, "v2rayn-nonru.json"), json(v2rayNonRu)),
    writeFile(path.join(dist, "v2rayn-blocked.json"), json(v2rayBlocked)),
  ]);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
