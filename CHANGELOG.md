# Değişiklik Günlüğü

## 1.15.19 · Paket 132 · İsteğe bağlı Otomatik geç

- Dört kontrol düğmesinin altına varsayılan kapalı, hesap bazlı “Otomatik geç” kutusu. Preload/IPC boolean doğrulaması ve etkin işte canlı açma/kapama.
- Katı bloklarda yalnızca server_corrections sonrası mevcut cooldown, bitmiş worker, 500 ms durağan gerçek konum ve yüklü tam ayak/gövde koşullarıyla sınırlı Resume. Gerçek doluluk tekrar taranır, hedef boşken koyulmuş/skipped sayılmaz.
- 60 saniyede bir otomatik Resume; tekrar eden düzeltmede durma. Yeni sunucu forcedMove, kullanıcı iptali, dünya/bağlantı değişimi ve pencere açılışı iptal eder; 10 saniyede durulamama timeout. Toggle limit geçmişini silmez; Start da 60 saniyelik geçmişi temizlemez.
- Teleport/paket/izin/ret/diğer hatalar ve Nether Wart kapsam dışı. Paket/hız limitleri, native ACK, konum eşikleri, üçlü düzen/son manuel hücre ve 131 yana geçişi değişmez. 14–17 CPS veya sınırsız retry yok.
- Sunucu geri itmesinin kök nedeni çözüldüğü iddia edilmez; ban garantisi, canlı sunucu/hesap testi ve Windows EXE derlemesi yok.

## 1.15.19 · Paket 131 · Komşu sütuna sınırlı native geçiş

- Normal katı blok bantlarında aynı seviye ve yaklaşık bir blok mesafedeki komşu çalışma duruşuna, koridor uygunsa tek native yürüyüş/frenleme denetleyicisi. Bu kısa geçişte pathfinder grid-goal + sonradan ince hizalama devri kullanılmaz. Üç hücre geri çekilme/uzun yaklaşma/terminal bant mevcut yoldadır.
- 25 örnek noktada yüklü gerçek gövde ve tam ayak desteği ön kontrolü; her fizik adımında gerçek durum ve doğal frenleme tahmini. Seviye farkı, bilinmeyen zemin, engel ve uzun geçiş bu yönteme alınmaz. Başladıktan sonraki hata duraklatır, gizli tekrar yoktur. Hareket özelliği sıfırsa durulur.
- Konum/hız/paket elle yazımı, hız veya paket bütçesi artışı ve koruma eşik değişikliği yok. Sunucu düzeltmesinde durma, izin/ilk ret/timeout, manuel son blok ve 130 devam/durdurma davranışı korunur. Nether Wart değişmez.
- Sunucu geri itmesinin kontrol adı/nedeni doğrulanamadı; bu, o yana geçiş için yerel yöntem değişikliğidir. Ban veya canlı sunucu çözümü garantisi değildir. Canlı hesap/sunucu testi ve Windows EXE derlemesi yok.

## 1.15.19 · Paket 130 · Doğal durdurma ve gerçek doluluktan devam

- Yerelde yeniden üretilen kusur: savedPhysics=false iken hareketli Durdur, kalan native hızı fizik OFF ile donduruyordu. Katı blok modunda tuşlar hemen bırakılır; doğal frenleme tamamlanınca fizik/surface shim geri alınır. Bu sırada yeni iş bekler. Dünya/bağlantı değişimi temizlenir; 1,5 s timeout'ta hareket dondurmak yerine fizik açık bırakılır, uyarı yazılır. Konum/velocity/paket yazımı yok.
- Katı blok işinin her launch'ında durulma ve salt okunur ilk boş hücre uzlaştırması. Pause sonrası gerçek geç ACK/dış doluluk atlanır; kaldırılmış önceki hücre kaçırılmaz.
- Aynı bot/dünya/alan/blok için bellekte köşe/yön ve gerçek son gönderim zamanı kaydı. Durdur/Başlat yönü korur; yeni iş sayacı mevcut doluluğu skipped olarak okur. Bot/dünya/alan/blok değişiminde kayıt reddedilir. Kalıcı disk kaydı değildir.
- Kayıtsız seçimde eski dolu köşenin duruşu yerine gerçek ilk boş hedef değerlendirilir; en uzun dolu önek ve çalışma duruşu yakınlığıyla seçim. Bilinmeyen chunk boş sayılmaz.
- Konum/paket cooldown Başlat'ta da korunur. Sunucu konum düzeltmesi guard'ı veya izin/ret/timeout korumaları kaldırılmadı. Fotoğrafın tek başına köşe hipotezini veya bütün düzeltmelerin sebebini kanıtlamadığı açıkça ayrılır.
- 129 üçlü/terminal/manual son hücre, Nether Wart, client tick ve paket sınırları korunur. Semver 1.15.19 sabit, paket/başlatıcılar 130. Canlı hesap/sunucu testi ve Windows EXE derlemesi yok.

## 1.15.19 · Paket 129 · Katı bloklarda sabit köşe/üçlü şerit

- Arayüz katı bloklarda açık `solidPattern` modu gönderir; çarpışmasız Nether Wart/bitkiler hariç. Eski düşük seviyeli API/regresyon yolu ayrı korunur.
- Dayanaklı/yüklü köşe ve yön bir kez seçilir; sabit çalışma duruşundan uzaktan yakına üç blok, bir sütun yana, bant sonunda üç hücre geri. Uzun seed hattı, rastgele geometri denemesi ve otomatik kurtarma/kapatma kullanılmaz.
- Terminal bantta açık sırada ilerleme ve gerektiğinde tekli yerleştirme; tüm işin son hücresi kullanıcıya elle bırakılır. UI reason/XYZ/manualRemaining ve gerçek doluluk sayacı; eksik hücre koyulmuş veya skipped sayılmaz.
- Yeni modda yerleştirme sonrası duruş/tam ayak desteği/doğal frenleme ve sonraki sabit duruş kanıtları kullanılır; alan dışına zorunlu çıkış yerine kullanıcı isteğine uygun açık hücrede teslim vardır. Çatıya çıkma, bilinmeyen zemin ve gövdeye blok koyma yasakları sürer.
- Native yürüyüşle hassas duruş ve öngörülü doğal frenleme. Konum/velocity yazımı, sprint, hız/fizik/packet limiti artırımı yok.
- Okunan gerçek blok durumlarından sınırlı dünya kanıtı; uzak veya aynı durum güncellemeleri gereksiz world_changed_at_target oluşturmaz. İlgili değişiklik/kanıt sınırı gönderimi reddeder.
- İzin/ilk ret/timeout/konum/paket duruşları, envanter yenileme ve modern tick-sonu korunur. Canlı hesap/sunucu kullanılmadı; ban garantisi ve Windows EXE derlemesi yok. Semver 1.15.19, paket/başlatıcılar 129.

## 1.15.19 · Paket 128 · Sınırlı restock ve son üçlü duruşu

- Yerleştirme gönderilmeden önce inventory_changed oluşursa, envanterde seçili malzeme kaldığı sürece native equip ile en fazla iki ek hazırlık denemesi; bakış/dünya/kaçış/continuation baştan doğrulanır. Geometri yürüyüşü tekrarlanmaz. Sunucu reddi/timeout/izin/konum/paket duruşlarına otomatik Resume uygulanmaz.
- Terminal crop bandı yakın uçtan çalışır; gerçek ruh kumu üst yüzündeki .38 m derinlik ofsetli tıklama, yakın hücreyi de aynı yönde tutar. Dünya-aligned sıra, yüklü zemin, görünür yüz ve sent-angle kontrolleri korunur.
- Normal şerit duruşu başarısız ve hedef altı değişmemiş, sunucu onaylı kendi bloksa aynı hedef için genel fiziksel duruş alternatifi; çatı üstüne çıkma veya açık kurtarma geçidine dönüş yok. Final escape/continuation hâlâ zorunlu.
- Komut tamamlandığında gövde içerideyse tek güncel çıkış yeniden planlaması; gerçek outside kanıtı olmadan kapanış yok. Tam geometri/bağlantı garantisi verilmez.
- Yeni birim ve loopback protokol regresyonları. Canlı hesap/sunucu, Windows EXE/GUI denenmedi. Semver 1.15.19 sabit, paket ve numaralı başlatıcılar 128.

## 1.15.19 · Paket 127 · Modern native tick yaşam döngüsü

- Sabit Mineflayer 4.39.0 fizik koduna bellekte begin/end kancaları; destekleyen protokollerde her yüklü play-state native tick sonunda tam bir tick_end. Bağımlılık dosyası, fizik değerleri ve timer değiştirilmez. Beklenmeyen bağımlılık kodunda bağlantı uyumluluk hatasıyla durur.
- Modern hareketler tek bekleyen en güncel konumda birleştirilir ve native tick sonunda boşaltılır. Hareket ile tick_end arasına normal eylem sokulmaz. 50 ms asgari hareket aralığı ve zorunlu native sunucu yanıtları korunur.
- Desteklemeyen sürümlerde tick_end yoktur. Modern sürümlerde gerekli ek bildirim yaklaşık 20 paket/sn olabilir; tanılamada sunucu yanıtından ayrılır. Yerleştirme hızı/oyun eylemi limitleri yükseltilmez.
- 126 eksik tick-sonu dar sıra kontrolünde yeniden üretildi; yerel regresyonlar eklendi. Bu, canlı sunucudaki bütün ban nedenlerinin çözüldüğünü veya anti-cheat onayını göstermez. Canlı hesap/sunucu testi ve Windows EXE derlemesi yapılmadı.
- Önceki izin, malzeme, konum, ilk ret duruşları korunur. Paket/başlatıcı/EXE çıktı adları 127; semver 1.15.19 sabit.

## 1.15.19 · Paket 126 · Açık ada izin reddi

- Yerleştirme sırasında açık sistem izin reddi permission_denied ile duraklatır; oyuncu sohbeti/ilgisiz bildirimler dışlanır. İzinleri değiştirme veya aşma yok.
- Genel hata yerine hesap için Blok Koyabilme izni gerektiğini gösteren TR/EN açıklama. Native açık placement reddi server_refused olarak timeout'tan ayrıldı.
- Önceki korumalar ve packet/hız sınırları korunur. Yeni Windows EXE derlenmez; yerel testler canlı sunucu kabul/ban garantisi değildir.

## 1.15.19 · Paket 125 · Malzeme kaybı ve fail-stop

- Asenkron kapılardan sonra toplam malzeme ve gerçek eldeki eşya tekrar kontrol edilir. materials/inventory_changed geometri yeniden denemesi sayılmaz.
- İlk belirgin konum düzeltmesi duraklatır. Sınıflandırma eşikleri ve zorunlu native sunucu yanıtları korunur.
- İlk yerleştirme reddi/yanıt hatası otomatik tekrar edilmez. Ekim modunda sprint kapalı; doğal fizik/hız ve packet bütçeleri aynı.
- Kullanıcının logu banın hangi kontrol tarafından verildiğini göstermiyordu. Bu değişiklikler ban nedenini çözdüğü veya banı önlediği iddiası değildir. Canlı sunucu/hesap kullanılmaz.

## 1.15.19 · Paket 124 · Gerçek dar geçit, kaçış ve güvenli tempo

- Normal şerit rotası yoksa aynı güvenli duruşa gerçek yüklü boşluklardan tek alternatif rota; sonraki sıra kanıtında da aynı dar geçit desteği. Çatı/dig/scaffold/hazard/unknown ve katman/duruş kuralları korunur.
- Kendi bloğu henüz yokken de mevcut çıkıştan native geri çekilme; row_route_blocked için sınırlı yeniden konumlanma ve sonraki taramada yeniden deneme. Başkasının blokları kurtarma amacıyla kazılmaz.
- Gereksiz pre-equip kaçış araması kaldırıldı; final kaçış ve devam kanıtı korunur. Dünya revizyonu arama sırasında değişirse yerleştirme gönderilmez. Zaten erişilmiş sonraki duruşta gerçek şekil/ayak desteği ve native frenleme kanıtı kullanılır.
- 275 ms pacing ve tüm PacketBudget/MotionPacer/konum/ACK korumaları aynı. Sabit yüksek hız veya ban/kick garantisi verilmez; canlı oyun sunucusunda test yapılmadı.
- ZIP, başlatıcılar, tanılama dosyası, paket notları, build-info ve EXE çıktı adları 124 oldu. Semver 1.15.19 ve bağımlılık sürümleri değişmedi.

## 1.15.19 · Paket 123 · Blok koyma temposu ve yan sıra geçişi

- Katı bloklarda kısa native açı hizalaması ve güvenli A/D geçişi; dolu yakın/uzak hücreler sonrası aynı şeritte yan geçiş uygunluğu. Boş/bilinmeyen/tamir hücreleri atlanmaz, Y/bant sırası korunur.
- Düz katı blok sıralarında gerçek yüzün yatay cursor noktası karaktere yakın ve kenar payıyla seçilir; native raycast/shape/reach/sent-angle/ACK kontrolleri korunur. Gereksiz kafa dönüşleri azaltıldı.
- İlk 3 / her 20 ACK için teknik aşama süreleri; A/D sırasında gerçek sıfır hız bildirimi tuşları bırakıp durdurur. Fizik/server speed/275ms pacing ve koruma eşikleri değişmedi.
- 334 sıra/cursor ve 21 native A/D kontrolü; dört 26.1 tempo fixture'ı ve önceki native inşa/ekim/kurtarma/edge/rollback/lock testleri. Yerel testlerdir, canlı sunucu hız/ban/kick garantisi yoktur. Semver v1.15.19 sabit, paket 123.

## 1.15.19 · Paket 122 · Doğru modern attribute kimlikleri

- 26.1'in eski mapper'ı ID20 mining_efficiency=0 değerini generic.movement_speed diye okuyordu; doğru hareket ID22'dir. Doğrulanmış 775/769 tabloları için dar inbound attribute çözümü, paket/count/string/op/finite değer sınırları ve diğer packet/state'e dokunmama eklendi. Bağımlılık/global serializer dosyaları değiştirilmez.
- Gerçek etkin hız=0 yürüyüşü movement_disabled ile erken durdurur; base=0 ve pozitif modifier hesaplanır. Server speed/values zorlanmaz, gerçek kilit bypass edilmez. speedEffective teşhisi ve iki dilli açık uyarı eklendi.
- Eski numeric-ID kusuru yeniden üretildi. 20 wire-packet vakası; dört numeric-ID 49 hücre bahçe, iki gerçek sıfır/serbest bırakma/yeniden kilit native fixture'ı. Mevcut inşa/koruma/ruh kumu testleri korundu; v1.15.19 sabit, paket 122.

## 1.15.19 · Paket 121 · Nether Wart üçlü ekim ve server speed

- CropRows: sabit hafızalı üç-derin şerit planı, ortak ruh kumu duruşu, bitişik A/D, son kısa bantlarda gerçek bahçe üzerinde kalma. Bitkilerde katı blok seed/çıkış kanıtı uygulanmaz; yüklü gövde/zemin/raycast/ACK kontrolleri korunur.
- Modern generic.movement_speed → minecraft:movement_speed fizik eşlemesi; server base/modifiers korunur, minecraft:sprinting native tek sprint hesabına uyarlanır, simülasyon canlı attributes nesnesini değiştirmez. Eski kodda hızın atlandığı bağımsız testle yeniden üretildi.
- Üçlü yan adım öncesi küçük yön sapması pitch korunarak native bakışla düzeltilir; A/D anında kamera sabittir. Koruma ve pacing eşikleri değişmedi.
- 21 crop planı, 24 server speed referans izi; 1.21.4/26.1 gerçek attribute/iş sırasında hız değişimi ve dört 49 hücre bahçe protokol testi. Canlı sunucudaki tek neden veya ban/kick garantisi değildir. v1.15.19, paket 121.

## 1.15.19 · Paket 120 · Skyblock sınırı ve doğal yan sıra

- Unloaded-block sentinel için konum erişimi korundu; bilinmeyen zemin yol olamaz.
- Zaten dışarıda bulunan güvenli yüklü duruş, planlanan blok dünyasında gövde/dört ayak köşesi/native frenleme doğrulanarak escape proof sayılır; gereksiz 1.5m kenar gezisi kaldırıldı. Sonraki sıra, içerideki duruş veya bilinmeyen hedef bypass edilmez.
- Bitişik üçlü sıralarda düz doğrulanmış koridorda kamera dönmeden native A/D. Her tick ve frenleme tahmini; engel/uygunsuz açı/bant değişiminde normal rota. Sınırlı mesafe, iptal ve yüklü-dünya kontrolü.
- Sınır/yan-adım testleri ve üç sürümde gerçek tek-chunk X/Z son çizgi fixture'ları; sürüm v1.15.19, paket 120. Koruma eşikleri/tempo/tuş bildirimi ve native fizik korundu.

## 1.15.19 · Paket 119 · Gerçek input ve gönderilmiş dönüş tutarlılığı

- Modern player_input gerçek yedi native kontrol bitini eksiksiz bildirir; aynı durum tekrar gönderilmez, legacy vehicle/input biçimi korunur. Listener yaşam döngüsü ve son released-input bildirimi eklendi.
- Yol takipçisi ileri/yan/jump/sprint çağrılarını gönderilmiş bakış istenen yöne dönene kadar bekletir; queued jump oluşmadan kontrol edilir. Physics/velocity/konum elle değiştirilmez.
- İki eski kusur ayrı ayrı yeniden üretildi. Native yürüyüş/escape protokol testi tuşları gerçek fizik-frame girdileriyle ve gönderilen bakışla karşılaştırır.
- Koruma eşikleri, zorunlu yanıtlar, 26.1 zemin/duruş ve inşa planı korunur. Günlükte sentForward/turnErrorDeg; sürüm v1.15.19, paket 119.

## 1.15.19 · Paket 118 · 26.1 yavaş zemin uyumluluğu

- Ruh kumu/bal telafisi, pinned kütüphanenin velocityBlocksOnTop tablosunda olmayan 26.1'i de kapsar. 1.20'nin native yavaşlamasıyla çift uygulanmaz; normal zemine veya Y hareketine dokunulmaz.
- Paket 117 doğal duruşu ve tüm paket/konum koruma eşikleri aynıdır; zorunlu sunucu yanıtları korunur.
- 26.1 native yerel inşa/koruma testleri, 49 blok yüksek katman fixture'ı ve eski pakette hatayı yakalayan yüzey referans-izi testi eklendi.
- v1.15.19 değişmedi, paket/başlatıcı adı 118. Canlı sunucu veya ban/kick garantisi yok.

## 1.15.19 · Paket 117 · Doğal duruş, konum düzeltmesi teşhisi

- Pinned pathfinder fullStop() artık doğrudan X/Z recenter veya velocity sıfırlama yapmaz. Tuşlar bırakılır; doğal fizik frenler. Son yaklaşım 0.10 toleransla gerçek yürüyüş kullanır; bu tolerans path başlangıç ve takip kontrolünde tutarlıdır.
- Dar bellek-içi uyumluluk katmanı node_modules'ı değiştirmez; beklenmeyen sürüm/kaynakta güvenli biçimde başlamaz.
- Konum/paket guard eşikleri ve zorunlu sunucu yanıtları değiştirilmedi. İnşa aralığı, ACK/raycast/envanter/kaçış kontrolleri korundu.
- Gizli veri içermeyen konum teşhisine XYZ farkları, ileri/zıplama girdisi ve protokol sürümü eklendi. Doğrudan konum/hız yazmama regresyonu ve gizlilik testi eklendi.
- Canlı sunucu sorununun tek nedenini veya anti-cheat kabulünü garanti etmez. Yerel test kapsamı PAKET-117-NOTLAR.txt içinde.

## 1.15.19 · Paket 116 · Kontrollü pacing ve gerçek sonraki hücre

- Sabit post-ACK 400 ms uyku yerine gerçek gönderime göre en az 275 ms aralık. ACK/yürüme/native bakış süresi bu aralığa dâhil. Actual send event'i zamanı günceller; standalone istemci için ihtiyatlı deneme timestamp'i vardır. Gap iptal edilebilir ve final dünya/bakış/kaçış kapılarından önce yapılır; guard eşikleri veya mandatory yanıtlar değişmedi.
- Continuation normal run gibi dolu hücreleri/onarım kayıtlarını atlar. Seed hattında dolu ara hücreler atlanır. Son boş hücre hayali bir sonraki duruş yerine gerçek predictive escape proof gerektirir. 2 ms tarama/yield sonrası eski escape proof yeniden kullanılmaz; bilinmeyen chunk başarısızdır. Final duruş/envanter/raycast tekrar kontrol edilir.
- Açık 2×10 arka alan + tek eksik blok fixture'ı: 115 önceden dolu sonraki bandın nominal zeminsiz hattını zorlayıp row_route_blocked verdi. 116 iki sürümde tek boşluğu 1 ACK ile doldurdu, 71 dolu hücreyi korudu; kazma yok. Benzer yerel vakadır, kullanıcının gerçek takılmasının kesin nedeni diye sunulmaz.
- 259 birim/regresyon, 36 uygulama JS. İki sürümde 20 native inşa + 8 konum cevabı + 4 yüksek şerit + 2 son boş blok geçti. Actual send gap >=275 ms; ret/geç ACK/eksik ACK, doğal engel atlama/soul/honey/travel testleri geçti. Renderer/ayarlar değişmedi; statik UI testleri verify kapsamında.
- 1.21.4 / 30×20 / tek Y / 600 hücre: 600 gönderim, 600 ACK, 0 ret, 18 envanter tıklaması, 0 onarım, local packet guard yok. Sunucu gözlemi tepe 26 paket/sn, 6/100 ms, hareket 3/100 ms. Yerel ölçüm; izinli hız/ban garantisi değil. Canlı AesirMC / Windows FPS testi yapılmadı.
- v1.15.19 değişmedi; paket/ZIP/BAT/EXE etiketleri 116. Paket bütçesi, mandatory response routing, movement watch/travel, renderer, hesap/tercih saklama ve dependency lock 115 ile değişmedi. Paketsiz inşa mümkün değil; sunucunun kurallarına uyun.

## 1.15.19 · Paket 115 · Hizalı şeritler ve açık çalışma koridoru

- Distal/nearest-frontier hedef seçimi yerine sabit dünya-ızgaralı, en fazla üç derin, uzaktan karaktere doğru şeritler. Bir çapraz eksen sabitken üç hücre; sonra yan sütun. Bandlar yan yönü değiştirir. Tail band 1/2 hücre olabilir; bütün hacim diziye çevrilmez. Başarısız görüş yüzünden hedef koordinatı/sıra kaydırılmaz.
- Yüksek ve desteksiz katmanda yakındaki yüklü 17×17 alanda dayanak seçimi; seçilen alan içinde tek düz seed hattı, ardından sabit şeritler. Çizgi bir hücre içeri kayıp basamaklı çerçeve yapmaz. Seed ortadaysa ilk band aynı kolondan iki yana doğrusal yayılır; sonraki band son kenardan başlar. Arama bounded; mevcut yapılar korunur.
- Çalışma duruşu açık banda ve ilgili şeride kısıtlanır. İç şeridin arkasına dolaşma/yeni çatıya çıkma engellenir. Eski banddan yeni banda önce geri çekilir. Mevcut engel için dış yan kenar istisnası vardır; alan dışındaki doğal tek blok transit zıplaması korunur. Çok dar/son bandda dış kenar gerekebilir; sürekli dolu hacim içinde kalma garantisi yoktur.
- Gerçek 0,875 ayak yüksekliği ve 1,8 boy ile shape-AABB baş boşluğu; öngörülen yeni blokla birlikte sonraki şerit duruşuna read-only native A* devam kontrolü. Doğrulanamıyorsa yerleştirmeden `row_route_blocked`. Voxel'e girilmesi tek başına varış sayılmaz; gerekli gerçek duruş/görünür açı hazır olmalı.
- Kendi-blok kaz/gerçek ACK/tam çıkış/dışarıdan kapat korunur. Kurtarma fixture'ında kapalı odanın iç konumu gerçek sunucu position paketiyle kurulur (client koordinatı elle atanmaz); kapatma için yalnızca sağ-X varsayımı yerine gerçek dışarıda olma ve her açık geçitle body çakışmaması test edilir. Özgün duvarlar ve final dolgu kontrolü korunur.
- 248 birim/regresyon, 36 uygulama JS; iki sürümde 20 tam native eski inşa, 8 native konum yanıtı, 4 yüksek şerit testi. Y83,875→85 / 72 hücre ve Y83→85 / 36 hücre, düz seed, şerit index sırası, gerçek wire duruşu ve sıfır kurtarma kazması doğrulandı. Yerel fizik/jump/soul/honey, native ret/geç ACK/eksik ACK, travel ve Chromium arayüz kontrolleri geçti.
- 1.21.4 / 30×20 / tek Y / 600 hücre: 600 gönderim, 600 sunucu onayı, 0 ret, 18 envanter tıklaması, 0 onarım, paket guard tetiklenmedi. Sunucu gözlemi tepe 23 paket/sn, 5/100 ms, hareket 3/100 ms. Yerel ölçüm; izinli hız/ban olmama garantisi değil. Canlı AesirMC / Windows FPS testi yapılmadı.
- Uygulama v1.15.19, paket/ZIP/BAT/EXE etiketleri 115. 114'ün konum yanıtı/paket ve ilerleme korumaları, AppData/hesaplar/sprint tercihleri değişmez.

## 1.15.19 · Paket 114 · Native konum yanıtı ve yürüyüş koruması

- İncelenen 113 günlüğünde paket watchdog alarmı veya bir hata yoktu. Görülen `peakSecond`/`peak100ms` bağlantı başından birikmiş tepelerdir; çoğunluk server-requested pong idi. Sık konum onayı sayısı tek başına geri çekme veya ban nedeni değildir. Canlı sunucu/kullanıcı hesabında test yapılmadı; ban olmama garantisi yoktur.
- Sunucu konum isteğinden önce eski bekleyen yürüyüş temizlenir. Native teleport onayı ve tam XYZ'li native konum yanıtı anında iletilir; otomasyon hareketi gibi birleştirilmez/engellenmez. İki protokolde relative XYZ flags native istemciyle eşleştirilir. Koordinat/velocity/tick hızı değiştirilmez; sahte onay yok.
- Gerçek yer değiştirmesi sıfır relative eşitleme/küçük ayardan ayrılır. 5 saniyede 3 adet >=0,25 blok düzeltme veya bir >=4 blok taşıma, yanıt sonrası inşayı duraklatır. Meşru sunucu taşımaları da duraklatabilir; eşikler sunucu anti-cheat eşikleri değildir.
- Yerel yürüyüş hedefinde 12 saniye anlamlı ilerleme yoksa `walk_stalled`; küçük ileri-geri hareket bekleyişi yenilemez. Meşru uzun sapmada ihtiyatlı duraklama mümkündür. Otomatik yürüyüş tekrarı yok; 3 saniye cooldown ve worker drain korunur. TR/EN gerekçeler eklendi.
- Canlı bilgi satırı gerçek son 1 saniye/100 ms sayaçları ve gerekli server yanıtları, diğer trafik, düzeltme ve durum/neden ayrımı gösterir. Kalıcı geçmiş tepe değerleri `peakScope=connection` olarak etiketlenir. Bounded teknik allowlist genişletildi; paket gövdesi/ID veya yeni kişisel alan kaydı yok. Dinleyiciler/kuyruklar kapanışta temizlenir.
- 222 birim/regresyon, 35 uygulama JS sözdizimi; 1.20.1/1.21.4'te 20 mevcut + 8 yeni tam native protokol senaryosu, yerel fizik/yerleştirme/koşu, 8 bağlantı senaryosu ve Chromium arayüz doğrulaması geçti. 480 ping/pong + relative marker/küçük ayar senaryolarında yanlış alarm yok; gerçek düzeltme/taşımada hem native onay hem native konum yanıtı doğrulandı.
- 1.21.4 yerel tam native istemci + sunucu: 30×20 / tek Y / 600 hücrenin tamamı doğrulandı; 600 gönderim, 600 gerçek sunucu onayı, 0 ret, 18 envanter tıklaması, 0 açık onarım. İnşa sırasında sunucu gözlemi tepe 24 paket/sn, 6 paket/100 ms, hareket 3/100 ms; paket koruması tetiklenmedi. Bu yerel ölçümler sunucu izinli hız veya ban olmama garantisi değildir. İlk 114 denemesi inşa sonunda 600'e ulaştı; testin bütün denemeleri onay gibi sayan `601 == 600` kontrolü başarısız oldu. Test artık reddi açıkça raporlayıp her hücre için gerçek onayı/final sunucu bloğunu, en fazla 3 denemeyi, sıfır açık onarımı ve envanter işlem sınırını ayrı doğrular. Ret başarı sayılmaz; inşa motorunun tekrar sınırı değiştirilmedi.
- Uygulama v1.15.19; paket/BAT/ZIP/EXE etiketleri 114. Hesaplar/AppData, sprint tercihi ve eski özellikler korunur. Canlı AesirMC / Windows FPS testi yapılmadı.

## 1.15.19 · Paket 113 · Paket yoğunluğu koruması ve kalıcı teşhis

- Banın nedeni doğrulanmadı. Kullanıcı hesabı/canlı AesirMC üzerinde test yapılmadı. Bu paket “ban yemez” veya sunucunun otomasyon kurallarıyla uyumluluk garantisi değildir.
- Elde uygun ve dolu bir blok yığını varken her yerleştirmede ana envanterdeki ilk yığının tekrar seçilmesi kaldırıldı. Elde bulunan aynı nesne için equip atlanır; yeni malzeme gerektiğinde native envanter işlemi yapılır. Araç seçimi, ACK ve iptal rezervasyonu korunur.
- Bounded frontier uzak uç tercihini korur; iki blokluk distal bantta karaktere yakın adayı seçerek büyük katmanda gereksiz gidip gelmeyi azaltır. Çıkış kontrolleri kaldırılmaz.
- Auto Build konum/bakış gönderimleri 50 ms aralıkla en fazla bir güncel bekleyen mutlak hareketle birleştirilir. Gerçek gönderilmiş açı kapısı korunur. Sunucu konum düzeltmesinden önce eski bekleyen hareket silinir; yeni native düzeltme yanıtı korunur. Pause/Stop/disconnect kuyruğu temizler.
- 1 saniye ve 100 ms paket yoğunluğu; hareket/eylem/yerleştirme/kazma ve toplam noncritical denemeler için mühendislik watchdog'u. Anormal gönderimde tetikleyen noncritical paket gönderilmeden inşa duraklar, kendiliğinden devam etmez. Üç saniye cooldown + worker drain; neden incelenmeden Resume önerilmez. Eşikler sunucunun anti-cheat eşikleri değildir.
- Keep-alive/pong, teleport/configuration onayları, chunk akış ve transaction yanıtları bekletilmez/atlanmaz. Kritik yanıtlar sayılır fakat watchdog'u tetiklemez. Auto Build dışındaki eski hareket penceresinde, gönderilmeyen denemelerin pencereyi uzatması düzeltildi.
- Payload içermeyen kalıcı yerel teşhis: AppData\logs\client-diagnostics.jsonl ve .1/.2. Her dosya en fazla 1 MiB, en fazla üç dosya; bounded kuyruk ve asenkron toplu yazma. Normal çıkışta flush, disk hatasında uyarı. Sohbet, komut, şifre/token, hesap adı, IP/adres, heartbeat ID, envanter/NBT/paket gövdesi yeni otomatik dosyaya yazılmaz. Koordinat, blok ve teknik neden/sayılar kaydedilir. Zorla sonlandırmada en son küçük tampon kaybolabilir.
- Tanınan ban mesajında normal/smart otomatik tekrarlar durur. Ham sunucu mesajı otomatik dosyaya yazılmaz; yalnızca ban_reported / packet_rate_reported / kick_reported kategorisi. Her mesaj biçimi tanınamayabilir; sınıflandırma banın nedeni hakkında kanıt değildir.
- Sprint varsayılan kapalı; 113'e ilk geçişte kayıtlı sprint tercihi bir kez kapatılır. Sonraki açık tercih korunur. Hesaplar/köşeler/blok/kurtarma ayarı ve AppData konumu değişmez. Uygulama v1.15.19; paket etiketleri 113.
- 201 birim/regresyon kontrolü; iki sürümde 20 tam native istemci/protokol senaryosu, fizik/yerleştirme/opsiyonel koşu, 8 bağlantı senaryosu ve Chromium arayüz testleri geçti.
- 1.21.4 yerel tam native istemci + sunucu: 30×20 / tek Y / 600 blok tamamlandı; 600 gerçek yerleştirme onayı, 18 envanter tıklaması, açık onarım yok. Sunucu tarafından inşa sırasında gözlenen tepe toplam 24 paket/sn, 5 paket/100 ms, hareket 3/100 ms; watchdog tetiklenmedi. Bunlar bu yerel testin ölçümleridir, herhangi bir sunucuda izinli hız veya ban olmama garantisi değildir. İlk geniş test yalnızca bekleme süresi dolduğu için tamamlanmadı; log/paket bulguları üzerinden equip ve hedef seçimi düzeltildi, sonra tam 600 testi geçti.

## 1.15.19 · Paket 112 · Güvenli normal koşu ve kısa rota

- Auto Build uzun, düz ve güvenli yürüyüşlerde native sprint kullanır. Varışa yaklaşınca, engel/yükseklik değişimi/kenar/yüklü olmayan chunk/düşük açlık/uçuş/su veya lavda yürüyüşe döner. Bal, slime ve buzda koşu kapalıdır. Hız, velocity, oyun tick oranı veya sunucu niteliği elle yükseltilmez.
- Düz ruh kumunda normal sprint kullanılabilir; ruh kumunun native yavaşlatması aynen korunur. Kesirli zeminin ayak voxel'i bütünüyle engel sayılmaz; gerçek çarpışma yüksekliği kontrol edilir.
- Ruh kumu/bal için rota cezası 3 yerine 0,35: native A* tarafından adımda iki kez uygulanan eski yüksek ceza gereksiz dolaşmaya ve bounded arama başarısızlığına yol açabiliyordu. Bu değişiklik yüzeyin fiziksel hızını değiştirmez.
- Varsayılan açık, hesap bazında kaydedilen “Güvenli düz zeminde koşarak git” ayarı. İstersen işi başlatmadan kapat. Auto Build yürürken manuel Shift temizlenir; işteki eğilme motor tarafından yönetilir, önceki eğilme Durdur/tamamlanma sonrası geri yüklenir. Yerleştirme, etkileşimli yüzey çömelmesi, durulma ve sunucu onayı süreleri kısaltılmadı.
- Duraklat/iptal/varış sonrası koşu ve policy listener'ı temizlenir. Kaçış/kurtarma fazlarında yeni sprint açılmaz; minimum kazma, gerçek çıkış ve dışarıdan arkayı kapatma kontrolleri korunur. [Auto Build/112] kaydında sprint/sneak, yatay velocity ve zemin bilgisi.
- 178 birim/regresyon kontrolü. İki sürümde yerel gerçek fizik karşılaştırması: 10 blok düz/yan yön 47 → 38 tick (2,35 → 1,90 native oyun saniyesi), ruh kumu 79 → 61 tick (3,95 → 3,05). Düz zemin maksimum adım 0,281; ruh kumu 0,163; balda sprint yok. Bunlar izole yol ölçümleri, tüm inşa süresi veya canlı sunucu hız garantisi değil.
- 1.20.1/1.21.4'te 20 tam native istemci / yerel Minecraft protokol senaryosu geçti: wart, envanter, Y68 seed, engelli açı, 4×4×2 dolgu ve native kır/ACK/çık/doldur/kapat. Dört sürümde ekim; mevcut inşa, 8 ağ senaryosu ve Chromium arayüz testleri geçti. Canlı AesirMC, Windows FPS veya sunucu otomasyon izinleri doğrulanmadı.
- Sürüm v1.15.19; paket/ZIP/BAT/EXE etiketleri 112. Hesap/AppData ve eski Auto Build özellikleri korunur.

## 1.15.19 · Paket 111 · Dayanaklı frontier / kaçış / otomatik kurtarma

- Aynı Y'de destekli hücrelerden büyüyen bounded frontier + tekrar doğrulama taraması; desteksiz/erişilemeyen ilk hücre bütün işi anında durdurmaz. Daha yüksek Y, alt katman boşlukları ve onarımları bitmeden açılmaz. Giriş/çıkış yönüne göre dolgu sırası. Alan hacmi koordinat dizisine çevrilmez.
- İlk çarpışan yüz/raycast kontrolü; görünmez arka yüze ve ince engelin arkasına tıklama yok. Yükseltilmiş hedef için dört blok aşağıdaki güvenli duruşlar da değerlendirilir. Otomatik açı/konum denemeleri sınırlıdır; geometri hataları aynı katmanda ilerleme sonrası yeniden denenir. Native iki-açı kapısı ve durulma korunur.
- Öngörülen ek blokla read-only native A* kaçış kontrolü; live world değiştirilmez. 2 ms dilimler, 1200 ms / 20000 node plan bütçesi. Pathfinder'a genel kazma izni verilmez.
- Kullanıcı tarafından kapatılabilen kendi-blok kurtarması: yalnızca gerçek yerleştirme onayıyla oluşturulmuş, değiştirilmemiş son 4096 blok kayıtlarından güvenli minimum bir/iki blokluk geçit. Özgün yapılar, korunan/düşen/tehlikeli bloklar ve ayak altı zemini kazılmaz. Native kazma doğru görünür yüzle ve native süreyle yapılır; araç seçilir, çok uzun kazma zorlanmaz.
- Native dig'in optimistic local air olayı başarı sayılmaz; inbound server block_change/multi_block_change onayı gerekir. Açılan hücre onarım kuyruğuna girer. Pause sonrası geç ACK kayda alınır; Stop/dünya/bağlantı değişiminde observerlar temizlenir.
- Kırma sonrası gerçek konumla dışarı çıkış doğrulanır. Açık onarım varken doldurma dışarıdan yapılır; aynı Y'nin diğer ulaşılabilir hücreleri önce tamamlanır, geçit sonradan alttan üste kapanır. Çıkış/kapatma başarısızsa iş tamamlandı olmaz.
- Kurtarma seçeneği, aşamalar ve kırılan/kapatılacak sayaçları. Kayıt etiketi [Auto Build/111]. Önceden dolu/hacim sayaçları katman doğrulamasında kesinleşir. Daha önce var olan/başkasının son anda doldurduğu bloklar sahiplenilmez.
- 159 birim/regresyon; 20 full native-client loopback protokol senaryosu iki sürümde: Y68 seed'leri, engelli açı, 4×4×2 hacim, native kazma/ACK/gerçek çıkış/arkayı kapatma ve korunan duvarlar dahil. Ekim dört sürümde; mevcut inşa, bağlantı, envanter ve Chromium arayüz kontrolü geçti. Canlı AesirMC veya Windows FPS testi yapılmadı.
- ZIP/klasör/BAT/EXE etiketleri 111; uygulama tam olarak v1.15.19, AppData ve hesaplar değişmedi.

## 1.15.19 · Paket 110 · Native bakış ve ortak yerleştirme akışı (sürüm değişmedi)

- Gerçek BotManager/Mineflayer ile yerel serialized-protocol sunucusunda Paket 109 bakış hatası yeniden üretildi: `lookAt(false)` Promise'i yaw hedefinde bitiyor, pitch hâlâ 8,6° iken aşağıdaki wart yüzeyi 90° gerektiriyordu. Yerleştirme şimdi native bakışın iki açısının gerçek outbound limitinden geçip gönderilmesini bekler. Sahte look/equip kullanan önceki testin kapsam açığı ayrı tam istemci testiyle kapatıldı.
- Blok görünür/erişilebilirken gereksiz kesin duruş hedefi beklenmez. Hareket girdisi durdurulup native sürtünmeyle durulma beklenir. Kesirli destek şekilleri tıklama cursor'u, bakış ve duruş yüksekliğinde kullanılır.
- Normal etkileşimsiz yüzeylerde sürekli çömelme kaldırılır. Etkileşimli desteklerde çömelme bakıştan önce ayarlanır ve 1,27 göz yüksekliği kullanılır; stance sonrası eski pitch ile tıklama yapılmaz.
- Envanter ele alma ve gönderilen bakış bekleyişleri sınırlıdır; iptal ve geç işlem rezervasyonu korunur. Native yerleştirmeye yalnızca mevcut hedef/zemin/envanter yeniden doğrulandıktan sonra girilir; yalnızca sunucu blok onayı sayılır.
- Canlı paket günlüğü ayarı giden paketlere de uygulanır (önceden giriş anında sabitleniyordu). `[Auto Build/110]` düşük hacimli aşama/hedef/konum/eldeki blok/bakış/ilk paket/onay/duraklama kayıtları ve arayüz Aşama alanı eklendi.
- 143 birim/regresyon kontrolü. 1.20.1/1.21.4'te 10 yeni gerçek BotManager + native Mineflayer + loopback Minecraft protokol testi: wart/hotbar, wart/ana envanter/yürüyüş, ruh kumu/iki katman, ruh kumu üstünde taş, etkileşimli destek/çömelme açısı. Tam istemci look, equip, physics ve pathfinder işlevleri taklit edilmez. Yerel sunucu iki gönderilmiş açıyı, yüzey cursor'unu, reach, envanter ve onayı denetler.
- Ekim chunk/fizik testleri dört sürümde; normal inşa ve ağ testleri 1.20.1/1.21.4'te geçti. Canlı AesirMC doğrulaması veya kullanıcı Windows FPS ölçümü yapılmadı.
- Paket/ZIP/BAT/EXE etiketleri 110; sol alt sürüm ve app:info paket numarasını da gösterir. Uygulama sürümü tam olarak v1.15.19; kullanıcı veri konumu, önceki özellikler ve güvenlik sınırları korunur.

## 1.15.19 · Paket 109 · Ruh kumu üzerine Nether Wart ekimi (sürüm değişmedi)

- Nether Wart'ın çarpışmasız bitki olduğu dikkate alınır. Karakterin kendi ayak hizasına ekim yapması engellenmez; zaten ekilmiş wart, duruş/yürüme hücresini tam küp gibi kapatmaz. Y65 ruh kumu / Y66 ekim dar şeridi sonunda takılma yerel testte yeniden üretildi ve giderildi.
- Ekim desteği yalnızca hedefin altındaki `soul_sand` ve tıklama yönü yalnızca UP. Ruh kumunun gerçek 7/8 yükseklikteki üst yüzeyi, hem bakış hem native paketin delta/cursor koordinatında kullanılır; tam küp y=1 noktası kullanılmaz.
- Ekimde gereksiz çömelme kaldırılır; bakıştan sonra göz yüksekliği değişmez. Ekipman/bakış bekleyişi sonrasında destek tekrar kontrol edilir. Yanlış zemin için açık Türkçe/İngilizce `wart_soil` uyarısı ve Y65→66 örneği.
- Dolu/olgun bitki korunur. Normal tam küp inşasında oyuncu çarpışma koruması ve diğer native yerleştirme davranışı değiştirilmez. Kırma, iskele, uçma/ışınlanma eklenmez.
- 11 yeni ekim geometri/çarpışma regresyon kontrolü (toplam 136); 7 yerel gerçek chunk/fizik/pathfinder/native paket senaryosu dört Minecraft sürümünde geçti. Dar şerit, 7×5 bahçe, doğru cursor/yerleştirme yönü, olgun bitki, yanlış destek, malzeme bitişi, ret ve geç cevap doğrulandı. Normal inşa ve bağlantı testleri geçti. Canlı AesirMC testi yapılmadı.
- ZIP, klasör, başlatıcı ve EXE çıktı etiketleri 109; uygulama sürümü v1.15.19 olarak kaldı. AppData/kaydedilmiş hesaplar ve Paket 108 özellikleri korunur.

## 1.15.19 · Paket 108 · Auto Build (sürüm değişmedi)

- İki çapraz XYZ köşesiyle inclusive 3B dolgu; en alt Y katmanından başlayıp her katmanda zikzak sıra. Constant-memory BigInt sayaç; büyük alan için koordinat dizisi / tam dünya ön taraması yok.
- Sunucu sürümünün blok listesi, texture'lı arama ve 4 satır yüksekliğinde sanallaştırılmış dropdown. Teknik/eşyasız ve çok hücreli kayıtlar açıklamalı devre dışı. Hesap bazlı köşe / blok ayarları.
- Başlat (alan onayı), Duraklat, Devam et, Durdur; yerleştirilen / önceden dolu / envanter / hacim / Y / hedef koordinat / duraklama nedeni.
- Pinned mineflayer-pathfinder 2.4.5: native fizik/yürüme/bakış, tek blok zıplama, sütunların etrafından güvenli rota; kırma, iskele, parkour, sprint, uçma/ışınlanma yok. Uzun yürüyüşlerde yerel ara hedefler ve 2 ms hesap bütçesi.
- Pathfinder'ın kısmi yol nesnelerini A* durumuyla paylaşması kesirli zeminlerde rota bozabiliyordu; sonuç yolları kopyalanır. İlk fizik açılışında zemin teması beklenir. Prismarine physics 1.11.1'in ruh kumu/bal altında yanlış katman okuması ve 1.21 hız-zemin tablosu eksikliği kendi native hız katsayılarıyla uyum katmanında düzeltilir; node_modules kaynakları değiştirilmez.
- Sadece hava doldurulur. Sunucu reddi, cevap zaman aşımı, desteksiz/düşen blok, tehlikeli duruş veya ulaşılamayan rota işi duraklatır; alt katman atlanmaz. Geç cevap Pause/Stop sonrası yeni yerleştirme başlatmaz. Dünya/bağlantı değişiminde iş durur; reconnect'te otomatik inşa yok.
- Anti AFK hareket rezervasyonu, geçici fizik ve çakışan makro/envanter korumaları. Giriş komutları tamamlanmadan inşa başlatılmaz. Hesaplar ve AppData konumu aynı kalır.
- Opsiyonel SRV DNS sorgusu gecikirse yapılandırılmış hostname/porta açıklamalı fallback; geç bağlantı iptali korunur. Sabit IP veya sunucu portu hardcode edilmez.
- 125 birim/regresyon senaryosu; gerçek yerel chunk/pathfinder/fizik hareketleri, native yerleştirme paketleri + simüle cevap, Chromium blok seçici/kontrolleri ve mevcut ağ testleri geçti. Canlı AesirMC / Windows FPS ölçümü yapılmadı.
- Paket adı ve başlatıcılar 108; uygulama sürümü tam olarak v1.15.19 kaldı.

## 1.15.19 · Paket 107 · Periyodik arayüz takılması ve parçalı spawner taraması

- Spawner Koruma, yakınında yabancı oyuncu varken spawner bulamazsa her 5 saniyede bir ana süreci bloke eden 150 blokluk `findBlocks()` taraması yapıyordu. Sık çalışan kazma döngüsünde de aynı geniş arama yeniden çalışıyordu. Bu çağrılar olay tabanlı, parçalı `SpawnerIndex` ile değiştirildi.
- Mevcut ve yeni yüklenen chunk'lar yaklaşık 2 ms'lik iş bütçeleriyle `setImmediate` üzerinden taranıyor; aralarda ağ, zamanlayıcı ve IPC işleri devam ediyor. Palette spawner içermeyen bölümler blok/eşya nesneleri oluşturmadan atlanıyor. Diğer bölümlerde ham state ID okunuyor; 1.8'in Vec3 gerektiren erişimi de destekleniyor.
- Yüklenmiş dünyanın spawner koordinatları block/chunk olaylarıyla güncelleniyor; aynı bölge için beş saniyelik tam tarama, her kırma sonrası dünya taraması ve boş bölgede yeniden indisleme yok. Gerçek yeni chunk veya blok olayı boş-alan önbelleğini anında geçersiz kılıyor.
- Sabit 150 blok alan, whitelist, 500 ms oyuncu kontrolü, yeni yerleştirilene özel kırma ve kazma zamanlaması değiştirilmedi. Kırma sonrası çıkış kararı eksik indeks üzerinden verilmiyor; dünya değişimi/iptal ve tarama sırasında aynı ChunkColumn'un yeniden yüklenmesi ayrıca korunuyor.
- Durum IPC akışı yalnızca uptime değiştiği için bütün arayüzü tekrar göndermiyor; süre mevcut yerel sayaçla akıyor. Gerçek ping/durum/makro/hesap değişimleri gönderilmeye devam ediyor.
- Değişmeyen status rozeti, üst hesap/sunucu listeleri, Auto Sell görünümü ve panel anahtarları yeniden çizilmiyor. Ping değiştiğinde oturum satırı yıkılıp yeniden yaratılmak yerine yalnızca metni güncelleniyor. Aynı CPU/RAM metni tekrar yazılmıyor; sabit çekirdek/toplam RAM bilgisi metrik döngüsünde yeniden alınmıyor.
- 21 yeni parçalı tarama/kararlı durum testi eklendi. Mevcut 29 Spawner Koruma, 24 bağlantı/heartbeat, 21 envanter ve 10 arayüz testi geçiyor. Gerçek chunk biçimleri 1.8, 1.16.5, 1.20.1 ve 1.21.4 ile sınandı; yerel ağ testleri 1.20.1/1.21.4'te tekrar geçti.
- Yerel Chromium testinde 20 sahte hesap ve 120 değişmeyen durum güncellemesinde izlenen status/listelerde eski 480 DOM değişikliği yerine 0 değişiklik görüldü; ping, özellik anahtarı, sayaç, çevrimdışı durum ve dil güncellemeleri çalıştı. Bunlar kullanıcının Windows bilgisayarındaki FPS ölçümü değildir; tüm olası GPU/işletim sistemi takılmalarının giderildiği iddia edilmez.
- Paket başlatıcıları ve sürüm metadata'sı v1.15.19 / Paket 107 olarak güncellendi. Paket 106 bağlantı düzeltmeleri ve kullanıcı veri konumu korunuyor.

## 1.15.18 · Paket 106 · Bağlantı iptali ve heartbeat güvenilirliği

- Otomatik sürüm algılamada açılan durum/status ve oyun soketleri tek iptal edilebilir bağlantı kapsamına alındı. Manuel çıkış, hata ve zaman aşımı her ikisini de kapatıyor; geç DNS/TCP/proxy cevapları kapatılmış oturumu yeniden açamıyor.
- DNS/SRV sorgusu 4 saniyeyle, TCP/proxy kurulumu ve otomatik sürüm status bekleyişi 15 saniyeyle sınırlandı. Geçici DNS hatası sessizce başka hedefe yönlendirmiyor. SRV öncelik/ağırlıkları destekleniyor; gerçek hedef loglanırken handshake'te kullanıcının alan adı korunuyor.
- Giriş öncesi ECONNREFUSED gibi fatal hatalar arayüzü anında çevrimdışı yapıyor. Eski oturumun geciken error/end/login/sohbet olayları yeni oturuma veya silinmiş oturumun kayıtlarına yazamıyor. Login gecikmesi ve VPN kimlik değişimi beklerken iptal yarışı da kapatıldı.
- Pong Pacer kaldırıldı. Native `pong`, `keep_alive`, teleport ve yapılandırma onayları geciktirilmeden, kimlikleri korunarak gönderiliyor; dolan kuyrukta yanıt silinmiyor. Bu önceki mekanizmadaki bir timeout riskini giderir; AesirMC'deki kopmanın kesin nedeni canlı sunucuda henüz doğrulanmış değildir.
- Dakikalık `Network health` kaydı gelen/giden paket ve heartbeat sayılarını, son paket yaşını ve event-loop gecikmesini tutuyor; şifre veya paket içeriği kaydetmiyor. Alt sunucudan lobiye `Connection timed out` aktarımı sohbetten görülürse anlık ağ özeti alınıyor, ana TCP bağlantısı yanlışlıkla kapatılmıyor.
- BAĞLANTI sayfasındaki sunucu testi, sayısal `ping` alanıyla çakışan yöntemden ayrıldı; testin status soketi de sonucu/zaman aşımı sonrası kapatılıyor. ECONNREFUSED artık sürüm uyuşmazlığı diye yönlendirmiyor.
- 24 bağlantı/heartbeat, 29 Spawner Koruma, 21 envanter ve 10 arayüz testi geçiyor. Gerçek soketli yerel testlerde 1.20.1 ve 1.21.4 ayrı ayrı sınandı: 3000 sıralı pong, 64-bit keepalive, dünya geçişleri, otomatik algılama, SRV hostname, iptal, gerçek bağlantı reddi, status testi ve SOCKS4/SOCKS5/HTTP tünelleri.
- `BASLAT-106.bat`, `EXE-OLUSTUR-106.bat`, `BAGLANTI-TESTI-106.bat` ve `diag-106.js` eklendi. Başlatma/derleme betiklerindeki koşulsuz `& exit /b` sorunu giderildi. Veri klasörü ve mevcut hesap/ayar biçimi değiştirilmedi.

## 1.15.17 · Paket 105 · Oyun açılışında arayüz akıcılığı

- Mineflayer dünya ve chunk verisi yüklenirken eski `256 MB` V8 sınırı sürekli tam çöp toplama çalıştırıp Electron arayüzünü dondurabiliyordu. Kontrollü bellek sınırı `768 MB` olarak yükseltildi.
- Canlı sohbet ve log IPC olayları artık her satırda ayrı DOM/layout işlemi yapmıyor; 50 ms içinde gelen satırlar kuyrukta birleştirilip `DocumentFragment` ile tek seferde çiziliyor.
- Sohbet, panel sohbeti ve log alanlarında kırpma ile en alta kaydırma hesabı her mesaj yerine her toplu grup için yalnızca bir kez yapılıyor. Görsel kuyruklar sınırlı tutuluyor; geçmiş ana süreç tamponundan yeniden okunabiliyor.
- Yoğun sunucularda aynı anda gelen onlarca satıra uygulanan ayrı giriş animasyonları kaldırıldı. Bu, oyun açılışındaki ana renderer yükünü ve takılmayı azaltıyor.
- Yeni 10 senaryolu arayüz performans testi; bellek sınırını, sohbet/log kuyruklarını, toplu fragment çizimini ve animasyonsuz satırları doğruluyor. Mevcut 29 Spawner Koruma, 21 envanter ve 5 Pong Pacer testi de geçiyor.
- Paket dosyaları `BASLAT-105.bat`, `EXE-OLUSTUR-105.bat` ve `diag-105.js` olarak güncellendi.

## 1.15.17 · Paket 104 · Normal kazma geri dönüşü ve kapanan envanter

- Uygulama sürümü paket metadata’sı, kilit dosyası, arayüz, başlatma/derleme dosyaları, README ve güncelleme örneğinde **v1.15.17** olarak eşitlendi.
- İpeksi Dokunuş bilgisi özel sunucu/proxy tarafından gönderilmezse Spawner Koruma artık durmuyor; kullanıcının isteğiyle en güçlü normal kazmayı kuşanıp kırmayı deniyor. Spawnerın eşya olarak düşmeyebileceği logda açıkça belirtiliyor.
- Normal kazma seçimi yalnızca malzeme adına göre değil gerçek vanilla kazma hızına göre yapılıyor; Verimlilik seviyesi `Eff²+1` hesabıyla karşılaştırılıyor. İpeksi Dokunuşlu herhangi bir kazma algılanırsa normal kazmadan önce yine ona öncelik veriliyor.
- Seçilen normal kazmanın Verimlilik seviyesi, `heldItem` güncellemesi gecikse bile kırma süresi hesabında korunuyor. Kırma logu artık kullanılan kazmanın İpeksi olup olmadığını da gösteriyor.
- Envanter penceresindeki X, Escape ve arka plana tıklama artık bekleyen sunucu transaction işlemini beklemeden modalı anında kapatıyor. Cursor'daki eşya varsa arka planda güvenle envantere döndürülmeye devam ediyor.
- Sandık veya sunucu menüsü açıldığında panel envanteri otomatik gizleniyor; sunucu menüsünün üstünde takılı kalmıyor. Geç gelen envanter cevabı kapalı cursor görüntüsünü tekrar açamıyor.
- Spawner Koruma testleri normal Verimlilikli geri dönüş, gerçek hızla en güçlü kazma seçimi, İpeksi önceliği ve kazmasız güvenli duruşla **29 senaryoya**; envanter testleri anında kapanış ve sunucu menüsü geçişiyle **21 senaryoya** çıkarıldı. 5 Pong Pacer testiyle birlikte tüm doğrulamalar geçiyor.
- Paket dosyaları `BASLAT-104.bat`, `EXE-OLUSTUR-104.bat` ve `diag-104.js` olarak güncellendi.

## 1.15.16 · Paket 103 · AesirMC Ipeksi Dokunuş uyumluluğu

- AesirMC’de envanterdeki `diamond_pickaxe` gerçek Ipeksi Dokunuşlu olmasına rağmen algılanmıyordu. Sunucuların/sürümlerin farklı enchant registry kimlikleri desteklendi: Silk Touch için eski NBT `33`, 1.20.x component `21`, 1.21.x `33/34`.
- Verimlilik algılaması da aynı sürüm farklarına uyarlandı (`1.20.x=20`, `1.21+=8`, eski NBT `32`); eski yanlış `35`/Fortune yedeği kaldırıldı.
- Prismarine’in normalize `.enchants` getter’ı eksik kaldığında eşyanın ham `constructor.toNotch()` component çıktısı da taranıyor.
- `components`, `componentMap`, eski NBT, ham Notch item, `customLore`, normal lore, özel ad ve çeviri anahtarları tek güvenli taramada destekleniyor. Türkçe `İpeksi Dokunuş` lore’u da algılanıyor.
- Güvenlik korunuyor: yalnızca enchant parıltısına güvenilmiyor; yalnızca Efficiency bulunan kazma Ipeksi Dokunuşlu sayılmıyor.
- Algılama yine başarısız olursa uyarı artık kazmanın enchant ID/adlarını, component türlerini ve kısa lore özetini yazıyor. Böylece başka özel sunucu biçimleri tek logla teşhis edilebilir.
- Paket 102’nin hızlı kademeli kırma, 100 ms ardışık hedef geçişi ve zorunlu hedef bakışı aynen korundu.
- Spawner testleri AesirMC sayısal ID 21, Türkçe lore, ham Notch component ve Efficiency-only yanlış pozitif reddiyle **26 senaryoya** çıkarıldı. Mevcut 5 Pong Pacer ve 18 envanter testi de geçiyor.
- Paket dosyaları `BASLAT-103.bat`, `EXE-OLUSTUR-103.bat` ve `diag-103.js` olarak güncellendi.

## 1.15.16 · Paket 102 · Hızlı ardışık kırma ve zorunlu hedef bakışı

- İyi Verimlilikli kazmalarda sabit 3,5 saniyelik taban kaldırıldı; tahmine göre 1,6 / 1,9 / 2,6 / 3,5 saniyelik güvenli kademeler kullanılıyor.
- Başarılı spawnerlar arasındaki 3,5 saniyelik ek bekleme kaldırıldı; gerçek blok onayından sonra 100 ms içinde sonraki hedefin hazırlığı başlıyor.
- Her spawner için START’tan önce tek `force=true` hedef bakışı gönderiliyor; bakış başarısızsa körlemesine kazma paketi gönderilmiyor.

## 1.15.16 · Paket 101 · gx01 güvenliği ve gecikmesiz envanter

- Yeni kayıtta iki spawner `2,4 sn` tutma ve yaklaşık `2 sn` arayla kırılmış; sunucu ikinci kırmadan **23 saniye sonra** gecikmeli `gx01` cezası vermiştir. Bu nedenle survival kırma tabanı yeniden **3,5 saniyeye** çıkarıldı ve başarılı spawner oturumları arasına **3,5 saniye** sunucu işleme payı kondu.
- Kırma boyunca 700 ms aralıklarla gönderilen sentetik kol animasyonları kaldırıldı. Artık her hedefte yalnızca başlangıçtaki tek kol animasyonu ile bir `START → FINISH` kazma oturumu oluşturuluyor; gereksiz paket dizisi azaltılıyor.
- Spawner Koruma kartındaki yeşil çerçeve/arka plan ve **SAVUNMA** rozeti kaldırıldı. Kart artık diğer makrolarla tamamen aynı sade görünümü kullanıyor.
- Oyuncu algılama mesafesi kaydırıcısının dolgu ve tutamaç geçişleri kapatıldı; değer fareyi gecikmesiz ve sert biçimde izliyor.
- Boş üretim sonucu slotuna tıklamak artık sunucuya envanter işlemi göndermiyor. Böylece boş sağ sonuç karesinde görülen `15–20 sn İşleniyor` kilitlenmesi oluşmuyor. Arka uçta da aynı kontrol var; kayıp bir transaction cevabı diğer slotlarda paneli en fazla **2,2 saniye** bekletebilir.
- Sol tıktaki `190 ms` çift-tık beklemesi ve saniyelik otomatik modal yenilemesi kaldırıldı. Tıklamalar anında, Minecraft sırasını koruyan tek işlem kuyruğuna giriyor; gereksiz yeniden çizim ve modalın yukarı-aşağı oynaması önleniyor.
- Envanter penceresinin altındaki kullanım açıklaması ve durum/`İşleniyor` satırı tamamen kaldırıldı. Nadir hatalar yerleşimi değiştirmeyen bildirim olarak gösteriliyor.
- Boş crafting sonucu, timeout, anında tıklama, alt satırların kaldırılması ve kart/slider görünümü regresyonları eklenerek envanter testleri **18 senaryoya** çıkarıldı. Mevcut **20 Spawner Koruma + 5 Pong Pacer** testiyle birlikte tüm doğrulamalar geçiyor.
- Paket dosyaları `BASLAT-101.bat`, `EXE-OLUSTUR-101.bat` ve `diag-101.js` olarak güncellendi.

## 1.15.16 · Paket 99 · Sabit koruma alanı ve gerçek Minecraft envanteri

- Spawner Koruma sayfasındaki ayrı **Spawner yarıçapı** kaydırıcısı tamamen kaldırıldı. Eski `breakRadius` kayıtları açılışta config’den temizleniyor ve motor görünmeyen eski bir değeri kullanmıyor.
- Korumanın spawner arama alanı artık sabit **150 blok**. Oyuncu algılama mesafesi ayarı 1–50 blok olarak kalıyor; Bot Physics kapalıysa 150 blok içindeki erişilemeyen hedefler önceki güvenlik davranışıyla yürünmeden atlanıyor.
- “Spawnerlar bitince çık” açıklaması kaldırılan ayara referans vermek yerine sabit koruma alanını anlatacak şekilde güncellendi.
- Paneldeki Envanter penceresi baştan tasarlandı: Minecraft Java’nın gri piksel paneli, koyu/açık kabartmalı slotları, dört zırh slotu, zırh hayalet ikonları, oyuncu/Steve önizlemesi, gerçek konumundaki diğer-el slotu, 2×2 üretim alanı ve sonuç karesi, 3×9 ana envanter ve ayrı 1×9 hotbar düzeni eklendi.
- Önceki dikey sol sütunda zırhın en alt slotu ile diğer-el slotu neredeyse birleşiyordu. Diğer el artık gerçek Minecraft düzenindeki gibi oyuncu önizlemesinin sağ-altında, bot slotuyla aynı hizada; tüm zırh slotlarının iç aralığı eşit.
- Slot ölçüleri 40×40 piksele ve aralıklar 2 piksele eşitlendi. Ana envanter satırları aynı aralıkta, hotbar ise Minecraft’taki gibi ayrı ve düzenli 10 piksel boşlukla yerleştirildi.
- Eşya atlasındaki gerçek piksel ikonları, sağ-alt yığın sayıları, Minecraft mor eşya adı balonu, boş zırh/diğer-el işaretleri ve seçili slot çerçevesi yeni tasarımda korunup iyileştirildi. Q ve Ctrl+Q işlemleri değişmedi.
- Sabit 150 blok motor davranışı, eski slider’ın HTML/JavaScript’ten tamamen kaldırılması ve yeni Minecraft envanter yapısı otomatik regresyon testine eklendi; **20 Spawner Koruma + 5 Pong Pacer** senaryosu çalışıyor.
- Paket dosyaları `BASLAT-99.bat`, `EXE-OLUSTUR-99.bat` ve `diag-99.js` olarak güncellendi.

## 1.15.16 · Paket 98 · Kazma gücüne göre hızlı Spawner Koruma

- Paket 97’de tüm survival kazmalarına uygulanan sabit 3,5 saniyelik güvenlik tabanı, en iyi netherit/Verimlilikli kazmanın yaklaşık 0,3 saniyelik teorik hızını da aynı ölçüde yavaşlatıyordu.
- Güvenli tutma süresi artık kazmanın hesaplanan gücüne göre kademeli: yaklaşık `≤0,4 sn` tahminli en iyi kazmalar **2,4 sn**, `≤1,0 sn` tahminli elmas/altın sınıfı **2,8 sn**, orta hızdaki kazmalar **3,2 sn**, yavaş alet veya boş el en az **3,5 sn** taban kullanıyor.
- Mineflayer’ın daha uzun gerçek süre hesabı, havada/suda kazma cezası ve ping payı korunuyor. Yeni hız tabanı yalnızca iyi kazmanın gereksiz sabit beklemesini kaldırıyor; 0,3–0,5 saniyelik doğrudan hızlı FINISH paketine geri dönülmedi.
- Yan yana gruptaki başarılı spawnerlar arasındaki ek sunucu işleme payı 2,5 saniyeden **1,2 saniyeye** indirildi. En iyi kazmayla beşli grubun toplam süresi belirgin biçimde kısaldı.
- Paket 96’daki iki dakikada beş kırma bütçesi, Paket 97’deki beşli toplama kuyruğu, hedefli koordinat ve 700 ms kol animasyonu sınırı korunuyor; uzun süreli gx01 koruması kaldırılmadı.
- En iyi kazma için 2,4 saniyelik ve normal elmas için 2,8 saniyelik ayrı hız testleriyle Spawner Koruma regresyon testleri **19 senaryoya** çıkarıldı; 5 Pong Pacer testi de korunuyor.
- Paket dosyaları `BASLAT-98.bat`, `EXE-OLUSTUR-98.bat` ve `diag-98.js` olarak güncellendi.

## 1.15.16 · Paket 97 · Bitişik spawnerları toplu ve dengeli kırma

- Paket 96’daki güvenlik sınırı her yeni spawnerı ayrı oturum saydığı için yan yana beş spawner konulduğunda her hedef arasında yaklaşık 15 saniye bekleyebiliyordu.
- Koruma artık hızlıca yan yana konulan spawnerları 1,2 saniyelik kısa yerleştirme penceresinde topluyor ve mevcut güvenlik bütçesinde yer olduğu kadarını — en fazla beş spawnerı — tek hedefli grupta işliyor.
- Gruptaki spawnerlar 3,5 saniyelik güvenli kazma süresiyle sırayla kırılıyor; sunucunun blok ve envanter durumunu işlemesi için aralarında 2,5 saniye bırakılıyor. Böylece her hedefte 15 saniye beklenmiyor fakat paket/kazma patlaması da oluşturulmuyor.
- Beş spawnerlık iki dakikalık üst sınır korunuyor. İlk beş bitişik spawner hızlı grupta tamamlanıyor; altıncı ve sonraki yeni yerleştirmeler gx01 riskini azaltmak için kuyrukta güvenli süreyi bekliyor.
- Ayrı yerleştirme oturumları arasındaki alt sınır 15 saniyeden 6,5 saniyeye indirildi. Bir spawner ilk toplama penceresine yetişmezse önceki kırma bittikten kısa süre sonra sıraya giriyor.
- Yabancı oyuncu yaklaşma akışı ve 150 blokluk acil toplama davranışı değiştirilmedi. Paket 96’nın trusted, hedefli koordinat, pong ve aç/kapa düzeltmeleri korunuyor.
- Yan yana beş `air → spawner` olayının tek çağrıda beş hedef olarak teslim edildiği otomatik testle doğrulandı; toplam **18 Spawner Koruma + 5 Pong Pacer** senaryosu başarıyla geçiyor.
- Paket dosyaları `BASLAT-97.bat`, `EXE-OLUSTUR-97.bat` ve `diag-97.js` olarak güncellendi.

## 1.15.16 · Paket 96 · Uzun süreli Spawner Koruma gx01 sınırı

- Yeni kayıtta korumanın teknik olarak doğru çalıştığı ve sunucunun her spawnerı onaylayarak kırdığı görülüyor; ancak yaklaşık üç dakikada **12 otomatik kırma** yapıldıktan sonra son kırmadan dört saniye sonra `gx01` oluşuyor. Kaynak paketi ve pong mesajları kick’ten sonra proxy lobiye geçirirken geldiği için bu olayın nedeni değiller.
- Paket 95’in yeni yerleştirme olayı tüm 150 blokluk alanı tarıyor, tek yeni spawner konulduğunda bazı turlarda eski bir spawnerı da ayrıca kırıyordu (`17:58:01 → 17:58:10` ve `17:59:24 → 17:59:34`). Yeni yerleştirme akışı artık yalnızca event ile görülen yeni koordinatı hedefliyor; yabancı oyuncu yaklaşırsa normal acil koruma yine seçilen yarıçaptaki bütün spawnerları tarıyor.
- Yeni yerleştirilen spawnerlar tek tek ve en az 15 saniye arayla işleniyor. Son iki dakikada beş başarılı kırmaya ulaşıldığında kalan yeni yerleştirmeler kaybolmadan kuyrukta bekliyor; süre dolunca otomatik devam ediyor. Kapatıp açmak bu güvenlik bütçesini sıfırlamıyor.
- 3,5 saniyelik kırma süresi ve sunucunun onaylı `START → FINISH` akışı korunurken gereksiz kol animasyonu 350 ms’den 700 ms’ye yayıldı. Böylece her kırmadaki ek animation paketleri yaklaşık yarıya indi.
- Kayıtta başlangıç logunda `Trusted: poltaaa` görünmesine rağmen 23 saniye sonra aynı adın yaklaşma tetikleyicisi olduğu saptandı. Kısmi runtime ayarı artık `trusted` alanı yoksa mevcut listeyi silmiyor; proxylerin ekleyebildiği görünmez Unicode format karakterleri de ad karşılaştırmasında kaldırılıyor.
- Yeni spawner kuyruğu özellik kapatılırken temizleniyor ve aç/kapa esnasındaki Paket 95’in sıfır kontrol paketi davranışı korunuyor.
- Kısmi ayarda trusted listesinin korunması, görünmez karakterli ad eşleşmesi, iki dakikalık kırma bütçesi ve hedefli döngünün 150 bloktaki eski spawnerı bırakmasıyla Spawner Koruma regresyon testleri 18 senaryoya çıkarıldı.
- Paket dosyaları `BASLAT-96.bat`, `EXE-OLUSTUR-96.bat` ve `diag-96.js` olarak güncellendi.

## 1.15.16 · Paket 95 · Güvenli aç/kapa ve yeni spawner algılama

- Kayıtta hesap yeniden bağlandıktan sonra hiçbir Spawner Koruma tetikleme/kazma olayı yokken özellik `17:38:42` kapatılıp `17:38:44` açılmış, sunucu bir saniye sonra `gx01` vermiştir. Boştaki eski `stop()` yine de tüm hareket ve Shift kontrollerini bırakıyor, `start()` da tekrar `stop()` çağırdığı için aç/kapa sırasında gereksiz `player_input`/duruş değişiklikleri oluşabiliyordu.
- Spawner Koruma boşta kapatılırken artık hareket, zıplama veya Shift durumuna dokunmuyor ve sunucuya kontrol paketi üretmiyor. Koruma gerçekten bir kırma/yürüme işleminin ortasındaysa güvenli temizlik aynen yapılıyor.
- Koruma açıkken hesabın yakınına **yeni bir spawner yerleştirilmesi** artık `blockUpdate` olayıyla algılanıyor ve güvenilir olmayan oyuncu tetikleyicisi beklenmeden kırma işlemi başlıyor. Spawnerı koyan kişi trusted listesinde olsa da bu yeni yerleştirme koruması çalışıyor.
- Yerleştirme sonrası dünya durumunun oturması için 800 ms bekleniyor; aynı konumdaki stack/metadata güncellemeleri 15 saniye boyunca ikinci kez tetiklenmiyor. Aynı tikte koyulan birden fazla spawner tek taramada işleniyor.
- Yeniden bağlanırken chunk ile yüklenen mevcut spawnerlar otomatik kırılmıyor; yalnızca gerçek `başka blok → spawner` geçişi yeni yerleştirme sayılıyor. Normal yabancı oyuncu yaklaşma koruması mevcut spawnerlar için aynen devam ediyor.
- Aç/kapa sırasında event dinleyicisi ve bekleyen zamanlayıcı tamamen kaldırılıyor; tekrar açıldığında çift dinleyici/çift kırma oluşmuyor.
- Boşta aç/kapanın sıfır kontrol paketi üretmesi, trusted oyuncunun yanında yeni yerleştirilen spawnerın tek kez tetiklenmesi ve listener temizliği eklenerek Spawner Koruma regresyon testleri 15 senaryoya çıkarıldı.
- Paket dosyaları `BASLAT-95.bat`, `EXE-OLUSTUR-95.bat` ve `diag-95.js` olarak güncellendi.

## 1.15.16 · Paket 94 · Spawner Koruma tekrar tetikleme / gx01 düzeltmesi

- Kayıtta ilk spawner `17:15:03–17:15:06` arasında başarıyla kırıldıktan sonra aynı oyuncu (`poltaaa`) alanı terk etmediği hâlde korumanın `17:15:18` ve `17:15:38` civarında yeniden tetiklendiği görüldü. Bu tekrarlar aynı yaklaşım olayı için gereksiz equip, bakış, Shift ve kazma davranışları oluşturuyordu.
- Spawner Koruma artık bir yaklaşım olayında yalnızca bir kez çalışıyor. Yeniden silahlanması için bütün güvenilir olmayan oyuncuların algılama alanından çıkması ve alanın en az 2 saniye boş kalması gerekiyor.
- Kalabalık lobi/spawn dünyasında yakında oyuncu olsa bile bölgede gerçek spawner yoksa koruma başlamıyor; kazma seçmiyor ve “Ipeksi Dokunuş yok” uyarısı üretmiyor. Boş bölge taraması 5 saniyelik beklemeyle sınırlandı.
- ChickenNW'nin özel spawner/anti-cheat zamanlamasına pay bırakmak için survival spawner kazma süresinin alt sınırı 2,7 saniye civarından **3,5 saniyeye** çıkarıldı. Daha uzun Mineflayer/native süreler korunuyor.
- Aynı olayda birden fazla spawner kırılırsa başarılı kırmalar arasındaki bekleme 150 ms'den 1,5 saniyeye çıkarıldı; sunucunun blok ve envanter durumunu işlemesine zaman veriliyor.
- Logdaki `17:15:54` pong kuyruğu mesajı kick mesajından sonra, proxy lobiye aktarırken oluşmuştur; bu olay gx01'in sebebi değildir. Paket 93'teki pong koruması aynen korunur.
- Spawnersız lobide sıfır kırma ve aynı oyuncu içerideyken tek tetikleme senaryoları eklenerek Spawner Koruma regresyon testleri 13 senaryoya çıkarıldı.
- Paket dosyaları `BASLAT-94.bat`, `EXE-OLUSTUR-94.bat` ve `diag-94.js` olarak güncellendi.

## 1.15.16 · Paket 93 · Windows Pong Pacer test kararlılığı

- Paket 92'nin Pong Pacer işlevinde paket kaybı yoktu; ancak Windows'un yaklaşık 15,6 ms zamanlayıcı çözünürlüğü nedeniyle sabit 500 ms bekleyen test bazen son paket gönderilmeden hemen önce `39 !== 40` hatası veriyordu.
- Test artık sabit süre sonunda erken karar vermek yerine kuyruğun boşalmasını en fazla 3 saniye bekliyor. Pong sırası, kayıpsız gönderim ve hız sınırı kontrolleri aynen korunuyor.
- Çalışan Pong Pacer ve yaklaşık 50 paket/sn üretim davranışı değiştirilmedi; bu paket yalnızca platformlar arası test kararlılığını düzeltir.
- Paket dosyaları `BASLAT-93.bat`, `EXE-OLUSTUR-93.bat` ve `diag-93.js` olarak güncellendi.

## 1.15.16 · Paket 92 · ChickenNW pong taşması / gx01 düzeltmesi

- Gönderilen kayıtta gx01 öncesinde tek saniyede **144 `pong`** çıktığı doğrulandı. Spawner Koruma kapalıydı ve hareket paketi yalnızca 1 adetti; bu nedenle sorun Spawner Koruma hareketinden değil, sunucunun gönderdiği `ping` patlamalarına Mineflayer'ın aynı anda cevap vermesinden kaynaklanıyordu.
- Yeni Pong Pacer, normal tek ping'i gecikmeden yanıtlıyor; bir ping patlamasında tüm pong kimliklerini ve sırasını koruyarak cevapları yaklaşık **50 paket/sn** hızına yayıyor. `keep_alive`, ışınlanma onayı, sohbet, hareket ve makro paketleri etkilenmiyor.
- Pong kuyruğu bağlantı kapanınca tamamen temizleniyor. Eski bağlantının geciken kapanış olayı yeni bağlantının kuyruğunu durduramıyor.
- Kaynak paketi isteğinin kick mesajıyla aynı saniyede görünmesinin sebebi proxy'nin oyuncuyu lobiye aktarmasıdır; kaynak paketi modu bu gx01 vakasının nedeni olmadığı için değiştirilmedi.
- Pong sırası, kayıpsız gönderim, burst hız sınırı, bağlantı temizliği ve `keep_alive` ayrımı için 5 otomatik regresyon senaryosu eklendi.
- Paket dosyaları `BASLAT-92.bat`, `EXE-OLUSTUR-92.bat` ve `diag-92.js` olarak güncellendi.

## 1.15.16 · Paket 91 · Güvenilir kişi ve gizli fizik zorlaması düzeltmesi

- Canlı logda `Trusted (tetiklemez): poltaaa` görünmesine rağmen beş saniye sonra aynı oyuncunun korumayı tetiklediği doğrulandı. Mineflayer’ın `bot.players` tablo anahtarı her sunucuda görünen kullanıcı adı olmadığı için kontrol yanlış değerle yapılıyordu.
- Güvenilir kişi eşleşmesi artık tablo anahtarı, `p.username` ve profil adı üzerinden yapılıyor; büyük/küçük harf, Minecraft renk kodu ve görünmez karakter farkları normalize ediliyor.
- Yalnızca güvenilir oyuncu yakındaysa tarama hiçbir kırma döngüsü başlatmıyor. Başka bir güvenilir olmayan oyuncu ayrıca yaklaşırsa koruma normal şekilde çalışmaya devam ediyor.
- `main.js` içindeki ikinci ve gizli Bot Physics zorlaması kaldırıldı. Önceki kod Spawner Koruma etkin olduğu sürece kullanıcının ayarı OFF olsa bile hesap çalışma kopyasında fiziği ON yapıyordu; güvenilir kişi nedeniyle hiç kazma yapılmasa dahi ChickenNW’de 15–20 saniye sonra `gx01` kick’i oluşabiliyordu.
- Spawner Koruma artık bütün katmanlarda gerçek Bot Physics ayarına uyar: OFF ise OFF kalır, yalnızca erişimdeki spawnerları kırar; ON ise kullanıcı özellikle açmış demektir.
- Regresyon testleri güvenilir görünen ad/farklı tablo anahtarı, yalnızca güvenilir kişide sıfır kırma çağrısı ve gizli fizik zorlamasının bulunmamasıyla 11 senaryoya çıkarıldı.
- Paket dosyaları `BASLAT-91.bat`, `EXE-OLUSTUR-91.bat` ve `diag-91.js` olarak güncellendi.

## 1.15.16 · Paket 90 · Paket 89 geri alımı ve güvenli yakın kırma

- Paket 89’daki sürekli konum-düzeltme engeli tamamen geri alındı; özellik doğrulanmış Paket 88 tabanından yeniden oluşturuldu.
- Spawner Koruma açılırken kapalı Bot Physics artık kesinlikle açılmıyor. ChickenNW’de sabit botun aniden fizik açıp yürümesiyle oluşabilen `gx01` riski kaldırıldı.
- Bot Physics kapalıyken yürüyüş paketi gönderilmiyor; erişimdeki spawner doğrudan kırılıyor. Yürüyüş yalnızca kullanıcı Bot Physics’i önceden açmışsa mümkün.
- Erişim hesabı düzeltildi: eski kod ayaktan spawner merkezine 3,5 blok ölçüyordu. Artık vanilla mantığıyla oyuncunun gözünden blok kutusunun en yakın noktasına ölçülüyor ve güvenli 4,25 blok sınırı kullanılıyor. Böylece yanında/üstünde duran bot spawner’ı yanlışlıkla “uzak” saymıyor.
- Gerçekten uzaktaysa log artık ölçülen erişim mesafesini gösteriyor; koruma sessizce fizik açmıyor.
- Ham kazmadaki ters blok yüzü hesabı küçük ve bağımsız bir düzeltme olarak korundu (`WEST/EAST`, `NORTH/SOUTH`, `TOP/BOTTOM`).
- Kullanıcı Bot Physics’i açık tuttuğunda yürüyüş sırasında sunucu tek kez geri çekerse yürüyüş hemen kesiliyor; yerel koordinattan uzaktan kazma gönderilmiyor.
- Spawner regresyon testleri fizik ayarının korunması, vanilla erişim mesafesi, blok yüzü, güvenli süre ve rubber-band reddiyle 8 senaryoya çıkarıldı.
- Paket dosyaları `BASLAT-90.bat`, `EXE-OLUSTUR-90.bat` ve `diag-90.js` olarak güncellendi.

## 1.15.16 · Paket 88 · Spawner kırma anti-cheat düzeltmesi

- Spawner Koruma’nın teorik kazma süresini doğrudan FINISH paketine çevirmesi düzeltildi. Elmas + Verimlilik kazmada yaklaşık 0,5 saniyede giden bitiş paketi ChickenNW tarafından “hızlı blok koyma/kırma” olarak iptal ediliyor, yalnızca animasyon görünüyor ve spawner yerinde kalıyordu.
- Kırma süresi artık mümkünse Mineflayer’ın gerçek durum hesabıyla (yerde/havada olma, su ve efektler dahil) doğrulanıyor; bu hesap spawner için kullanılamazsa güvenli teorik hesap uygulanıyor. Ping, sunucu tiki ve en az 1,5 saniyelik anti-cheat payı eklendi.
- Shift ve bakış durumu kırma başlamadan önce sunucuya yerleşiyor; kazma akışı tek bir `START → bekle → FINISH` oturumu olarak çalışıyor. Başarı yalnızca sunucunun gerçek blok güncellemesiyle kabul ediliyor.
- Sunucu kırmayı onaylamazsa artık yanıltıcı biçimde tamamlanmış sayılmıyor; blok yerinde kaldı uyarısı loglanıyor ve “tümü kırılınca çık” seçeneği hesabı yanlışlıkla oyundan çıkarmıyor.
- Spawner kırma zamanlaması ve paket sırası için 5 otomatik regresyon senaryosu eklendi.
- Paket dosyaları `BASLAT-88.bat`, `EXE-OLUSTUR-88.bat` ve `diag-88.js` olarak güncellendi.

## 1.15.16 · Paket 87 · Ipeksi Dokunuş registry düzeltmesi

- Minecraft 1.20.5+ eşya componentlerindeki büyü kimliklerinin sabit olmadığı dikkate alındı. Özellikle **Silk Touch**, 1.21.4'te `33` iken 1.21.11'de `34` olduğundan paket 86 gerçek ipeksili kazmayı kaçırabiliyordu.
- Spawner Koruma artık component içindeki sayısal büyü kimliğini botun o sürüme ait enchantment registry'si üzerinden `silk_touch` adına çeviriyor; aynı yöntem Verimlilik seviyesi için de kullanılıyor.
- Eski NBT, yazılı büyü adları ve önceki sürüm yedekleri korunurken yanlış kazmayı Ipeksi Dokunuşlu sayabilecek sabit kimlik karşılaştırmaları engellendi.
- Paket dosyaları `BASLAT-87.bat`, `EXE-OLUSTUR-87.bat` ve `diag-87.js` olarak güncellendi.

## 1.15.16 · Paket 86 · Spawner Koruma hareket ve enchant uyumluluğu

- ChickenNW logunda korumanın hareket etmemesinin nedeni olan yanlış **Ipeksi Dokunuş algılama** genişletildi. Artık Prismarine `enchants`, eski NBT, 1.21+ doğrudan component/componentMap, `Map` tabanlı levels ve eşya lore biçimleri destekleniyor.
- Koruma bağlı hesaba sonradan açıldığında yürüyüş için Bot Physics’in gerçekten açıldığı loglanıyor; özellik kapatılınca kullanıcının önceki fizik ayarına dönüyor.
- Ipeksi Dokunuş algılanamazsa yanıltıcı “tamamlandı” mesajı yerine korumanın uygun kazmayı beklediği açıkça yazılıyor; güvenlik gereği kazma paketi gönderilmiyor.
- Electron’ın meta CSP içinde desteklemediği `frame-ancestors` kaldırılarak açılıştaki gereksiz CSP konsol hatası giderildi; diğer CSP güvenlik kuralları korunuyor.
- Paket dosyaları `BASLAT-86.bat`, `EXE-OLUSTUR-86.bat` ve `diag-86.js` olarak güncellendi.

## 1.15.16 · Paket 85 · Gizli giriş komutları ve Spawner Koruma

- Sohbet ve Canlı Sohbet kutularında `/login`, `/gir`, `/register`, `/reg` ve `/l` komutlarından sonraki boşluk dışı karakterler anında `*` ile gizleniyor; sağdaki göz düğmesiyle geçici olarak gösterilebiliyor. Gerçek komut sunucuya gönderilirken sohbet geçmişi ve loglarda sansürlü kopya tutuluyor.
- Giriş Komutları sayfasındaki aynı sansür sistemi `/gir` desteği ve birden fazla parola alanındaki boşlukları koruyan tam maskeleme ile güncellendi.
- **Spawner Koruma** yeniden etkinleştirildi, hesap bazlı çalışacak biçimde düzeltildi ve Makrolar sayfasına eklendi; Spawner AFK deneme süresince kilitli kalmaya devam ediyor.
- Oyuncu algılama yarıçapı 1–50 blok, yeni Spawner yarıçapı 1–150 blok olarak ayrı ve akıcı kaydırıcılarla ayarlanabiliyor. Whitelist yalnızca listedeki oyuncuları yok sayıyor.
- Koruma yalnızca en iyi **Ipeksi Dokunuşlu** kazmayı kullanıyor; uygun kazma yoksa spawnerı kırmıyor. Seçilen yarıçaptaki spawnerlara yürür, Shift basılıyken vanilla tempolu tek kazma akışı kullanır ve tümü gerçekten kırıldıysa hesabı çıkarır.
- Her sunucuda istemeden çalışmaya yol açan genel hesap kapsamı, tek turdan sonra korumayı kilitleyen değişken kapsamı hatası ve yürüyüş sonunda basılı kalabilen sağ/sol kontrolleri düzeltildi. Sürekli geniş alan taraması ve tekrarlanan kazma paketleri kaldırılarak kick riski azaltıldı.
- Spawner Koruma ayar ekranı istemcinin koyu/açık temasıyla uyumlu, durum göstergeli ve akıcı yeni kart tasarımına geçirildi.
- Paket dosyaları `BASLAT-85.bat`, `EXE-OLUSTUR-85.bat` ve `diag-85.js` olarak güncellendi.

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
