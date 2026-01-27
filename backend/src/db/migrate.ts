import { Database } from "bun:sqlite";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

const dbPath = join(import.meta.dir, "../../ecoplate.db");
const migrationsDir = join(import.meta.dir, "migrations");

console.log("Running migrations...\n");

const sqlite = new Database(dbPath);
sqlite.exec("PRAGMA journal_mode = WAL;");
sqlite.exec("PRAGMA foreign_keys = ON;");

// Get all .sql files sorted by name
const files = readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

for (const file of files) {
  const sql = readFileSync(join(migrationsDir, file), "utf-8");
  console.log(`  Running ${file}...`);
  sqlite.exec(sql);
  console.log(`  ✓ ${file}`);
}

sqlite.close();
console.log(`\nMigrations complete. Database: ${dbPath}`);
