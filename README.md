# Единые правила для Shadowrocket и v2rayN

Самостоятельный генератор конфигураций для устройств Apple и Windows. Базовые
правила, шаблоны и сборщик находятся в этом репозитории и не зависят от чужого
репозитория конфигураций.

## Режимы

| Режим | Поведение |
| --- | --- |
| `basic` | Выбранные сервисы через прокси, остальное напрямую |
| `geo` | Российские домены и IP напрямую, остальное через прокси |
| `nonru` | Российские домены через прокси, остальное напрямую |

## Shadowrocket

Основной режим `basic`:

```text
https://raw.githubusercontent.com/qleager/proxy-routing-config/main/dist/shadowrocket.conf
```

Дополнительные режимы:

```text
https://raw.githubusercontent.com/qleager/proxy-routing-config/main/dist/shadowrocket-geo.conf
https://raw.githubusercontent.com/qleager/proxy-routing-config/main/dist/shadowrocket-nonru.conf
```

В каждом файле указан собственный `update-url`.

## v2rayN

Основной режим `basic`:

```text
https://raw.githubusercontent.com/qleager/proxy-routing-config/main/dist/v2rayn-routing.json
```

Дополнительные режимы:

```text
https://raw.githubusercontent.com/qleager/proxy-routing-config/main/dist/v2rayn-geo.json
https://raw.githubusercontent.com/qleager/proxy-routing-config/main/dist/v2rayn-nonru.json
```

В v2rayN откройте настройки маршрутизации и импортируйте нужный JSON из URL.
Повторное обновление URL может потребоваться вручную — это зависит от версии
клиента.

## Где редактировать правила

- `source/proxy.list` — общий базовый каталог сервисов;
- `custom/proxy.list` — личные правила через прокси;
- `custom/direct.list` — личные исключения напрямую;
- `source/general.conf` — общие параметры Shadowrocket.

Формат правила:

```text
DOMAIN-SUFFIX,example.com
DOMAIN,api.example.com
DOMAIN-KEYWORD,example
IP-CIDR,198.51.100.0/24,no-resolve
```

После изменения исходников GitHub Actions пересобирает все файлы. Личные
`DIRECT`-правила имеют приоритет над базовым каталогом.

## Автоматическая сборка

Workflow запускается:

- ежедневно в `02:17 UTC` (`05:17` по Москве);
- после изменения исходников, личных правил, сборщика или тестов;
- вручную через **Actions → Update routing configs → Run workflow**.

Сборка проверяет формат правил, запускает тесты и публикует только валидные
конфигурации.
