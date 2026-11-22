# Karabarakorsa AFK Client

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Source available](https://img.shields.io/badge/source-available-brightgreen.svg)](#kaynaktan-derleme)

Windows için Electron, Mineflayer ve Minecraft Protocol tabanlı açık kaynak Minecraft AFK istemcisi.
Bu depo **v1.15.19 / paket 132** kaynak kodunu içerir.

> **Bağımsız proje:** Mojang, Microsoft veya herhangi bir Minecraft sunucusuyla bağlantılı ya da onlar tarafından onaylanmış değildir.
> Kullandığınız sunucunun bot, AFK ve otomasyon kurallarına uymak sizin sorumluluğunuzdadır.

## Neden kaynak kodu açık?

Kullanıcılar uygulamanın ne yaptığını inceleyebilsin, kendi bilgisayarında derleyebilsin ve yayımlanan EXE ile kaynak kodunu karşılaştırabilsin diye bütün uygulama kodu bu depoda paylaşılır.

- Gizli çalıştırılabilir dosya veya kapalı kaynak modül yoktur.
- Uygulamanın kendi analiz/telemetri ya da reklam servisi yoktur.
- Hesap, proxy ve ayar verileri yerel bilgisayarda saklanır.
- Microsoft kimlik doğrulaması ilgili açık kaynak bağımlılıklar üzerinden resmi oturum akışını kullanır.
- Güncelleme denetimi bu projenin GitHub Releases API adresine yapılır.

Detaylar: [Güvenlik](SECURITY.md) · [Gizlilik](PRIVACY.md) · [Üçüncü taraf paketler](THIRD_PARTY_NOTICES.md)

## Özellikler

- Offline/cracked ve Microsoft hesap desteği
- Çoklu hesap ve oturum yönetimi
- Anti AFK ve Auto Spam
- `/login`, `/gir` ve `/register` için arayüz ve loglarda gizli giriş komutları
- Auto Build: iki XYZ köşesi arasında envanterle alttan üste dolgu, aramalı texture seçici ve fizik tabanlı yol bulma
- Auto Farm, Auto Sell ve canlı sunucu ekranı
- Hesap bazlı Spawner Koruma: whitelist, oyuncu algılama yarıçapı, sabit 150 blok koruma alanı ve güvenli çıkış
- Panelde gerçek Minecraft düzeni ve işlevleri: sürükle-bırak, sol/sağ/Shift tık, bölme, giyme, 2×2 üretim, çift tık, 1–9/F, Q ve Ctrl+Q
- Spawner AFK arayüzde görünür ancak deneme sürecinde zorunlu olarak kapalıdır
- SOCKS4, SOCKS5 ve HTTP proxy desteği
- Türkçe ve İngilizce arayüz
- Sessiz otomatik güncelleme ve Windows bildirimleri
- Kaynak paketi yanıt yönetimi

## Paket 132: İsteğe bağlı “Otomatik geç”

- Başlat / Duraklat / Devam et / Durdur düğmelerinin hemen altında **Otomatik geç** kutusu vardır. Varsayılan kapalıdır; hesap bazında kaydedilir ve etkin işte açılıp kapatılabilir.
- Açıkken yalnızca katı blok modundaki `server_corrections` uyarısından sonra sınırlı otomatik Devam et uygular. Sunucunun gerçek konumu kabul edilir; mevcut 3 saniyelik hareket beklemesi bitmeden devam edilmez. Önceki iş parçacığının bitmesi, en az 500 ms durağanlık, yüklü gövde/ayak desteği ve kapalı envanter gereklidir.
- 60 saniyede en fazla **bir otomatik devam**. İkinci düzeltmede veya beklerken yeni sunucu konum mesajında durur. Kutuyu kapatma, elle duraklatma/durdurma, dünya/bağlantı değişimi beklemeyi iptal eder. Koşullar 10 saniyede sağlanmazsa otomatik devam iptal edilir.
- Sunucu teleportu, paket duruşu, izin/yerleştirme reddi ve diğer hatalar otomatik geçilmez. Nether Wart/ekim planlayıcısına otomatik devam eklenmedi. Eksik bloklar yapılmış sayılmaz; mevcut iş gerçek doluluğu tekrar tarar ve aynı planla devam eder.
- Paket/hız sınırı ve konum sınıflandırma eşikleri değiştirilmedi. 131'in kısa yana geçişi, üçlüler, 130'un durdurma/devam düzeltmeleri ve manuel son hücre korunur. 14–17 CPS eklenmedi.
- Bu seçenek sunucu düzeltmesinin nedenini çözmez ve ban garantisi değildir. Canlı sunucuya/hesaba bağlanılmadı.

**v1.15.19 / paket 132.** Eski uygulamayı kapatıp ZIP'i ayrı klasöre çıkarın ve `BASLAT-132.bat` ile açın. Windows EXE burada derlenmedi; `EXE-OLUSTUR-132.bat` Windows'ta derler. Hesap/AppData'yı silmeyin. Ayrıntılar: `PAKET-132-NOTLAR.txt` ve `CHANGELOG.md`.

## Kaynaktan çalıştırma

Gereksinimler:

- Windows 10/11
- Node.js 22 LTS veya daha yeni bir LTS sürümü
- npm

```bash
git clone https://github.com/Poltaaa/karabarakorsa-client-updates.git
cd karabarakorsa-client-updates
npm ci
npm run verify
npm start
```

Windows'ta alternatif olarak `BASLAT-130.bat` dosyasını çalıştırabilirsiniz.

## Önceki Auto Build davranışları · Eski API/regresyon yolu

**Sürüm v1.15.19 kaldı; güncel paket 130.** Eski uygulamayı kapatıp ZIP'i ayrı klasöre çıkarın, `BASLAT-130.bat` ile açın. Sol altta **v1.15.19 · 130** görünmeli. Eski EXE güncellenmez; `EXE-OLUSTUR-130.bat` ile Windows'ta yeniden derlenebilir. Hesaplar/AppData silinmez.

Aşağıdaki bölüm eski düşük seviyeli akışın geçmiş açıklamasıdır. Yeni katı blok arayüzünde Paket 130 bölümü geçerlidir; otomatik kurtarma/kapatma yoktur ve son blok bilinçli olarak elle bırakılır.

### İstenen davranışlar

- **Dayanaktan genişleme:** Karakter Y65 civarında, hedef Y68 olabilir. O katmanda mevcut tahta gibi erişilebilir bir dayanak varsa görünür yan yüzüne koyar; koyduğu bloklar sonraki hücrelere dayanak olur. İlk şerit desteksizse yakındaki dayanağa bağlı tek düz seed hattı kurup hizalı şeritlere döner; erişilemeyen destek için duraklar. Mevcut tahta korunur. Havaya blok/iskele/ışınlanma eklenmez; fiziksel erişim ve destek hâlâ gerekir.
- **Otomatik açı:** Görüş, gerçek ilk çarpışan yüzle doğrulanır; dayanağın arkasındaki görünmez yüzüne tıklamaz. Güvenli duruşlar arasında otomatik yeniden konumlanır, kısa/sınırlı tekrar yapar, güvenli açı yoksa sabit hedef sırasını bozmak yerine duraklar. Dolu hücreleri korur; açık hücreyi tamamlandı sayıp üst katmana geçmez.
- **Kapanmayı önleme:** Dolgu sırası giriş/çıkış tarafına göre yönlenir. Blok koymadan ve bakış sonrasında, öngörülen blokla birlikte yürüyüş/baş boşluğu ve güvenli çıkış planı kontrol edilir. Gerekirse koymadan önce geri çekilir. Tamamlandı durumu için son katman doğrulanır, karakter alanın dışında olmalı ve açık kurtarma geçidi kalmamalı.
- **Son çare kurtarma:** Ayarlarda **“Sıkışınca yalnızca bu işte koyduğu blokları kır, çık ve arkayı kapat”** seçeneği var (yeni işlerde varsayılan açık, kapatılabilir). Önce kırmadan yol arar; bu yoksa yalnızca bu işte sunucu onayıyla koyulmuş, değişmemiş ve hâlâ kayıtlı kendi bloklarından en az bir, gerekirse iki yüksekliğinde geçit planlar. Önceden bulunan yapılar, spawner/sandık/tehlikeli veya düşen bloklar ve ayak altındaki zemin kazılmaz.
- **Kır → tamamen çık → arkayı kapat:** Native kazmanın yerel “hava” tahmini yetmez, sunucunun blok güncellemesi beklenir. Gerçek konumun tamamen dışarıda olduğu doğrulanmadan kapatma başlamaz. Açık geçit varken içeri geri yürüyerek doldurmaz; kalan erişilebilir hücreleri dışarıdan tamamlar ve Y sırasını koruyarak geçidi en sona kapatır. Kapatamıyorsa işi tamamlandı saymaz. Pause sonrası geç gelen gerçek kırma onayı da kayda alınır; Pause kendi başına yürüyüş/kapatma başlatmaz.

### Sınırlar ve kayıtlar

- Alan için yeni yapay blok sayısı sınırı yok. BigInt imleç, sabit hafızalı üç-derin şerit planı, 4096 son doğrulanmış blokluk sahiplik günlüğü ve parçalı (2 ms) / sınırlı A* planlama kullanılır; bütün hacmin koordinat dizisi oluşturulmaz. Günlükten çıkmış ya da değiştirilmiş bloklar **kırma için sahiplenilmez**. Plan doğrulanamazsa risk almak yerine duraklar. En fazla iki blokluk kurtarma geçidi denenir; rastgele uzun tünel kazılmaz. Aynı anda açık onarım kuyruğu güvenlik için sınırlıdır.
- Yerel yürüyüş, zıplama, soul-sand/bal yavaşlaması ve iki gönderilmiş bakış açısının beklenmesi korunur. Araçla 15 saniyeden uzun kazma gerektiren kurtarma bloğu otomatik zorlanmaz. Sunucu yerleştirme/kırma izni vermiyorsa, malzeme bitmişse veya geometri tamamlanamıyorsa duraklama hâlâ gereklidir; her şekil için tamamlanma garantisi yoktur.
- **Durdur / dünya veya bağlantı değişimi** işi tamamen durdurur; otomatik yeniden inşa/onarım yoktur. Kurtarma sırasında Durdur kullanılırsa açılmış geçit kalabilir. Aynı işi devam ettirmek için Duraklat/Devam et kullanın.
- Arayüzde Aşama ve **Kurtarma: kırılan / kapatılacak** sayaçları bulunur. `Önceden dolu` ve işlenmiş hacim katman doğrulamasıyla kesinleşir; kendi onaylı yerleştirmeleri anında sayılır. Sorun durumunda `[Auto Build/116] start`, `watch`, `auto retry`, `rescue opened`, `exit verified`, `rescue closed`, `failure/paused` kayıtlarını ve hedef koordinatı paylaşın.

### Test kapsamı

`npm run verify`: birim/regresyon senaryoları ve kaynak sözdizimi denetimi. `npm run test:planner`: seed/frontier, görünmeyen/ince engelli yüz, sahiplik/değişiklik, hafıza sınırı, çıkmadan kapatmama, ayak altını koruma, yerel hava tahminini onay saymama, Pause sonrası geç gerçek ACK ve otomatik tekrar.

`npm run test:build-network`: **20 tam native istemci + loopback Minecraft protokol sunucusu** senaryosu (1.20.1/1.21.4). Native look/equip/physics/pathfinder/dig taklit edilmez. Wart, ruh kumu, taş, ana envanter, Y68 sol/sağ seed, engelli açı, 4×4×2 dolgu ve gerçek iki-blok kurtarma/çıkış/dışarıdan dolgu/yeniden kapatma sınandı. Kurtarma fixture'ında sahiplik önce gerçek native yerleştirme ve sunucu ACK ile kazanılır; ardından kontrollü dış duvar kapanışı denenir. Sunucu kazılan blokları, doğru görünür kazma yüzünü, gönderilmiş açıları ve kapatma anında karakterin dışarıda olduğunu denetler.

Ekim fizik/chunk testleri 1.8/1.16.5/1.20.1/1.21.4; normal inşa, envanter, bağlantı ve Chromium arayüz testleri geçti. **Canlı AesirMC ve kullanıcının Windows FPS ölçümü yapılmadı.** Sunucu kuralları ve izinleri ayrıca geçerlidir.

## Paket 110 · Auto Build bakış ve yerleştirme düzeltmesi

**Uygulama v1.15.19 olarak kaldı; paket numarası 110.** ZIP'i ayrı klasöre çıkarıp `BASLAT-110.bat` ile açın. Sol alt sürüm satırı **v1.15.19 · 110** göstermeli. Eski EXE yeni kodu içermez; Windows'ta `EXE-OLUSTUR-110.bat` ile yeniden derlenebilir. Hesapları/AppData'yı silmeyin.

- Gerçek Mineflayer `lookAt(false)` bekleyişinin yalnızca yatay açıyı kontrol ettiği doğrulandı: dikey bakış henüz hedefe ulaşmamışken yerleştirme başlayabiliyordu. Artık native yumuşak dönüş korunarak, **gerçek gönderilmiş yatay ve dikey açı** birlikte beklenir. Paket limiti tarafından düşürülen hareketler gönderilmiş sayılmaz.
- Yerleştirme yüzeyi zaten görünür/erişilebilir olduğunda rota erken tamamlanır; karakterin gereksiz biçimde tam bir duruş hücresine yürümesi beklenmez. Hareket durulmadan tıklanmaz. Ruh kumu/bal gibi kesirli zeminlerin gerçek yüzeyi hem duruş hem tıklama noktasında kullanılır.
- Taş/ruh kumu gibi etkileşimsiz desteklerde gereksiz çömelme kaldırıldı. Etkileşimli destek için çömelme bakıştan **önce**, doğru göz yüksekliğiyle yapılır. Wart yalnızca ruh kumunun üst yüzeyine ekilir; Y65 ruh kumu için ekim Y66 olmalı.
- Auto Build durum kartı artık **Aşama** gösterir. `[Auto Build/110]` başlangıç, 5 saniyelik izleme, gönderilen ilk tıklamalar, onay ve duraklama kayıtları paket günlüğü kapalıyken de gelir. Giden paket günlüğünü bağlantıdan sonra açmak da artık çalışır.
- Yine takılırsa **KAYITLAR** bölümünden yalnızca `[Auto Build/110] start`, `watch`, `failure` / `paused` satırlarını, görünen aşamayı ve seçili blok/koordinatları paylaşın. Uzun gelen chat/boss_bar/map listesi yerleştirme aşamasını göstermez.
- `npm run verify`: **143** birim/regresyon senaryosu. `npm run test:build-network`: 1.20.1 ve 1.21.4'te **10 tam istemci + yerel protokol sunucusu** senaryosu; native bakış/equip/fizik/pathfinder taklit edilmez. Sunucu gerçek açıları, envanter transferini, erişimi, yüzey cursor'unu, çömelmeyi ve blok onayını denetler. Wart, ruh kumu, taş, ana envanter/hotbar, gerçek yürüyüş, iki katman ve etkileşimli destek sınandı.
- `test:wart` yerel ekim testleri 1.8 / 1.16.5 / 1.20.1 / 1.21.4'te; normal inşa ve bağlantı testleri 1.20.1 / 1.21.4'te geçti. Canlı AesirMC ve kullanıcının Windows bilgisayarı test edilmedi; sunucu izinleri/kuralları ayrıca geçerlidir.

## Paket 109 · Nether Wart ekim düzeltmesi

Sürüm **v1.15.19** olarak kaldı. Paket/başlatıcı numarası **109** oldu. Nether Wart dolgu küpü gibi değil, **ruh kumu üzerindeki çarpışmasız bitki ekimi** olarak yerleştirilir.

- Örneğin ruh kumu **Y=65** ise Nether Wart için **iki köşenin Y değerini de 66** yapın; aynı X/Z aralığını kullanın. Her hedefin bir alt hücresinde `soul_sand` gerekir; `soul_soil` uygun değildir.
- Karakter kendi ayak hizasına ekebilir ve ekili wart hücrelerinin üzerinden/arasından yürüyebilir. Dar şeridin son hücresinde yanlış tam-küp çarpışması nedeniyle duraklama giderildi. Aynı alanın içinde olgun veya önceden ekilmiş wart varsa kırılmaz; dolu hücre olarak korunur.
- Ekim yalnızca aşağıdaki ruh kumunun **üst yüzüne**, gerçek **7/8 blok yüksekliğindeki** tıklama noktasıyla yapılır. Hedefe bakış ve native paketin cursor değeri aynı noktayı kullanır. Gereksiz çömelme yapılmadığından ekimde göz yüksekliği değişmez.
- Yanlış/eksik zemin ve son anda değişen destek kontrol edilir; `wart_soil` açıklaması gösterilir. Malzeme, duraklat/devam, geç cevap ve sunucu onayı kontrolleri korunur. Her boş hücre için destek gerekir; bitkiler havada üst üste dizilmez.
- `npm run verify`: **136** birim/regresyon senaryosu. `npm run test:wart`: ekim geometri kontrolleri ve gerçek yerel chunk/fizik/pathfinder/native yerleştirme paketleri + simüle sunucu cevabı. Y65/Y66, dar 7 hücrelik şerit, 7×5 bahçe, olgun bitki, yanlış zemin, malzeme bitişi ve geç cevap senaryoları 1.8 / 1.16.5 / 1.20.1 / 1.21.4 ile sınandı. Canlı AesirMC testi yapılmadı.

## Paket 108 · Auto Build

**Sürüm v1.15.19 olarak kaldı; yalnızca paket numarası 108 oldu.** Aynı sürüm numarası otomatik güncelleme karşılaştırmasında yeni sürüm sayılmayabilir. Bu ZIP'i ayrı klasöre çıkarıp yeni başlatıcıyla açın; eski EXE değişmez.

1. Sunucuya ve inşa edeceğiniz dünyaya girin. Aynı hesapta Auto Farm, Auto Sell ve Spawner Koruma'yı kapatın; giriş komutlarının tamamlanmasını bekleyin.
2. **MAKROLAR → Auto Build ayarları** içinde çevrimiçi hesabı seçin.
3. İki çapraz köşenin tam sayı XYZ değerlerini girin. Köşeler dahil edilir ve koordinatlar otomatik normalize edilir. “Konumumu al” mevcut ayak koordinatını kopyalar; mutlaka inşa edeceğiniz hücreye göre kontrol edin.
4. Texture'lı listede blok arayın (ör. `ruh kumu`, `soul sand`, `stone`). Liste sunucu sürümünün bütün blok kayıtlarını gösterir; yalnızca 4 satır yüksekliğinde ve görünür satırlar oluşturularak çizilir. Eşya karşılığı olmayan veya kapı/yatak gibi çok hücre kaplayan kayıtlar devre dışıdır. Atlasın kapsamadığı yeni dokularda yer tutucu simge kullanılır.
5. **Başlat** ile miktarı / alanı kontrol edin, ardından tekrar **Başlat** ile onaylayın. İlk denemeyi 3×3, tek Y katmanıyla yapın.
6. **Duraklat / Devam et** aynı koordinattan sürdürür. Malzeme biterse iş duraklar; malzeme ekledikten sonra devam edin. Son gönderilen yerleştirmenin cevabı beklenirken Devam et kısa süre kilitli kalabilir.
7. **Durdur** işi sonlandırır. Bağlantı veya dünya değişince de iş durur ve tekrar girişte otomatik başlamaz.

### Çalışma ve sınırlar

- En alt Y katmanı tamamlanmadan üst katmana geçilmez. Her katmanda zikzak sıra kullanılır. Sadece hava hücreleri doldurulur; önceden dolu hücreler korunup ayrı sayılır. “En fazla blok” ham hacimdir; gerçek ihtiyaç mevcut dolu hücreler kadar azalır.
- Küçük bir yapay hacim sınırı yoktur. Dünyanın gerçek Y ve X/Z sınırları geçerlidir. Büyük alanlar BigInt sayaç + tek koordinatla ilerler, tüm koordinatlar belleğe dizilmez. İş fiziksel yürüyüş / malzeme / destek gerektirdiği için sınırsız alanın kesin tamamlanacağı garanti edilmez.
- Normal fizik, yürüyüş, bakış ve tek blok zıplama kullanılır. Yüksek sütun/duvarın yanından erişilebilir rota aranır; ruh kumu ve bal bloğunda native yavaşlama korunur. Buz/su daha yüksek rota maliyetine sahiptir; ağ/lav/zararlı zeminler tercih edilmez veya dışlanır.
- Blok kırma, ekstra iskele, uçuş ve ışınlanma yoktur. Yüksek katmana güvenli bir geçiş, görünür destek yüzeyi veya chunk bulunamazsa neden ve sıradaki koordinat gösterilir. Güvenli yol veya destek oluşturduktan sonra Devam et kullanılabilir.
- Blok başına sunucu dünya güncellemesi beklenir. İzin reddi / eksik cevap başarı sayılmaz; alt katman atlanıp üst katmana geçilmez. Kum/çakıl gibi düşen bloklar alttan destek gerektirir. Slab/merdiven gibi bloklar normal yerleştirme durumuyla konur; ayrı bir yön / block-state editörü yoktur.
- Anti AFK hareketleri iş boyunca bekler; fizik geçici açık kalır, iş bitince önceki duruma döner. Çalışırken envanter işlemleri çakışmaz; duraklatılıp son işlem tamamlandıktan sonra envanter düzenlenebilir.
- 2 ms yol arama / duruş değerlendirme iş bütçeleri ve 250 ms durum çizimi kullanılır. Bu yerel test bütçesidir, Windows FPS garantisi değildir. Sunucunun otomasyon ve inşa kurallarına uyun; “bot tespit edilemez” garantisi yoktur.

### Testler

`npm run verify`: 125 birim/regresyon senaryosu. `npm run test:build`: gerçek Prismarine chunk/pathfinder/fizik + native Mineflayer yerleştirme paketleri, yerel simüle sunucu onayı/reddi/geç cevabı. Yerel hareket testleri 1.8, 1.16.5, 1.20.1 ve 1.21.4 ile çalıştırıldı; 1.8'de bal bloğu yoktur. Canlı AesirMC ve kullanıcının Windows bilgisayarı test edilmedi.

## Paket 107 performans düzeltmesi

Spawner Koruma'nın beş saniyelik tam dünya taraması kaldırıldı. Dünya verisi küçük zaman dilimlerinde bir kez indekslenir; sonrasında chunk/blok olayları ile güncel tutulur. **150 blok koruma alanı, oyuncu algılama mesafesi ve kazma süreleri değişmez.** Eksik tarama üzerinden "tümü kırıldı" kararı verilmez.

Değişmeyen durumlar arayüzü yeniden çizmez. Ping ve gerçek durum/hesap/makro değişimleri canlı güncellenir; uptime yerel sayaçtan akar. Paket 106'nın bağlantı/heartbeat düzeltmeleri korunur.

Gerçek chunk biçimleriyle yerel test: `npm run test:performance`. Bu test sunucuya bağlanmaz ve yalnızca bellekteki sahte dünyayı tarar. Yerel test sonuçları kullanıcının gerçek Windows FPS'sini garanti etmez.

## Bağlantı testi

- Yeni ZIP'i ayrı klasöre çıkarıp `BASLAT-130.bat` ile açın. Eski EXE, yeni kaynak dosyalarındaki düzeltmeleri içermez; EXE kullanmak için `EXE-OLUSTUR-130.bat` ile yeniden derleyin.
- Önceki hesap/ayarlar aynı Windows veri klasöründe kalır. Ayarları veya Microsoft oturum dosyalarını silmek gerekmez.
- AesirMC testi için `BAGLANTI-TESTI-130.bat` yalnızca herkese açık status bilgisi okur; hesapla giriş yapmaz. Varsayılan olarak **doğrudan ağ** kullanır, uygulamanın VPN/proxy ayarlarını kullanmaz. Yalnızca VPN/proxy üzerinden bağlanmak istiyorsanız bunu çalıştırmayın; uygulamanın ağ kayıtlarını kullanın.
- Komut satırında alternatif: `node diag-126.js oyna.aesirmc.com 25565`.
- ECONNREFUSED sürüm uyuşmazlığı değildir. `Network target`/`Network error target` satırlarını ve aynı bilgisayardaki normal Minecraft erişimini karşılaştırın. Sunucu/ağ tarafındaki gerçek bir reddi bu paket ortadan kaldıramaz.
- SkyBlock'ta kopma tekrarlanırsa kopmadan hemen önceki/sonraki `Network health`, `Protocol error`, `Connection timed out` ve `Disconnected` satırlarını paylaşın; şifre/oturum jetonu paylaşmayın. Canlı AesirMC davranışı henüz doğrulanmadı.
- Yerel geliştirici testi: `npm run test:network`. Yalnızca loopback kullanır; gerçek hesabı veya harici sunucuyu kullanmaz. Modern sürüm için `LOCAL_MC_VERSION=1.21.4` ortam değişkeniyle çalıştırılabilir.

## Kaynaktan derleme

Portable EXE:

```bash
npm ci
npm run verify
npm run build:portable
```

Installer ve portable EXE:

```bash
npm ci
npm run verify
npm run build
```

Çıktılar `dist/` klasörüne yazılır. `EXE-OLUSTUR-130.bat` aynı işlemi Windows'ta otomatik yapar.

## İndirilen EXE neden uyarı gösterebilir?

Windows SmartScreen, ücretli kod imzalama sertifikası bulunmayan ve henüz yeterli indirme itibarı kazanmamış yeni EXE dosyalarında **“Windows bilgisayarınızı korudu”** uyarısı gösterebilir. Bu uyarı tek başına virüs tespiti değildir.

Güvenmek için:

1. Kaynak kodunu inceleyin.
2. GitHub Actions derlemesinin başarılı olduğunu kontrol edin.
3. Kaynaktan kendiniz derleyin.
4. Release dosyasının SHA-256 değerini yayımlanan değerle karşılaştırın.
5. İsterseniz dosyayı VirusTotal gibi çoklu tarama hizmetlerinde kontrol edin; otomasyon ve ağ kütüphaneleri nedeniyle sonuçları bağlamıyla değerlendirin.

PowerShell ile SHA-256:

```powershell
Get-FileHash '.\Karabarakorsa AFK Client Setup 1.15.19.exe' -Algorithm SHA256
```

## Depo yapısı

```text
src/main/                 Electron ana süreç, pencere, IPC ve bot yönetimi
src/main/bot/             Minecraft bağlantısı ve otomasyon modülleri
src/renderer/             HTML/CSS/JavaScript arayüz
src/renderer/assets/      Yerel görsel varlıklar
build/                    Uygulama ve tepsi ikonları
scripts/verify.js         Kaynak kodu sözdizimi ve güvenlik kontrolü
.github/workflows/        GitHub Actions doğrulama/derleme iş akışı
```

## Kullanıcı verileri

Uygulama ayarları normal kullanımda proje klasörüne değil, Windows kullanıcı veri dizinine yazılır:

```text
%APPDATA%\Karabarakorsa AFK Client\
```

Şifreler ve oturum verileri düz metin olarak depoya eklenmemelidir. `.gitignore`, olası yerel kullanıcı verilerini ve anahtar dosyalarını dışarıda bırakır.

## Katkı ve güvenlik

- Hata düzeltmeleri için: [CONTRIBUTING.md](CONTRIBUTING.md)
- Güvenlik açığı bildirmek için: [SECURITY.md](SECURITY.md)
- Lisans: [MIT](LICENSE)

## VPN modu
Proxies sayfasındaki VPN paneli, ayrı kurulmuş VPN motorunu yerel SOCKS5 (127.0.0.1:9050) üzerinden başlatır. Bağlantılar VPN üzerinden gönderilir, `NEW IDENTITY` yeni devre ister ve iki harfli ülke kodu ExitNodes seçebilir. VPN sistem geneline uygulanmaz; yalnızca Minecraft bot bağlantısı etkilenir.

VPN motoru Windows x64 için resmi Tor Expert Bundle içindeki `tor.exe` ile birlikte dağıtılır; kullanıcı ayrıca Tor Browser kurmak zorunda değildir.
