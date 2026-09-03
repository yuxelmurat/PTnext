# Analiz kartları

Mevcut açık zemin, lacivert metin ve mavi vurgu korunur. Koyu zemin haftanın maçı bölümünde kalır. Her yeni kartta takım/dönem, yöntemi ayırt eden kısa not ve PTnext imzası bulunur. “Kartı aç” düğmesi kontrol alanlarını kaldırarak kartı ekran görüntüsüne uygun bir pencerede gösterir. Bu görünümdeki maç sonuçları yeniden tıklanamaz. Escape ve kapatma düğmesi odağı açan düğmeye döndürür.

## Takım sayfası ve sezon yolu

Takım seçimi, haftalık tam puan tahmini, sıra dağılımı, fikstür ve geçmiş test sonucunu bir araya getirir. Takım tercihi yalnız tarayıcıda saklanır; depolama kapalıysa oturum seçimi çalışır. Hesap veya ücretli servis gerekmez.

`data/standings-history.json` son 10 sezonun tüm TFF haftalık cetvellerini içerir; ilk tamamlanan kapsam 2016–2017 / 2025–2026 arasında 364 haftadır. İki sezon aynı hafta ekseninde karşılaştırılır. Sıra grafiğinde üst taraf daha iyi sıradır. Puan grafiği resmî cetveldeki puanı kullanır. Bay geçen haftalar oynanan maç sayısıyla, eksik haftalar kopuk çizgiyle gösterilir. Mevcut sezonun yalnız tamamlanan haftaları eklenir; gelecek haftalar geçmiş gibi çizilmez. Ertelenen maçların sonradan arşive işlenmesi nedeniyle grafik belirli bir günün değişmez yayın kaydı değildir.

Sıra/takım geçmişindeki sezon adına basmak o takım ve sezonun grafiğini açar; yanındaki ok resmî kaynağa gider.

## Kritik maçlar

Ortak `simulate` fonksiyonu aynı 10.000 koşunun içinde maç sonucu başına liderlik, ilk dört, sıra yükseltme ve ortalama sıra özetleri toplar. Yeni bir rastgele örnekleme veya ana tahmine düzeltme eklenmez. Seçilen takım ve hedef için koşullu oranların en büyük–en küçük farkı sıralanır. En az 30 örnekli sonuçlar gösterilir. Bunlar maç kazanma olasılıkları değil, belirli maç sonucu altında haftayı hedef sırada bitirme olasılıklarıdır.

Kullanıcının diğer maç seçimleri korunur. Sabitlenmiş maçta artık iki alternatif gözlenmediği için o maç karşılaştırma listesinden çıkar; seçim etiketiyle geri alınabilir. Koşullu oranlar yaklaşık Monte Carlo ölçümleridir.

## Haftalık karne

Karne önce değişmez `*-opening-v2.json` kaydını arar. Kayıt zamanı her maçın başlangıcından önce olmalı ve içerideki snapshot zamanı ile uyuşmalıdır. Kayıt yoksa görünür geçmiş canlandırma kullanılır ve açıkça etiketlenir; canlı başarıya dahil edilmez. Hafta tamamlanmadan doğru sıra/puan/isabet ölçümü yayımlanmaz.

Gerçekleşen sıra ve puan, TFF'nin o hafta cetvelinden alınır. Karne doğru sıra sayısını, doğru puan sayısını, ortalama mutlak sıra sapmasını ve doğru 1/X/2 sayısını gösterir. Arşiv tahmini gerçek sonuçlarla yeniden yazılmaz. İlk sürümde 1–3. haftalar canlandırmadır; ilk maç öncesi kayıt 4. haftaya aittir ve sonuç bekler. Bu durum sezon ilerledikçe veriden değişir.

## Lig örüntüleri ve Avrupa

Liderlik analizi iki gözlemi hesaplar: 3. hafta liderinin sezon sonu durumu ve son beş fikstür haftasına lider giren takımın sezon sonu durumu. İkinci başlangıç, 34 haftalı sezonda 29., 38 haftalı sezonda 33. cetveldir. Lig geneli/takım filtresi, pay ve payda, sezon bazında kaynaklar ve Wilson %95 aralığı gösterilir. Gözlenen oran gelecek şampiyonluk olasılığı olarak kullanılmaz.

Avrupa tarihleri OpenFootball'un 2020–2021 ile 2024–2025 arasındaki Şampiyonlar Ligi, Avrupa Ligi ve var olduğu sezonlarda Konferans Ligi ana turnuva dosyalarından alınır. İlk kapsam 126 Türk takımı maçıdır. Elemeler ve bu dönem dışındaki sezonlar dahil değildir; eksik kapsam “Avrupa maçı yok” diye genellenmez. Kaynak içerikleri, alınış zamanı ve SHA-256 bilgisi saklanır.

Avrupa öncesi, sonrası ve deplasman sonrası koşulları 1–4 takvim günüyle sınırlıdır. Her takım-lig maçı bir kez sayılır; iki Avrupa maçı arasındaki bir lig maçı hem öncesi hem sonrası sorgusunda bulunabilir. Kontroller, aynı takım/sezon/lig saha durumu içinde bilinen Avrupa maçlarının dört gün öncesi ve sonrası dışından alınır. Kontrol ortalamaları maruz kalan maçların dağılımına göre ağırlıklandırılır. Eşleşmeyen maç ve kontrol sayısı görünür. Rakip gücü, rotasyon, sakatlık, eleme ve kupa maçları tam kontrol edilmediği için nedensel etki veya otomatik model düzeltmesi iddia edilmez.

## Olasılık karnesi ve bağlantılar

Kalibrasyon kartı takım ve test sezonuyla filtrelenir. Bir maç bir kez sayılır; ölçülen şey en yüksek olasılıklı 1/X/2 sonucunun isabetidir. Takımın galibiyet oranıyla karıştırılmaz. Her dilimde örnek sayısı, ortalama tahmin, gerçekleşen isabet ve Wilson aralığı yer alır. Az örnek açıkça işaretlenir; boş grup %0 başarı değildir.

Senaryo bağlantısı takım, sezon, hafta, maç kimlikleri/sonuçları ve tahmin dosyası zamanını taşır. Sezon/hafta veya seçimler geçersizse uygulanmaz ve kullanıcıya açıklanır. Zaman değişmişse güncel hesapla açıldığı belirtilir. Tahminler bağlantıda dondurulmaz. Yerel bağlantı başka cihazlardan erişilebilir bir yayın değildir; aynı site yayımlandığında bağlantı o alan adından üretilir. Kartın ekran görüntüsü ise bağımsız paylaşılabilir.

## Güncelleme ve doğrulama

`npm run update` TFF'yi, geçmiş haftaları, hakem atamalarını ve önbellekli Avrupa arşivini hazırlayıp aday göstergeyi üretir. Testler geçince tek dosya halinde yayın değişir. Tarihsel dosyalar sonraki çalışmalarda önbellekten okunur; son 10 sezon penceresi güncel sezonla ilerler. Avrupa örüntüsünün kapsamı şimdilik 2020–2025 olarak sabittir; yeni dönem eksiksiz veriyle ayrıca genişletilir.

`npm run update -- --offline` yerel veriden aynı kontrol/yayın sürecini çalıştırır. Testler koşullu dağılımı, veri sızıntısı sınırlarını, filtreleri, eksik haftaları, karne kayıtlarını, bağlantı doğrulamasını ve kaynak kapsamını denetler.
