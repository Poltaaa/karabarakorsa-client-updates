# Karabarakorsa AFK Client

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Source available](https://img.shields.io/badge/source-available-brightgreen.svg)](#kaynaktan-derleme)

Windows için Electron, Mineflayer ve Minecraft Protocol tabanlı açık kaynak Minecraft AFK istemcisi.
Bu depo **v1.15.13 / paket 68** kaynak kodunu içerir.

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
- Giriş komutları
- Auto Farm ve canlı sunucu ekranı
- SOCKS4, SOCKS5 ve HTTP proxy desteği
- Türkçe ve İngilizce arayüz
- Sessiz otomatik güncelleme ve Windows bildirimleri
- Kaynak paketi yanıt yönetimi

## Kaynaktan çalıştırma

Gereksinimler:

- Windows 10/11
- Node.js 20 LTS veya daha yeni bir LTS sürümü
- npm

```bash
git clone https://github.com/Poltaaa/karabarakorsa-client-updates.git
cd karabarakorsa-client-updates
npm ci
npm run verify
npm start
```

Windows'ta alternatif olarak `BASLAT-68.bat` dosyasını çalıştırabilirsiniz.

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

Çıktılar `dist/` klasörüne yazılır. `EXE-OLUSTUR-68.bat` aynı işlemi Windows'ta otomatik yapar.

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
Get-FileHash '.\Karabarakorsa AFK Client Setup 1.15.13.exe' -Algorithm SHA256
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
