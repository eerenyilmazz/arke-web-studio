# Site Factory

Küçük işletmelere (İngiltere) tanıtım sitesi üreten MCP server + kurallar.
Agent soruları üretir, cevapları doğrulanmış config'e işler, sabit bir şablon siteyi üretir,
kalite kontrolünden geçirir ve onaylarından sonra Cloudflare'e yayınlar.

**Agent kod yazmaz.** Sadece MCP tool'ları üzerinden config, içerik ve görsel kaydeder.

## Panel (günlük kullanım)

```bash
cd ~/projects/site-factory
npm run panel
```

Terminal bir bağlantı yazar (`http://127.0.0.1:4777/login?key=…`); Windows'taki tarayıcıda açın.
Anahtar her başlatmada yenilenir ve sadece o oturumda geçerlidir. Panel sadece bu bilgisayardan erişilebilir.

| Sekme | Ne yaparsınız |
| --- | --- |
| Yeni müşteri | İşletme adı, sektör, barındırma, dil |
| Sorular | 1./2. tur formunu üretir, metni kopyalayıp müşteriye gönderirsiniz |
| Cevaplar | Cevapları soru soru ya da serbest metin olarak girer, logo/fotoğraf yüklersiniz → **Cevapları agent'a işlet** |
| Agent | **Tasarım ve metinleri oluştur**, serbest **Değişiklik iste**, metinleri okuma |
| Build | Build + kalite raporu, **Önizlemeyi aç** (http://127.0.0.1:4778) |
| Onay ve yayın | Onay komutlarını kopyalarsınız (terminalde verilir), önizleme / canlı yayın |

Agent işleri arka planda Claude Code ile (`claude -p`) çalışır, sağdaki kayıtta canlı görünür.
Agent bu işlerde **sadece** site-factory araçlarını kullanabilir: shell, dosya düzenleme, yayın ve müşteri oluşturma kapalı;
Cloudflare değişkenleri agent'a hiç verilmez. Aynı anda tek iş çalışır.
Onaylar bilinçli olarak panelde değil, terminalde: `npm run approve -- <slug> <content|visual|production>`.

**Müşteri arşivleme:** müşteri sayfasındaki **Arşivle** düğmesi (kısa adı yazarak onaylanır). Silmez:
`sf-clients/<slug>` ve `sf-inbox/<slug>` klasörleri `_archive/<slug>-<tarih>` altına taşınır. Geri almak için klasörü
eski yerine taşıyıp adını `<slug>` yapın. Yayındaki site kapanmaz; Cloudflare'den ayrıca kaldırılır.

## Klasör yapısı

```
site-factory/            ← bu repo (fabrika)
├── AGENTS.md            ← agent'ın akış ve kuralları (CLAUDE.md buna yönlendirir)
├── rules/design-rules.md← tasarım kuralları + görsel onay kontrol listesi
├── src/schema/          ← Zod şema (TEK KAYNAK) + soru listesi (questions.ts)
├── schema/*.json        ← Zod'dan üretilir (npm run schema), elle düzenlenmez
├── src/tools.ts         ← MCP tool'ları
├── templates/           ← şablonlar (corporate-v1 vb.) — senin agent'la yapacağın kısım
└── factory.config.json  ← klasör yolları ve limitler

../sf-clients/<slug>/    ← her müşteri ayrı klasör + ayrı git repo
├── site.config.json     ← yapı ve dilden bağımsız bilgiler
├── content/en.json      ← tüm metinler (dil başına bir dosya)
├── assets/              ← logo ve görseller (save_asset ile)
├── questionnaires/      ← müşteriye gönderilen formlar
├── dist/                ← üretilen site
├── quality-report.md    ← son build'in kontrol raporu
└── .factory/            ← onaylar, son build/deploy kaydı, audit log

../sf-inbox/             ← müşteriden gelen dosyaları buraya koyarsın
```

## Kurulum (Windows: WSL2 içinde)

Projeyi WSL'in kendi diskine koy (`~/projects/site-factory`), Windows sürücüsüne (`/mnt/c/...`) değil.
Claude Code'u da WSL içine kur ve bu klasörden çalıştır; sandbox sadece böyle devreye girer.

```bash
mkdir -p ~/projects && cd ~/projects
unzip /mnt/c/Users/<kullanıcı>/Downloads/site-factory.zip      # site-factory/ klasörü çıkar
cd site-factory
bash scripts/setup-wsl.sh --check   # sadece kontrol, hiçbir şeyi değiştirmez
bash scripts/setup-wsl.sh           # klasörler + settings.local.json + git init + npm ci/build/test
```

Script `../sf-clients` ve `../sf-inbox` klasörlerini oluşturur, eksik araç varsa kurulum komutunu yazar
(kendisi sistem paketi kurmaz, hiçbir şeyi silmez). Windows'tan erişim: `\\wsl$\Ubuntu\home\<kullanıcı>\projects`.

Elle kurulum:

```bash
npm install
npm run build          # dist/server.js
npm test               # 31 test: güvenlik, akış, MCP stdio, düzeltmeler, onay sabitleme
```

Claude Code bu klasörde açıldığında `.mcp.json` ile server'ı otomatik bulur (`node dist/server.js`).
Kod değiştirince `npm run build` yeniden çalıştır.

İsteğe bağlı:
- **UI UX Pro Max** (tasarım sistemi önerisi): `git clone https://github.com/nextlevelbuilder/ui-ux-pro-max-skill vendor/ui-ux-pro-max` (Python 3 gerekir). Yoksa agent `design-rules.md`'ye göre kendisi seçer.
- **Impeccable** (tasarım lint): `npm i -D impeccable`. Varsa build_site otomatik çalıştırır, telemetri kapalı.

## Akış (kısaca)

| Adım | Kim | Ne |
| --- | --- | --- |
| 1 | Sen → agent | "Yeni site: Willow & Thread, bridal salon" (veya `/mcp__site-factory__new-site`) |
| 2 | Agent | `create_client` + 1. tur formu (10 soru). Sen müşteriye gönderirsin |
| 3 | Sen | Cevabı agent'a yapıştırırsın, dosyaları `../sf-inbox/`'a koyarsın |
| 4 | Agent | Cevapları kaydeder, eksik varsa 2. tur form |
| 5 | Agent | Tasarım sistemi + tüm metinler |
| 6 | **Sen** | `npm run approve -- <slug> content` |
| 7 | Agent | `build_site` → `quality-report.md` |
| 8 | **Sen** | `dist/`'i aç, design-rules.md'deki listeyle bak → `npm run approve -- <slug> visual` |
| 9 | Agent | `deploy` preview → link abine/müşteriye |
| 10 | **Sen** | Müşteri onaylayınca `npm run approve -- <slug> production` |
| 11 | Agent | `deploy` production |

Herhangi bir adımda: agent'a "durum ne?" de → `get_client_status`.

## Onaylar neden terminalde?

Onaylar sadece sen etkileşimli terminalde slug'ı yazınca verilir. Agent'ın shell'i TTY olmadığı için
onay veremez; ayrıca `.claude/settings.json` bu komutu agent'a yasaklar. Her onay o anki içerik
hash'ine bağlıdır: config, metin veya görselde en küçük değişiklik onayı geçersiz kılar.
`visual` ve `production` onayları ayrıca son build'in `dist/` hash'ine bağlıdır: şablon değişip çıktı farklılaşırsa
ya da `dist/` elle değiştirilirse onay geçmez ve deploy durur. Geçerli bir build yoksa bu onaylar verilemez.
Onay sırasında içerik değişirse (slug'ı yazarken) onay kaydedilmez.

## Cloudflare (deploy için)

MCP server'ın ortamında (Claude Code'u başlattığın shell'de) tanımla, dosyalara yazma:

```bash
# hosting.model = managed (senin hesabın)
export SF_CF_MANAGED_API_TOKEN=...
export SF_CF_MANAGED_ACCOUNT_ID=...
# hosting.model = client (müşterinin hesabı), slug: harbour-dental
export SF_CF_CLIENT_HARBOUR_DENTAL_API_TOKEN=...
export SF_CF_CLIENT_HARBOUR_DENTAL_ACCOUNT_ID=...
```

İletişim formu için (isteğe bağlı) aynı ortamda `export SF_FORM_ACTION=https://...` tanımla; build_site bunu şablona geçirir. Yoksa form yerine e-posta/telefon/WhatsApp butonları çıkar.

Token yetkisi: sadece *Workers Scripts: Edit* (+ alan adı bağlanacaksa ilgili zone için DNS/Workers Routes).
Tokenlar log'lara ve tool çıktısına `***` olarak düşer. `deploy` `dryRun: true` ile yükleme yapmadan kontrol eder.

## Şablon sözleşmesi (örnekleri agent'la yaparken)

`build_site` şablondan sadece şunu bekler (detay AGENTS.md → "Working on templates"):

- `templates/<ad>/package.json` içinde `npm run build`
- Girdi: `SF_CLIENT_DIR` ortam değişkenindeki klasör (`site.config.json`, `content/<dil>.json`, `assets/`)
- Çıktı: `SF_OUT_DIR` klasörüne statik site (`index.html` zorunlu)
- Bir kez `npm install` (node_modules yoksa build durur)

İlk şablon için agent'a şunu diyebilirsin:
> "AGENTS.md'deki şablon sözleşmesine ve design-rules.md'ye göre templates/corporate-v1'i Astro + Tailwind ile kur.
> Şemayı schema/*.schema.json'dan oku, varyantları (a/b/c) ve bölüm registry'sini kur. Sonra demo bir müşteriyle build_site çalıştır."

## Güvenlik özeti

- Slug ve tüm yollar doğrulanır; müşteri klasörü/inbox dışına çıkılamaz (symlink dahil).
- Görseller içerikten tanınır (uzantıya bakılmaz); zararlı SVG (script, olay, dış referans, entity) reddedilir.
- Komutlar shell'siz, argüman listesiyle çalışır; alt sürece sadece izinli ortam değişkenleri geçer.
- Geçersiz değer içeren patch'in hiçbir parçası kaydedilmez; kayıtlar atomik yazılır.
- Her tool çağrısı `.factory/audit.log`'a (sırlar maskeli) yazılır.
- Yanlış yazılmış alan adları (`contakt` gibi) reddedilir; `meta` sadece `unmapped`/`laterInterests` ile değişir.
- `visual`/`production` onayları `dist/` hash'ine bağlıdır; deploy, onaylanan çıktıdan farklı bir `dist/` yüklemez.

### Agent'a karşı neyin gerçek sınır olduğu

Agent seninle aynı kullanıcı olarak çalışır. Şunlar **tek başına sınır değildir**, sadece yönlendirir:
`AGENTS.md`, `permissions.deny` kuralları (Bash kalıpları aşılabilir) ve onay CLI'ının TTY kontrolü
(`script`/`expect` gibi araçlarla sahte terminal açılabilir).

Gerçek sınır **Claude Code sandbox'ı** (`.claude/settings.json` → `sandbox`, macOS'ta işletim sistemi uygular):
- Agent'ın Bash komutları sadece bu klasöre, geçici klasöre ve `~/.npm`'e yazabilir. `../sf-clients/` dışarıda kaldığı için
  agent Bash ile `approvals.json`'a, `dist/`'e veya müşteri dosyalarına yazamaz; onay CLI'ı da sandbox içinden onay kaydedemez.
- Ağ sadece listedeki alan adlarına açık (npm, GitHub, Google Fonts). Cloudflare'e doğrudan erişim yok.
- `SF_CF_MANAGED_*` değişkenleri agent'ın komutlarından silinir.
- `allowUnsandboxedCommands: false` + `failIfUnavailable: true`: sandbox dışına kaçış yok; sandbox çalışmazsa Claude Code açılmaz.

MCP server ve senin kendi terminalin sandbox dışında çalışır; build, deploy ve onay normal işler.

Kurulumdan sonra bir kez yapılacaklar:
1. `.claude/settings.local.json.example` dosyasını `.claude/settings.local.json` olarak kopyala, `sf-clients` klasörünün
   **mutlak** yolunu yaz (agent'ın Edit/Write araçları sandbox dışında çalışır, bu kural onları durdurur).
2. `client` hosting modelindeki her müşterinin `SF_CF_CLIENT_<SLUG>_*` değişkenlerini aynı dosyadaki listeye ekle.
3. Claude Code'da `/sandbox` → Config sekmesinde kuralların göründüğünü kontrol et.

Bir şey bozulursa (ör. agent'ın ihtiyaç duyduğu bir alan adı engelleniyorsa) `network.allowedDomains`'e ekle;
sandbox'ı tamamen kapatmak için `sandbox` bloğunu silmek yeterli (geri alma).

## Henüz yok (bilinçli)

Lighthouse otomasyonu, görsel regresyon, rollback/domain tool'ları, config migrator, izleme script'leri.
Plan dokümanındaki "Büyüyünce" bölümü — ihtiyaç doğunca eklenecek.
