import assert from "node:assert/strict";
import test from "node:test";

import {
  buildV2rayBasic,
  buildV2rayBlocked,
  buildV2rayGeo,
  buildV2rayNonRu,
  meaningfulLines,
  normalizeBlockedDomains,
  normalizeBlockedIps,
  normalizeV2flyDomains,
  parseRule,
  toShadowrocketRule,
} from "../scripts/build.mjs";

function assertAdBlocking(result, expectedDomain) {
  assert.ok(
    result.some(
      (entry) =>
        entry.outboundTag === "block" &&
        entry.domain?.includes("geosite:category-ads-all"),
    ),
  );
  if (expectedDomain) {
    assert.ok(
      result.some(
        (entry) =>
          entry.outboundTag === "block" &&
          entry.domain?.includes(`domain:${expectedDomain}`),
      ),
    );
  }
}

test("убирает комментарии и пустые строки", () => {
  assert.deepEqual(meaningfulLines("# comment\n\n DOMAIN-SUFFIX,example.com \n"), [
    "DOMAIN-SUFFIX,example.com",
  ]);
});

test("преобразует правила Shadowrocket в значения v2rayN", () => {
  assert.deepEqual(parseRule("DOMAIN-SUFFIX,example.com"), {
    domain: "domain:example.com",
  });
  assert.deepEqual(parseRule("DOMAIN,api.example.com"), {
    domain: "full:api.example.com",
  });
  assert.deepEqual(parseRule("DOMAIN-KEYWORD,example"), {
    domain: "example",
  });
  assert.deepEqual(parseRule("IP-CIDR,192.0.2.0/24,no-resolve"), {
    ip: "192.0.2.0/24",
  });
  assert.deepEqual(parseRule("DOMAIN-SUFFIX,рф"), {
    domain: "domain:xn--p1ai",
  });
});

test("добавляет политику перед параметром no-resolve", () => {
  assert.equal(
    toShadowrocketRule("IP-CIDR,192.0.2.0/24,no-resolve", "DIRECT"),
    "IP-CIDR,192.0.2.0/24,DIRECT,no-resolve",
  );
});

test("basic проксирует выбранные сервисы, остальное напрямую", () => {
  const result = buildV2rayBasic({
    direct: ["DOMAIN-SUFFIX,direct.example"],
    proxy: ["DOMAIN-SUFFIX,proxy.example", "IP-CIDR,192.0.2.0/24"],
    ads: ["DOMAIN-SUFFIX,ads.example"],
  });

  assert.equal(result.at(-1).outboundTag, "direct");
  assert.equal(result.at(-1).port, "0-65535");
  assert.ok(result.some((entry) => entry.domain?.includes("domain:proxy.example")));
  assertAdBlocking(result, "ads.example");
});

test("geo направляет российские адреса напрямую, остальное в прокси", () => {
  const result = buildV2rayGeo({ direct: [] });
  assert.ok(result.some((entry) => entry.ip?.includes("geoip:ru")));
  assert.equal(result.at(-1).outboundTag, "proxy");
  assertAdBlocking(result);
});

test("nonru проксирует российские домены, остальное напрямую", () => {
  const result = buildV2rayNonRu({ direct: [], proxy: [] });
  assert.ok(result.some((entry) => entry.domain?.includes("domain:ru")));
  assert.equal(result.at(-1).outboundTag, "direct");
  assertAdBlocking(result);
});

test("normalizes and deduplicates blocked-resource sources", () => {
  assert.deepEqual(
    normalizeBlockedDomains([
      "Example.com\n*.cdn.example.com\n# comment\nexample.com\n",
    ]),
    ["cdn.example.com", "example.com"],
  );
  assert.deepEqual(
    normalizeBlockedIps(["192.0.2.0/24\n2001:db8::/32\n192.0.2.0/24\n"]),
    ["192.0.2.0/24", "2001:db8::/32"],
  );
});

test("normalizes v2fly domains and skips unsupported expressions", () => {
  assert.deepEqual(
    normalizeV2flyDomains([
      [
        "kino.pub",
        "ahc.ovh # sub domains mirror",
        "domain:cdn.example @attribute",
        "regexp:(\\w+)-static-[0-9]+\\.cdntogo\\.net$",
        "include:another-list",
      ].join("\n"),
    ]),
    ["ahc.ovh", "cdn.example", "kino.pub"],
  );
});

test("blocked proxies only blocked resources", () => {
  const result = buildV2rayBlocked({
    direct: ["DOMAIN-SUFFIX,direct.example"],
    blockedDomains: ["blocked.example"],
    blockedIps: ["192.0.2.0/24"],
    overrides: [
      "DOMAIN,quietly-blocked.example",
      "IP-CIDR,198.51.100.0/24,no-resolve",
    ],
  });
  assert.ok(
    result.some((entry) => entry.domain?.includes("domain:blocked.example")),
  );
  assert.ok(result.some((entry) => entry.ip?.includes("192.0.2.0/24")));
  assert.ok(
    result.some((entry) =>
      entry.domain?.includes("full:quietly-blocked.example"),
    ),
  );
  assert.ok(result.some((entry) => entry.ip?.includes("198.51.100.0/24")));
  assert.equal(result.at(-1).outboundTag, "direct");
  assertAdBlocking(result);
});
