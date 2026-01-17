# DocuVault AI - Intelligent Document Management

DocuVault AI is a comprehensive document lifecycle management platform with AI-powered features, smart expiration tracking, and seamless document organization.

## Features

### Subscription Plans

#### Free Plan
- 2 documents
- 5 AI questions per month
- Basic expiration tracking
- Single device access

#### Starter Plan ($5/month)
- 25 documents
- 50 AI questions per month
- Smart expiration reminders
- All devices sync
- Email notifications
- OCR for scanned documents

#### Pro Plan ($15/month)
- 100 documents
- 200 AI questions per month
- Smart expiration reminders
- All devices sync
- Email notifications
- Priority processing
- OCR for scanned documents
- Priority support

#### Business Plan (Coming Soon)
- Everything in Pro
- 500 AI questions per month
- Team sharing (5 members)
- Advanced analytics
- Dedicated support

## Development Setup

### Prerequisites
- Node.js 18+
- npm or yarn
- Supabase project with email authentication enabled

### Installation
1. Clone the repository
2. Install dependencies: `npm install`
3. Copy `.env.example` to `.env` and configure Supabase credentials
4. Start the development servers: `npm run dev:full`

This will start both the frontend (Vite) and backend (Express) servers concurrently.

### Supabase Setup
1. Create a new project at [Supabase](https://supabase.com)
2. Go to Settings > API to get your project URL and anon key
3. Enable Email authentication in Authentication > Settings
4. Run the database migrations in the `supabase/migrations` folder
5. Add your environment variables to `.env`:
   - `VITE_SUPABASE_URL=your-project-url`
   - `VITE_SUPABASE_ANON_KEY=your-anon-key`

### Stripe Setup (Optional - For Paid Plans)
1. Create a Stripe account at [Stripe Dashboard](https://dashboard.stripe.com)
2. Create products and prices for each plan:
   - Starter: $5/month (or $50/year)
   - Pro: $15/month (or $150/year)
   - Business: $29/month (or $290/year) - Coming Soon
3. Add the price IDs to your `.env`:
   - `VITE_STRIPE_STARTER_PRICE_ID=price_xxxxx`
   - `VITE_STRIPE_PRO_PRICE_ID=price_xxxxx`
   - `VITE_STRIPE_BUSINESS_PRICE_ID=price_xxxxx`

### Database Setup
Run the SQL migration in your Supabase SQL editor:

```sql
-- Copy and paste the contents of supabase/migrations/create_documents_table.sql
```

This will create:
- Documents table with proper relationships
- Row Level Security (RLS) policies
- Storage bucket for document files
- Proper user isolation and security

### Available Scripts
- `npm run dev` - Start frontend development server only
- `npm run server` - Start backend server only  
- `npm run dev:full` - Start both frontend and backend servers
- `npm run build` - Build for production

### Authentication
- **Email/Password**: Users can sign up and sign in with email and password
- **Session Management**: Automatic session persistence across browser refreshes
- **Authorization**: Users can only access their own documents
- **Security**: All data is protected with Row Level Security (RLS)

### API Endpoints
- `POST /api/documents/upload` - Upload multiple documents
- `GET /api/documents` - Get all documents
- `DELETE /api/documents/:id` - Delete a document
- `GET /api/documents/:id/download` - Download a document

### File Storage
Documents are stored in the `server/uploads` directory with unique filenames.
Document metadata is stored in Supabase with proper user isolation.