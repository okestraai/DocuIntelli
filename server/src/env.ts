import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

console.log("🔧 Environment Variables Loaded:", {
  SUPABASE_URL: process.env.SUPABASE_URL ? "✓ Set" : "✗ Missing",
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY ? "✓ Set" : "✗ Missing",
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ? "✓ Set" : "✗ Missing",
});
