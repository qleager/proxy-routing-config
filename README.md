# Единые правила для Shadowrocket и v2rayN

Репозиторий ежедневно получает свежий `sr_ru_basic.conf` из
[`misha-tgshv/shadowrocket-configuration-file`](https://github.com/misha-tgshv/shadowrocket-configuration-file)
и выпускает два совместимых файла:

- `dist/shadowrocket.conf` — конфигурация Shadowrocket;
- `dist/v2rayn-routing.json` — правила маршрутизации v2rayN.

Остальной трафик идёт напрямую, как в исходном `sr_ru_basic.conf`.

## Shadowrocket

В разделе `Config` выберите добавление конфигурации по URL:

```text
https://raw.githubusercontent.com/qleager/proxy-routing-config/main/dist/shadowrocket.conf
```

Внутри файла уже указан этот же `update-url`, поэтому последующие обновления
Shadowrocket сможет получать с вашего репозитория.

## v2rayN

Откройте настройки маршрутизации и выберите импорт правил из URL подписки:

```text
https://raw.githubusercontent.com/qleager/proxy-routing-config/main/dist/v2rayn-routing.json
```

После импорта выберите созданный набор правил. Повторный импорт или обновление
URL в v2rayN может потребоваться вручную — это зависит от версии клиента.

## Личные правила

- `custom/direct.list` — трафик должен идти напрямую;
- `custom/proxy.list` — трафик должен идти через прокси.

Формат — правило Shadowrocket без `DIRECT` или `PROXY`:

```text
DOMAIN-SUFFIX,example.com
DOMAIN,api.example.com
DOMAIN-KEYWORD,example
IP-CIDR,198.51.100.0/24,no-resolve
```

После изменения файла GitHub Actions пересоберёт обе конфигурации. Личные
`DIRECT`-правила стоят раньше правил автора и могут создавать исключения.

## Обновление

Workflow запускается:

- ежедневно в `02:17 UTC` (`05:17` по Москве);
- после изменения сборщика или личных правил;
- вручную через вкладку **Actions → Update routing configs → Run workflow**.

Если один из источников недоступен, сборка завершается ошибкой и сохраняет
предыдущую рабочую конфигурацию.
