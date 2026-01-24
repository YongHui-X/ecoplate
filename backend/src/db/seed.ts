import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "./schema";

const sqlite = new Database("ecoplate.db");
const db = drizzle(sqlite, { schema });

console.log("Seeding database...");

// Seed badges
const badgesData = [
  {
    code: "first-item",
    name: "First Step",
    description: "Added your first item to the fridge",
    category: "milestones",
    pointsAwarded: 10,
    sortOrder: 1,
  },
  {
    code: "no-waste-week",
    name: "Zero Waste Week",
    description: "Went a whole week without wasting any food",
    category: "waste-reduction",
    pointsAwarded: 50,
    sortOrder: 2,
  },
  {
    code: "first-share",
    name: "Sharing is Caring",
    description: "Shared your first item with the community",
    category: "sharing",
    pointsAwarded: 25,
    sortOrder: 3,
  },
  {
    code: "first-sale",
    name: "Eco Entrepreneur",
    description: "Made your first sale on the marketplace",
    category: "sharing",
    pointsAwarded: 30,
    sortOrder: 4,
  },
  {
    code: "streak-7",
    name: "Week Warrior",
    description: "Maintained a 7-day activity streak",
    category: "streaks",
    pointsAwarded: 25,
    sortOrder: 5,
  },
  {
    code: "streak-30",
    name: "Monthly Master",
    description: "Maintained a 30-day activity streak",
    category: "streaks",
    pointsAwarded: 100,
    sortOrder: 6,
  },
  {
    code: "items-consumed-10",
    name: "Smart Consumer",
    description: "Consumed 10 items before they expired",
    category: "waste-reduction",
    pointsAwarded: 20,
    sortOrder: 7,
  },
  {
    code: "items-consumed-50",
    name: "Waste Warrior",
    description: "Consumed 50 items before they expired",
    category: "waste-reduction",
    pointsAwarded: 75,
    sortOrder: 8,
  },
  {
    code: "items-consumed-100",
    name: "Eco Champion",
    description: "Consumed 100 items before they expired",
    category: "waste-reduction",
    pointsAwarded: 150,
    sortOrder: 9,
  },
  {
    code: "co2-saved-1kg",
    name: "Climate Helper",
    description: "Saved 1kg of CO2 emissions",
    category: "milestones",
    pointsAwarded: 40,
    sortOrder: 10,
  },
  {
    code: "co2-saved-10kg",
    name: "Planet Protector",
    description: "Saved 10kg of CO2 emissions",
    category: "milestones",
    pointsAwarded: 200,
    sortOrder: 11,
  },
];

for (const badge of badgesData) {
  await db
    .insert(schema.badges)
    .values(badge)
    .onConflictDoNothing({ target: schema.badges.code });
}

console.log("Seeded badges!");
console.log("Database seeding complete!");

sqlite.close();
