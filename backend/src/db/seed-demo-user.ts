import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "./schema";
import { hashPassword } from "../middleware/auth";

const sqlite = new Database("ecoplate.db");
const db = drizzle(sqlite, { schema });

console.log("Creating demo user...");

const demoUser = {
  email: "demo@ecoplate.com",
  password: "demo123",
  name: "Demo User",
  userLocation: "Singapore 119076", // NUS area
  avatarUrl: "avatar1", // 🌱 Sprout avatar
};

(async () => {
  try {
    // Check if user already exists
    const existing = await db.query.users.findFirst({
      where: (users, { eq }) => eq(users.email, demoUser.email),
    });

    if (existing) {
      console.log(`User ${demoUser.email} already exists!`);
      console.log(`\nLogin with:`);
      console.log(`  Email: ${demoUser.email}`);
      console.log(`  Password: ${demoUser.password}`);
      sqlite.close();
      return;
    }

    // Hash password
    const passwordHash = await hashPassword(demoUser.password);

    // Create user
    const [newUser] = await db
      .insert(schema.users)
      .values({
        email: demoUser.email,
        passwordHash,
        name: demoUser.name,
        userLocation: demoUser.userLocation,
        avatarUrl: demoUser.avatarUrl,
      })
      .returning();

    // Initialize user points and metrics
    await db.insert(schema.userPoints).values({ userId: newUser.id });
    await db.insert(schema.userSustainabilityMetrics).values({
      userId: newUser.id,
    });

    console.log(`✓ Demo user created successfully!`);
    console.log(`\nLogin with:`);
    console.log(`  Email: ${demoUser.email}`);
    console.log(`  Password: ${demoUser.password}`);
  } catch (error) {
    console.error(`✗ Failed to create demo user:`, error);
  }

  sqlite.close();
})();
