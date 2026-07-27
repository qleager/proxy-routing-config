# Proxy routing configuration generator

A configuration generator for Shadowrocket on iOS, iPadOS, macOS, and tvOS,
and for v2rayN on Windows. It builds matching routing profiles from shared
sources so the same proxy policy can be used across devices.

## Routing modes

| Mode | Behavior |
| --- | --- |
| `basic` | Routes selected services through the proxy and connects everything else directly |
| `blocked` | Routes resources blocked or restricted in `Russia 🇷🇺` through the proxy and connects everything else directly |
| `geo` | Connects Russian domains and IP addresses directly and routes everything else through the proxy |
| `nonru` | Routes Russian domains through the proxy and connects everything else directly |

## Shadowrocket

Use the `blocked` profile to proxy only blocked or restricted resources:

```text
https://raw.githubusercontent.com/qleager/proxy-routing-config/main/dist/shadowrocket-blocked.conf
```

Other profiles:

```text
https://raw.githubusercontent.com/qleager/proxy-routing-config/main/dist/shadowrocket.conf
https://raw.githubusercontent.com/qleager/proxy-routing-config/main/dist/shadowrocket-geo.conf
https://raw.githubusercontent.com/qleager/proxy-routing-config/main/dist/shadowrocket-nonru.conf
```

Each Shadowrocket profile contains its own `update-url`.

## v2rayN

Use the `blocked` profile to proxy only blocked or restricted resources:

```text
https://raw.githubusercontent.com/qleager/proxy-routing-config/main/dist/v2rayn-blocked.json
```

Other profiles:

```text
https://raw.githubusercontent.com/qleager/proxy-routing-config/main/dist/v2rayn-routing.json
https://raw.githubusercontent.com/qleager/proxy-routing-config/main/dist/v2rayn-geo.json
https://raw.githubusercontent.com/qleager/proxy-routing-config/main/dist/v2rayn-nonru.json
```

Open the v2rayN routing settings and import the selected JSON file from its
URL. Importing the large `blocked` profile can take some time. Refreshing an
imported URL may need to be done manually, depending on the client version.

## Rule sources

- `source/proxy.list` contains the repository's curated service catalog.
- `source/blocked-sources.json` defines the MIT-licensed Re:filter feeds used
  by the `blocked` mode.
- `source/blocked-overrides.list` contains manually confirmed blocks missing
  from upstream feeds. These rules are published for every `blocked` user.
- `custom/proxy.list` contains personal proxy rules.
- `custom/direct.list` contains personal direct-connection exceptions.
- `source/general.conf` contains shared Shadowrocket settings.

User-defined `DIRECT` rules are evaluated before generated proxy rules.

Supported rule syntax:

```text
DOMAIN-SUFFIX,example.com
DOMAIN,api.example.com
DOMAIN-KEYWORD,example
IP-CIDR,198.51.100.0/24,no-resolve
```

See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for data-source license
information.

## Automatic updates

GitHub Actions rebuilds and validates all profiles:

- every day at `02:17 UTC`;
- after generator, source, custom-rule, test, or workflow changes;
- manually from **Actions → Update routing configs → Run workflow**.

If an external blocked-resource feed is unavailable or returns no usable
rules, the workflow fails without replacing the previously generated files.

## License

The generator and repository-owned configuration files are available under
the [MIT License](LICENSE). Generated artifacts that include third-party data
also remain subject to the notices in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
