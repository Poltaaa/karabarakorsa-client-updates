# Üçüncü Taraf Bileşenleri

Bu proje npm üzerinden açık kaynak paketler kullanır. Tam sürüm ve alt bağımlılık listesi `package-lock.json` içindedir.

Başlıca bileşenler:

- Electron
- Mineflayer
- mineflayer-pathfinder 2.4.5 (MIT)
- minecraft-protocol
- msmc
- prismarine-auth
- socks
- https-proxy-agent
- electron-builder

Her bileşen kendi lisansı altında dağıtılır. Bir release hazırlarken `npm license` veya uygun bir lisans tarama aracıyla alt bağımlılık lisanslarını yeniden kontrol edin.

Paket 117: mineflayer-pathfinder 2.4.5 (MIT) bellekte kendi uyumluluk katmanımızla yüklenir: fullStop doğrudan konum/hız yazmaz ve son yaklaşım toleransı küçültülür. Kurulu paket dosyaları değiştirilmez. Asıl telif/lisans node_modules/mineflayer-pathfinder/LICENSE dosyasında korunur.
