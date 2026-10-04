# Değişiklik Günlüğü

## 1.15.16 · Paket 84 · GitHub yayın sürümü

- Uygulama sürümü tüm yayın noktalarında **v1.15.16** olarak yükseltildi: paket metadata’sı, kilit dosyası, kenar çubuğu, başlatma/derleme dosyaları, README ve güncelleme örneği eşitlendi.
- Paket 83’teki VPN gerçek durum eşitlemesi ve temaya uyumlu VPN arayüzü bu yayın sürümüne dahil edildi.
- GitHub dağıtımı için kök dosya adları `BASLAT-84.bat`, `EXE-OLUSTUR-84.bat` ve `diag-84.js` olarak güncellendi.

## 1.15.15 · Paket 83 · VPN durum ve tema düzeltmesi

- Pencere sağ üstteki çarpıdan gizlenip yeniden açıldığında VPN göstergesi artık kayıtlı ayarı değil, çalışan VPN motorunun gerçek durumunu yeniden sorguluyor.
- Uygulama açılışındaki VPN otomatik başlatma yarışı giderildi; motor açıldıktan, kapandıktan veya beklenmedik biçimde durduktan sonra arayüz anında doğru **ON/OFF** durumuna eşitleniyor.
- VPN başlangıcı başarısız olursa eski açık durumu kalıcı ayarlardan temizleniyor; kapalı görünen fakat arka planda açık kalan veya tam tersi görünen durumlar engelleniyor.
- Proxyler sayfasındaki VPN kartı, düğmeler, durum rozeti, ülke satırı ve pencereler istemcinin mevcut koyu/açık temasına uygun biçimde yeniden tasarlandı. İşlevler değiştirilmedi.

## 1.15.15 · Paket 82 · SkyBlock offset ve Electron güvenlik düzeltmesi

- SkyBlock’a girdikten bir süre sonra gelen `ERR_OUT_OF_RANGE / offset is out of range` ayrıştırma hatası da kesintisiz uyumluluk katmanına alındı.
- Koruma artık yalnızca “abnormally large array” hatasını değil, **play/configuration aşamasındaki tüm tek-frame ayrıştırma uyumsuzluklarını** stream’i kapatmadan atlıyor. Login ve kimlik doğrulama hataları fatal kalmaya devam ediyor.
- Hatalı paketin sınırı splitter tarafından önceden ayrıldığı için sonraki paketler güvenle okunuyor; `entity_equipment` gibi eklenti kaynaklı büyük paketler bağlantıyı veya gelen sohbeti durduramıyor.
- Renderer’a sıkı Content Security Policy eklendi. Kaynak koddan çalıştırırken görünen `Electron Security Warning (Insecure Content-Security-Policy)` giderildi; harici script, bağlantı ve object yüklemeleri kapatıldı.

## 1.15.15 · Paket 81 · Kesintisiz SkyBlock aktarımı

- SkyBlock’taki uyumsuz paketten sonra gelen paket akışının durup 60 saniye sonra `client timed out` vermesinin kök nedeni düzeltildi: bozuk frame artık deserializer stream’i hata durumuna sokmadan yakalanıp atlanıyor.
- Protokol durumu login → configuration → play olarak her değiştiğinde oluşturulan yeni ayrıştırıcı otomatik olarak yeniden korunuyor; bağlantı gerçekten gelen paketleri okumaya devam ediyor.
- Bilinen uyumsuz paket dışındaki protokol hataları gizlenmiyor; gerçek bağlantı sorunları normal şekilde raporlanmaya devam ediyor.
- `/login` sonrasında oluşan dünya değişiminin çalışan giriş zincirini iptal edip sıradaki `/gir skyblock-spawn` komutunu silmesi engellendi. Devam eden sıra tamamlanana kadar korunuyor.

## 1.15.15 · Paket 80 · GitHub yayın sürümü

- Uygulama sürümü tüm yayın noktalarında **v1.15.15** olarak yükseltildi: paket metadata’sı, kilit dosyası, kenar çubuğu, başlatma/derleme dosyaları, README ve güncelleme örneği aynı sürüme getirildi.
- SkyBlock protokol uyumluluk koruması ve Auto Sell dayanıklılık düzeltmesi bu yayın sürümüne dahil edildi.
- GitHub dağıtımı için kök dosya adları `BASLAT-80.bat`, `EXE-OLUSTUR-80.bat` ve `diag-80.js` olarak güncellendi.

## 1.15.14 · Paket 79 · SkyBlock protokol uyumluluğu

- Proxy arkasındaki bazı SkyBlock sunucularında görülen `array size is abnormally large` gelen-paket ayrıştırma hatası için uyumluluk koruması eklendi.
- Hatalı tek paket frame’i güvenli biçimde atlanıyor; bağlantı, giriş komutları ve otomasyon çalışmaya devam ediyor. Bu durum artık bağlantıyı bozan kırmızı hata/toast olarak gösterilmiyor.
- Koruma ilk olayı ve atlanan paket sayısını Kayıtlar’a tek bir bilgi satırı olarak yazıyor; tekrar eden aynı hata logları 30 saniyede birleştiriliyor.
- Paket kimliği mümkünse Minecraft protokol şemasından çözümlenip bilgi satırına ekleniyor; böylece ileride sunucuya özel şema düzeltmesi gerekirse teşhis verisi hazır oluyor.
- `minecraft-protocol` **1.68.0** ve Mineflayer **4.39.0** sürümlerine sabitlendi; farklı bilgisayarlarda eski protokol kütüphanelerinin kurulması engellendi.

## 1.15.14 · Paket 78 · Auto Sell dayanıklılık düzeltmesi

- Auto Sell’in nadiren sandığı açık bırakıp saatlerce devam etmemesine yol açan pencere/transaction kilidi giderildi.
- Sandık tıklaması yanıt vermezse yeni tıklamalar yığılmıyor; tur güvenli biçimde kesiliyor, sandık zorla kapatılıyor ve ayarlanan süreden sonra temiz bir tur başlıyor.
- Eklenti sunucularının ilk sandık penceresini ikinci bir özel pencereyle değiştirmesi desteklendi; Auto Sell artık açtığı en güncel pencereyi takip edip kapatıyor.
- Bakma, etkileşim, eşya taşıma, pencere kapatma ve bütün tur için zaman aşımı korumaları eklendi. Bir hata Auto Sell döngüsünü kalıcı olarak durduramıyor.
- Kullanıcının veya başka bir özelliğin açtığı alakasız ekranlar Auto Sell’e ait sayılmıyor ve zorla kapatılmıyor.

## 1.15.14 · Paket 77

- **Spawner AFK** ve **Spawner Koruma** deneme süreci tamamlanana kadar zorunlu olarak kapatıldı; eski ayarlarda açık kayıtlı olsalar bile hiçbir hesapta veya bot motorunda çalışmazlar.
- İki ayar arayüzde daha koyu ve soluk gösteriliyor; yanlarında **(Kapalı)** etiketi bulunuyor.
- Anahtara veya ayar dişlisine basıldığında sayfa/hesap seçici açılmıyor ve sağ altta “Bu ayar şu an kapalı; özellik deneme sürecinde.” uyarısı gösteriliyor.
- Doğrudan IPC veya eski config üzerinden başlatma yolları da engellendi.

## 1.15.14 · Paket 76

- Yeni **Auto Sell** makrosu eklendi: yürümeden en yakın erişilebilir sandığı açar, envantere sığan tüm yığınları hızlı Shift+tıklarla alır, sandığı kapatır ve `/sellall` gönderir.
- İlk satış ayar açıldığı anda yapılır; sonraki turlar için Spam Mesaj’dakiyle aynı **Sabit aralık** ve **Rastgele aralık (en az–en fazla)** seçenekleri eklendi.
- Auto Sell hesap bazlı açılıp kapatılabilir, yeniden bağlanınca otomatik devam eder ve Makrolar sayfasında ayrı ayar/durum ekranına sahiptir.
- Başka bir sunucu ekranı açıksa ekran zorla kapatılmaz; ilgili tur güvenli biçimde atlanır. Envanter dolduğunda sandıkta kalan eşyalara dokunulmaz.

## 1.15.14 · Paket 75

- Spawner’a dönüş, Bot Physics kapalı olsa bile tek bir doğrudan bakış paketiyle sunucuya kesin olarak gönderiliyor.
- Spawner etkileşimi eklenti uyumlu, animasyonsuz `use item on block` paketine geçirildi; gerçek blok yüzü/imleç noktası ve her tıklamada artan sequence değeri kullanılıyor.
- Etkileşim sırasında Anti-AFK’nin rastgele bakma/eğilme hareketleri geçici olarak durduruluyor.
- Sağ tıklama anında Shift geçici olarak bırakılıp önceki durumu geri yükleniyor; Shift nedeniyle eklenti menüsünün açılmaması engellendi.

## 1.15.14 · Paket 74

- Spawner AFK sağ tıklamasındaki gereksiz el sallama animasyonu kaldırıldı; yalnızca eklentinin dinlediği gerçek blok etkileşim paketi gönderiliyor.
- Sağ tıklanan blok yüzü ve imleç noktası artık oyuncunun gözünden spawner merkezine uzanan ışına göre hesaplanıyor. Böylece yandan bakarken hatalı biçimde “üst yüz” gönderilmesi ve eklenti menüsünün açılmaması düzeltildi.

## 1.15.14 · Paket 73

- Spawner AFK bakış hesabı Mineflayer ile aynı koordinat sistemine geçirildi; bot artık spawner bloğunun tam merkezine bakıyor.
- Spawner etkileşimi resmî `activateBlock` akışına geçirildi; doğru yüz/imleç verisi ve el animasyonuyla gerçek sağ tık gönderiliyor.
- Bakışın sunucuya işlenmesi için tıklamadan önce fizik tikleri kadar güvenli bekleme eklendi.

## 1.15.14 · Paket 72

- Düzeltme: **Spawner AFK** ekran adımı olmadan da çalışır; bot önce tek bir bakış paketiyle spawner'a döner, sunucunun bakışı işlemesi için bekler ve ardından yalnızca **tek** sürüme uyumlu `block_place` etkileşim paketi gönderir. Ek `lookAt`/kol sallama paketleri kaldırıldı; sağ tıklara en az 8 sn, turlara en az 10 sn koruma kondu.
- Yeni: **Spawner AFK** makrosu — MAKROLAR sayfasına eklendi; Auto Farm gibi dişli (ayarlar) ikonuyla açılıyor ve "nasıl çalışır" kartının yerinde duruyor. Komut yazmaz, bot yürümez: en yakın spawner'a döner, erişim mesafesi içindeyse üzerine sağ tık atar ve sunucunun açtığı ekranda seçtiğin karelere sırayla ve tekrar tekrar tıklar; her adımda açılan yeni ekran anında görülür.
- Düzeltme: Spawner AFK açılınca anında kick atılıyordu. Artık kafa aniden çevrilmez (kademeli ~5 küçük adım; hedef spawner'ın üst kısmı olduğu için ekran hafif yukarı kalkar — insansı), döndükten sonra 350–900 ms beklenir, sağ tık yalnızca sürüme uygun tek `block_place` paketiyle gider (bozuk ham paket denemesi yoktur), bot ile spawner arasında duvar varsa sağ tık atılmaz. Tur başına paket yükü düşürüldü (tekrar tıklama kaldırıldı).
- Düzeltme: Hesap oyundan çıkınca mesajlar ve loglar artık **10 saniye** daha görünür kalıyor, sonra temizleniyor.
- Düzen: MAKROLAR sayfası eski görünümüne döndü (Auto Farm kartı + açıklaması); "NASIL ÇALIŞIR" kartının yerinde Spawner AFK kartı var.

## 1.15.14 · Paket 80

- Düzeltme: Mod açıkken bağlanınca koruma çalışmıyordu; kapat-açınca çalışıyordu. Sebep: koruma yalnızca o hesap "hangi hesaplarda" listesinde ise başlıyordu. Artık anahtar **en az bir hesapta açıksa bağlı TÜM botlarda** devreye girer ("mod açık = koruma açık" davranışı). Hâlâ kapalıysa bağlantı anında sebebi loga yazar ("Spawner Protect kapali (anahtar hicbir hesapta secili degil)...") — yani hiçbir hesap seçili değilse anahtara basıp hesap/işaretleme yapmak gerekir.
- Düzeltme: "Mod açıkken yanına spawner koydum, yarıçapta olmama rağmen kırmıyordu" — kendi hesabın otomatik "dost" sayılıp korumayı **bastırıyordu**. Artık **kendi hesapların da korumayı tetikler**; yalnızca **Güvenilir Kişiler** yakındayken koruma devreye girmez. Botların birbirini tetiklemesini istemiyorsan onları güvenilir listesine ekle. **TEST butonu kaldırıldı** (gerek kalmadı — kendi hesabınla yanına gelmen yeterli).
- Düzeltme: Elmas kazmayla bile 7,5 sn kırılıyordu. Kazma **hotbar'da ise artık window-click'siz tek paketle** (`setQuickBarSlot`) kuşanılıyor — envanter→hotbar taşıma reddi riski ortadan kalktı. Kuşanma adı hatırlanıyor (`lastPickaxeOkName`), `heldItem` klavuzu gecikse de hız hesaplanıyor: elmas ~0,95 sn / elmas+Eff5 ~0,25 sn. Kırma deneme satırının `el:` kısmı kuşanılan kazmayı gösterir.
- Güvenlik: Kazma **hiç kuşanılamadıysa** hızlı status-2 oyunu oynanmaz — vanilla 7,5 sn (sunucunun kendi kazmasız süresi); kuşanamama sebebi logda yazar ve kalıcı çözüm olarak "kazmayı 1. hotbar slotuna koy" yönlendirmesi verir. Yaratıcı modda kırma yine ANINDA (150 ms).
- Sağlamlaştırma: tick() içindeki beklenmedik bir hata döngüyü ölü bırakamaz (armed=false'da takılı kalma) — "kapat-aç yapınca çalışıyor" durumu tekrar edemez. Spawner var ama tetiklenmezse 30 sn'de bir oyuncu listesi loglanır (trusted/oyuncu, entity, mesafe).

## 1.15.14 · Paket 79

- Düzeltme: Elmas kazmayla bile 7,5 sn kırılıyordu çünkü kazma kuşanılamadığında (veya `heldItem` gec guncellendiginde) süre hep "kazmasız 7,5 sn" hesaplanıyordu. Artık kazma **3 kez denenip kuşanılıyor** (çift doğrulama: `heldItem` + `inventory.heldItem`), süre kuşanılan kazmaya göre vanilla: taş ~3,75 sn / demir ~1,25 sn / elmas ~0,95 sn / elmas+Eff5 ~0,25 sn. 30 sn'lik beklemeler bitti (spawner başına vanilla kazmayla ~1–3 sn).
- Güvenlik: Kazma **gerçekten kuşanılamadıysa** hızlı status-2 oyunu OYNANMAZ — sunucu eli boş görüyorsa hızlı finiş "anında kırma" (gx01) imzası çeker; o durumda vanilla 7,5 sn kazmasız süre korunur (sunucunun kendi kırma süresi). Kuşanamama sebebi logda yazar (örn. "Kazma kusanilamadi (3 deneme)") ve kırma deneme satırının `el: ...` kısmında görünür.
- Düzeltme: Sertlik hesabı sürüm farkına dayanıklı — "diggingTime" ms (5000) ya da fonksiyon/NaN dönse de spawner sertliği 5 kabul ediliyor.

## 1.15.14 · Paket 78

- Düzeltme: Kırma süresi artık net ve loglanıyor. Bot bağlanınca gamemode'u yazar (survival/creative). **CREATIVE modda spawner ANINDA (150 ms) kırılır** — sunucu status-0'ı alır almaz bloğu kırar; tespit çok katmanlı yapıldı (`player.gamemode`, `game.gameMode`, `game.gameType` — sürüm/sunucu farkına dayanıklı). **SURVIVAL'da süre eldeki kazmaya göre vanilla**: kazmayla 0,25–3,75 sn, KAZMASIZ yine vanilla 7,5 sn (sunucu bunu dayatır; hızlı test için bota İpeksi Dokunuşlu kazma verin). "Kazma yok" uyarısı artık yalnızca survival'da çıkar ve yönlendirme içerir; kreatifte "kazma gerekmiyor" bilgisi basılır.
- Düzeltme: "Hiç kazmıyor" vakaları artık konsolda açıklanıyor — yarıçapta spawner var ama tetikleyici yoksa bot 30 sn'de bir "dost/trusted OLMAYAN oyuncu yaklaşmalı" notu basar (kendi hesapların dost sayılır). Kırma deneme logu da **mod + eldeki aleti** gösterir (ör. `mod: survival | el: bos el` → 7,5 sn'nin nedenini anında görürsün).
- Yeni: Spawner Protect panelinde **TEST butonu** — intruder beklemeden tek seferlik tarama + kırma. Yanına spawner koyup butona basınca bot hemen dener (güvenilir kişi yakında olsa bile). Sunucuya ek paket göndermez; yalnızca mevcut kırma döngüsünü başlatır.

## 1.15.14 · Paket 77

- Düzeltme: Bot artık duvar arkasından spawner KIRMIYOR. Mesafe yeterli olsa bile bot ile spawner arasında kati blok varsa (görüş / line-of-sight kontrolü) kırma başlamıyor; bot sağ/sol kayarak duvarın etrafından dolaşıyor. Kırmanın hemen öncesinde de son bir görüş kontrolü var (2+ duvarlı senaryolar için güvenlik katmanı; sunucu tarafından "hile" gibi görünmez).
- Düzeltme: Yürüme takibindeki "stuck" sayacı düzeltildi (konum nesnesi kopyalanıyor) — bot yaklaşsa bile ~6.6 sn sonra pes eden davranış bitti.
- Yeni: Algılama anında tetikleniyor — tarama aralığı 2 sn'den 0,5 sn'ye indirildi; yarıçapa birisi girer girmez kırma başlıyor.
- Yeni: "Spawnerlar bitince oyundan çık" anahtarı — açıkken TÜM spawnerlar kırılınca bot oyundan çıkıyor (manuel bağlantı kesme gibi davranır; otomatik yeniden bağlanma devreye girmez).
- Yeni: PANEL'de "Spam Mesajı Başlat" ve "Giriş Komutları" yerine **ENVANTER** ikon butonu (yazısız, sadece sandık ikonu) — seçili hesabın envanteri gerçek Minecraft düzeninde açılıyor (solda zırh + diğer el, ortada 9x3 ana envanter + sıcak bar; "ekran" paneli kalitesinde, başlıksız ve emoji'siz); Q = 1 tane düşür, Ctrl+Q = yığının tamamını düşür (Shift+Q ve sağ tık kaldırıldı).
- Düzeltme: "Güvenilir Kişiler" — isim eklenince/çıkınca liste ARTIK anında yeniden çiziliyor; "Henüz güvenilir kişi yok" mesajı kaldırıldı; giriş kutusu kısaltıldı ve "Ekle" butonu tamamen kaldırıldı (isim Enter'a basınca ekleniyor); "Ayarlar" ile "Güvenilir Kişiler" kartları ayrıldı (yan yana, diğer sayfalar gibi aralıklı); liste yumuşak animasyonla akıyor.
- Yeni: Mesafe kaydırıcısı yeniden tasarlandı — dolgu ayrı bir track üzerinde animasyonla akıyor (width geçişi), top büyütülüp parıltılı hale getirildi; pürüzsüz his artık gerçek.
- Temizlik: Uygulamadan fotoğraflardaki bilgi mesajları kaldırıldı — Spawner Protect sayfasındaki açıklama metni, MACROS sayfasındaki "Auto Farm" açıklaması ve "NASIL ÇALIŞIR" kartı tamamen silindi.
- Düzeltme (GENEL — kick koruması): Yüksek ping ya da yoğun paket altında sunucuların "packet flood / Timed out" kick'leri önlendi. Spawner koruması HİÇBİR zorlamalı "look" paketi göndermiyor (bakış paketleri artık vanilla gibi yalnızca gerçek değişimde gidiyor — birbirine giren look paketi yığını kaldırıldı); `block_dig` paketleri en az 250 ms arayla gidiyor; kol sallama (`arm_animation`) tekrarları global olarak en az 90 ms'de bir süzülüyor; Auto Farm'da gecikmesi 0 olan ardışık adımlar artık en az 450 ms arayla tıklıyor ve sunucu onay bekleme süresi 2,5 sn'ye çıkarıldı (yüksek pingde bekleyen onaylarla üst üste tıklamıyor); spawner taraması önbellekle yapılıyor (ağır `findBlocks` döngüsü ~%75 hafifledi).
- Teşhis: Giden paket hızı artık izleniyor — 120 pkt/sn'yi aşan sürekli yığılma tek seferlik uyarı logluyor (Ayrıntılar > Paket günlüğü ile doğrulanabilir).
- Düzeltme (GENEL — kick koruması, 77/2): NexoMC "gx01" tipi kick'lere karşı ikinci katman. ① `position`/`position_look`/`look` paketleri artık saniyede **en fazla 27** gidiyor (vanilla ~20): fizik motoru CPU yükünde "burst" yapıp paketleri yığdığında fazlası atılıyor — konum paketleri mutlak olduğu için güvenli, sunucu hep son konumu görüyor; bu, "normalden fazla hareket paketi" tespitini doğrudan yok ediyor (keep_alive/pong/aksiyon paketleri etkilenmez). ② Spawner kırma artık **ilk denemede tamamen vanilla**: modern protokolde istemci "status 2 (finish)" paketi göndermez — sunucu kazma süresi bitince blogu kendisi kırar. Daha önce status 2 gönderiliyordu; bu "anında kırma" imzası anticheat'in gözüne batıyordu. Sunucu blok güncellemesi göndermezse SONRAKİ denemelerde status 2 devreye girer (kırma özelliği aynen çalışmaya devam eder). ③ Kazma beklerken fizik kapatılıyor → duran bot hiç konum paketi göndermiyor (paket yükü ve burst ihtimali düşüyor). ④ Sızan "status 2" zamanlayıcısı temizleniyor (başarılı kırmadan sonra boşta paket vurmayı durdurdu).
- Teşhis (77/2): Paket hızı uyarısı artık **tür dökümüyle** geliyor — 1 sn'de 90+ pakette "Dağılım: position_look:x arm_animation:y ..." şeklinde hangi paketin yığıldığı görülür (15 sn'de en fazla bir kez).
- Düzeltme (77/3 — asıl kick sebebi): NexoMC "Hızlı blok koyma/kırma" + "An internal error" kick'lerinin kök nedeni bulundu: fizik kapalıyken bot **geçici olarak açılıp yürümeye çalışıyor, yürüyemeyip sıkışıyor (10 sn), sonra 4.2 blok mesafeden kazma gönderiyordu.** Anticheat bunu "uzaktan/imkansız kırma" olarak işaretliyordu. Artık: ① fizik **hiçbir zaman geçici olarak açılmıyor** — kapalıysa bot yürümez, sadece **dokunma mesafesindeki spawner'ları kırar** (uzak olanlar atlanır); ② kazma mesafesi tüm yollarda **en fazla 3.5 blok** (vanilla ~4.5 ama bayrak yememek için 3.5; sıkışma fallback'i 4.2 → 3.5); ③ kazma beklerken fizik kapatma kaldırıldı (gerçek oyuncu kazarken konum paketi gönderir; patlamalar zaten global tavanla dengeleniyor); ④ vanilla ilk denemenin bekleme süresi uzatıldı — sunucu doğal kırma süresini tamamlamadan force-finish'e geçilmiyor.
- Not (77/3): Sohbette görülen "Görünüşe bakılırsa Chicken Client kullanmıyorsun..." mesajı ve `acknowledge_player_digging` paketi normaldir — sunucunun botları gözlemlediğini gösterir; kick artık yukarıdaki uzak-mesafe kazmasından kaynaklanmıyor olmalı.
- Düzeltme (77/4 — "spam + hiçbir şey yapmıyor" sorunu): Fizik kapalıyken bot hiç yürüyemeyince spawner hep 3,5 blok dışında kalıyor, koruma her ~2,5 sn'de bir tetiklenip aynı mesajları basıyor ve hiçbir şey kırılamıyordu. Artık: ① **sınırlı yürüme geri geldi** — fizik kapalıysa kırma boyunca geçici olarak açılır, bitince eski haline döner; yürüme **spawner başına en fazla 8 sn** sürer (77/2'deki "10 sn sıkışıp 4,2 bloktan kazma" bayrağı imkânsız: mesafe hâlâ 3,5'te, görüş kontrolü duruyor, süre dolunca kazma gönderilmez); ② **spam korumaları** — tetiklenme uyarısı 15 sn'de bir, "atlandı" ve "tamam" logları 30 sn'de bir, fizik aç/kapa uyarısı 60 sn'de bir yazılır; ③ bu turda hiçbir spawner kırılamadıysa yeniden tetiklenme 2 sn yerine **10 sn** sonra olur (intruder oradaysa koruma çalışmaya devam eder ama konsol su baskınına uğramaz); ④ goNear artık zaman bütçeli ve kuyruk tavan dönüşü 4,2 → 3,5.
- Not (77/4): 105 pkt/sn uyarısındaki "Dağılım: pong:63 teleport_confirm:14 ..." **sunucu kaynaklıdır** — tpa ışınlanması sırasında sunucunun yolladığı ping'lere ve teleport onaylarına verilen cevaplardır, istemcinin özellikleri değil. Bu yüzden gereksiz uyarı eşiği 90 → 140 pkt/sn'ye çıkarıldı (gerçek yığılmalar yine yakalanır, tpa sonrası yanlış alarm vermez).
- Düzeltme (77/5 — kök neden): 77/4 canlı testinde bot **hiç kazma göndermeden** (sadece sınırlı yürüme + atlama) gx01 kick'i aldı. Böylece gerçek suçlu kesinleşti: saatlerce hareketsiz duran bir botun **fizik açılıp kapatılması** ("don → hareket" imzası) — NexoMC bunu ~30 sn içinde yakalıyor. Artık: ① fizik **hiçbir zaman geçici açılmıyor**; ② fizik kapalıysa bot **hiç yürümüyor** — yalnızca el erişimindeki (3,5 blok, görüş açık) spawner'ları kırıyor, uzaklar sessizce atlanıyor; ③ fizik **kullanıcı tarafından açıksa** bot gerçek oyuncu gibi yürüyüp kırıyor (geçiş yok, sürekli hareket — güvenli); ④ "ulaşılamayan" spawner 120 sn boyunca tekrar denenmiyor → 77/4'teki ardisik burst-yürüme döngüsü de ortadan kalktı (iki tetik arasında bot artık hareketsiz).
- Not (77/5): Uzak spawner kırma artık **Bot Physics açıkken** çalışır (Ayarlar'dan açılır) — fizik kapalıyken bot yürüyemediği için yalnızca yanındaki spawner'ları kırabilir. Bu, hile bayrağı yemeyen tek güvenli davranıştır: hareketsiz duran bot teste kadar kick almamıştı (77/3, 2+ dakika temiz).
- Düzeltme (77/6 — "spawnere bakıp hiçbir şey yapmıyor"): Bu davranışın nedeni fizik kapalıyken botun yürüyememesidir; güvenli tek yol korundu — bot yürümez ama **el erişimindeki (3,5 blok, görüş açık) spawner'ları kırıyor**. Karakter spawner farmının üzerinde/yanındaysa intruder gelince grup yerinde kırılır; uzak spawnerlar için **Ayarlar > Bot Physics** açık olmalı (o zaman bot gerçek oyuncu gibi yürüyüp kırıyor — fizik açılıp kapatılmıyor, kick yok).
- Düzeltme (77/6 — paket hijyeni): Koruma yürüyüşünde **sprint kaldırıldı** — sprint hem ekstra `entity_action` paketleri gönderiyordu hem de davranışı "scriptli" gösteriyordu; artık normal yürüme hızı kullanılıyor (kısa mesafeler için fazlasıyla yeterli). Konum/bakış paketleri zaten saniyede en fazla 27 (77/2'den beri), `block_dig` en az 250 ms arayla.
- Not (77/6): Sunucuya "aniden aşırı paket yükleme" istemciden gelmiyor — ölçtük: tpa sırasındaki 105 pkt/sn'nin 63'ü `pong` (sunucunun kendi ping'lerine verilen cevap), kalanı teleport onaylarıydı. Sunucu botu izlediğinde ping yağdırıyor; istemci özellikleri tetiklendiğinde ek paket ~5-20 arası.
- Düzeltme (77/7): **Creative'te spawner kırma artık anında** (vanilla creative davranışı). Oyuncu gamemode'u creative ise kazma süresi 150 ms'e iniyor — önceden el boşken formül 7,5 sn veriyordu (survival'da doğru, creative'te yanlıştı). Survival formülü aynen vanilla: kazmayla taş ~3,75 sn / demir ~1,25 sn / elmas ~0,95 sn / elmas+Eff5 ~0,25 sn; kazmasız 7,5 sn (vanilla eli-boş süresi).
- Düzeltme (77/7): Erişim mesafesindeki spawner artık "vazgeçme" kuyruğuna takılıp hiç kırılmaz kalmıyor — 120 sn'lik atlama yalnızca **yürüme gerektiren uzak** spawnerlar için geçerli; botun elinin eriştiği her spawner her zaman kırılır.
- Not (77/7): "Hiç kazmıyor" durumu çoğunlukla **tetikleyici** yüzünden: koruma yalnızca **dost/trusted OLMAYAN** bir oyuncu yaklaşınca ateşlenir; istemcinin kendi hesapları "dost" sayılıp hariç tutulur. Test için hesap listesinde **olmayan** bir oyuncu spawner'ın yanına gelmeli (ya da trusted'a eklenmemiş bir hesap).

## 1.15.14

- Yeni özellik: **Spawner Protect**. BAĞLANTI sayfasının sağ tarafındaki ayarlar listesine eklendi; tıklayınca hangi hesaplarda çalışacağı seçilir (mor = bazı hesaplar, sarı = tüm hesaplar).
- Seçilen AFK hesabın `X` blok (varsayılan 70, 0-70 arası ayarlanabilir) yakınına bu istemcinin hesapları dışında bir oyuncu gelirse, bot envanterindeki en iyi İpeksi Dokunuşlu kazmayı (netherite > elmas > altın > demir...) kuşanır, Shift'i basılı tutar ve 20 blok yarıçapındaki bütün spawnerları bitene kadar kırar.
- Spawner ulaşamayınca bot spawnerın yanına yürür; önünde engel varsa zıplar; spawnerlar bitene kadar devam eder.
- SMP sunucularının "stacklenmiş spawner" sistemleri için tasarlandı (Shift + kırma = 64'lü gurup).
- Düzeltme: "Bot Physics" kapalıyken bot yürümüyordu; Spawner Protect çalışırken fiziği geçici olarak açıp bitince eski haline döndürüyor.
- Düzeltme: Elde spawner kazabilecek kazma yoksa kırma anında başarısız oluyordu (1-2 sn eğilip bırakma belirtisi); artık kazma kuşanılıp doğrulanmadan kırma denenmiyor, kazma yoksa uyarı loglanıyor.
- Düzeltme: Kırma işlemine zaman aşımı koruması eklendi (sunucu blok güncellemesi göndermezse bot sonsuza dek beklemeyecek).
- Teşhis: "Bot Physics" kapalıyken kırma boyunca geçici açılıp bitince kapatıldığı loga yazılıyor; kazma bulunamayınca elindeki/envanterindeki eşyaların özeti loglanıyor.
- Düzeltme: Yürüme yeniden yazıldı — sürekli zıplama kaldırıldı; zıplama yalnızca önünde gerçek engel varken yapılıyor ve zıplama kuyruğu (jumpQueued) her bırakışta temizleniyor. Bot artık havada takılıp 2-3 saniye süzülmüyor / durmadan zıplamıyor.
- Düzeltme: Kırma işi bitince "Bot Physics" kapatılmadan önce botun yere inmesi bekleniyor (havadayken fizik kapanınca donma önlendi).
- Teşhis: Kazma kuşanıldığında ve her spawner için kırma denemesi başladığında log eklendi.
- Düzeltme: Envanterde kazma olmasa bile bot artık spawner'ı kırıyor — kazma aranıyor, bulunamazsa spawner "ham paket" ile kesilip **yok ediliyor** (eğilerek; İpeksi Dokunuşlu kazma koyarsan spawner düşer).
- Düzeltme: Bot spawner'a çok yaklaşıp da tam varamazsa (engelde takılırsa) yine de kırma denemesi yapılıyor.
- Düzeltme: Kazmasız kırma artık vanilla'ya birebir ve tek hamlede — botun baktığı yüz hesaplanıp o yüze bakılıyor, kırma boyunca sürekli kol sallanıyor (sol tık basılı tutar gibi), 4-5 saniyelik boş bekleme kaldırıldı (blok güncellemesi gelmezse hızlıca yeniden deneniyor). Kazma yoksa süre vanilla barehand = ~7.5 sn; kazma koyarsan bot.dig ile 1-2,5 sn'ye iner.
- Teşhis: İş başında tespit edilen spawner sayısı loglanıyor.
- Düzeltme: Yol çizme — bot artık 2 blokluk duvara ZIPLAMIYOR; sağ/sol kayarak etrafından dolaşıyor (duvar takibi). 1 blokluk engeli hâlâ zıplıyor. Duvarın arkasından kırıp "hile gibi" görünmüyor.
- Yeni: Algılama mesafesi artık kaydırıcı (slider) — 1 ile 50 blok arası, sağa/sola çekerek ayarlanır (eskiden 0-70 yazıyla giriliyordu).
- Yeni: "Güvenilir Kişiler" listesi — kaydedilen isimlerden biri bot hesabının yakınına gelirse Spawner koruması AKTİVE OLMAZ (kazma boşa harcanmaz).
- Düzeltme (paket 75): Kırma süresi artık VANILLA formülle hesaplanıyor — botun eldeki aletine göre (alet hızı + Verimlilik²). Eff5 elmas kazmayla ~0.25 sn'ye iner, tıpkı gerçek oyuncu gibi; sunucuya "zaman oynanmış" sinyali gitmez. (Mineflayer'in digTime() spawner'da hep Infinity dönmesi nedeniyle hep 7.5 sn kırıyordu.)
- Düzeltme (paket 75): Spawner sen ya da başkası tarafından kırıldıysa bot artık BOŞLUĞU KAZMAZ; her kırma denemesinin başında blok tekrar kontrol edilir, spawner kalmadıysa hemen bırakır.

## 1.15.13

- Canlı sohbet ve kayıtlar uzun mesajlardan sonra en alta kaydırmayı bırakmıyor (pencere gizliyken kaydırma donması düzeltildi).
- "Başlangıçta açılsın" ayarı: dişli kaldırıldı, açıp/kapatınca hesap seçme ekranı açılıyor; yanında diğer ayarlar gibi hesap sayacı görünüyor (mor = bazı hesaplar, sarı = tüm hesaplar).
- Ekran bildirimlerinde sol menüdeki PANEL sekmesine de animasyonlu "!" geliyor.
- Bilgi penceresinin üst satırı hafifçe aşağı alındı.
- Otomatik kaydırma ayarları kaldırıldı; yukarı kaydırdığınızda yeni mesajlar ekranı indirmiyor.
- Sayfa değiştirince Kayıtlar, Sohbet ve canlı sohbet en son mesaja kayıyor.

## 1.15.12

- ESC tuşundaki eski güncelleme penceresi çağrısı kaldırıldı.
- Küçültme normal Windows görev çubuğu davranışına döndürüldü.
- Yalnızca X ile kapatma uygulamayı arka plana gönderir.

Önceki ayrıntılı sürüm notları için [HISTORY.md](HISTORY.md) dosyasına bakın.
