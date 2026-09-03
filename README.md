# PTnext

Süper Lig'in mevcut puan tablosunu, gelecek haftanın olasılıklarıyla karşılaştıran çalışan yerel prototip. Ücretli API ve npm bağımlılığı yok. Node.js 22 veya üzeri gerekir.

```sh
npm run build
npm start
```

Adres: http://localhost:3000

İlk sürümün masaüstü ve 390 piksel mobil kontrolleri tamamlandı. Tam puan tablosu güncellemesinin kapsamı ve otomasyon: [Hafta döngüsü](docs/HAFTA_DONGUSU.md).

```sh
npm test
npm run sync
npm run sync -- --refresh
npm run build
npm run update
```

`sync` önbelleği kullanır; `--refresh` TFF'den yeni kopya alır. `update` yalnız güncel sezonu yeniler, doğrular ve çıktıyı atomik olarak üretir. Codex otomasyonu perşembe 18:00'de kadro incelemesi; cuma 20:00–salı 00:00 arasında dört saatte bir sonuç kontrolü yapar. Hafta içi maçlar fikstür filtresiyle ayrıca kapsanır; maçsız pencerelerde HTTP taraması yapılmaz. Bilgisayarın erişilebilir olması gerekir. Sunucu yalnızca yerel bilgisayarda dinler. Sayfa yenilendiğinde yeni veri gösterilir. Google Fonts erişilemezse sistem yazı tipleri kullanılır.

## Çalışan özellikler

- 2026–2027 resmî fikstürü, üçüncü hafta sonrası puan durumu ve dördüncü hafta tahmini.
- Mevcut ve tahmini sıra, seçilen skorlarla hesaplanan tam puan, %80 sıra aralığı ve yükselme olasılığı.
- Birden çok maçta 1/X/2 sonucu seçip bütün puan tablosunu 10.000 senaryoyla yeniden hesaplama.
- Maçın gol/sonuç olasılıkları, önceki beş lig maçı ve önceki beş lig karşılaşmasına kadar ikili rekabet.
- İlk üç haftanın, hafta başlamadan bilinen bilgilerle geriye dönük canlandırılması. Bunlar maçlardan önce yayımlanmış tahminler değildir.
- İki sezonda kronolojik maç tahmin testi; isabet, Brier, log loss ve kalibrasyon görünümü.
- Kaynak bağlantıları, veri tarihi ve sezon kapsamı.
- TFF ilk 11/yedek arşivi, kaynak ve maç bazlı eksik/geri dönüş kayıtları, nitel kadro incelemesi ve paylaşılabilir kadro kartı. Aday kadro düzeltmesi geçmiş testte iyileşme göstermediği için ana yüzdelere henüz uygulanmaz: [Kadro analizi](docs/KADRO_ANALIZI.md).
- Hakemle takım geçmişi, ev/deplasman ayrımı, belirsizlik aralığı ve gerçekleşen/beklenen galibiyet grafiği. Hakem düzeltmesi yeterli örnek ve geçmiş dönem doğrulaması olmadan uygulanmaz: [Hakem analizi](docs/HAKEM_ANALIZI.md).

## Veri ve ölçüm

3 Eylül 2026 itibarıyla 5.257 sonuç: 2010–2011 / 2025–2026 arasındaki 16 normal sezon ve 2026–2027'nin ilk 27 maçı. 2011–2012 play-off'ları bu kapsamda değildir. Önceki arşivin eksik 28 adet 2024–2025 eşleşmesi TFF'den tamamlandı. TFF'nin 2024–2025 ve 2025–2026 fikstürleri hafta numarası ve gerçekleşen tarihlerle alındı. Güncel 306 maçlık fikstürün ilk dört haftasının tarihleri mevcut; ileri haftalardaki tarihler henüz doldurulmadı.

İlk model yalnız önceki maç skorlarından takım hücum/savunma gücü ve ev avantajı öğrenir. Bağımsız Poisson gol dağılımları kullanır. Aynı günün tahminleri, o günün hiçbir sonucu modele öğretilmeden üretilir. Sezon geçişinde takım güçleri lig ortalamasına yaklaştırılır. Hazır Elo, form, maç sonrası istatistikler ve bahis oranları modele girdi değildir.

647 maçlık 2024–2025 / 2025–2026 geçmiş dönem ölçümü:

| Ölçüt | PTnext | Geçmiş lig sıklığı |
|---|---:|---:|
| 1/X/2 isabeti | %53,94 | %45,44 |
| Brier, üç sonucun hata toplamı | 0,5833 | 0,6446 |
| Log loss | 0,9814 | 1,0669 |

Bunlar maç olasılıklarının ölçümüdür. Haftalık sıralama başarısı, canlı yayımlanmış tahmin başarısı veya bahis getirisi ölçülmüş değildir. Parametreler için hiperparametre araması yapılmadı; bu sonuç bir başlangıç karşılaştırmasıdır.

Eksik gelişmiş istatistiği bulunan 30 tarihsel kayıt ve doğrulanmış bir hükmen karşılaşma eğitim/test dışında tutuldu. Hükmen karşılaşmaların tamamının etiketlenmesi henüz bitmedi. Tekil doğrulanmış istisna `data/match-overrides.json` içinde gerekçe ve kaynakla saklanır. 2024–2025 Adana Demirspor'un sonuçlardan hesaplanan 14 puanı ile resmî 2 puanı arasındaki 12 puan farkı tespit edildi; geçmiş haftalara tarihini bilmeden ceza uygulanmadı.

Puan eşitliğinde tamamlanmış ikili/çoklu eşleşmeler, sonra genel averaj ve atılan gol kullanılır. Tam eşitlikte önceki sıra korunur; resmî karar iddiası yoktur. Tahmini tablo en olası 1/X/2 sonuçlarına uygun skorlarla, 3/1/0 tam puan üzerinden hesaplanır. Simülasyon ortalaması ayrı bir istatistiktir ve puan tablosuna yazılmaz.

## Sınırlar

Puan tablosunda sıra numarası, son 10 sezonda aynı haftada o sırayı alan takımları; takım adı, o takımın aynı haftalardaki sıra ve puanlarını açar. Mevcut görünüm önceki tamamlanmış haftayla, tahmini görünüm tahmin haftasıyla eşleşir. Hafta sürüyorsa mevcut görünüm de süren haftayla karşılaştırılır ve geçmiş cetvellerin hafta sonuna ait olduğu belirtilir. Sezon başlangıcında geçmiş cetvel gösterilmez.

Tarihsel cetveller doğrudan TFF hafta arşivinden alınır; 2016–2017 ile 2025–2026 arasındaki, 364 haftanın tamamı doğrulandı. Kaynak bağlantısı, alınış zamanı ve içerik özeti `data/standings-history.json` içinde saklanır. Sponsor adı değişiklikleri TFF kulüp kimliğiyle eşleştirilir. Ligde bulunmama ve veri eksikliği ayrı durumlardır. Arşiv ertelenen maçların sonradan işlenen sonuçlarını içerebilir; o gün yayımlanmış değişmez bir tablo olarak sunulmaz. Bu görünüm modelin yeni bir girdisi değil, tarihsel karşılaştırmadır.

Oyuncu kadroları, sakatlıklar, cezalar, Avrupa/kupa takvimi ve oyuncu gelişimi ilk modele dahil değildir. Kaynakta oyuncu verisi bulunmadığı için bu özellikler uydurulmadı. Takım stereotipleri modele kural olarak eklenmedi. Son 10 sezonun haftalık cetvelleri ve 2020–2025 Avrupa ana turnuva tarihleri toplandı. Avrupa verisi yalnız örüntü karşılaştırmasında kullanılır; kadro/rotasyon etkisi veya tahmine düzeltme olarak uygulanmaz.

Hafta sürerken gerçek sonuçlar tablonun başlangıcıdır ve yalnızca kalan maçlar tahmin edilir. Sonuçlar tamamlanınca bir sonraki haftaya, tahmini puanlardan değil gerçek puanlardan geçilir. Önceki haftadan erteleme veya resmî puanlarla tutarsızlık bulunursa üretim durur; önceki çalışan çıktı korunur. İçe alınan sezonların en yenisi otomatik seçilir.

Tahmin arşivi `data/predictions/` altında kaynak/veri özetiyle içerik kimliği kullanarak saklanır. Aynı hesap mevcut dosyanın üstüne yazılmaz. Dosya adı kriptografik dış zaman damgası veya yayın kanıtı değildir; yerel kayıt niteliğindedir.

Halka açık sayfalar düşük hızda ve önbellekle okunur. Erişim reddinde işlem durur. Açık kaynak repo lisansı, TFF veya başka kaynaklardan türeyen verinin ticari yeniden kullanım hakkını tek başına kanıtlamaz. Site yerel prototiptir; yayımlama ve reklam entegrasyonu yapılmadı.

## Dosyalar

- `scripts/sync-tff.mjs`: TFF sayfaları ve tarihler; doğrulamalı, önbellekli içe aktarma.
- `scripts/build.mjs`: birleştirme, güncel puan kontrolü, kronolojik doğrulama ve tahmin üretimi.
- `public/model.js`: sunucu üretimi ve tarayıcının ortak istatistik modeli.
- `public/`: bağımlılıksız arayüz ve üretilmiş gösterge verisi.
- `lib/`: CSV/TFF okuyucuları ve takım adı eşleştirmesi.
- `test/`: olasılık, puan dağılımı, veri sızıntısı, averaj ve gerçek kaynak tutarlılığı kontrolleri.
- `docs/UCRETSIZ_VERI_ARASTIRMASI.md`: ilk veri araştırması ve sonraki tamamlamalar.

## Paylaşılabilir analiz kartları

Takım sayfası ve favori takım, iki sezonun hafta hafta sıra/puan grafiği, kritik maçlar, tahmin–gerçekleşen karne, liderlik/Avrupa örüntüleri ve takım/dönem filtreli olasılık karnesi eklendi. Her kartın “Kartı aç” düğmesi ekran görüntüsü için tek kart görünümü sunar. Senaryo bağlantısı takım, hafta ve maç seçimlerini taşır; geçersiz/eski seçimler doğrulanmadan uygulanmaz. Ayrıntılar: [Analiz kartları](docs/ANALIZ_KARTLARI.md).
