import type { ChangelogEntry } from "./changelog.js";

export const trEntries: ChangelogEntry[] = [{
  version: "0.0.3",
  date: "2026-09-18",
  highlights: [
    "Kenar çubuğunda grup, proje ve oturum girintilerini azaltırken hiyerarşiyi, odak durumlarını, temaları ve bırakma göstergelerini korur.",
    "Proje grupları, kalıcı sıralama, çoklu proje üyeliği, proje kapsamlı bellek ve sabitlenmiş düzenleme panelleri ekler.",
    "Dolu oturumlar için onay ve çalışan oturumlar için koruma ile güvenli proje ve oturum sürükleyip bırakma düzenlemesi ekler.",
    "Kenar çubuğunu kapatan kalıcı proje yolu ipuçlarını kaldırır.",
    "Proje bağlamı değiştiğinde oturum kimliklerini ve dökümleri korur.",
  ],
}, {
  version: "0.0.2",
  date: "2026-09-18",
  highlights: ["Güncelleme hatalarında anlaşılır bir mesaj gösterir ve tanılama ayrıntılarını yerel günlüklerde korur."],
}, {
  version: "0.0.1",
  date: "2026-09-17",
  highlights: ["PI Desktop Nexus’i yönetilen çalışma alanları, iş akışı paketleri, Context Vault ve manzara temalarıyla bağımsız, yerel öncelikli bir yapay zekâ kodlama çalışma alanı olarak başlatır."],
}];
