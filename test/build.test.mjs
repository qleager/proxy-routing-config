import assert from "node:assert/strict";
import test from "node:test";

import {
  buildShadowrocketConfig,
  buildV2rayRouting,
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
});

test("добавляет политику Shadowrocket перед дополнительными параметрами", () => {
  assert.equal(
    toShadowrocketRule("IP-CIDR,192.0.2.0/24,no-resolve", "DIRECT"),
    "IP-CIDR,192.0.2.0/24,DIRECT,no-resolve",
  );
});

test("встраивает личные правила и собственный update-url", () => {
  const base = [
    "[General]",
    "include = sr_ru_extended.conf",
    "update-url = https://example.com/upstream.conf",
    "[Rule]",
    "DOMAIN-SUFFIX,upstream.example,PROXY",
    "FINAL,DIRECT",
  ].join("\n");
  const result = buildShadowrocketConfig(
    base,
    ["DOMAIN-SUFFIX,direct.example"],
    ["DOMAIN-SUFFIX,proxy.example"],
  );

  assert.doesNotMatch(result, /^include\s*=/m);
  assert.match(
    result,
    /update-url = https:\/\/raw\.githubusercontent\.com\/qleager\/proxy-routing-config\/main\/dist\/shadowrocket\.conf/,
  );
  assert.ok(
    result.indexOf("DOMAIN-SUFFIX,direct.example,DIRECT") <
      result.indexOf("DOMAIN-SUFFIX,upstream.example,PROXY"),
  );
});

test("v2rayN заканчивает маршрутизацию прямым подключением", () => {
  const result = buildV2rayRouting({
    customDirect: ["DOMAIN-SUFFIX,direct.example"],
    customProxy: ["DOMAIN-SUFFIX,proxy.example"],
    upstreamDirect: [],
    upstreamProxy: ["1.1.1.1"],
  });

  assert.equal(result.at(-1).outboundTag, "direct");
  assert.equal(result.at(-1).port, "0-65535");
  assert.deepEqual(result[1].domain, ["domain:direct.example"]);
});
