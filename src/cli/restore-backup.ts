/**
 * Restores a backup into a new folder: npm run restore-backup -- <backup.tar.gz> <new-folder>
 *
 * Never writes over the current clients: the target folder must not exist. The command checks every restored
 * client and prints how to switch to the restored copy.
 */
import { loadFactoryConfig } from "../config.js";
import { restoreBackup } from "../panel/backup.js";

async function main(): Promise<void> {
  const [archive, target] = process.argv.slice(2);
  if (!archive || !target) {
    console.error("Kullanım: npm run restore-backup -- <arke-web-studio-yedek-….tar.gz> <yeni-klasör>");
    process.exit(2);
  }
  const factory = loadFactoryConfig();
  const r = await restoreBackup(factory, archive, target);
  console.log(`\nYedek açıldı: ${r.folder}`);
  console.log(`Müşteriler (${r.clients.length}): ${r.clients.join(", ") || "yok"} · ${r.files} dosya`);
  for (const p of r.problems) console.log(`  SORUN: ${p}`);
  console.log(
    `\nŞu anki müşteri klasörü değişmedi (${factory.clientsRoot}). Geri yüklenen kopyaya geçmek için paneli kapat,\n` +
      "şu anki klasörün adını değiştir (silme) ve geri yüklenen klasördeki müşteri klasörünü onun yerine taşı.\n",
  );
}

main().catch((error) => {
  console.error(`Geri yüklenemedi: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
