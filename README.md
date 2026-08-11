<div align="center">

# IlanAvci

**R10.net ilan takip ve fırsat yakalama aracı**

Otomatik tarama, fiyat düşüşü tespiti, anomali analizi ve anlık bildirim sistemi ile çalışan masaüstü uygulaması.

![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20Linux%20%7C%20macOS-blue)
![Electron](https://img.shields.io/badge/electron-28.x-47848f)
![Node](https://img.shields.io/badge/node-20.x-339933)
![License](https://img.shields.io/badge/license-Free-green)

</div>

---

# Özellikler

## Otomatik İlan Takibi

Belirlenen platformlarda otomatik arama yaparak yeni ilanları takip eder.

- Belirli aralıklarla otomatik tarama
- Yeni ilan algılama
- Daha önce görülmüş ilanların tekrar engellenmesi
- Arka planda çalışma desteği


## Anlık Bildirim Sistemi

Yeni fırsatlar bulunduğunda kullanıcıyı bilgilendirir.

Desteklenen bildirimler:

- Masaüstü bildirimi
- Telegram bildirimi
- Sesli alarm


## Fiyat Analizi

İlan fiyatlarını analiz ederek fırsatları tespit eder.

Özellikler:

- Ortalama fiyat karşılaştırması
- Ucuz ilan tespiti
- Fiyat anomalisi analizi
- Fiyat değişim geçmişi
- İstatistiksel sapma hesaplama


## Fiyat Düşüşü Alarmı

Takip edilen ilanlarda fiyat değişikliklerini yakalar.

Örnek:

```
Eski fiyat: 5000 TL
Yeni fiyat: 3500 TL

%30 fiyat düşüşü algılandı
```


## Satıcı Analizi

Satıcı geçmişlerini analiz eder.

Kontrol edilen bilgiler:

- Toplam ilan sayısı
- Ortalama fiyat
- Fiyat tutarlılığı
- Güven skoru


## Çok Kriterli Filtreleme

Detaylı takip kuralları oluşturulabilir.

Desteklenen filtreler:

- Anahtar kelime
- Hariç tutulacak kelimeler
- Minimum fiyat
- Maksimum fiyat
- Kategori
- Platform


## Yerel Veritabanı

SQLite kullanılarak hızlı ve güvenli veri saklama yapılır.

Kaydedilen veriler:

- Takip listeleri
- İlan geçmişi
- Fiyat değişimleri
- Alarm kayıtları
- Satıcı bilgileri


## Modern Arayüz

Electron tabanlı masaüstü uygulaması.

Özellikler:

- Karanlık tema
- Dashboard ekranı
- Sistem tepsisi desteği
- Arka planda çalışma


## Çoklu Platform Desteği

Desteklenen işletim sistemleri:

- Windows
- Linux
- macOS


---

# Desteklenen Platformlar

Mevcut platform modülleri:

- R10.net
- Sahibinden
- TürkHackTeam
- Dolap


Yeni platformlar kolayca eklenebilir.

Platform dosyaları:

```
lib/platforms/
```

içerisinde bulunur.


---

# Kurulum


## Gereksinimler

- Node.js 18.x veya 20.x
- npm 9+
- Git


## Kurulum Adımları


Depoyu indirin:

```bash
git clone https://github.com/ossiqn/ilanavci.git

cd ilanavci
```


Bağımlılıkları yükleyin:

```bash
npm install
```


Uygulamayı başlatın:

```bash
npm start
```


---

# Build Alma


## Windows

```bash
npm run build:win
```


## macOS

```bash
npm run build:mac
```


## Linux

```bash
npm run build:linux
```


Çıktılar:

```
dist/
```

klasörü içerisinde oluşturulur.


---

# Kullanım


## Takipçi Oluşturma


Uygulama açıldıktan sonra:

```
Takipçiler
   |
   Yeni Takip
```

bölümünden yeni takip oluşturulur.


Desteklenen alanlar:

| Alan | Açıklama |
|---|---|
| Takip Adı | Takip ismi |
| Anahtar Kelimeler | Aranacak kelimeler |
| Hariç Tut | Yok sayılacak kelimeler |
| Min Fiyat | Minimum fiyat |
| Max Fiyat | Maksimum fiyat |
| Kategori | Platform kategorisi |
| Telegram | Bildirim ayarı |


---

# Telegram Kurulumu


1. Telegram üzerinden BotFather açılır.

2. Yeni bot oluşturulur.

```
/newbot
```

3. Token alınır.

4. Chat ID öğrenilir.

5. Ayarlar bölümünden bilgiler girilir.

6. Test bildirimi gönderilir.


---

# Alarm Sistemi


Sistem aşağıdaki durumlarda alarm oluşturur:


| Alarm | Açıklama |
|-|-|
| Yeni İlan | Yeni bulunan ilan |
| Fiyat Düşüşü | %15+ düşüş |
| Fiyat Anomalisi | Ortalama fiyatın altında ilan |
| İstatistiksel Sapma | Normal değer dışı fiyat |
| Acil Satış | Acil, son fiyat gibi kelimeler |


---

# Proje Yapısı


```
ilanavci/

├── package.json
├── main.js
├── preload.js

├── src/

│   ├── index.html
│   ├── style.css
│   ├── renderer.js

│   ├── pages/
│   │   ├── dashboard.html
│   │   ├── watchers.html
│   │   ├── alerts.html
│   │   ├── history.html
│   │   └── settings.html

│   └── assets/
│       ├── logo.png
│       └── tray-icon.png


├── lib/

│   ├── database.js
│   ├── scraper.js
│   ├── parser.js
│   ├── analyzer.js
│   ├── notifier.js
│   ├── scheduler.js

│   └── platforms/
│       ├── r10.js
│       ├── sahibinden.js
│       ├── turkhackteam.js
│       └── dolap.js


├── data/

│   └── ilanavci.db
```

---

# Kullanılan Teknolojiler


## Electron

Cross-platform masaüstü uygulama framework.


## SQLite

Yerel hızlı veri saklama sistemi.


## Cheerio

HTML parsing işlemleri.


## Node Cron

Zamanlanmış görev sistemi.


## Electron Store

Kalıcı ayar yönetimi.


---

# Modül Açıklamaları


## database.js

Veritabanı işlemlerini yönetir.

Görevleri:

- Tablo oluşturma
- İlan kaydetme
- Güncelleme
- Alarm kayıtları


---

## scraper.js

Platformlardan veri çekme katmanı.


Özellikler:

- HTTP istekleri
- User-Agent değiştirme
- Retry sistemi
- Timeout kontrolü


---

## parser.js

Ham veriyi standart ilan formatına çevirir.


İşlemler:

- Başlık temizleme
- Fiyat ayrıştırma
- Link çıkarma
- Satıcı bilgisi alma


---

## analyzer.js

Fiyat analiz motorudur.


Kontroller:

- Ortalama fiyat
- Fiyat sapması
- Z-score
- Fiyat düşüşü
- Aciliyet kelimeleri


---

## notifier.js

Bildirim sistemini yönetir.


Desteklenen kanallar:

- Desktop
- Telegram
- Ses


---

## scheduler.js

Otomatik tarama zamanlayıcısıdır.


Akış:

```
Scheduler

↓

Platform araması

↓

Parser

↓

Database

↓

Analyzer

↓

Notifier
```


---

# Yeni Platform Ekleme


Yeni platform eklemek için:


Dosya oluştur:

```
lib/platforms/yeni.js
```


Örnek:


```javascript
async function search(watcher){

    return {
        success:true,
        listings:[]
    };

}


module.exports={

name:"yeni",

displayName:"Yeni Platform",

search

};
```


Daha sonra scheduler içerisine eklenir.


---

# Güvenlik


Uygulama güvenlik önlemleri:

- contextIsolation aktif
- nodeIntegration kapalı
- IPC whitelist sistemi
- Prepared SQL sorguları
- Local veri koruması


---

# Lisans


Bu yazılım OSSIQN tarafından geliştirilmiştir.

Kurallar:

- Satışı yasaktır.
- Kaynak kod kredileri kaldırılamaz.
- Değiştirilmiş sürümlerde orijinal geliştirici belirtilmelidir.


---

# Katkı


Pull request göndererek katkıda bulunabilirsiniz.


Büyük değişikliklerden önce issue açılması önerilir.


---

# Yazar


**OSSIQN**

Github:

https://github.com/ossiqn


R10:

https://www.r10.net/profil/217094-ossiqn.html


---

<div align="center">

Bu proje işinize yaradıysa ⭐ bırakmayı unutmayın.

</div>
