/**
 * Streak Continuation Test Script
 * Tests the updateStreak() logic across 5 scenarios by directly
 * inserting product_interaction records with controlled timestamps.
 *
 * Run: cd backend && bun run src/tests/test-streak.ts
 */
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { eq, and, inArray } from "drizzle-orm";
import * as schema from "../db/schema";

// Create a standalone DB connection (avoids starting the server via index.ts)
const sqlite = new Database("ecoplate.db");
const db = drizzle(sqlite, { schema });

// ---- helpers ----

function daysAgoDate(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(12, 0, 0, 0); // noon to avoid edge-case midnight issues
  return d;
}

/** Get or create user_points row for userId */
async function getOrCreateUserPoints(userId: number) {
  let points = await db.query.userPoints.findFirst({
    where: eq(schema.userPoints.userId, userId),
  });
  if (!points) {
    const [created] = await db
      .insert(schema.userPoints)
      .values({ userId })
      .returning();
    points = created;
  }
  return points;
}

/** Mirror of gamification-service.ts updateStreak() */
async function updateStreak(userId: number) {
  const userPoints = await getOrCreateUserPoints(userId);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const streakActions = ["consumed", "shared", "sold"];

  const allInteractions =
    await db.query.ProductSustainabilityMetrics.findMany({
      where: and(
        eq(schema.ProductSustainabilityMetrics.userId, userId),
        inArray(schema.ProductSustainabilityMetrics.type, streakActions)
      ),
      orderBy: (t, { desc }) => [desc(t.todayDate)],
    });

  const todayInteractions = allInteractions.filter((i) => {
    const d = new Date(i.todayDate);
    d.setHours(0, 0, 0, 0);
    return d.getTime() === today.getTime();
  });

  if (todayInteractions.length > 1) {
    return; // already counted today
  }

  const previousInteraction = allInteractions.find((i) => {
    const d = new Date(i.todayDate);
    d.setHours(0, 0, 0, 0);
    return d.getTime() < today.getTime();
  });

  let newStreak: number;
  if (!previousInteraction) {
    newStreak = 1;
  } else {
    const lastDate = new Date(previousInteraction.todayDate);
    lastDate.setHours(0, 0, 0, 0);
    if (lastDate.getTime() === yesterday.getTime()) {
      newStreak = userPoints.currentStreak + 1;
    } else {
      newStreak = 1;
    }
  }

  await db
    .update(schema.userPoints)
    .set({ currentStreak: newStreak })
    .where(eq(schema.userPoints.userId, userId));
}

/** Award points (simplified version matching gamification-service.ts) */
async function awardPoints(
  userId: number,
  action: "consumed" | "shared" | "sold" | "wasted"
) {
  const POINT_VALUES = { consumed: 5, shared: 10, sold: 8, wasted: -3 };
  const amount = POINT_VALUES[action];
  const userPoints = await getOrCreateUserPoints(userId);
  const newTotal = Math.max(0, userPoints.totalPoints + amount);

  await db
    .update(schema.userPoints)
    .set({ totalPoints: newTotal })
    .where(eq(schema.userPoints.userId, userId));

  if (["consumed", "shared", "sold"].includes(action)) {
    await updateStreak(userId);
  } else if (action === "wasted") {
    await db
      .update(schema.userPoints)
      .set({ currentStreak: 0 })
      .where(eq(schema.userPoints.userId, userId));
  }
}

/** Reset state: clear interactions, reset streak & points for user */
async function resetUser(userId: number) {
  sqlite.exec(`DELETE FROM product_interaction WHERE user_id = ${userId}`);
  await db
    .update(schema.userPoints)
    .set({ currentStreak: 0, totalPoints: 0 })
    .where(eq(schema.userPoints.userId, userId));
}

/** Insert a product_interaction with a specific date */
async function insertInteraction(
  productId: number,
  userId: number,
  date: Date,
  type: string
) {
  await db.insert(schema.ProductSustainabilityMetrics).values({
    productId,
    userId,
    todayDate: date,
    quantity: 1.0,
    type,
  });
}

/** Insert a "today" interaction and call awardPoints (simulates UI action) */
async function doActionToday(
  productId: number,
  userId: number,
  type: "consumed" | "shared" | "sold" | "wasted"
) {
  await db.insert(schema.ProductSustainabilityMetrics).values({
    productId,
    userId,
    quantity: 1.0,
    type,
  });
  await awardPoints(userId, type);
}

async function getStreak(userId: number): Promise<number> {
  const row = await db.query.userPoints.findFirst({
    where: eq(schema.userPoints.userId, userId),
  });
  return row?.currentStreak ?? 0;
}

// ---- test runner ----

let passed = 0;
let failed = 0;

function assert(label: string, actual: number, expected: number) {
  if (actual === expected) {
    console.log(`  PASS: ${label} (streak = ${actual})`);
    passed++;
  } else {
    console.log(`  FAIL: ${label} — expected ${expected}, got ${actual}`);
    failed++;
  }
}

// ---- main ----

async function main() {
  // Determine test user and product IDs from existing seed data
  const user = await db.query.users.findFirst();
  if (!user) {
    console.error("No users in DB. Run `bun run db:seed` first.");
    process.exit(1);
  }
  const product = await db.query.products.findFirst({
    where: eq(schema.products.userId, user.id),
  });
  if (!product) {
    console.error("No products for user. Run `bun run db:seed` first.");
    process.exit(1);
  }

  const uid = user.id;
  const pid = product.id;

  console.log(`\nUsing user: ${user.name} (id=${uid}), product id=${pid}\n`);
  console.log("=".repeat(60));

  // ---- Scenario 1: No previous interactions, consume today → streak = 1 ----
  console.log("\nScenario 1: No previous interactions, consume today");
  await resetUser(uid);
  await doActionToday(pid, uid, "consumed");
  assert("First ever consume → streak 1", await getStreak(uid), 1);

  // ---- Scenario 2: Yesterday interaction exists, consume today → currentStreak + 1 ----
  console.log("\nScenario 2: Yesterday interaction, consume today");
  await resetUser(uid);
  // Simulate yesterday interaction
  await insertInteraction(pid, uid, daysAgoDate(1), "consumed");
  // Set streak to 1 (as if yesterday was first day)
  await db
    .update(schema.userPoints)
    .set({ currentStreak: 1 })
    .where(eq(schema.userPoints.userId, uid));
  // Today action
  await doActionToday(pid, uid, "consumed");
  assert("Continue streak → streak 2", await getStreak(uid), 2);

  // ---- Scenario 3: Interaction from 3+ days ago, consume today → reset to 1 ----
  console.log("\nScenario 3: Interaction 3 days ago, consume today");
  await resetUser(uid);
  await insertInteraction(pid, uid, daysAgoDate(3), "consumed");
  await db
    .update(schema.userPoints)
    .set({ currentStreak: 5 })
    .where(eq(schema.userPoints.userId, uid));
  await doActionToday(pid, uid, "consumed");
  assert("Gap > 1 day → streak reset to 1", await getStreak(uid), 1);

  // ---- Scenario 4: Waste today after any streak → streak = 0 ----
  console.log("\nScenario 4: Waste today (after streak)");
  await resetUser(uid);
  await db
    .update(schema.userPoints)
    .set({ currentStreak: 3 })
    .where(eq(schema.userPoints.userId, uid));
  await doActionToday(pid, uid, "wasted");
  assert("Waste resets streak → 0", await getStreak(uid), 0);

  // ---- Scenario 5: Waste today, then consume today → streak = 1 ----
  console.log("\nScenario 5: Waste then consume same day");
  await resetUser(uid);
  await db
    .update(schema.userPoints)
    .set({ currentStreak: 3 })
    .where(eq(schema.userPoints.userId, uid));
  await doActionToday(pid, uid, "wasted");
  assert("After waste → streak 0", await getStreak(uid), 0);
  await doActionToday(pid, uid, "consumed");
  assert("Then consume → streak 1", await getStreak(uid), 1);

  // ---- Summary ----
  console.log("\n" + "=".repeat(60));
  console.log(`Results: ${passed} passed, ${failed} failed out of ${passed + failed}`);
  if (failed > 0) {
    console.log("\nSome tests FAILED. Review the streak logic.");
    process.exit(1);
  } else {
    console.log("\nAll tests PASSED!");
  }

  // Clean up: reset user to 0 after testing
  await resetUser(uid);
  sqlite.close();
}

main().catch((err) => {
  console.error("Test error:", err);
  sqlite.close();
  process.exit(1);
});
