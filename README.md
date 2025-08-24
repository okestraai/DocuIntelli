## Development Setup

### Prerequisites
- Node.js 18+ 
- npm or yarn
- Google OAuth Client ID (for Google login)
- Facebook App ID (for Facebook login)

### Installation
1. Clone the repository
2. Install dependencies: `npm install`
3. Copy `.env.example` to `.env` and configure social auth credentials
4. Start the development servers: `npm run dev:full`

This will start both the frontend (Vite) and backend (Express) servers concurrently.

### Social Authentication Setup

#### Google OAuth Setup
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable Google+ API
4. Create OAuth 2.0 credentials
5. Add your domain to authorized origins
6. Copy Client ID to `.env` as `VITE_GOOGLE_CLIENT_ID`

#### Facebook Login Setup
1. Go to [Facebook Developers](https://developers.facebook.com/)
2. Create a new app or select existing one
3. Add Facebook Login product
4. Configure Valid OAuth Redirect URIs
5. Copy App ID to `.env` as `VITE_FACEBOOK_APP_ID`

### Available Scripts
- `npm run dev` - Start frontend development server only
- `npm run server` - Start backend server only  
- `npm run dev:full` - Start both frontend and backend servers
- `npm run build` - Build for production

### API Endpoints
- `POST /api/documents/upload` - Upload multiple documents
- `GET /api/documents` - Get all documents
- `DELETE /api/documents/:id` - Delete a document
- `GET /api/documents/:id/download` - Download a document

### File Storage
Documents are stored in the `server/uploads` directory with unique filenames.
Document metadata is stored in memory (replace with a real database in production).