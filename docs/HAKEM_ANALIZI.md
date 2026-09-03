# Hakemle takım performansı

3 Eylül 2026: TFF'deki 684 maç sayfası kontrol edildi. 2024–2025, 2025–2026 ve 2026–2027'nin oynanmış maçlarından 675 orta hakem ataması elde edildi; 38 orta hakem var. Doğrulanmış bir hükmen maç dışarıda bırakıldı ve analizde 674 hakemli maç kaldı. Güncel dördüncü haftanın dokuz maçında kontrol edilen maç sayfaları orta hakem adı listelemiyor. Bu, başka bir duyuruda atama bulunmadığının kanıtı değildir.

## Ne ölçülüyor?

Bir takımın belirli hakemle geçmiş galibiyet/beraberlik/mağlubiyet sayıları; galibiyet oranı, Wilson yöntemiyle yaklaşık %95 örneklem belirsizliği; ev/deplasman ayrımı ve kümülatif geçmiş grafiği gösterilir. Kaynağın alınma zamanı ve TFF bağlantısı saklanır. Orta hakem ile VAR/yardımcı görevleri ayrıdır; bu sürüm yalnız orta hakemi model girdisi olarak inceler.

FB'nin bir hakemle %60, BJK'nin %83 kazanması tek başına hakem kararlarının BJK lehine olduğunu göstermez. Rakipler, saha dağılımı, takım gücü ve örneklem sayısı farklı olabilir. Kararların doğruluğu, pozisyonun maç olasılığına etkisi ve kayırma bu sonuç verilerinden hesaplanamaz. Araştırmalarda bu sorular ayrıca karar verisi ve doğal deneyler kullanılarak incelenir: [Cohen, Neeman ve Auferoth — Judging Under Public Pressure](https://www.nber.org/papers/w28894), [Garicano, Palacios-Huerta ve Prendergast — Favoritism Under Social Pressure](https://www.nber.org/papers/w8376).

## Araştırma adayı

Temel Poisson modeli geçmiş skorlardan hücum/savunma gücü, saha avantajı ve güncellenen takım performansını hesaplar. Her tarihsel maç için maçın sonucu görülmeden oluşturulmuş galibiyet olasılığı saklanır. Aynı hakemle gerçek galibiyet sayısı, bu temel beklentilerin toplamıyla karşılaştırılır.

Takım sapması: `(gerçek galibiyet − beklenen galibiyet toplamı) / (maç sayısı + 30)`. 30 maçlık önsel, küçük örneklemi sıfıra yaklaştırır; öğrenilmiş veya kesin doğru bir katsayı iddiası değildir.

Ev sahibi olasılığının aday değişimi, iki takımın bu sapmalarının farkının yarısıdır. Değişim ±5 yüzde puanla sınırlandırılır ve olasılıkların geçerli aralıkta kalması sağlanır. Deplasman olasılığı ters yönde değişir; beraberlik aynı kalır. Skor matrisi aynı sonuç olasılıklarına göre yeniden ağırlıklandırılır. Böylece maç kartı, skor seçimi ve tam puan tablosu aynı olasılık modelini kullanır. Takım/hakem verisinde en az sekizer maç ve hakem toplamında en az 30 önceki maç yoksa düzeltme uygulanmaz.

Bu formül sınırlı bir tahmin adayıdır. Nedensel hakem etkisi katsayısı değildir. Takım ve rakip güçleri dışındaki bütün karıştırıcıları kontrol ettiği söylenemez; özellikle kadro ve maçın önem düzeyi henüz yoktur.

## Ana tahmine geçiş

Son tamamlanmış sezon ayrılmış kontrol dönemidir. O dönemin maçları kronolojik olarak, yalnız daha önceki hakem/maç geçmişiyle değerlendirilir. Mevcut durumda dönem 2025–2026'dır; sonraki sezon tamamlandığında dönem otomatik ilerler. Parametreler geçmiş sonuçlara göre taranıp en iyi görünen değerler seçilmedi.

Kullanım eşiği: en az 60 yeterli eşleşme, %80 hakem veri kapsamı, en az 15 farklı hafta ve hem Brier hem log loss hatasında iyileşmenin hafta kümeleriyle hesaplanan yaklaşık %95 aralıkta desteklenmesi. Bu kontrol basit bir kullanıma alma kuralıdır; tekrarlı sezon değerlendirmeleri, model belirsizliği veya bütün seçim yanlılıkları için kesin istatistiksel garanti değildir. Tarihsel atamalar sonradan toplandı; her atamanın o zamanki açıklanma anı doğrulanmadı.

İlk ölçüm: 306/306 hakemli test maçı var, ancak iki takım/hakem için minimum sekiz önceki maçı sağlayan eşleşme sayısı sıfır. Bu nedenle aday düzeltme denenebilecek yeterli örnek yok; hata ölçüleri temel modelle aynı kalıyor. Bu eşitlik "hakem etkisi yok" sonucu değildir. Ana tahmine geçiş kapalıdır. FB–BJK maç sayfasında da atama olmadığı için mevcut %54 oranı korunur; varsayımsal %51 yazılmaz.

## Güncelleme

`npm run sync:referees` mevcut sezon dosyalarında bulunan tarihsel hakem atamalarını tamamlar. Tamamlanmış atamalar önbellekte tutulur. `npm run update` mevcut otomasyon tarafından çağrılırken güncel sezonun eksik atamalarını ve hedef haftanın atamalarını da yeniler. Hakem değişirse hesap tekrar değerlendirilir. Maç başlamışsa önceden kaydedilen tahmin korunur. Hata halinde son geçerli gösterge yayında kalır.

`data/referees.json` kaynak, zaman, belge özeti ve görevleri içerir. `lib/referee.mjs` hesaplama, `test/referee.test.mjs` tarih sınırı, rol ayrımı, örneklem, olasılık tutarlılığı ve kullanıma alma eşiği kontrolleridir.

Sonraki veri ihtiyacı daha eski sezonların hakem atamalarıdır. 2010'a kadar maç sonuçları mevcut olsa da bu eski kayıtların hakem alanları henüz yoktur; tüm 16 sezon için hakem kapsamı varmış gibi gösterilmez. Penaltı, kırmızı kart ve VAR müdahaleleri için pozisyon verisi, zaman ve karar doğruluğu ayrıca gerekir.
