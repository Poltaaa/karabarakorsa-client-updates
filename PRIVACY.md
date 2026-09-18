# Gizlilik

## Yerel olarak saklanan veriler

Uygulama ayarları, hesap yapılandırması ve kimlik doğrulama önbelleği Windows kullanıcı veri klasöründe tutulur. Hassas alanlar Electron `safeStorage` üzerinden Windows DPAPI ile korunur.

## Ağ bağlantıları

Uygulama yalnızca işlevleri için gerekli hedeflere bağlanır:

- Kullanıcının seçtiği Minecraft sunucuları
- Microsoft/Minecraft kimlik doğrulama servisleri (Microsoft hesabı kullanıldığında)
- Kullanıcının yapılandırdığı proxy sunucuları
- Güncelleme denetimi için `api.github.com/repos/egemastertt/karabarakorsa-client-updates/releases/latest`
- Sunucunun açıkça gönderdiği kaynak paketi adresi (kabul edilirse)

## Telemetri

Bu kaynak sürümünde geliştiriciye özel analiz, reklam, uzaktan komut veya kullanıcı etkinliği telemetrisi bulunmaz. Oyun sunucuları ve üçüncü taraf kimlik doğrulama hizmetleri kendi gizlilik politikalarına tabidir.

## Günlükler

Paket günlüğü etkinleştirildiğinde teknik paket adları yerel kayıtlara yazılır. Günlük paylaşmadan önce kullanıcı adı, IP, sohbet, sunucu adresi ve diğer kişisel bilgileri temizleyin.
