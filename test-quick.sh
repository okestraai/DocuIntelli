#!/bin/bash

# Quick Manual Test Script for Tier Enforcement
# Run this after starting the backend server

API_URL="http://localhost:5000"
SUPABASE_URL="https://caygpjhiakabaxtklnlw.supabase.co"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}🧪 Quick Tier Enforcement Test${NC}\n"

# Check if backend is running
echo "📡 Checking if backend is running..."
if curl -s "${API_URL}/health" > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Backend is running${NC}\n"
else
    echo -e "${RED}❌ Backend is not running. Start it with: cd server && npm start${NC}"
    exit 1
fi

# Check if you have a token
if [ -z "$AUTH_TOKEN" ]; then
    echo -e "${RED}❌ No AUTH_TOKEN set${NC}"
    echo ""
    echo "To get a token:"
    echo "1. Login to your app"
    echo "2. Open browser console"
    echo "3. Run: localStorage.getItem('sb-<project-id>-auth-token')"
    echo "4. Set it: export AUTH_TOKEN='your-token'"
    echo ""
    exit 1
fi

echo -e "${GREEN}✅ Auth token found${NC}\n"

# Test 1: Check subscription info
echo "📋 Test 1: Checking subscription..."
curl -s "${SUPABASE_URL}/rest/v1/user_subscriptions?select=*" \
  -H "Authorization: Bearer ${AUTH_TOKEN}" \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNheWdwamhpYWthYmF4dGtsbmx3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYwNzMzMTQsImV4cCI6MjA3MTY0OTMxNH0.UYaF1hW_j2HGcFP5W1FMV_G7ODGJuz8qieyf9Qe4Z90" \
  | jq '.[0] | {plan, document_limit, ai_questions_limit, ai_questions_used, feature_flags}'

echo ""

# Test 2: Check document count
echo "📊 Test 2: Checking document count..."
curl -s "${SUPABASE_URL}/rest/v1/documents?select=count" \
  -H "Authorization: Bearer ${AUTH_TOKEN}" \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNheWdwamhpYWthYmF4dGtsbmx3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYwNzMzMTQsImV4cCI6MjA3MTY0OTMxNH0.UYaF1hW_j2HGcFP5W1FMV_G7ODGJuz8qieyf9Qe4Z90" \
  | jq

echo ""

# Test 3: Try to upload a document
echo "📤 Test 3: Testing document upload..."
TEMP_FILE=$(mktemp --suffix=.txt)
echo "Test document content" > "$TEMP_FILE"

UPLOAD_RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" \
  -X POST "${API_URL}/api/upload" \
  -H "Authorization: Bearer ${AUTH_TOKEN}" \
  -F "file=@${TEMP_FILE}" \
  -F "name=Test Document $(date +%s)" \
  -F "category=other")

HTTP_STATUS=$(echo "$UPLOAD_RESPONSE" | grep "HTTP_STATUS" | cut -d: -f2)
RESPONSE_BODY=$(echo "$UPLOAD_RESPONSE" | sed '$d')

echo "$RESPONSE_BODY" | jq

if [ "$HTTP_STATUS" == "403" ]; then
    echo -e "\n${GREEN}✅ Limit enforcement is working! (Got 403)${NC}"
elif [ "$HTTP_STATUS" == "200" ]; then
    echo -e "\n${GREEN}✅ Upload succeeded (within limit)${NC}"
else
    echo -e "\n${YELLOW}⚠️  Unexpected status: ${HTTP_STATUS}${NC}"
fi

rm "$TEMP_FILE"

echo ""
echo -e "${YELLOW}📝 Summary:${NC}"
echo "- If you get 403 with 'Document limit reached': ✅ Enforcement working"
echo "- If you get 200: ✅ Upload succeeded (still within your limit)"
echo "- Check the response JSON for details"
echo ""
