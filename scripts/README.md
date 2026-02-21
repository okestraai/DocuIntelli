# 🛠️ Scripts Directory

Organized utility scripts for development, testing, and maintenance.

---

## 📁 Directory Structure

### `/billing` - Stripe Billing Scripts

**Purpose**: Manage Stripe billing data synchronization and verification

- **`sync-stripe-billing.js`** - Sync billing data from Stripe to database
  - Use when: Initial setup, data recovery, or manual sync needed
  - Run: `node scripts/billing/sync-stripe-billing.js`

- **`verify-billing-data.js`** - Verify billing data in database
  - Use when: After sync, troubleshooting, data validation
  - Run: `node scripts/billing/verify-billing-data.js`

- **`clear-stripe-data.js`** - Reset Stripe-related database tables
  - Use when: Testing, development, resetting to clean state
  - ⚠️ **Warning**: Deletes billing data, use with caution
  - Run: `node scripts/billing/clear-stripe-data.js`

---

### `/testing` - Integration & Feature Tests

**Purpose**: Test various features and integrations

- **`test-db-connection.js`** - Test database connectivity
- **`test-integration.js`** - Full integration tests
- **`test-url-processing.js`** - Test URL content processing
- **`test-local-embeddings.js`** - Test local embedding service
- **`test-vllm-embeddings.js`** - Test vLLM embedding API
- **`test-vllm-chat.js`** - Test vLLM chat API
- **`test-chat-vllm.js`** - Alternative vLLM chat test
- **`test-edge-function-chat.js`** - Test chat Edge Function
- **`test-embedding-format.js`** - Verify embedding format
- **`test-monitor.js`** - Monitoring tests
- **`test-tier-enforcement.js`** - Test subscription tier limits
- **`generate-tags-test.js`** - Test document tag generation

**Usage**: Run individual tests as needed during development

---

### `/verification` - Data Verification Scripts

**Purpose**: Validate data integrity and consistency

- **`verify-all-embeddings.js`** - Verify all document embeddings
  - Use when: After embedding migration, checking data quality
  - Run: `node scripts/verification/verify-all-embeddings.js`

- **`verify-chunks.js`** - Verify document chunks
  - Use when: Checking chunk generation, troubleshooting search
  - Run: `node scripts/verification/verify-chunks.js`

---

### `/maintenance` - Database Maintenance

**Purpose**: Clean up and maintain database tables

- **`clear-embeddings-only.js`** - Clear embedding vectors only
  - Use when: Resetting embeddings without deleting documents
  - Run: `node scripts/maintenance/clear-embeddings-only.js`

- **`clear-old-embeddings.js`** - Remove old/stale embeddings
  - Use when: Cleaning up after migration or model changes
  - Run: `node scripts/maintenance/clear-old-embeddings.js`

---

### `/embeddings` - Embedding Processing & Management

**Purpose**: Process, check, and fix document embeddings

- **`check-embeddings.js`** - Check embedding status
- **`check-embedding-status.js`** - Verify embedding generation status
- **`check-embedding-raw.js`** - Check raw embedding data
- **`check-and-fix-embeddings.js`** - Find and fix embedding issues
- **`check-column-type.js`** - Verify embedding column types
- **`process-all-embeddings.js`** - Process embeddings for all documents
- **`process-all-embeddings-local.js`** - Process using local embedding service
- **`re-embed-all-documents.js`** - Regenerate all embeddings
- **`trigger-embeddings.js`** - Trigger embedding generation

**Usage**: Run when embeddings need to be generated, verified, or fixed

---

### `/tags` - Document Tag Management

**Purpose**: Generate and verify document tags

- **`check-documents.js`** - Check document data
- **`check-document-tags.js`** - Verify document tags
- **`check-tags.js`** - Check tag status
- **`check-tags-column.js`** - Verify tags column structure
- **`generate-all-tags.js`** - Generate tags for all documents

**Usage**: Run when tags need to be generated or verified

---

### `/migrations` - Database Migration Scripts

**Purpose**: Run and manage database migrations

- **`apply-migration.js`** - Apply pending migrations
- **`run-migration.js`** - Run specific migration

**Usage**: Run when applying schema changes to database

---

## 🚀 Common Usage

### Initial Setup
```bash
# Sync billing data after deployment
node scripts/billing/sync-stripe-billing.js

# Verify the sync worked
node scripts/billing/verify-billing-data.js
```

### Development Testing
```bash
# Test database connection
node scripts/testing/test-db-connection.js

# Test tier enforcement
node scripts/testing/test-tier-enforcement.js
```

### Troubleshooting
```bash
# Verify embeddings are working
node scripts/verification/verify-all-embeddings.js

# Check billing data
node scripts/billing/verify-billing-data.js
```

### Maintenance
```bash
# Clear old embeddings after model change
node scripts/maintenance/clear-old-embeddings.js

# Reset billing data (development only)
node scripts/billing/clear-stripe-data.js
```

---

## ⚠️ Important Notes

1. **Production Safety**: Scripts in `/maintenance` and `/billing` that clear data should NEVER be run in production without proper backups

2. **Environment Variables**: All scripts require proper `.env` configuration

3. **Dependencies**: Ensure all dependencies are installed:
   ```bash
   npm install
   ```

4. **Supabase Connection**: Scripts use `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from environment

5. **Stripe Keys**: Billing scripts require Stripe configuration in environment variables

---

## 📝 Adding New Scripts

When adding new scripts:

1. Place in appropriate directory based on purpose
2. Add clear comments explaining what it does
3. Include usage examples
4. Update this README
5. Use consistent naming: `action-feature.js` (e.g., `test-api.js`, `verify-data.js`)

---

## 🔒 Security

- Never commit scripts with hardcoded credentials
- Always use environment variables
- Add sensitive scripts to `.gitignore` if needed
- Review scripts before running in production

---

**Last Updated**: February 11, 2026
