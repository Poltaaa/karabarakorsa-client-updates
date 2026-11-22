# Gizlilik

## Yerel olarak saklanan veriler

Uygulama ayarları, hesap yapılandırması ve kimlik doğrulama önbelleği Windows kullanıcı veri klasöründe tutulur. Hassas alanlar Electron `safeStorage` üzerinden Windows DPAPI ile korunur.

## Ağ bağlantıları

Uygulama yalnızca işlevleri için gerekli hedeflere bağlanır:

- Kullanıcının seçtiği Minecraft sunucuları
- Microsoft/Minecraft kimlik doğrulama servisleri (Microsoft hesabı kullanıldığında)
- Kullanıcının yapılandırdığı proxy sunucuları
- Güncelleme denetimi için `api.github.com/repos/Poltaaa/karabarakorsa-client-updates/releases/latest`
- Sunucunun açıkça gönderdiği kaynak paketi adresi (kabul edilirse)

## Telemetri

Bu kaynak sürümünde geliştiriciye özel analiz, reklam, uzaktan komut veya kullanıcı etkinliği telemetrisi bulunmaz. Oyun sunucuları ve üçüncü taraf kimlik doğrulama hizmetleri kendi gizlilik politikalarına tabidir.

## Günlükler

Paket günlüğü etkinleştirildiğinde teknik paket adları yerel kayıtlara yazılır. Günlük paylaşmadan önce kullanıcı adı, IP, sohbet, sunucu adresi ve diğer kişisel bilgileri temizleyin.

## Otomatik teknik teşhis

AppData `logs/client-diagnostics.jsonl` ve iki dönüşüm dosyası, toplam en fazla yaklaşık 3 MiB. Yapılandırılmış teknik allowlist: inşa aşaması/koordinat/blok/zemin, paket ad ve sayıları, kapsamı belirtilen geçmiş tepe hızlar, son 1 saniye sayaçları, gerçek konum düzeltmesi mesafesi/sayısı, ağ sayaçları, sınırlı neden kodları. Şifre/token, sohbet/komut, hesap adı, IP/sunucu adresi, envanter/NBT, protokol gövdesi ve heartbeat ID bu yeni dosyaya yazılmaz. Ham kick yerine sınırlı kategori kullanılır; bu banın nedeni hakkında kesin kanıt değildir. Dosyalar ağ üzerinden gönderilmez.

Koordinatlar da kişisel olabilir; paylaşmadan önce inceleyin. Uygulamayı kapatıp dosyaları silebilirsiniz; sonraki oturumda yeni teknik kayıt oluşur. Normal çıkışta tampon yazılır; zorla sonlandırmada son küçük tampon kaybolabilir. Genel log dışa aktarımı ve mevcut UI hata dosyası ayrıdır ve kişisel bilgiler içerebilir.
