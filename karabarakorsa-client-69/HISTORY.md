# Karabarakorsa AFK Client

**Paket no: 35 · Uygulama surumu: 1.15.10** — uygulamayi actiginizda sol menunun en altinda `v1.15.10` yazmali.

## HIZLI BASLANGIC (en kolay yol)

1. **Node.js** kurun: https://nodejs.org → "LTS" butonu → indirilen dosyayi kurun (hep "Next").
2. Bu klasordeki **BASLAT.bat** dosyasina **cift tiklayin**. Gerisini kendisi halleder
   (ilk acilista bagimliliklari kurar, sonra uygulamayi baslatir).
3. EXE + installer icin: **EXE-OLUSTUR.bat** dosyasina cift tiklayin, ciktilar `dist` klasorunde.

> `index.html` dosyasina cift tiklamayin. Tarayicida acilan sayfada hicbir buton calismaz;
> uygulama Electron ile baslatilmalidir.


Windows 10/11 için profesyonel Minecraft AFK Client. Electron + mineflayer ile gerçek
Minecraft protokol bağlantısı kurar (offline/cracked ve Microsoft hesap desteği).

## Dosya yapısı

```
karabarakorsa-client/
├─ BASLAT.bat                   # ÇİFT TIKLA: kurar ve başlatır
├─ EXE-OLUSTUR.bat              # ÇİFT TIKLA: exe + installer üretir
├─ package.json                 # bağımlılıklar + electron-builder ayarları
├─ build/
│  ├─ icon.ico                  # uygulama/kısayol ikonu (çok boyutlu)
│  ├─ tray.png                  # saatin yanındaki tepsi simgesi (32x32)
│  └─ tray16.png                # küçük DPI için tepsi simgesi
└─ src/
   ├─ main/                     # Electron ANA süreç (Node tarafı)
   │  ├─ main.js                # pencere, tray, IPC, CPU/RAM metrikleri
   │  ├─ preload.js             # güvenli IPC köprüsü (contextIsolation)
   │  ├─ store.js               # config kaydetme/yükleme + DPAPI şifreleme
   │  ├─ logger.js              # INFO/WARNING/ERROR/CHAT/CONNECT... (iki dilli) log sistemi
   │  ├─ versions.js            # desteklenen Minecraft sürümleri (1.21 → güncel)
   │  └─ bot/
   │     ├─ bot-manager.js      # Minecraft bağlantısı + auto reconnect
   │     ├─ anti-afk.js         # walk/jump/sneak/rotate/look motoru
   │     ├─ auto-spam.js        # sabit veya rastgele aralıklı mesaj motoru
   │     ├─ join-messages.js    # sıralı komut zinciri (sınırsız komut)
   │     ├─ macro-farmer.js     # MAKROLAR > Auto Farm: komut + sıralı kare tıklama
   │     ├─ dialogs.js          # sunucu ekranları (kayıt/giriş formları)
   │     ├─ nbt-out.js          # form cevabı paketini bayt bayt üretir (NBT yazıcı)
   │     ├─ respack.js          # kaynak paketi (resource pack) cevap düzeltici
   │     └─ proxy.js            # SOCKS4/SOCKS5/HTTP proxy bağlayıcı
   └─ renderer/                 # ARAYÜZ
      ├─ index.html             # sidebar + tüm sayfalar
      ├─ styles.css             # dark/light tema, responsive
      ├─ core.js                # hata yakalama, menü, açılır listeler, ikonlar
      ├─ renderer.js            # tüm sayfa mantığı
      ├─ i18n.js                # TR / EN sözlüğü (arayüzün tamamı)
      └─ assets/
         ├─ items.png           # eşya ikonları atlası (16x16 dokular, tek dosya)
         └─ item-icons.js       # "eşya adı -> atlastaki kare" haritası (1440 eşya)
```

## 1) Çalıştırma (terminal ile)

`npm start` = uygulamayı normal başlatır.
`npm run dev` = aynı şey + hata ayıklama konsolu (DevTools) açık başlatır.

Node.js 18+ kurulu olmalı (https://nodejs.org).

```bash
cd karabarakorsa-client
npm install
npm start
```

Geliştirici araçları ile: `npm run dev`

## 2) Bağımlılıklar

| Paket | Görev |
|---|---|
| electron | masaüstü uygulama çatısı |
| mineflayer | gerçek Minecraft protokol istemcisi |
| minecraft-protocol | alt seviye protokol |
| msmc | Microsoft giriş pop-up'ı (resmi OAuth penceresi) |
| prismarine-auth | Microsoft jeton (token) yenileme |
| socks / https-proxy-agent | proxy desteği |
| electron-builder | EXE + installer üretimi |

`npm install` hepsini kurar. Windows'ta native modül derlemesi gerekirse:
`npm install --global windows-build-tools` (yalnızca hata alırsanız).

## 3) EXE oluşturma

```bash
npm run build:portable     # tek dosya portable exe -> dist/
```
Çıktı: `dist/Karabarakorsa AFK Client 1.15.10.exe`

## 4) Installer (setup) oluşturma

```bash
npm run build              # NSIS installer + portable -> dist/
```
Çıktı: `dist/Karabarakorsa AFK Client Setup 1.15.10.exe`
Kurulum sırasında dizin seçilebilir, masaüstü ve başlat menüsü kısayolu oluşur.

İkon: `build/icon.ico` (çok boyutlu, 16→256 px). Tepsi simgesi `build/tray.png` olarak paketlenir.

## Ayarların saklanması

`%APPDATA%\Karabarakorsa AFK Client\config.json`
(Eski surumden gelen `%APPDATA%\KARABARAKORSA CLIENT` klasoru ilk acilista otomatik tasinir.)
Şifreler Windows DPAPI (Electron safeStorage) ile şifrelenir, arayüzde asla açık gösterilmez.
Microsoft hesapları **resmi Microsoft giriş penceresi** (pop-up) ile giriş yapar; yenileme jetonu
şifrelenmiş olarak `config.json` içinde, oyun oturumu jetonu ise `auth-cache/` klasöründe tutulur.

## Sorumluluk

Bazı sunucuların kuralları bot/AFK istemcilerini ve otomatik mesaj göndermeyi yasaklar.
Kullandığınız sunucunun kurallarına uyun; hesap yasaklamalarından kullanıcı sorumludur.

## Arayüzdeki küçük numaralar (v1.7)

- **Üst bardaki çip ikonu** (RAM çubuğu şeklinde): ping, süre, CPU ve RAM oradadır.
  Tıklayınca açılır, tekrar tıklayınca/`Esc` ile kapanır. Nokta yeşilse bot çevrimiçi.
- **Anahtarlara sağ tık**: o seçeneğin ne işe yaradığını kısa bir kartta yazar
  (uzun açıklama paragrafları bu yüzden kaldırıldı).
- **Küçük "+" tuşu**: kartların altındaki `+` gelişmiş bölümü açar/kapatır
  (örnek: formu komutla gönderme, komut şablonu). Kapalıyken yer kaplamaz.
- **Sayı kutuları**: kendi ok tuşlarımız var; basılı tutunca hızlanır.

## Aynı anda birden fazla hesap

Aynı anda **sınırsız** hesapla bağlanabilirsiniz (v1.10.0'dan itibaren 5 hesap sınırı yok);
her hesap kendi bağlantısı,
kendi Anti AFK / Auto Spam motoru ve kendi sohbet geçmişiyle çalışır.

- **ACCOUNTS** (veya CONNECT sayfasındaki hesap kartı) satırındaki **güç tuşu** o hesabı
  bağlar; bağlıyken yeşil yanar, tekrar basınca sadece o hesabın bağlantısını keser.
- Bağlanan her hesap bir **oturum numarası** alır (`#1`, `#2`, ...) ve hesap satırında görünür.
- **CHAT** ve **LOGS** sayfalarının üstünde **numaralı sekmeler** çıkar: hangi hesabın
  sohbetini/kaydını göreceğinizi seçersiniz. Sekmedeki nokta o hesabın durumunu
  (yeşil = çevrimiçi), sağ üstteki sarı işaret **okunmamış** yeni satır olduğunu gösterir.
- LOGS sayfasındaki **TÜMÜ** sekmesi bütün hesapları birlikte gösterir ve her satırın
  başına `#numara` yazar.
- Sohbete yazdığınız mesaj **hangi sekme açıksa o hesaptan** gider.
- Tepsi (tray) menüsündeki **"Tüm baglantilari kes"** hepsini birden kapatır.

## v1.8.0'da düzeltilenler

- Sağ tık açıklaması **ikinci sağ tıkta kapanıyor** (önce açık kalıyordu).
- Bütün şifre alanlarında **göz tuşu**: şifreyi görmek için basılır, tekrar basınca gizlenir
  (hesap şifresi, proxy şifresi, dialog formundaki şifre alanları dahil).
- Çalışmayan **SUNUCUYU TEST ET** butonu kaldırıldı.
- **ANTI AFK** sol menüden çıkarıldı; sayfaya CONNECT'teki *Anti AFK* anahtarının
  yanındaki **dişli** tuşundan girilir.
- **Anti AFK seçenekleri artık anında uygulanıyor**: yürüme/zıplama/aralık değiştirince
  motoru kapatıp açmak gerekmiyor (Auto Spam aralıkları için de aynısı geçerli).
- Alttaki **kırmızı hata bandı kapatılabiliyor** (sağ üstteki ×).
- **X (kapat) tuşu** uygulamayı hiçbir ayardan bağımsız olarak **kapatmıyor**: bot arka planda
  çalışmaya devam eder ve her seferinde *"Arka planda çalışmaya devam ediyor"* bildirimi
  gösterilir. Tamamen çıkmak için tepsi simgesine sağ tık → **Çıkış**.

## v1.9.0'da yenilenenler

**1 · Hesap listesi artık kesilmiyor.** Sağdaki *KAYITLI HESAPLAR* kutusu ekranın %64'üne
kadar uzuyor, taşma olduğunda liste **yumuşak kaybolma (fade)** ile biter ve kaydırma
animasyonlu olur. Alt/üst kenarda içerik varsa o kenar soluk görünür — böylece "burada
devamı var" belli olur.

**2 · Bağlantı kesilince oturum numarası her yerden siliniyor.** Bir hesabın bağlantısı
kesildiğinde (elle, güç tuşuyla, sunucu atınca ya da tepsi menüsündeki *Tüm bağlantıları
kes* ile) o oturum tamamen kaldırılır: hesap satırındaki `#2` etiketi, CHAT ve LOGS
sekmeleri, okunmamış işaretleri ve o hesaba ait sohbet geçmişi gider. Kalan hesaplar
sıralarını korur, `TÜMÜ` görünümündeki eski satırların `#numara` etiketi düşer.

**3 · RAM kullanımı düşürüldü.** V8 bellek sınırı 256 MB'a çekildi, kayıt/sohbet tamponları
küçültüldü (kayıt 1200, sohbet 250 satır), listeler sadece gerçekten değiştiğinde yeniden
çiziliyor ve **pencere gizliyken** canlı kayıt/sohbet/ölçüm akışı durduruluyor
(geri açınca tek seferde tazeleniyor). *SETTINGS → Bellek optimizasyonu* anahtarı açık
gelir.

**4 · Arayüz tamamen iki dilli.** Artık **Türkçe/İngilizce** her yazıyı kapsıyor: menü,
başlıklar, anahtar adları, açılır listeler, ipucu kartları, bildirimler, hata mesajları
**ve LOGS sayfasındaki kayıt satırları**. Varsayılan dil artık **İngilizce**;
*SETTINGS → Language* ile anında değişir (yeniden başlatma yok).

**5 · Kapatma bildirimi tek ve logolu.** X'e basınca yalnızca **bir** bildirim çıkıyor
(eskiden tepsi balonu + bildirim ikisi birden geliyordu) ve bildirimde uygulamanın
**logosu** görünüyor. Pencere zaten gizliyse tekrar bildirim gösterilmez.

**6 · Açılışta tek kayıt satırı.** Uygulama açılırken kayıtlara sadece
`Karabarakorsa AFK Client started` yazıyor; arayüz kendi kendini test eden satır artık
yalnızca tanılama dosyasına gidiyor.

**7 · Bildirimlerde "electron.app" yazmıyor.** Uygulama adı ve Windows model kimliği
(`AppUserModelID`) ayarlandı; bildirim başlığında artık **Karabarakorsa AFK Client**
görünüyor.

**8 · Giriş komutları anahtarı iki yönlü.** *JOIN MESSAGES* sayfasındaki anahtar ile
*CONNECT* sayfasındaki *Giriş komutları* anahtarı aynı ayarı gösteriyor; birini
değiştirince diğeri de anında değişiyor (Anti AFK anahtarı için de aynısı geçerli).

**9 · Uygulama adı artık BÜYÜK HARF değil.** Sol üstte `Karabarakorsa` + `AFK Client`,
pencere başlığında ve tepsi ipucunda `Karabarakorsa AFK Client` yazıyor.

**10 · Tepsi (tray) simgesi geri geldi.** Saatin yanındaki simge için ayrı `tray.png`
üretildi ve EXE paketine dahil edildi; simgeye tek tık pencereyi geri getirir, sağ tık
menüsü de seçili dile göre yazılır.

## v1.10.0'da yenilenenler

**1 · Microsoft girişi artık gerçek pop-up.** Kod yazdıran modal (device code) tamamen kaldırıldı.
**HESAPLAR → Microsoft ile giriş yap** tuşu, Microsoft'un kendi giriş penceresini açar
(launcher'daki akışın aynısı). Giriş bitince pencere kapanır, hesap **PREMIUM** etiketiyle
kaydedilir, kullanıcı adı profilden gelir ve oyun oturumu saklanır — bağlanırken ikinci kez
giriş istenmez. Jeton süresi geçerse istemci arka planda kendisi yeniler.

**2 · Eşzamanlı oturum sınırı kalktı.** Önceden en fazla 5 hesap bağlanabiliyordu; artık
**sınırsız**.

**3 · Hesap listesinden çoklu seçim.** Hesap satırındaki **tik** tuşuyla birden fazla hesap
seçilir; **BAĞLAN** tek tuşla hepsini sırayla bağlar, **BAĞLANTIYI KES** ise açık oturumların
hepsini kapatır (tek tek kapatmak için hesap satırındaki güç tuşu duruyor). Seçili bir hesaba
tekrar basınca **seçim kalkar** (eskiden geri alınamıyordu); bağlı hesaplar her zaman seçili görünür.

**4 · RAM göstergesi donmuyor.** Ölçüm artık tüm uygulama süreçlerinin (ana + arayüz + GPU)
çalışma kümesini toplar; CPU çekirdek sayısına bölünüp yumuşatılır. Ping ve süre de her saniye
yayınlandığı için sayaçlar canlı akar.

**5 · PANEL (dashboard) baştan yazıldı.** Sol tarafta **büyük canlı sohbet** (kendi yazma alanı
ile), sağda **BAĞLANTI** kartı (durum, sunucu, ping, süre, oturum sayısı, RAM), altında **aktif
hesaplar** listesi ve hızlı işlem tuşları var. İşe yaramayan istatistik kutuları ve "son
olaylar" kaldırıldı.

**6 · BAĞLANTI sayfası sadeleşti.** Bilgi kartı küçültüldü, **8 hesap tek ekrana sığıyor**
(yazılar kesilmiyor), anahtarlar ise başlıksız **ince bir çizgi + dişli** ile aşağı doğru
açılan panele taşındı. "Otomatik yeniden bağlanma" kutusu ve ipucu satırı sayfadan kalktı.

**7 · Otomatik yeniden bağlanmanın kendi sayfası var.** Anahtarın yanındaki dişliden açılır:
açık/kapalı, bekleme süresi, **sınırsız dene** veya deneme sayısı. Sınırsız açıkken deneme
sayısı alanı görünmez.

**8 · Sahte host (fake host) alanı sadece anahtar açıkken görünüyor.**

**9 · Dişliler doğru sayfaya gidiyor** (Anti AFK, otomatik yeniden bağlanma, giriş komutları,
proxy) ve tüm anahtarlar iki yönlü senkron: hangi sayfadan değiştirirsen diğeri de değişir.

**10 · Üst bardaki sunucu/hesap çipleri çoklu oturumu gösteriyor.** Birden fazla hesap bağlıysa
`Karabarakorsa +2` yazar; yanındaki **?** tuşuna basınca bağlı hesapların/sunucuların listesi
açılır (yeşil nokta = çevrimiçi).

**11 · Başlık çubuğunun tamamı sürüklenebiliyor.** Eskiden sadece ince bir şerit tutuyordu;
artık boş alanın her yeri pencereyi taşır (tuşlar ve çipler hariç).

**12 · Açılır listeler seçim yapınca kapanıyor.** Sürüm/kaynak paketi/mod listelerinde bazen
açık kalıp tıklamaları yutuyordu.

**13 · Giriş komutlarındaki şifreler maskeli.** `/login`, `/register`, `/reg`, `/l` ile başlayan
komutlarda şifre `••••` olarak görünür; yanındaki **göz** tuşu ile açıp kapatabilirsin.
Kayıtlarda ve loglarda da maskeli yazılır.

**14 · GİRİŞ KOMUTLARI sınırı kaldırıldı** (eskiden en fazla 10 komut eklenebiliyordu).

**15 · HESAPLAR sayfası sadeleşti.** Hesap türü listesinde artık sadece *Offline / Cracked* var,
e-posta alanı kaldırıldı; premium için tek tuş (Microsoft logolu) yeterli. Giriş durumu tuşun
altında sabit yükseklikte yazılır, sayfa zıplamaz.

**16 · Anti AFK sayfasındaki gereksiz "Etkinleştir" anahtarı kaldırıldı** (motor BAĞLANTI
sayfasındaki anahtarla çalışıyor).

**17 · OTOMATİK MESAJ sayfası düzenlendi:** "bağlanınca otomatik başlat" ve "rastgele sıra"
alt alta, aralık alanları moda göre gizleniyor.

**18 · AYARLAR sayfası temizlendi.** Sesler, "güncelleme sıklığını azalt", kapatma/paket
ipuçları ve **Electron/Node sürüm bilgileri** kaldırıldı. Kalanlar: tema, dil, Windows
açılışında başlat (+ hesap seçimi), tepsiye küçült, bildirimler, düşük CPU, bellek
optimizasyonu, paket günlüğü, klasörü aç, **hata kaydını aç**, ayarları sıfırla ve tek satırlık
**Uygulama hakkında** paneli (ad, sürüm, yapan, ayar ve kayıt dosyası yolu).

**19 · Windows açılışında otomatik bağlanma.** "Windows açılışında başlat" anahtarının yanındaki
dişliden **hangi hesapların** açılışta bağlanacağını seçersin; uygulama açılır açılmaz o
hesaplar bağlanır (otomatik mesaj / Anti AFK / giriş komutları kendi ayarlarıyla çalışır).

**20 · Bildirimler sadeleşti.** Artık sadece **hata** bildirimi çıkar, tek cümleye kısaltılır ve
varsayılan Windows sesiyle gösterilir. Pencereyi X ile kapatınca gelen bilgi bildirimi de tek satır:
*"Arka planda çalışmaya devam ediyor"*.

**21 · Sürüm yazısı tek yerde.** Logonun yanındaki versiyon kaldırıldı; sol altta `v1.10.0` ve
altında **made by Poltaaa** yazıyor. "UI OK" yazısı da kaldırıldı (hata olursa kırmızı bant
zaten çıkıyor).

**22 · Türkçe artık tam diakritikli.** Sözlük baştan yazıldı (**247 anahtar × 2 dil**):
`BAĞLANTI`, `GİRİŞ KOMUTLARI`, `OTOMATİK MESAJ`, `Eğil`, `Dünya değişince…` gibi bütün yazılarda
doğru Türkçe karakterler var. **LOGS sayfasındaki kayıt satırları ve hata/ipucu metinleri de**
aynı şekilde düzeltildi.

**23 · Sağ tık ipucu kartından** "kapatmak için boş bir yere tıkla" satırı kaldırıldı.

**24 · Sohbet iki yerde birden.** PANEL'deki canlı sohbet ile SOHBET sayfası aynı akışı gösterir;
mesajı hangisinden yazarsan aktif hesaptan gider.

## v1.11.0 · MAKROLAR (Auto Farm)

Sol menüye **MAKROLAR** sekmesi eklendi. İçinde **Auto Farm** makrosu var: açıp
kapatılabilen bir anahtar ve yanındaki **dişli** ile ayar sayfası.

**Nasıl çalışır**

1. **MAKROLAR → Auto Farm** dişlisine bas.
2. En üste **ekranı açan komutu** yaz (örnek: `/çiftçi`).
3. Ortadaki **9 x 6 = 54 kare**lik sandık ekranından tıklanmasını istediğin kareye bas.
   Kare **sarı yanar**, üzerinde **kaçıncı adım** olduğu yazar ve aşağıdaki **SIRA (ADIMLAR)**
   listesine düşer.
4. Her adımın kendi süresi vardır: *"o adıma geçmeden önce kaç saniye beklesin"*.
   Listeden değiştirebilir, ok tuşlarıyla **sırayı değiştirebilir**, çöp kutusuyla silebilirsin.
   Aynı kareyi birden fazla adımda kullanabilirsin.
5. **Tur arası bekleme**: bütün adımlar bittikten sonra kaç saniye sonra baştan başlasın.
6. **ÇALIŞTIR**'a bas: istemci komutu yazar, sunucunun açtığı ekranı bekler, adımlara
   **sırayla** tıklar, tur bitince ekranı kapatır ve tur arası kadar bekleyip tekrar eder.
   **DURDUR** ile biter.

**Birden fazla tıklama / iç içe ekranlar.** Her adım **o an açık olan ekrana** tıklar.
Yani ilk adım yeni bir ekran açıyorsa (örnek: önce **kaktüse**, açılan menüde sonra
**zümrüte** basmak gerekiyorsa) ikinci adım o yeni ekranın karesine tıklar. Bu yüzden
"önce kaktüs → 1 sn bekle → zümrüt" gibi zincirler kurabilirsin.

**Ekranı oku.** Bot bağlıyken ve oyunda ekran açıkken **Ekranı oku** tuşuna basarsan
istemci o ekrandaki eşyaları okur ve **karelerin üstüne isimlerini yazar** (fare ile
üzerine gelince `#48 · Emerald` gibi görünür). Böylece kare saymak zorunda kalmazsın.

**Diğer ayrıntılar**

- **Sunucuya bağlanınca otomatik başlat**: anahtar açıkken bot oyuna girdikten ~4 sn sonra
  makro kendi kendine çalışmaya başlar.
- Adımlar, komut ve süreler **kaydedilir**; uygulamayı kapatıp açınca aynen durur.
- Çalışırken **DURUM** kartında hangi adımda olduğunu (`Adım 2 / 3`) ve tamamlanan tur
  sayısını görürsün; o an tıklanan kare **yeşil** yanar.
- Her tıklama **KAYITLAR** sayfasına yazılır (`Auto Farm: 2. adım · kare #48 tıklandı (emerald)`),
  yani sunucu ekranı açmazsa veya kare o ekranda yoksa sebebini oradan görürsün.
- Makro her hesap için ayrı çalışır: çoklu oturumda **o an seçili sekmedeki** hesapta başlar.

## v1.11.1 · Makro düzeltmeleri (tıklama gerçekten gidiyor)

**1 · Tıklama artık sunucuya doğru şekilde gidiyor.** Menü eklentileri tıklamayı "iptal"
ettiği için sunucu çoğu zaman **onay paketi göndermiyor**; kütüphane bunu hata sayıp
bekliyordu ve makro adımın ortasında **takılı kalıyordu** (kare yeşil yanıyor ama satış
olmuyordu). Artık:

- onay beklemesi **1,5 saniye** ile sınırlı, onay gelmemesi hata sayılmıyor;
- kütüphane paketi hiç yazamazsa aynı tıklama **elle ham `window_click` paketi** olarak
  gönderiliyor (sürüme göre doğru biçimde: 1.17+ `stateId`, 1.16 ve altı `action`);
- her tıklamadan sonra "elimde eşya var" sanılmasına yol açan **imleç temizleniyor**
  (ikinci ve sonraki tıklamalar bozulmuyordu);
- ekran açılmazsa komut **bir kez daha** gönderiliyor, eşyaların yüklenmesi beklenir,
  tur bitiminde ekran **0,7 sn** beklendikten sonra kapatılır (satış işlensin diye).

**2 · Tıklama türü seçilebiliyor (en önemli yeni ayar).** Bazı sunucularda satış için
**sağ tık** veya **SHIFT + tık** gerekir; sol tık hiçbir şey yapmaz. Adım listesindeki
**SOL** yazan küçük tuşa basarak sırayla
`SOL → SAĞ → ⇧SOL → ⇧SAĞ` arasında geçiş yapabilirsin. Her adımın türü ayrı kaydedilir.

**3 · "Tıklamayı doğrudan paket olarak gönder"** ayarı eklendi (adım listesinin altında).
Sunucu normal tıklamayı hiç görmüyorsa bu ayarı açınca istemci kütüphaneyi hiç
kullanmadan paketi kendisi yazar.

**4 · `[object Object]` hatası düzeltildi.** Sandık başlığı ve eşya isimleri bazı
sürümlerde metin değil **nesne** olarak geliyordu; artık hepsi düz yazıya çevrilir
(renk kodları da atılır). Okunan ekranda **olmayan kareler soluk** görünür ve üzerine
gelince "okunan ekranda bu kare yok" yazar — 27 karelik bir menüde 40. kareyi seçmek
gibi hatalar böylece anlaşılır.

**5 · Adım satırı temizlendi.** ↑ ↓ 🗑 tuşları artık arayüzün geri kalanıyla aynı
görünüyor (çöp kutusu kırmızıya sadece üzerine gelince döner) ve saniye kutusunun
**okları küçültüldü**, satırdan taşmıyor.

**6 · Kayıtlar çok daha açıklayıcı.** Her tur için ekranın **başlığı, kare sayısı ve kaç
eşya olduğu**, her adım için **hangi kareye hangi tıklama türüyle basıldığı ve o karede
ne olduğu** yazılır. DURUM kartına **Gönderilen tıklama** sayacı eklendi. Satış olmuyorsa
KAYITLAR sayfasındaki satırlar sebebi doğrudan gösterir.

## v1.11.2 · Sandık ekranında eşya fotoğrafları

**1 · İsim yerine gerçek eşya resimleri.** **Ekranı oku**'ya bastığında kareler artık
küçük yazı yerine **Minecraft eşya ikonlarını** gösteriyor (kaktüs, havuç, zümrüt,
şeker kamışı, cam panel...). 1440 eşyanın ikonu uygulamanın içinde tek bir atlas
dosyasında (`src/renderer/assets/items.png`) geliyor, internet gerekmez. İkonu
bulunmayan eşyalarda eskisi gibi kısa isim yazılır.

**2 · Fareyle üstüne gelince isim.** Oyundaki gibi **koyu ipucu balonu** çıkar:
eşyanın adı (sunucunun yazdığı ad, örnek "Şeker Kamışı"), altında `#9 · x12` gibi
kare numarası ve adet, o kare bir adımda kullanılıyorsa **hangi adımlarda** olduğu.

**3 · Adet ve kare numarası.** Adet (stack) sayısı Minecraft'ta olduğu gibi karenin
**sağ altında**, kare numarası **sol altta** sönük yazıyor.

**4 · Aynı kareye çok basınca taşma düzeltildi.** Bir kareyi 4-5 kereden fazla
seçtiğinde sıra rozetleri karenin dışına taşıyordu. Artık karede **ilk adım + `+N`**
(örnek `1 +6`) görünür, adımların tamamı ipucu balonunda yazar; hiçbir şey kareden
dışarı çıkmaz.

## v1.12.0 · Makro artık kendi kendine çalışıyor

**1 · Anahtar açıkken makro hep çalışır.** MAKROLAR sayfasındaki **Auto Farm
çalışsın** anahtarını bir kez açıyorsun, gerisini uygulama hallediyor:

- sunucuya her girişte makro otomatik başlar,
- sunucu yeniden başlar / bot atılır / otomatik yeniden bağlanma olursa makro
  yeniden kurulur,
- makro herhangi bir sebeple durursa (sandık kapandı, hata, komut yanıt vermedi)
  arka planda çalışan bir **bekçi 20 saniyede bir kontrol edip tekrar başlatır**.

Sadece iki şey makroyu kapatır: **anahtarı kapatmak** veya **DURDUR**'a basmak.
Eskiden RUN'a her seferinde elle basmak gerekiyordu; kopunca duruyordu.

**2 · Giriş komutlarıyla sıra artık senkron.** Makro kartına **"Ne zaman
başlasın?"** kutusu eklendi:

- *Giriş komutlarından sonra* (varsayılan) — `/login`, `/is go` gibi komutlar
  bittikten sonra makro komutu gider,
- *1. / 2. / 3. … komuttan önce* — makro komutunu giriş sırasının tam istediğin
  yerine sokar (örnek: `/login` gitsin, sonra makro, sonra `/warp ciftlik`),
- *Giriş komutlarını beklemeden* — sunucuya girdikten X saniye sonra tek başına
  başlar (giriş komutları kapalıysa da çalışır).

Altındaki **"Bu adımdan önce bekle"** kutusu o adımın kaç saniye sonra
gideceğini belirler. Kartın altındaki **SUNUCUYA GİRİNCE SIRA** önizlemesi
gerçek sırayı numaralı gösterir ve makro satırı vurgulanır; şifreler `****`
olarak maskelenir. **Giriş komutlarını düzenle** düğmesi seni doğrudan GİRİŞ
KOMUTLARI sayfasına götürür. KAYITLAR'a da aynı sıra `Giriş sırası kuruldu: …`
satırıyla yazılır, yani hangi komutun ne zaman gittiğini görebilirsin.

**3 · Eşya fotoğrafları geri geldi.** v1.11.2'deki sandık ikonları ve Minecraft
tarzı ipucu balonu bu pakette de var.

**4 · Sağ tık açıklamaları düzeltildi.** İki ayrı ipucu kodu aynı isimle
çakışıyordu; bir seçeneğe sağ tıklayınca açıklama balonu açılmıyordu. Düzeltildi.

## v1.13.0 · Her ayar artık hesap bazlı

**1 · Bir ayarı açarken "hangi hesaplarda?" diye soruyor.** BAĞLANTI ve
MAKROLAR sayfasındaki anahtarlara bastığında artık doğrudan açılmıyor; ekrana
hesap listesi çıkıyor:

- istediğin kadar hesabı seçebilirsin (çoklu seçim),
- seçtiklerin sarı çerçeveyle işaretlenir,
- **seçili bir hesaba tekrar tıklarsan o hesapta kapanır**,
- **Tümünü seç** / **Seçimi temizle** kısayolları var,
- **KAYDET**'e basınca ayar sadece o hesaplara yazılır.

Aynı pencere **kapatırken de** çıkıyor, yani "şu hesapta kalsın, bu hesapta
kapansın" diyebiliyorsun. Pencerenin en altında **HİÇ HESAP SEÇMEDEN AYARI
KAPAT** düğmesi var: hesap seçmekle uğraşmadan ayarı tamamen kapatır.

> Not: hesap bazlı olan şey **anahtarın kendisi**. Ayrıntılar (giriş komutlarının
> listesi, makro adımları, tur bekleme süresi, ham paket, Anti AFK hareketleri,
> proxy listesi) bütün hesaplarda ortak kalır - sadece "kimde açık" bilgisi
> hesaba göre değişir.

**2 · Seçili hesaplar oyuna her girdiğinde o ayar açık geliyor.** Örnek: Anti
AFK'yı 3 hesap için seçtiysen, o 3 hesap sunucuya girdiğinde Anti AFK
kendiliğinden çalışır; diğer hesaplar etkilenmez. Makro, giriş komutları,
proxy, otomatik yeniden bağlanma... hepsi aynı şekilde çalışıyor.

**3 · Anahtarın rengi kaç hesapta açık olduğunu söylüyor.**

| Renk | Anlamı |
|---|---|
| Kapalı (gri) | hiçbir hesapta açık değil |
| **Mor** | bazı hesaplarda açık |
| **Sarı** | bütün hesaplarda açık |

Anahtarın yanında ayrıca **`3/9`** gibi küçük bir sayaç var: kaç hesapta açık
olduğunu tek bakışta gösterir.

**4 · Yeni kurulumda her şey kapalı.** BAĞLANTI ve MAKROLAR sayfasındaki bütün
ayarlar kapalı başlıyor (eski `config.json`'ı olanlarda da bir kez sıfırlanır),
böylece uygulama ilk açılışta hiçbir şeyi kendi başına yapmıyor.
Bir sunucuda bağlantı sorunu yaşarsan **Bot fiziği**, **Sohbet imzalamayı
kapat** ve **Vanilla istemci gibi davran** ayarlarını hesaplarına aç.

**5 · PANEL'e "+" ile ayar sabitleme.** Panelin sağ altındaki **+** düğmesiyle
BAĞLANTI ve MAKROLAR sayfasındaki ayarlardan istediklerini panele taşıyabilirsin.
Buradaki anahtar da aynı hesap seçme penceresini açar ve **BAĞLANTI sayfasıyla
anında senkron olur** (eski sürümde panelden Anti AFK açınca BAĞLANTI sayfasında
kapalı gözüküyordu - bu düzeltildi). Bir ayarı panelden kaldırmak için satırın
sonundaki **×** yeter.

**6 · Üst bardaki SUNUCU kutusunda da "+" var.** Birden fazla oturum açtığında
HESAP kutusu gibi SUNUCU kutusu da tıklanabilir oluyor; hangi hesabın hangi
sunucuda olduğunu listeler.

**7 · AYARLAR sayfası düzeltmeleri.**
- *Küçültünce görev çubuğunda kal* → **Arka planda çalışsın** olarak adlandırıldı.
- Satır aralıkları eşitlendi; "Arka planda çalışsın" ve "Bildirimler" artık
  "Başlangıçta açılsın" ile hizalı.
- Dişliyle açılan hesap listesi, başka sayfaya gidip geri gelince **kapanıyor**.
- Küçük **i** düğmesine basınca sadece **PERFORMANS** kartı uzuyor; GÖRÜNÜM ve
  GENEL kartları artık büyümüyor.

**8 · RAM göstergesi düzeltildi.** Eskiden tüm Electron süreçlerinin *çalışma
kümesi* toplanıyordu; paylaşılan bellek her süreçte tekrar sayıldığı için gerçek
kullanımın 2-3 katı görünüyordu. Artık Windows Görev Yöneticisi'ndeki gibi
**private working set** gösteriliyor.

**9 · KAYITLAR uygulama açılırken boş.** Açılışta atılan "started" satırı
kaldırıldı; artık kayıtlar sadece sen bir şey yaptığında dolmaya başlıyor.

## v1.15.10 · Güncelleme düğmesi + küçük düzeltme

**1 · Sağ üstte GÜNCELLE düğmesi.** Yeni sürüm çıktığında uygulamanın sağ
üstünde, pencere düğmelerinin yanında sarı bir **↑ GÜNCELLE v1.x.x** düğmesi
çıkıyor. Düğmeye basınca sürüm notları, kurulu sürüm ve şu düğmeler gelir:
**İNDİR** (uygulama kurulum dosyasını İndirilenler klasörüne indirir, ilerleme
çubuğuyla), indikten sonra **ŞİMDİ KUR** / **Klasörde göster**, ya da
**Tarayıcıda aç**. Program açılıştan 8 saniye sonra ve 6 saatte bir kendi
kendine bakıyor; AYARLAR > GÜNCELLEME'den kapatabilir veya **ŞİMDİ KONTROL ET**
ile elle bakabilirsin.

**Nasıl kurarsın (bir kez yapılır):**

1. Zip'in içindeki `GUNCELLEME-ORNEK.json` dosyasını örnek al, kendi bilgilerini
   yaz (`version`, `notes`, `url`, `page`).
2. Bu dosyayı herkesin erişebileceği bir adrese koy. En kolayı GitHub: depoya
   `guncelleme.json` olarak ekle, **Raw** adresini kopyala.
3. Uygulamada **AYARLAR > GÜNCELLEME > Güncelleme adresi** alanına o adresi yaz.
4. Bu ayarla bir kez `EXE-OLUSTUR` yapıp dağıt. Artık yeni sürüm çıkardığında
   sadece `guncelleme.json` dosyasındaki `version` ve `url` satırlarını
   değiştirmen yeterli — kullanan herkesin ekranında GÜNCELLE düğmesi çıkar.

**GitHub Releases kullanıyorsan** ayrı dosya hazırlamana gerek yok. Adres olarak
`https://api.github.com/repos/KULLANICI/DEPO/releases/latest` yazman yeterli;
`tag_name` sürüm olarak, açıklama sürüm notu olarak okunur ve eklerin içinden
`Setup ... .exe` dosyası otomatik seçilir.

`version` kurulu sürümden **büyük** olmadıkça düğme çıkmaz. Adresler sadece
`http`/`https` olabilir, indirilen dosya İndirilenler klasörüne yazılır ve
yarım inen dosya silinir.

**2 · Hızlı ayarlardaki "×" düğmesi düzeltildi.** PANEL > HIZLI AYARLAR'daki
kaldırma düğmesi tarayıcının beyaz düğmesi olarak görünüyordu; artık temanın
renklerini kullanıyor (saydam, soluk gri; üzerine gelince kırmızı). Açık temada
da doğru görünüyor.

## v1.14.0 · Hesap başına spam mesajı + renkli sohbet

**1 · SPAM MESAJ artık hangi hesapta çalışacağını soruyor.** AYARLAR kutusunun
en üstünde **ÇALIŞACAĞI HESAPLAR** satırı var; yanındaki **HESAP SEÇ** düğmesi
hesap penceresini açıyor. **BAŞLAT** / **DURDUR** artık sadece o an seçili
oturumu değil, seçtiğin bütün hesapları birlikte başlatıp durduruyor. Hiç hesap
seçmediysen BAŞLAT'a basınca seçme penceresi açılıyor.

**2 · Her hesap kendi mesajlarını yazabiliyor.** MESAJLAR kutusundaki
**Hangi hesabın mesajları?** listesinden bir hesap seç, **Bu hesaba özel mesaj
listesi kullan** kutusunu işaretle: o hesap ortak listeden ayrılıp kendi
mesajlarını, kendi aralığını ve kendi sırasını kullanır. Kutunun işaretini
kaldırınca ortak listeye geri döner. Listede hangi hesabın özel listesi
olduğunu (`· özel`) ve hangisinde spam açık olduğunu (`· açık`) görebilirsin.

**3 · Sohbette kimin yazdığı görünüyor.** Sunucu oyuncu adını mesajın içine
koymadığında (1.19+ imzalı sohbet gönderen adını ayrı yolluyor, bazen boş
geliyordu) adı biz ekliyoruz: gönderenin adı satırın başında vurgulu renkte
yazıyor. Hem SOHBET sayfasında hem PANEL'deki canlı sohbette geçerli.

**4 · Oyundaki renkler sohbete de geliyor.** Mesajlar artık düz metne
çevrilmiyor: oyundaki renk kodları (`§` kodları, `§x` ve `§#` hex renkleri,
adlandırılmış renkler), kalın / italik / altı çizili / üstü çizili biçimleri
korunuyor. Sunucunun çeviri anahtarlarıyla yolladığı mesajlar (`<Ege> selam`,
"X oyuna katıldı" gibi) da doğru çözülüyor. Renkler yalnızca metin olarak
işlendiği için sunucudan gelen mesaj arayüze kod çalıştıramaz.

## v1.13.1 · Panel hesaba özel + küçük düzeltmeler

**1 · "Ayarı kapat" artık hesap seçimini silmiyor.** Pencerenin altındaki düğme
**HESAP SEÇİMİNİ SİLMEDEN AYARI KAPAT** oldu: ayar kapanır ama seçtiğin hesaplar
hatırlanır. Aynı anahtara tekrar basıp **KAYDET**'e dokunman yeter, ayar eski
hesaplarıyla geri açılır.

**2 · PANEL'deki hızlı anahtarlar hesap sormuyor.** Panelde zaten bir hesap
seçili (AÇIK HESAPLAR listesinde tıkladığın, sohbetini gördüğün hesap), bu yüzden
oradaki anahtarlar **sadece o hesabı** açıp kapatıyor - pencere çıkmıyor.
Kartın sağ üstünde hangi hesap için çalıştığı yazıyor. `Hesap1`'de açtığın ayar
`Hesap2`'ye geçmiyor; `Hesap2`'ye tıkladığında onun kendi durumu görünüyor.
BAĞLANTI sayfası yine senkron kalıyor (2 hesaptan 1'i açıksa mor yanar).

**3 · SPAM MESAJ ve GİRİŞ KOMUTLARI da hesap bazlı.** SPAM MESAJ sayfasındaki
"Bağlanınca otomatik başlasın" anahtarı da hesap seçme penceresini açıyor;
BAŞLAT / DURDUR ise o anda seçili hesap için çalışıyor. Panelden
**Spam Mesajı Başlat**'a basınca da hesap sorulmuyor.

**4 · PANEL yerleşimi düzeltildi (bug).** Çok ayar sabitleyince AÇIK HESAPLAR
kartı eziliyor, hatta kayboluyordu. Artık:
- BAĞLANTI kartı küçültüldü (**SÜRE** ve **RAM** kaldırıldı - ikisi de üst bardaki
  simgede zaten var),
- AÇIK HESAPLAR yukarı çekildi ve **en az 148 px** yer garanti edildi,
- HIZLI AYARLAR listesi kendi içinde kayıyor, kaç ayar eklersen ekle taşmıyor.

**5 · Panelin "+" düğmesi düzeltildi.** Koyu temada bembeyaz görünüyordu (arka
plan rengi verilmemişti); artık diğer küçük düğmelerle aynı.

**6 · Satır sonundaki "×" ve dişliye sağ tıklayınca açıklama balonu çıkmıyor.**
Açıklama sadece ayarın yazısına ya da anahtarına sağ tıklayınca geliyor.

## Microsoft (premium) hesapla giriş

1. **HESAPLAR** sayfasını açın (hesap türü seçmenize gerek yok, e-posta da istenmez).
2. **Microsoft ile giriş yap** tuşuna basın → **Microsoft'un kendi giriş penceresi** açılır
   (tıpkı oyunun launcher'ında olduğu gibi). E-posta + şifre girin, gerekiyorsa doğrulamayı yapın.
3. Pencere kendiliğinden kapanır, hesap listeye **PREMIUM** etiketiyle eklenir/güncellenir ve
   kullanıcı adı Minecraft profilinden otomatik gelir. Böylece DonutSMP gibi premium isteyen
   sunuculara girebilirsiniz.

Kod yazmak, tarayıcı açmak veya kod kopyalamak yok. Oturum saklandığı için sonraki
bağlantılarda tekrar giriş istenmez; jeton süresi geçmişse istemci arka planda kendisi yeniler.
Şifreniz hiçbir yerde tutulmaz.

Premium hesapla bağlanırken **BAĞLANTI → Offline / Cracked** anahtarı **kapalı** olmalıdır.

## Arayüz çalışıyor mu? (hızlı kontrol)

Sol menünün **en altında** çalışan sürüm yazar (`v1.10.0` + `made by Poltaaa`).
- Ekranın altında **kırmızı bant** çıkarsa arayüzde hata var, sebebi bandın üzerinde yazar.
- Ayrıca açılıştan 2 sn sonra sorun varsa otomatik bir hata penceresi çıkar ve
  ayrıntı `%APPDATA%\Karabarakorsa AFK Client\ui-error.log` dosyasına yazılır.
- **AYARLAR → Hata kaydını aç** (veya menü çubuğu → Uygulama → Hata kaydını aç) ile bu dosyayı açabilirsiniz.
- **F5** yeniden yükler, **F12** geliştirici konsolunu açar.

## Sunucu ekranları (Dialog) — "Yeni Hesap Oluştur" formu

Bazı sunucular kayıt/giriş için sohbet komutu yerine ekranda bir **form** açar
(Minecraft 1.21.6+ "dialog" sistemi). Örnek: *Yeni Hesap Oluştur → Yeni şifre /
Yeni şifre tekrar → Devam Et*. Normal bir bot bu formu göremez ve orada takılı kalır.

Bu istemci formu yakalar:

1. Sunucu formu açtığında **uygulamada aynı form belirir** (başlık, açıklama, alanlar, butonlar).
2. Alanları doldurup butona basarsın; cevap sunucuya doğru pakette geri gider
   (buton bir komut çalıştırıyorsa komut olarak gönderilir).
3. JOIN MESSAGES sayfasındaki **SUNUCU EKRANLARI (DIALOG)** kartından:
   - *Sunucu ekranı açılınca uygulamada göster* — formu göster/gizle,
   - *Şifre alanlarını kayıtlı şifreyle otomatik doldur ve gönder* — sen orada olmasan da
     bot formu kendi doldurur (gecikme ayarlanabilir),
   - **Kayıtlı şifre** Windows DPAPI ile şifrelenerek saklanır, log'a yazılmaz.

Form bazen oyuna girmeden önce (configuration aşamasında) açılır. O anda sohbet komutu
gönderilemez; istemci cevabı doğru pakette yollar, komut gerekiyorsa oyuna girer girmez
otomatik gönderir. Bu sırada zaman aşımı sayaçları durur, form açıkken bağlantı kesilmez.

Not: aynı sunucuların çoğu klasik `/register <şifre> <şifre>` ve `/login <şifre>`
komutlarını da kabul eder. Form gelmiyorsa JOIN MESSAGES sayfasına bu komutları
gecikmeli olarak ekleyip aynı sonucu alabilirsin.

### "Failed to decode packet 'serverbound/minecraft:custom_click_action'" hatası

Formu gönderdikten hemen sonra bu hatayla atıldıysan, sunucu cevap paketini **bayt
düzeyinde** çözemiyor demektir. Sebebi kullanılan protokol kütüphanesindeki (minecraft-data)
hatalı paket tanımıydı: payload'ı `boolean + NBT` olarak yazıyordu. Gerçek biçim şudur:

| Sürüm | custom_click_action gövdesi |
|---|---|
| 1.21.6 – 1.21.8 | `Identifier` + `NBT` (boş ise tek bayt `0`) |
| 1.21.9 ve sonrası | `Identifier` + `VarInt uzunluk` + `NBT` |

**v1.7.0'dan itibaren** istemci bu paketi kütüphaneye bırakmıyor; sunucunun sürümüne göre
doğru baytları kendisi üretip gönderiyor. Sunucunun butonla verdiği ek alanlar (`additions`,
örneğin geri çağırma kimliği) tipi hiç bozulmadan aynen geri yollanıyor, yazdığın alanlar da
vanilla ile aynı NBT tipleriyle (metin → `TAG_String`, onay kutusu → `on_true/on_false`,
sayı → `TAG_Float`) ekleniyor.

Yine de bu hata gelirse istemci paket biçimini kendiliğinden değiştirip 3 kez daha dener;
sonrasında sunucu ekranındaki **KOMUTLA GÖNDER** butonunu kullan.

### "An internal error occurred in your connection." hatası

Bu mesaj **sunucunun kendi tarafında** bir hata oluştuğunu söyler (çoğunlukla Velocity/BungeeCord
ağlarında, istemciden gelen bir paket işlenemediğinde). Sırayla deneyin:

0. **Sol altta yazan sürümün** gönderilen son sürüm olduğundan emin olun (üstte logonun yanında da yazar).
   Eski klasörü çalıştırıyorsanız hiçbir düzeltme etkili olmaz.
1. **CONNECT → Kaynak paketi (resource pack)** ayarı **Reddet** olsun (yeni varsayılan). Sunucu zorunlu bir
   kaynak paketi gönderiyorsa ve cevabı işleyemiyorsa tam olarak bu hata çıkar. Olmazsa
   **Hiç cevap verme** seçeneğini deneyin.
2. **CONNECT → Sohbet imzalamayı kapat** açık olsun (varsayılan açık). İmzalı sohbet paketleri
   bu hatanın diğer yaygın sebebidir.
3. **Sürümü değiştirin.** "Auto detect" ile deneyin, olmazsa birebir aynı sürümü seçin
   (ViaVersion'lı sunucularda bir alt sürüm de çalışır). Sunucunun bildirdiği sürüm LOGS
   sayfasında bağlanma satırında yazar.
4. Hata bir **sunucu ekranı (form)** gönderdikten sonra geldiyse: formdaki **KOMUTLA GÖNDER**
   butonunu kullanın veya *SUNUCU EKRANLARI* kartından **"Formu her zaman komutla gönder"**
   seçeneğini açıp şablonu yazın (`/register $(password) $(password_repeat)`).
5. **LOGS** sayfasına bakın: atıldığınız anda `Son gonderilen paketler:` ve `Son gelen paketler:`
   satırları hangi işlemin sebep olduğunu gösterir, altındaki `Ipucu:` satırı ne yapmanız
   gerektiğini yazar.

### Sunucuya bağlanılıyor ama içeri girmiyor (sonra atıyor)

Bağlantı "configuration" aşamasında takılıyor demektir. LOGS sayfasında
`Son gonderilen paketler` / `Son gelen paketler` satırları nerede durduğunu gösterir.

1. **SETTINGS → Paket günlüğü**'nü açın, bir kez bağlanmayı deneyin. Log'da `->` ve `<-`
   satırları tüm paketleri gösterir; en son gelen paket sorunun yerini söyler.
2. **Sürümü değiştirin.** Çoğu sunucu ViaVersion kullanır: sunucu 1.21.11 olsa bile
   **1.21.4** veya **1.20.1** ile girebilirsiniz. En etkili çözüm genelde budur.
3. **Kaynak paketi = Akıllı** bırakın: sırayla `Otomatik kabul et` → `Reddet` → `Hiç cevap verme`
   yöntemlerini kendi kendine dener, hangisi çalışırsa onunla devam eder.
4. **CONNECT → Vanilla istemci gibi davran** açık olsun (istemci kimliğini vanilla olarak bildirir).
5. Hiçbiri işe yaramıyorsa sunucuda **bot koruması (anti-bot)** vardır. Bu koruma özellikle
   mineflayer tabanlı istemcileri tanır ve hiçbir AFK client'ı doğrudan giremez.

## Proxy kullanımı

PROXIES sayfasından SOCKS5 / SOCKS4 / HTTP proxy ekleyip seçebilir, CONNECT sayfasındaki
**Proxy** anahtarını açarak bağlantıyı o proxy üzerinden kurabilirsin. SOCKS5 en uyumlusudur.
SRV kayıtları (`_minecraft._tcp`) bu modda da çözülür.

## Microsoft hesabı ile giriş (kısa özet)

HESAPLAR → **Microsoft ile giriş yap** → açılan Microsoft penceresinde giriş yap.
Hesap listede **PREMIUM** olarak işaretlenir, kullanıcı adı profilden gelir.
Jeton güvenli şekilde saklanır (`auth-cache/` + şifrelenmiş yenileme jetonu); şifren hiçbir yerde tutulmaz.

## Sohbet

Sunucuya giriş yapıldığı anda (login) mesaj yazabilirsiniz — bazı lobi/queue sunucuları
`spawn` paketi göndermez, bu yüzden istemci "dünyaya girildi" beklemeden sohbeti açar.

## Bağlanamıyorsanız

1. LOGS sayfasını açın ve BAĞLAN'a basın: sunucu adresi, sürüm ve hata sebebi oraya yazılır
   (kayıtlar seçili dilde yazılır).
2. Minecraft Version'ı **Auto detect** bırakın (önerilen). Listede yalnızca **ana sürümler**
   (1.21 – 26.11) vardır; snapshot / pre-release / rc / beta sürümleri elenir.
3. Kırmızı bildirim kutusundaki mesaj sebebi söyler:
   - *Sunucu adresi bulunamadı* → Server IP yanlış
   - *Bağlantı reddedildi* → port yanlış veya sunucu kapalı
   - *Sunucu attı: ...* → sunucunun verdiği gerçek sebep (sürüm, ban, whitelist, premium zorunluluğu)
4. Premium (online-mode) sunucular **Offline/Cracked** hesapları kabul etmez; Microsoft hesabı ekleyin.
5. Ayrıntılı akış LOGS sayfasında; Export Logs ile dışa aktarılır.

## Sorun giderme

**Butonlar tepki vermiyorsa**
1. `npm run dev` ile açın, **F12 → Console** sekmesindeki ilk kırmızı satıra bakın.
2. Terminalde `Preload error` / `Renderer:` satırı var mı kontrol edin.
3. `src/renderer/` içinde `index.html, styles.css, core.js, renderer.js, i18n.js`
   dosyalarının **hepsinin** bulunduğundan emin olun (biri eksikse arayüz ölü kalır).
4. Uygulama açıldıktan 1,5 sn sonra scriptler yüklenmediyse otomatik bir hata penceresi çıkar.
5. Ayarlar bozulduysa `%APPDATA%\Karabarakorsa AFK Client\config.json` dosyasını silip tekrar açın
   (ya da SETTINGS → **Ayarları sıfırla**).

Pencere çerçevesi native (Windows) çerçevesidir; kapat/küçült düğmeleri JS'ten bağımsız çalışır.


## v1.15.10 · Pencere davranışı

- ESC tuşundaki eski güncelleme penceresi hatası giderildi.
- Küçültme artık normal Windows davranışını kullanır ve görev çubuğunda kalır.
- Yalnızca X ile kapatma uygulamayı arka plana/tepsiye gönderir.
