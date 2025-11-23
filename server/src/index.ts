// src/index.ts

// The dotenv import and configuration MUST be the first thing to run.
import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(__dirname, "../.env") });

// Import necessary modules
import express, { Request, Response } from "express";
import cors from "cors";
import uploadRoutes from "./routes/upload";

// Initialize the Express application
const app = express();
const PORT = process.env.PORT || 5000;

// Debug log to verify env vars are loaded
console.log("Loaded ENV:", {
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY ? "present" : "missing",
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ? "present" : "missing"
});

// Configure middleware
app.use(cors({
  origin: ["http://localhost:5173", "http://localhost:3000"],
  credentials: true,
}));
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Define API routes
app.use("/api", uploadRoutes);

// Define a simple health check endpoint
app.get("/api/health", (req: Request, res: Response) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",
    supabaseConfigured: !!process.env.SUPABASE_URL && !!process.env.SUPABASE_ANON_KEY,
  });
});

// Start the server
app.listen(PORT, () => {
  console.log(`🚀 Backend running on port ${PORT}`);
  console.log(`📁 Upload endpoint: http://localhost:${PORT}/api/upload`);
  console.log(`🔗 Health check: http://localhost:${PORT}/api/health`);
});