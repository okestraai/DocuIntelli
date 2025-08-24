## Development Setup

### Prerequisites
- Node.js 18+ 
- npm or yarn
- Supabase project with authentication enabled
- Google OAuth Client ID (for Google login)
- Facebook App ID (for Facebook login)

### Installation
1. Clone the repository
2. Install dependencies: `npm install`
3. Copy `.env.example` to `.env` and configure Supabase and social auth credentials
4. Start the development servers: `npm run dev:full`

This will start both the frontend (Vite) and backend (Express) servers concurrently.

### Supabase Setup
1. Create a new project at [Supabase](https://supabase.com)
2. Go to Settings > API to get your project URL and anon key
3. Enable Email authentication in Authentication > Settings
4. Configure social providers (Google, Facebook) in Authentication > Settings > Auth Providers
5. Add your environment variables to `.env`:
   - `VITE_SUPABASE_URL=your-project-url`
   - `VITE_SUPABASE_ANON_KEY=your-anon-key`

### Social Authentication Setup

#### Google OAuth Setup
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable Google+ API
4. Create OAuth 2.0 credentials
5. Add your domain to authorized origins
6. Copy Client ID to `.env` as `VITE_GOOGLE_CLIENT_ID`

**For Supabase Integration:**
1. In your Supabase project, go to Authentication > Settings > Auth Providers
2. Enable Google provider and add your Google OAuth credentials
3. Set the redirect URL to your Supabase auth callback URL

#### Facebook Login Setup
1. Go to [Facebook Developers](https://developers.facebook.com/)
2. Create a new app or select existing one
3. Add Facebook Login product
4. Configure Valid OAuth Redirect URIs
5. Copy App ID to `.env` as `VITE_FACEBOOK_APP_ID`

**For Supabase Integration:**
1. In your Supabase project, enable Facebook provider in Auth Providers
2. Add your Facebook App credentials
3. Configure the redirect URL in Facebook app settings

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