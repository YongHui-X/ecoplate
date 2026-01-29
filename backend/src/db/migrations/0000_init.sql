CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`name` text NOT NULL,
	`avatar_url` text,
	`user_location` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);
--> statement-breakpoint
CREATE TABLE `products` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
	`product_name` text NOT NULL,
	`category` text,
	`quantity` real NOT NULL,
	`unit_price` real,
	`purchase_date` integer,
	`description` text,
	`co2_emission` real
);
--> statement-breakpoint
CREATE TABLE `user_points` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
	`total_points` integer DEFAULT 0 NOT NULL,
	`current_streak` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_points_user_id_unique` ON `user_points` (`user_id`);
--> statement-breakpoint
CREATE TABLE `product_interaction` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`product_id` integer REFERENCES `products`(`id`) ON DELETE CASCADE,
	`user_id` integer NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
	`today_date` integer NOT NULL,
	`quantity` real NOT NULL,
	`type` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `marketplace_listings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`seller_id` integer NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
	`buyer_id` integer REFERENCES `users`(`id`),
	`product_id` integer REFERENCES `products`(`id`),
	`title` text NOT NULL,
	`description` text,
	`category` text,
	`quantity` real NOT NULL,
	`price` real,
	`original_price` real,
	`expiry_date` integer,
	`pickup_location` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL,
	`completed_at` integer
);
