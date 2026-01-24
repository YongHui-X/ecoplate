import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";

const sqlite = new Database("ecoplate.db");
const db = drizzle(sqlite);

console.log("Running migrations...");
migrate(db, { migrationsFolder: "./src/db/migrations" });
console.log("Migrations complete!");

sqlite.close();
