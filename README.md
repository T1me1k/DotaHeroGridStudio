# Dota Hero Grid Studio v0.3

Локальный редактор Hero Grid. PNG/JPG/WebP/SVG или текст → ASCII / Line Art / Silhouette / Dither / Pixel / Outline / Hybrid → текстовые категории Dota → `hero_grid_config.json`.

**Экспериментальный экспорт:** каждый glyph/строка записывается в `category_name`, с координатами и `width: 0`, `height: 0`, `hero_ids: []`. Этот приём используется для отдельных надписей в [dota-hero-grid-generator](https://github.com/hauzer/dota-hero-grid-generator/blob/master/dota_hero_grid_generator.py). Unicode, baseline, ширину строк и пределы производительности нужно проверить в текущей Dota. Никакие выдуманные `fontSize`, `rotation` или `symbol` в JSON не добавляются.

## Что добавлено в v0.3

- **Simple Mode:** загрузка → стиль → качество → Preview → установка. Advanced возвращает инструменты.
- **Canvas art tools:** Pencil, Symbol Brush, Eraser, Line, Rectangle, Ellipse, Flood Fill, Magic Wand, Component Delete, Bezier (4 клика: начало, две управляющие, конец), Mirror X/Y. Art Select: click / Shift / протянуть рамку; перетаскивание; Snap и центральные Guides.
- Слои: название, порядок, hide, lock, перенос выделенного. Группы, Copy/Paste внутри приложения, Duplicate, align/distribute, rotate/flip/scale координат. Ctrl+A/C/V/D/G, Shift+Ctrl+G работают в Art Select/Wand; Undo/Redo общие. Эти инструменты редактируют art; native Hero/Text категории редактируются отдельно.
- **Image Converter:** grayscale, brightness, contrast, blur, Sobel + thinning или Canny с двойным порогом/hysteresis, noise components, angle-aware glyphs и адаптивное прореживание прямых. Outline, Hybrid и монохромный Pixel. Region — до 8 прямоугольников с собственными mode/quality/threshold/density; применяются при следующем Convert. Конвертация заменяет только art активного незаблокированного слоя.
- **SVG → Dota:** очистка SVG, локальная растеризация и тот же конвертер. Это не редактирование векторных узлов SVG. Text → Art сохраняет строки и пробелы в позициях glyph.
- **Logo Wizard / Pixel Wizard:** загрузка, удаление одноцветного фона по цвету угла, trace/simplify, center/fit, export. У сложного фона качество зависит от ручного threshold/tolerance.
- **Hero Grid Manager:** все configs импортированного файла, rename через название сетки, duplicate/reorder/delete, export one, import/merge. Каждый config хранит свои art, image, calibration и слои. Общий Export JSON экспортирует все сетки проекта.
- **Visual Hero Picker:** 127 карточек с именами, атрибутами и ролями, поиск, выбор мышью без ручного ввода ID. Портреты не загружаются; данные OpenDota — см. THIRD_PARTY.md. Неизвестные ID из импортированных файлов сохраняются.
- **Autosave / History:** локальная IndexedDB, восстановление при запуске, последние 10 именованных snapshots, скачивание `.dotagrid`. Это данные конкретного браузера/desktop-профиля: для переноса используйте Save. Compare фиксирует A, показывает добавленные/удалённые glyph цветом в Editor Preview и число categories A/B.
- **Optimize:** объединение совместимых text runs, удаление пустых/дублирующихся элементов экспорта, округление координат до 3 знаков. Noise/simplification выполняются в конвертере. Степень сокращения зависит от рисунка и калибровки; 85% не гарантируется. Исходный art не урезается ради бюджета.

## Быстрый запуск

Node.js 20+:

```sh
npm ci
npm run dev
```

Открыть http://127.0.0.1:4173. Сам веб-редактор работает без сторонних runtime-библиотек. `npm ci` устанавливает CLI для сборки и инструменты тестов.

Для Windows: Rust stable, Visual Studio C++ Build Tools и WebView2, затем:

```sh
npm run tauri -- dev
npm run tauri -- build --bundles nsis
```

GitHub Actions **Windows build** собирает NSIS `.exe` и сохраняет `DotaHeroGridStudio-Windows-x64` в Artifacts конкретного запуска. Автоматической публикации Release нет. Состояние последнего запуска: https://github.com/T1me1k/DotaHeroGridStudio/actions/workflows/windows-build.yml

## Первый тест в Dota

1. Нажмите **Generate Dota Test Grid**. Это отдельный проект; предыдущий можно вернуть Undo.
2. **Export JSON** создаёт файл тестовой сетки. В Windows-сборке можно выбрать Steam-аккаунт и нажать **Установить в Dota** после закрытия игры. Эта операция добавляет сетку к имеющимся, автоматически переименовывая совпадающие названия.
3. В игре выберите `Dota Glyph Calibration v0.2`. Проверьте латиницу, цифры, блоки, линии и строки RUN/GLYPHS. Сделайте скриншот; запишите отсутствующие символы и нужное смещение.
4. Вернитесь к рисунку, загрузите свой `radiance_regular.ttf`/OTF, настройте X/Y/baseline и интервалы в **Dota Text Calibration**. Шрифт не поставляется с приложением.
5. Сначала экспортируйте небольшой рисунок в **Per glyph**. Затем сравните **Text runs**. Если строки расходятся, используйте Per glyph до калибровки.

Готовые файлы: `fixtures/dota_glyph_calibration.json` (полная таблица), `fixtures/text_category_probe.json` (короткий тест). При ручной установке не заменяйте существующий файл без копии: сначала откройте его в редакторе, чтобы экспорт сохранил имеющиеся сетки. Для добавления отдельного тестового файла к имеющимся удобнее desktop-установка.

## Экспорт и оптимизация

- **Auto** и **Text runs** соединяют только непрерывные участки одной строки с одинаковым размером editor glyph и совместимым шагом. Пробелы и разрывы не склеиваются; несовместимые элементы остаются отдельными категориями. Длина run ограничена 64 символами.
- **Per glyph** создаёт одну категорию на элемент.
- Кнопка подгонки интервалов использует размер ячейки конвертера и glyph advance. С Radiance учитывается относительная измеренная ширина каждого символа. Это приблизительные метрики, пока не проверены в игре.
- Бюджеты Safe 400 / Balanced 1200 / Detailed 3000 / Ultra 6000 — ориентиры приложения, **не подтверждённые безопасные лимиты Dota**. Превышение останавливает экспорт/установку, сохраняя весь рисунок. Custom допускает до 10000 категорий.
- Без Radiance включён ASCII fallback (`╱ → /`, `█ → #` и т. п.). С загруженным шрифтом доступность проверяется по Unicode cmap 4/12, а ширина через Canvas. Проверка относится к загруженному файлу шрифта, не к клиенту Dota.
- **Dota Export Preview** рисует именно строки и координаты экспорта, без подложки и сетки. Шрифт/отступы остаются приближением. **Editor Preview** показывает отдельные glyph исходной композиции.
- `.dotagrid` отдельно хранит `art`, категории, картинку, параметры и загруженный шрифт. v0.1/v0.2 автоматически мигрируют в v3 проекта. Неизвестные поля импортированных категорий/сеток/корня сохраняются при JSON round-trip.

## Установка и восстановление

Steam обнаруживается через Windows Registry (`SteamPath`, `InstallPath`) и обычные каталоги. Для нестандартной установки укажите Steam root; Health Check также читает Steam libraryfolders.vdf для поиска Dota. В списке показываются аккаунты с существующей папкой `userdata/<account>/570/remote/cfg`, даже если JSON ещё нет. Создание всей папки Dota автоматически не выполняется: сначала запустите игру для аккаунта.

Установщик проверяет процесс Dota, путь и существующий JSON, сохраняет backup, записывает временный файл в том же каталоге и заменяет целевой файл через Windows rename. Перед заменой проверяется, что исходный файл не изменился. Блокировка предотвращает конкурирующие операции приложения. Ошибка резервного копирования отменяет запись. Для нового файла backup содержит пустую сетку version 3.

**One-click Test Install** создаёт или заменяет только точное имя `DHGS TEST`. Повторные тесты не создают `(2)`, `(3)`; другие сетки сохраняются. Обычная установка продолжает добавлять новую сетку с уникальным именем.

**Открыть текущий файл Dota** загружает configs аккаунта в Manager. **Health Check** показывает Steam / Dota / Account / CFG / JSON / Backup / Write Access. Проверка Write Access создаёт и удаляет временный probe. Если папка cfg есть, отсутствующий JSON создаётся корректно.

**Recovery** предлагает все полностью читаемые configs из повреждённого файла. Можно скачать оригинал и открыть восстановленные сетки отдельно. Запись обратно в Dota требует подтверждения, создаёт backup исходных байтов и отказывается, если файл изменился после preview. Не обещает восстановить оборванные объекты.

**Backup History → Восстановить** возвращает весь файл из выбранной копии, предварительно сохраняя текущее состояние. По умолчанию хранятся последние 20 копий, настройка 1–200. Они находятся в `cfg/DotaHeroGridStudio_backups`. Если приложение аварийно завершилось, оставшийся `.studio-lock` нужно удалить вручную только после закрытия приложения.

## Проверки

```sh
npm test
npm run typecheck
npm run build
npx playwright install chromium
npm run test:e2e
cargo test --manifest-path src-tauri/Cargo.toml --lib
```

`typecheck` — историческое имя команды **проверки синтаксиса JS**, не проверка TypeScript-типов. Проект продолжает v0.1 на JavaScript. 39 модульных тестов проверяют экспорт, конвертацию, регионы, слои, геометрию, менеджер и recovery. 8 Browser E2E проверяют PNG/SVG→Art→JSON, Canvas, Save/Open, бюджет, калибровку, слои, Hero Picker, IndexedDB и desktop-вызовы с mock bridge. Font E2E требует `DOTA_TEST_FONT` — путь к локальному TTF/OTF; без него этот тест пропускается. Реальные запись/backup/restore проверяются Rust-тестами на временных файлах. Они не подменяют тест в Dota.

## Структура

`src/editor.mjs` — чистые art operations; `studio-ui.mjs` — editor controller; `manager.mjs` — configs/recovery; `history.mjs` — IndexedDB; `svg.mjs` — SVG sanitizer; `src/art-export.mjs` — преобразование и бюджет; `core.mjs` — форматы; `converter.mjs` + worker — Sobel, thinning, noise components, direction-aware/adaptive sampling, ASCII и dither; `font.mjs` — Unicode cmap; `app.mjs` — UI; `src-tauri/src/storage.rs` — файловые операции и тесты; `main.rs` — Steam и Tauri bridge.

Нет телеметрии, регистрации или отправки изображений. Конвертация stateless и выполняется в Worker; этот API можно использовать для будущих последовательностей кадров. GIF/Video пока не реализованы.

## Практические ограничения

Dota в CI не запускается. Unicode, spacing, baseline, выбор шрифта и комфортный бюджет остаются экспериментальными до калибровки в игре. Pixel Art монохромный; цвет и произвольный размер/поворот шрифта не добавляются в JSON. Magic Wand выбирает связные glyph на сетке brush step, а не цветовые области исходной фотографии. Mask сейчас прямоугольный, не свободный lasso. При drag art свыше 6000 элементов отображается прореженно; mouseup восстанавливает полное качество. Конвертация фоновой Worker, рендеринг Canvas — без DOM-узла на glyph. Лимит 50 000 art на сетку, 100 сеток в проекте, 24 МБ входного файла.
