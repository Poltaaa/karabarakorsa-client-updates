# Güvenlik Politikası

## Desteklenen sürüm

Güvenlik düzeltmeleri en son yayımlanan sürüm için hazırlanır.

## Güvenlik açığı bildirme

Bir güvenlik açığını herkese açık issue olarak paylaşmayın. GitHub deposundaki **Security → Report a vulnerability** (Private vulnerability reporting) özelliğini kullanın. Bildirime şunları ekleyin:

- Etkilenen sürüm
- Yeniden oluşturma adımları
- Beklenen ve gerçekleşen davranış
- Varsa günlükler veya örnek kod

Parola, Microsoft oturum anahtarı, proxy parolası, IP adresi veya kişisel veri paylaşmayın.

## Release güvenliği

- Release EXE dosyaları mümkün olduğunda SHA-256 özetiyle yayımlanmalıdır.
- Kaynak paketindeki `SOURCE-MANIFEST.sha256`, kaynak dosyaların bütünlüğünü kontrol etmek için kullanılabilir.
- Kod imzalama sertifikası yoksa bu durum Release açıklamasında açıkça belirtilmelidir.
