# Tahmini puan tablosu ve güncelleme döngüsü

## Tek maçın tablodaki karşılığı

Model önce ev sahibi / beraberlik / deplasman olasılıklarını hesaplar. En yüksek olasılıklı sonuç seçilir. Sonra yalnız bu sonuçla uyumlu skorlar arasından en olası skor alınır. Tam eşitlikte sabit H/X/A sırası ve skor dizisindeki ilk değer kullanılır; rastgele değişmez.

Örneğin Galatasaray'ın mevcut puanı 7 ve seçilen sonuç Galatasaray galibiyetiyse, tahmini hafta sonu puanı 10 olur. Galibiyet 3, beraberlik 1, mağlubiyet 0 puandır. İki rakibe aynı maçta çelişen sonuçlar yazılmaz. Maç sayısı, atılan/yenen gol, averaj ve form da aynı skor kaydından hesaplanır. Bay geçen takımın maçı artmaz.

Tek en olası skor ile en olası 1/X/2 aynı olmayabilir: 1-1 bütün skorlar arasında en yüksek tek olasılığa sahipken, farklı ev sahibi galibiyetlerinin toplamı beraberlikten yüksek olabilir. Bu nedenle tercih önce sonuç, sonra o sonuca uygun skordur. Maç kartında tabloya uygulanan sonuç ve skor açıkça gösterilir.

10.000 simülasyon yalnız ayrı belirsizlik istatistikleri içindir. Ortalama puan maç detayında açıklama olarak bulunur; puan tablosuna yazılmaz. Tahmini sıralama seçilen tam puanlar ve skorların averajıyla belirlenir.

## Yeni veri geldiğinde

1. `npm run update` güncel TFF sezonunu ve haftalık tarihleri önbelleğe alır. Geçmiş sezonları her çalışmada yeniden indirmez.
   Aynı adım, sezon grafikleri ve sıra/takım karşılaştırması için önceki 10 sezonun bütün TFF haftalık cetvellerini hazırlar. Yalnız önbellekte olmayan cetveller indirilir. Sezon listesi ilerleyince 10 sezonluk pencere de ilerler; yeni sezon bağlantısı eksikse arşiv dizini yeniden okunur. Sezon/hafta, kulüp kimliği ve puan tutarlılığı doğrulanamayan kayıtla yayın yapılmaz. Yalnız bu arşivi hazırlamak için `node scripts/sync-tff.mjs --history-only` kullanılabilir.
   Güncel sezonun eksik hakem atamaları ve hedef haftanın hakemleri de yenilenir. Orta hakem analizi yeterli geçmiş ve doğrulama koşullarını sağlarsa skor olasılıklarına eklenir; ayrıntılar `HAKEM_ANALIZI.md` dosyasındadır.
2. Sonuçlardan hesaplanan puanlar ve maç sayıları resmî tabloyla karşılaştırılır. Fark varsa yeni yayın durur.
3. Hafta sürüyorsa gerçek sonuçlar başlangıç tablosundadır. Yalnız kalan maçlar tahmin edilir; gerçekleşen maça yeniden puan verilmez.
4. Hafta tamamlanınca hedef otomatik olarak sonraki haftaya geçer. Önceki tahmini tablo, yeni haftanın gerçek tablosu olarak kullanılmaz. Örneğin 7 puanlı GS için 10 puan tahmin edilmiş ama maç berabere bitmişse, sonraki hesap 8 puandan başlar.
5. Henüz başlamamış maçların olasılıkları yeni geçmiş verilerle güncellenir. Gün içindeki sonuçlar güç modeline ertesi gün girer; resmî puan tablosuna ise kaynakta görüldüğünde yansır. Başlamış fakat sonucu henüz gelmemiş maç için önceden zaman damgalanmış olasılık korunur. Böyle bir kayıt yoksa maç öncesi tahmin üretilmiş gibi davranılmaz; işlem durur.
6. Hafta başlamadan ilk oluşturulan tahmin `data/predictions/*-opening-v2.json` içinde değişmeden tutulur. Daha sonraki haftalarda bu kayıt arşiv görünümünde açılır. Yeni hesaplar ayrı sürüm dosyalarıdır. Eski, önceden kaydedilmemiş haftalar açıkça geriye dönük canlandırma olarak kalır.
7. Önce aday gösterge dosyası hazırlanır; testler bu dosya üzerinde çalışır. Bütün adımlar başarılıysa aday dosya tek adımda yayına alınır. Test hatası dahil herhangi bir hata halinde son çalışan gösterge korunur. Güncelleme sonucu `public/data/update-status.json` içindedir. Değişmeyen hesaplar yeni tahmin arşivi dosyaları oluşturmaz.

## Düzenli çalışma

Sonuç otomasyonu Türkiye saatiyle 00, 04, 08, 12, 16 ve 20 saatlerinde önce yerel fikstür filtresini çalıştırır. Cuma 20:00'den pazartesiyi salıya bağlayan 00:00 son kontrolüne kadar, o hafta sonu fikstürde maç varsa `node scripts/update.mjs --scheduled` internete çıkar. Maçsız arada tarama yapılmaz. Salı/çarşamba/perşembe maçı varsa başlangıcından dört saat önce ile altı saat sonrası arasına düşen kontrol saatleri de açılır. Böylece normal hafta içi ve millî arada gereksiz HTTP taraması yapılmaz. Zaman sınırları işletim sisteminden bağımsız UTC+3 hesaplanır. `node scripts/check-schedule.mjs` yalnız yerel dosyayla kararın nedenini gösterir.

Aynı otomasyon perşembe 18:00'de kadro akışını seçerek güncel fikstürü ve haberleri tarar; ayrıntılar `KADRO_ANALIZI.md` içindedir. Codex bir göreve tek heartbeat bağladığı için zamanlayıcıda 18:00 de bulunur; diğer günlerin 18:00 uyanışı yerel filtreden `idle` döner ve tarama yapmaz. Sonuç akışı maç kadrolarını yeni sonuçlarla ekler; haberlerin nitel incelemesi perşembe akışındadır. `update.mjs` aday veriyi test eder ve yalnız başarılı çıktıyı yayımlar. Sonuç, hedef hafta veya tahmin değişmediyse bildirim yapılmaz. Çalışması bilgisayarın ve Codex otomasyon ortamının erişilebilir olmasına bağlıdır; bağımsız bulut barındırma değildir. Sayfa açıldığında/yenilendiğinde son yayımlanan veriyi okur.

Manuel çalıştırma: `npm run update`. İnternet bağlantısı olmadan mevcut veriyle üretme: `npm run update -- --offline`.

## Sınırlar ve durma koşulları

- Önceki haftadan ertelenmiş maç varken daha sonraki haftalar başlamışsa tarih/hafta ilişkisi insan tarafından incelenmelidir. Sistem sessizce yanlış haftaya geçmez.
- Puan cezası nedeniyle sonuç puanları ile resmî cetvel uyuşmazsa işlem durur. Tarihi bilinmeyen ceza geçmişe dağıtılmaz.
- Hedef haftanın maç tarihleri eksikse, kaynak erişimi reddedilirse veya kaynağın biçimi değişirse son geçerli yayın korunur.
- Aynı anda iki güncelleme `data/update.lock` dosyasıyla engellenir. İşlem zorla sonlandırılmışsa kalan kilit, çalışan işlem bulunmadığı doğrulanarak kaldırılmalıdır.
- Sezon tamamlandığında tahmin edilecek maç kalmaz; gerçek sezon sonu tablosu gösterilir. Yeni sezon TFF'de yayımlanıp başarıyla içe aktarılınca en yeni sezon seçilir. Tanınmayan takım adları ve değişen eşitlik kuralları ayrıca kontrol edilmelidir.
- Yerel arşiv dosyaları dışarıdan doğrulanmış yayın zamanı kanıtı değildir. Kamuya açık başarı iddiası için ayrıca dış yayın kaydı gerekir.

Haftalık karne, tamamlanan haftanın TFF cetvelini değişmez hafta başı tahminiyle karşılaştırır. Kayıt yoksa geçmiş canlandırma ayrı etiketlenir. Kritik maç ve filtreli kalibrasyon özetleri ortak hesaplardan üretilir. Avrupa örüntü arşivi önbellekten hazırlanır; mevcut kapsam 2020–2025 ana turnuvalarıdır. Ayrıntılar `ANALIZ_KARTLARI.md` içindedir.
