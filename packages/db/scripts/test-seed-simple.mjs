// Simple test for the seeding script with minimal data
import "./load-env.mjs";

// Override environment variables for minimal test
process.env.JP_TEST_USERS_COUNT = "2";
process.env.JP_TEST_OUTLETS_COUNT = "1";
process.env.JP_TEST_ITEMS_COUNT = "5";
process.env.JP_TEST_POS_TRANSACTIONS_COUNT = "3";
process.env.JP_TEST_SALES_INVOICES_COUNT = "2";
process.env.JP_TEST_SALES_ORDERS_COUNT = "2";
process.env.JP_TEST_CASH_TRANSACTIONS_COUNT = "2";

// Import and run the main seeding script
import("./seed-test-data.mjs");