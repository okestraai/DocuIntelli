@@ .. @@
+## Development Setup
+
+### Prerequisites
+- Node.js 18+ 
+- npm or yarn
+
+### Installation
+1. Clone the repository
+2. Install dependencies: `npm install`
+3. Copy `.env.example` to `.env` and configure if needed
+4. Start the development servers: `npm run dev:full`
+
+This will start both the frontend (Vite) and backend (Express) servers concurrently.
+
+### Available Scripts
+- `npm run dev` - Start frontend development server only
+- `npm run server` - Start backend server only  
+- `npm run dev:full` - Start both frontend and backend servers
+- `npm run build` - Build for production
+
+### API Endpoints
+- `POST /api/documents/upload` - Upload multiple documents
+- `GET /api/documents` - Get all documents
+- `DELETE /api/documents/:id` - Delete a document
+- `GET /api/documents/:id/download` - Download a document
+
+### File Storage
+Documents are stored in the `server/uploads` directory with unique filenames.
+Document metadata is stored in memory (replace with a real database in production).
+