import assert from "node:assert/strict";
import test from "node:test";

import {
  buildV2rayBasic,
  buildV2rayGeo,
  buildV2rayNonRu,
  meaningfulLines,
  parseRule,
  toShadowrocketRule,
} from "../scripts/build.mjs";

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
  });

  assert.equal(result.at(-1).outboundTag, "direct");
  assert.equal(result.at(-1).port, "0-65535");
  assert.ok(result.some((entry) => entry.domain?.includes("domain:proxy.example")));
});

test("geo направляет российские адреса напрямую, остальное в прокси", () => {
  const result = buildV2rayGeo({ direct: [] });
  assert.ok(result.some((entry) => entry.ip?.includes("geoip:ru")));
  assert.equal(result.at(-1).outboundTag, "proxy");
});

test("nonru проксирует российские домены, остальное напрямую", () => {
  const result = buildV2rayNonRu({ direct: [], proxy: [] });
  assert.ok(result.some((entry) => entry.domain?.includes("domain:ru")));
  assert.equal(result.at(-1).outboundTag, "direct");
});
