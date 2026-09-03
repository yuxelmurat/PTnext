# PTnext ücretsiz veri araştırması

Araştırma tarihi: 3 Eylül 2026.

## Çalışan prototipe geçiş — 3 Eylül 2026

Bu bölüm aşağıdaki ilk araştırmanın ardından yapılan tamamlamaları kaydeder. Aşağıdaki 4.896 satırlık kapsam tablosu indirilen özgün GitHub dosyasına aittir; artık uygulamanın birleşik veri kapsamı değildir.

- TFF'nin [2024–2025](https://www.tff.org/default.aspx?pageID=1730), [2025–2026](https://www.tff.org/default.aspx?pageID=1768) ve [güncel](https://www.tff.org/default.aspx?pageID=198) sayfaları doğrudan okundu. Tarayıcı koruması aşma aracı veya ücretli API gerekmedi.
- 2024–2025: 342 sonuç ve 38 resmî hafta; 2025–2026: 306 sonuç ve 34 resmî hafta alındı. Haftalık sayfalardan maçların gerçekleşen tarihleri eşleştirildi.
- 2026–2027: 18 takım, 306 eşleşme, tamamlanmış ilk üç haftada 27 sonuç. İlk dört haftanın tarih/saatleri alındı.
- Birleşik arşiv 5.257 maça ulaştı. Önceki 28 eksik eşleşme tamamlandı. Sponsor adları tek kulüp adına bağlandı.
- Güncel ve 2025–2026 puan cetvellerindeki O/G/B/M, gol ve puanlar sonuçlarla uyuşuyor. 2024–2025 Adana Demirspor için sonuç puanı 14, resmî puan 2: fark 12. Bu fark tarihini bilmeden eski haftalara dağıtılmadı.
- 30 eksik istatistikli tarihsel kayıt eğitim dışında tutuldu. Ayrıca Galatasaray–Adana Demirspor'un 9 Şubat 2025'te terk edilen ve hükmen sonuçlanan karşılaşması ayrı kaynak kaydıyla çıkarıldı: [AA / PFDK kararı](https://www.aa.com.tr/tr/futbol/pfdkden-adana-demirspora-puan-silme-cezasi/3481587). Tüm idari maç istisnalarının denetimi tamamlanmış değildir.
- 647 maçlık iki sezon kronolojik ölçümünde ilk Poisson modeli %53,94 1/X/2 isabeti, 0,5833 Brier ve 0,9814 log loss üretti. Geçmiş lig sıklığı karşılaştırması %45,44, 0,6446 ve 1,0669. Bu rakamlar haftalık sıralama başarısı veya bahis kazancı değildir.
- Güncel/gelecek puan tablosu, koşullu maç senaryoları, maç detayı ve model karnesi içeren yerel arayüz hazırlandı. Çalıştırma ve kapsam: [README](../README.md).

## İlk arşiv araştırmasının kaydı

15 sezon dönemine (2010–2011 / 2024–2025) yayılan **4.896 Süper Lig maç kaydı** yerel olarak alındı. Bunlar 15 eksiksiz sezon anlamına gelmez: 2024–2025 döneminde 28 ev sahibi–deplasman eşleşmesi eksik. 2025–2026 ve 2026–2027 bu dosyada bulunmuyor.

## İndirilen veriler

- [Ana çalışma dosyası](../data/research/xgabora/super-lig-2010-2025.csv): kaynak dosyadan yalnızca Türkiye ve tarih filtresiyle ayrılan satırlar; kaynak sütunları korunmuştur.
- [Kaynak ve kapsam kaydı](../data/research/xgabora/manifest.json): kaynak adresi, Git blob SHA, alınma günü ve sınırlar.
- [Alan denetimi](../data/research/xgabora/audit.json): sezon bazında satır, takım, eşleşme ve doluluk sayıları.
- [İkinci arşiv](../data/research/footballcsv/manifest.json): 2009–2010 / 2023–2024 dönemlerine ait 15 temel sonuç dosyası. Bu arşivde şut, kart, korner veya oran sütunları bulunmuyor. Aynı asıl kaynaktan türediği için bağımsız doğrulama kaynağı sayılmamalı.

Ana veri kaynağı [xgabora/Club-Football-Match-Data-2000-2025](https://github.com/xgabora/Club-Football-Match-Data-2000-2025); asıl sonuç kaynağı Football-Data.co.uk, hazır Elo kaynağı ClubElo. Repo MIT lisansı yerel dosyalara eklendi. Diğer arşiv [footballcsv/cache.footballdata](https://github.com/footballcsv/cache.footballdata) ve CC0 lisansı da saklandı. Repo lisansı üçüncü taraf veri haklarının bütünüyle çözüldüğünün kanıtı olarak değerlendirilmedi.

## Sezon kapsamı

Şut, korner ve sarı kart sütunları ev sahibi takım alanının dolu olduğu kayıt sayısını gösterir. Oran sütunu OddHome alanıdır. Diğer alanların ayrı dolulukları audit.json içindedir. Dolu olması doğruluğunun bağımsız doğrulandığı anlamına gelmez.

| Sezon | Kayıt | Takım | Şut | Korner | Sarı kart | Oran | Eksik eşleşme |
|---|---:|---:|---:|---:|---:|---:|---:|
| 2010-11 | 306 | 18 | 0 | 0 | 0 | 306 | 0 |
| 2011-12 | 306 | 18 | 0 | 0 | 0 | 302 | 0 |
| 2012-13 | 306 | 18 | 0 | 0 | 0 | 306 | 0 |
| 2013-14 | 306 | 18 | 0 | 0 | 0 | 306 | 0 |
| 2014-15 | 306 | 18 | 0 | 0 | 0 | 306 | 0 |
| 2015-16 | 306 | 18 | 0 | 0 | 0 | 305 | 0 |
| 2016-17 | 306 | 18 | 0 | 0 | 0 | 306 | 0 |
| 2017-18 | 306 | 18 | 306 | 306 | 306 | 303 | 0 |
| 2018-19 | 306 | 18 | 306 | 306 | 306 | 306 | 0 |
| 2019-20 | 306 | 18 | 306 | 306 | 306 | 306 | 0 |
| 2020-21 | 420 | 21 | 420 | 420 | 420 | 420 | 0 |
| 2021-22 | 380 | 20 | 380 | 380 | 380 | 380 | 0 |
| 2022-23 | 342 | 19 | 313 | 313 | 313 | 313 | 0 |
| 2023-24 | 380 | 20 | 379 | 379 | 379 | 380 | 0 |
| 2024-25 | 314 | 19 | 314 | 314 | 314 | 314 | 28 |

Toplam 2724 kayıtta ev sahibi şut alanı, 4859 kayıtta ev sahibi galibiyet oranı dolu.

Kontroller:
- Tarih + ev sahibi + deplasman anahtarında tekrar: 0.
- Boş, negatif veya tam sayı olmayan maç sonu gol kaydı: 0.
- Maç sonu skoruyla H/D/A sonucu arasında uyuşmazlık: 0.
- Dolu şut, korner, sarı/kırmızı kart alanlarında negatif veya tam sayı olmayan değer: 0.
- Eşleşme kontrolü, görülen takımların çift devreli normal sezonunda beklenen N × (N−1) ev/deplasman çiftlerine dayanır. Resmî puan cetveliyle karşılaştırma yapılmadı.
- Pandemi nedeniyle 2020 yazında oynanan maçlar 2019–2020 sezonuna dahil edildi.
- 2011–2012 normal sezonunda 306 kayıt var; play-off maçları bu toplamın dışında. Sezon sonu şampiyonluk analizinde özel format ayrıca modellenmeli.
- Hükmen sonuçlar, maç terkleri, puan silmeleri ve ligden çekilmeler henüz resmî kaynakla etiketlenmedi. Özellikle 2022–2023 ve 2023–2024 dönemindeki boş maç istatistikleri otomatik olarak sıfır kabul edilmemeli.
- 2024–2025 dosyasındaki son maç tarihi sezon sonuna ulaşsa da kapsam eksik. Son tarihe bakarak sezonu tam saymak hatalıdır.

## Hangi ürün işlevleri mümkün?

Bu veriyle iç/dış saha formu, geçmiş eşleşmeler, gol dağılımı, karşılıklı gol, 2,5 alt/üst ve takım güç puanı için başlangıç çalışması yapılabilir. 2017–2018 sonrası maç istatistikleri ek özellikler sağlar.

Haftalık resmî sıralamayı yeniden oluşturmak için hafta numarası, asıl fikstür ve erteleme bilgisi ayrıca alınmalı. Maçları tarihe dizip dokuzlu gruplara ayırmak doğru hafta numarası vermez. Puan cezaları ve sezonun eşitlik kuralları da işlenmelidir.

Bu dosyada oyuncu bazında kadro, dakika, sakatlık, ceza, muhtemel ilk 11 veya xG yok. Avrupa öncesi/sonrası etkiyi incelemek için UEFA ve kupa maçlarının tarihleri ayrıca gerekir. Lig maçları arasındaki gün farkı toplam dinlenme süresi olarak sunulmamalı.

Hazır HomeElo/AwayElo, form ve C_* alanları denetlenmedi. C_* sınıfları aynı maçın istatistiklerinden türemiş olabilir; maç öncesi tahminde kullanılmamalı. Sonuç, şut ve korner gibi aynı maç tamamlandıktan sonra bilinen alanlar geleceği tahmin eden modele doğrudan girdi olamaz; yalnızca önceki maçlardan hesaplanmış değerler kullanılmalı. Geçmiş oranlar Türk İddaa oranı olarak etiketlenmemeli.

## GitHub adayları

- [probberechts/soccerdata](https://github.com/probberechts/soccerdata): birden fazla site için okuyucular ve önbellek. Süper Lig'in her kaynak/sezon için kapsamı ayrıca sınanmalı. Bu araştırmada çalıştırılmadı.
- [kaany43/Turkish-Super-League-toolkit](https://github.com/kaany43/Turkish-Super-League-toolkit): SofaScore temelli maç, kadro ve olay dışa aktarma aracı. Resmî TFF API'si değil; güncel erişimi ve tarihsel kapsamı çalıştırılarak doğrulanmadı.
- [c0ze/super-lig](https://github.com/c0ze/super-lig): Süper Lig arşivi, SQLite ve kaynak dönüştürme örneği. Kod çalıştırılmadı; veri kullanma hakkı ve güncel kaynak erişimi ayrıca değerlendirilmeli.
- [Ernecna/Turkish-Football-League-Scraper](https://github.com/Ernecna/Turkish-Football-League-Scraper): FBref odaklı örnek. Gelişmiş veri kaynağı olarak güvenilmemeli: [Sports Reference'ın 20 Ocak 2026 açıklaması](https://www.sports-reference.com/blog/category/expire21d/) gelişmiş futbol verilerinin kaldırıldığını bildiriyor.

## Toplama yöntemi ve maliyet

Öncelik sezonluk indirilebilir arşivler ve izin verilen halka açık sayfalar olmalı. JavaScript ile yüklenen sayfalarda standart tarayıcı otomasyonu değerlendirilebilir. Önbellek, düşük istek sıklığı, hata halinde bekleme ve yalnızca değişen veriyi yenileme bakım maliyetini azaltır. Erişim reddi, CAPTCHA veya üyelik duvarını aşmaya dayanan bir üretim sistemi kurulmadı.

Doğrudan Football-Data HTTPS indirmesi bu ortamda sertifika doğrulama hatası verdi. Sertifika doğrulaması kapatılmadı; veri GitHub üzerindeki yayınlanmış arşivlerden alındı.

API için ücret ödenmedi ve bağımlılık kurulmadı. Alan adı, barındırma ve bakımın toplam maliyeti ayrıca değerlendirilmelidir. Güncel sakat/cezalı oyuncular için resmî duyuruların tarihli kaydı ve ilk aşamada elle doğrulama düşünülebilir; verisi olmayan oyuncuya otomatik olarak “sağlıklı” denmemeli.

İlk araştırmadaki eksik sezonları tamamlama, güncel TFF fikstürüyle hafta eşleştirme ve başlangıç modelini geçmiş bilgiyle doğrulama işleri yukarıdaki ek çalışmayla tamamlandı. Sıradaki veri ihtiyaçları: tüm hükmen sonuç/puan cezası kayıtları, daha eski sezonların resmî hafta numaraları, oyuncu/kadro durumları ve Avrupa/kupa takvimi. Haftalık sıralama tahminleri için ayrıca sıra hatası ölçümü kurulmalı.
