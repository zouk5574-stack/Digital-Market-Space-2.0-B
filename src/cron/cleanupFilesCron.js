// cron/cleanupFilesCron.js
import cron from "node-cron";
import { supabase } from "../server.js";

export function startCleanupFilesCron() {
  // run daily at 3:30am
  cron.schedule("30 3 * * *", async () => {
    try {
      const retentionDays = Number(process.env.FILE_RETENTION_DAYS || 90);
      const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();

      const { data: oldFiles, error } = await supabase
        .from("product_files")
        .select("id, storage_path")
        .lt("created_at", cutoff);

      if (error) {
        console.error("Cleanup files fetch error:", error);
        return;
      }
      if (!oldFiles || oldFiles.length === 0) {
        console.log("cleanupFilesCron: rien à supprimer");
        return;
      }

      const bucket = process.env.SUPABASE_FILES_BUCKET || "product-files";
      for (const f of oldFiles) {
        // delete from storage
        await supabase.storage.from(bucket).remove([f.storage_path]).catch(err => {
          console.error("Error deleting storage object:", f.storage_path, err);
        });
        // delete metadata
        await supabase.from("product_files").delete().eq("id", f.id).catch(err => {
          console.error("Error deleting metadata:", f.id, err);
        });
        console.log("Deleted old file:", f.id);
      }
    } catch (err) {
      console.error("cleanupFilesCron error:", err);
    }
  });
}
