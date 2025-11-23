import dotenv from "dotenv";
import path from "path";

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

import express, { Request, Response } from "express";
import cors from "cors";
import uploadRoutes from "./routes/upload";

const app = express();
const PORT = process.env.PORT || 5000;

console.log("🔧 Environment Check:", {
  SUPABASE_URL: process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL ? "✓ Set" : "✗ Missing",
  SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY ? "✓ Set" : "✗ Missing",
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ? "✓ Set" : "✗ Missing",
});

// Middleware
app.use(cors({
  origin: ["http://localhost:5173", "http://localhost:3000"],
  credentials: true,
}));
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Routes
app.use("/api", uploadRoutes);

// Health check endpoint
app.get("/api/health", (req: Request, res: Response) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    message: "Backend server is running",
    auth: "Handled by Supabase Auth on frontend",
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Backend server running on port ${PORT}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/api/health`);
  console.log(`🔐 Auth: Handled by Supabase Auth (frontend)`);
});
