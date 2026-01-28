import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "./schema";
import { hashPassword } from "../middleware/auth";

const sqlite = new Database("ecoplate.db");
const db = drizzle(sqlite, { schema });

console.log("Seeding database...\n");

// Demo users
const demoUsers = [
  {
    email: "alice@demo.com",
    password: "demo123",
    name: "Alice Wong",
    userLocation: "Queenstown, Singapore 169648",
  },
  {
    email: "bob@demo.com",
    password: "demo123",
    name: "Bob Tan",
    userLocation: "Clementi, Singapore 129588",
  },
];

// Sample listings
const sampleListings = [
  {
    title: "Fresh Organic Apples",
    description: "Sweet and crispy organic apples from local farm.",
    category: "produce",
    quantity: 2,
    unit: "kg",
    price: 5.0,
    originalPrice: 12.0,
    expiryDays: 5,
    location: "Queenstown MRT Station, Singapore 149305|1.2943,103.8016",
  },
  {
    title: "Whole Wheat Bread",
    description: "Freshly baked whole wheat bread.",
    category: "bakery",
    quantity: 2,
    unit: "loaf",
    price: null,
    originalPrice: 4.5,
    expiryDays: 2,
    location: "Clementi Mall, Singapore 129588|1.3149,103.7651",
  },
  {
    title: "Fresh Milk (2L)",
    description: "Full cream fresh milk, unopened.",
    category: "dairy",
    quantity: 2,
    unit: "l",
    price: 3.5,
    originalPrice: 6.0,
    expiryDays: 3,
    location: "Buona Vista MRT, Singapore 138600|1.3073,103.7897",
  },
  {
    title: "Mixed Vegetables Pack",
    description: "Assorted fresh vegetables - carrots, broccoli, lettuce.",
    category: "produce",
    quantity: 1,
    unit: "pack",
    price: 4.0,
    originalPrice: 8.0,
    expiryDays: 4,
    location: "Commonwealth MRT, Singapore 149732|1.3025,103.7981",
  },
];

// Sample products (fridge items)
const sampleProducts = [
  {
    productName: "Organic Eggs",
    category: "dairy",
    quantity: 12,
    unitPrice: 5.9,
    daysAgo: 2,
    description: "Free-range organic eggs",
    co2Emission: 0.4,
  },
  {
    productName: "Fresh Salmon Fillet",
    category: "meat",
    quantity: 2,
    unitPrice: 12.5,
    daysAgo: 1,
    description: "Norwegian salmon, 200g each",
    co2Emission: 1.2,
  },
  {
    productName: "Broccoli",
    category: "produce",
    quantity: 1,
    unitPrice: 2.8,
    daysAgo: 3,
    description: "Fresh broccoli head",
    co2Emission: 0.2,
  },
  {
    productName: "Greek Yogurt",
    category: "dairy",
    quantity: 4,
    unitPrice: 3.5,
    daysAgo: 5,
    description: "Plain Greek yogurt, 200g tubs",
    co2Emission: 0.3,
  },
  {
    productName: "Chicken Breast",
    category: "meat",
    quantity: 3,
    unitPrice: 8.9,
    daysAgo: 1,
    description: "Boneless skinless chicken breast",
    co2Emission: 0.9,
  },
  {
    productName: "Sourdough Bread",
    category: "bakery",
    quantity: 1,
    unitPrice: 6.5,
    daysAgo: 0,
    description: "Artisan sourdough loaf",
    co2Emission: 0.15,
  },
  {
    productName: "Baby Spinach",
    category: "produce",
    quantity: 2,
    unitPrice: 3.2,
    daysAgo: 2,
    description: "Pre-washed baby spinach, 150g bags",
    co2Emission: 0.1,
  },
  {
    productName: "Cheddar Cheese",
    category: "dairy",
    quantity: 1,
    unitPrice: 7.8,
    daysAgo: 7,
    description: "Aged cheddar cheese block, 250g",
    co2Emission: 0.6,
  },
  {
    productName: "Orange Juice",
    category: "beverages",
    quantity: 1,
    unitPrice: 4.5,
    daysAgo: 4,
    description: "Freshly squeezed orange juice, 1L",
    co2Emission: 0.25,
  },
  {
    productName: "Frozen Mixed Berries",
    category: "frozen",
    quantity: 1,
    unitPrice: 8.0,
    daysAgo: 10,
    description: "Strawberries, blueberries, raspberries, 500g",
    co2Emission: 0.3,
  },
  {
    productName: "Jasmine Rice",
    category: "pantry",
    quantity: 1,
    unitPrice: 9.5,
    daysAgo: 14,
    description: "Thai jasmine rice, 2kg bag",
    co2Emission: 0.5,
  },
  {
    productName: "Avocados",
    category: "produce",
    quantity: 3,
    unitPrice: 2.5,
    daysAgo: 1,
    description: "Ripe Hass avocados",
    co2Emission: 0.35,
  },
];

async function seed() {
  try {
    // Clear existing data (order matters for foreign keys)
    console.log("Clearing existing data...");
    sqlite.exec("DELETE FROM listing_images");
    sqlite.exec("DELETE FROM marketplace_listings");
    sqlite.exec("DELETE FROM products");
    sqlite.exec("DELETE FROM users");
    sqlite.exec("DELETE FROM sqlite_sequence");

    // Create users
    console.log("Creating demo users...");
    const createdUsers: { id: number; name: string }[] = [];

    for (const user of demoUsers) {
      const passwordHash = await hashPassword(user.password);
      const [created] = await db
          .insert(schema.users)
          .values({
            email: user.email,
            passwordHash,
            name: user.name,
            userLocation: user.userLocation,
          })
          .returning();

      createdUsers.push({ id: created.id, name: created.name });
      console.log(`  ✓ ${user.email}`);
    }

    // Create listings
    console.log("\nCreating sample listings...");
    for (let i = 0; i < sampleListings.length; i++) {
      const listing = sampleListings[i];
      const seller = createdUsers[i % createdUsers.length];

      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + listing.expiryDays);

      await db.insert(schema.marketplaceListings).values({
        sellerId: seller.id,
        title: listing.title,
        description: listing.description,
        category: listing.category,
        quantity: listing.quantity,
        unit: listing.unit,
        price: listing.price,
        originalPrice: listing.originalPrice,
        expiryDate: expiryDate,
        pickupLocation: listing.location,
        status: "active",
      });

      console.log(`  ✓ "${listing.title}" by ${seller.name}`);
    }

    // Create products (fridge items)
    console.log("\nCreating sample products...");
    for (let i = 0; i < sampleProducts.length; i++) {
      const product = sampleProducts[i];
      const owner = createdUsers[i % createdUsers.length];

      const purchaseDate = new Date();
      purchaseDate.setDate(purchaseDate.getDate() - product.daysAgo);

      await db.insert(schema.products).values({
        userId: owner.id,
        productName: product.productName,
        category: product.category,
        quantity: product.quantity,
        unitPrice: product.unitPrice,
        purchaseDate: purchaseDate.toISOString().split('T')[0], // YYYY-MM-DD format
        description: product.description,
        co2Emission: product.co2Emission,
      });

      console.log(`  ✓ "${product.productName}" for ${owner.name}`);
    }

    console.log("\n========================================");
    console.log("Done! Demo accounts (password: demo123):");
    console.log("  - alice@demo.com");
    console.log("  - bob@demo.com");
    console.log("========================================\n");

  } catch (err) {
    console.error("Seeding failed:", err);
    process.exit(1);
  }

  sqlite.close();
}

seed();