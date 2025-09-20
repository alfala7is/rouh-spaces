#!/bin/bash

# Test script for Rouh Action Execution Engine API
# Run this when you have the API server running on localhost:3001

echo "🚀 Testing Rouh Action Execution Engine API"
echo "=============================================="
echo

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# API base URL
API_URL="http://localhost:3001"

# Test Space ID (you'll need to create a space first)
SPACE_ID="your-space-id-here"
USER_ID="test-user-123"

echo -e "${BLUE}ℹ️  Before running this test:${NC}"
echo "   1. Start your infrastructure: docker compose -f infra/docker-compose.yml up -d"
echo "   2. Run migrations: pnpm -w db:migrate"
echo "   3. Start API server: pnpm -w dev"
echo "   4. Create a space and update SPACE_ID in this script"
echo

# Check if API is running
echo -e "${YELLOW}🔍 Checking if API is running...${NC}"
if curl -s "$API_URL/health" > /dev/null 2>&1; then
    echo -e "${GREEN}✅ API is running${NC}"
else
    echo -e "${RED}❌ API is not running on $API_URL${NC}"
    echo "   Please start the API server first: pnpm -w dev"
    exit 1
fi

echo

# Function to make API calls with proper headers
api_call() {
    local method=$1
    local endpoint=$2
    local data=$3

    if [ -n "$data" ]; then
        curl -s -X $method "$API_URL$endpoint" \
            -H "Content-Type: application/json" \
            -H "x-space-id: $SPACE_ID" \
            -H "x-user-id: $USER_ID" \
            -d "$data"
    else
        curl -s -X $method "$API_URL$endpoint" \
            -H "x-space-id: $SPACE_ID" \
            -H "x-user-id: $USER_ID"
    fi
}

# Test 1: Create a café order action
echo -e "${BLUE}🧪 TEST 1: Create Café Order Action${NC}"
echo "Creating an order action for Downtown Café..."

order_response=$(api_call POST "/actions" '{
    "itemId": "cafe-item-123",
    "type": "order",
    "parameters": {
        "items": [
            {
                "name": "Latte",
                "price": 5.50,
                "quantity": 1,
                "modifications": ["oat milk", "extra shot"]
            },
            {
                "name": "Croissant",
                "price": 3.25,
                "quantity": 1
            }
        ],
        "pickup_time": "15 minutes",
        "customer_name": "John Doe",
        "customer_phone": "+1234567890",
        "special_instructions": "Make it extra hot"
    }
}')

if echo "$order_response" | jq -e '.action.id' > /dev/null 2>&1; then
    ACTION_ID=$(echo "$order_response" | jq -r '.action.id')
    echo -e "${GREEN}✅ Order action created: $ACTION_ID${NC}"
    echo "   Status: $(echo "$order_response" | jq -r '.action.status')"
    echo "   Type: $(echo "$order_response" | jq -r '.action.type')"
else
    echo -e "${RED}❌ Failed to create order action${NC}"
    echo "Response: $order_response"
fi

echo

# Wait a moment for execution
echo -e "${YELLOW}⏳ Waiting 3 seconds for action execution...${NC}"
sleep 3

# Test 2: Check action status
if [ -n "$ACTION_ID" ]; then
    echo -e "${BLUE}🧪 TEST 2: Check Action Status${NC}"
    echo "Checking status of action: $ACTION_ID"

    status_response=$(api_call GET "/actions/$ACTION_ID/status")

    if echo "$status_response" | jq -e '.action' > /dev/null 2>&1; then
        current_status=$(echo "$status_response" | jq -r '.action.status')
        echo -e "${GREEN}✅ Status retrieved: $current_status${NC}"

        # Show execution details
        if echo "$status_response" | jq -e '.action.executions[0]' > /dev/null 2>&1; then
            handler_name=$(echo "$status_response" | jq -r '.action.executions[0].handlerName // "none"')
            handler_status=$(echo "$status_response" | jq -r '.action.executions[0].status // "none"')
            echo "   Handler: $handler_name ($handler_status)"
        fi

        # Show receipt if available
        if echo "$status_response" | jq -e '.action.receipts[0]' > /dev/null 2>&1; then
            receipt_number=$(echo "$status_response" | jq -r '.action.receipts[0].receiptNumber')
            receipt_status=$(echo "$status_response" | jq -r '.action.receipts[0].status')
            echo "   Receipt: $receipt_number ($receipt_status)"
        fi

        # Show status updates
        echo "   Recent status updates:"
        echo "$status_response" | jq -r '.statusUpdates[]? | "     \(.timestamp | split("T")[1] | split(".")[0]) - \(.status): \(.message // "")"' | head -3
    else
        echo -e "${RED}❌ Failed to get action status${NC}"
        echo "Response: $status_response"
    fi
else
    echo -e "${YELLOW}⚠️  Skipping status check - no action ID${NC}"
fi

echo

# Test 3: Create a contact action (should use email handler)
echo -e "${BLUE}🧪 TEST 3: Create Contact Action${NC}"
echo "Creating a contact action (should use email handler)..."

contact_response=$(api_call POST "/actions" '{
    "itemId": "provider-item-456",
    "type": "contact",
    "parameters": {
        "message": "Hi, I am interested in your services. Please contact me.",
        "user_name": "Jane Smith",
        "user_email": "jane@example.com",
        "user_phone": "+1987654321"
    }
}')

if echo "$contact_response" | jq -e '.action.id' > /dev/null 2>&1; then
    CONTACT_ACTION_ID=$(echo "$contact_response" | jq -r '.action.id')
    echo -e "${GREEN}✅ Contact action created: $CONTACT_ACTION_ID${NC}"
    echo "   Status: $(echo "$contact_response" | jq -r '.action.status')"
else
    echo -e "${RED}❌ Failed to create contact action${NC}"
    echo "Response: $contact_response"
fi

echo

# Test 4: List all actions in space
echo -e "${BLUE}🧪 TEST 4: List All Actions${NC}"
echo "Retrieving all actions in space..."

actions_response=$(api_call GET "/actions?limit=10")

if echo "$actions_response" | jq -e '.[0].id' > /dev/null 2>&1; then
    action_count=$(echo "$actions_response" | jq '. | length')
    echo -e "${GREEN}✅ Retrieved $action_count actions${NC}"

    echo "   Recent actions:"
    echo "$actions_response" | jq -r '.[] | "     \(.id) - \(.type) (\(.status)) - \(.createdAt | split("T")[0])"' | head -5
else
    echo -e "${RED}❌ Failed to retrieve actions${NC}"
    echo "Response: $actions_response"
fi

echo

# Test 5: Cancel an action (if we have one)
if [ -n "$CONTACT_ACTION_ID" ]; then
    echo -e "${BLUE}🧪 TEST 5: Cancel Action${NC}"
    echo "Cancelling contact action: $CONTACT_ACTION_ID"

    cancel_response=$(api_call PUT "/actions/$CONTACT_ACTION_ID/cancel")

    if echo "$cancel_response" | jq -e '.success' > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Action cancelled successfully${NC}"
    else
        echo -e "${RED}❌ Failed to cancel action${NC}"
        echo "Response: $cancel_response"
    fi
else
    echo -e "${YELLOW}⚠️  Skipping cancel test - no contact action ID${NC}"
fi

echo
echo -e "${GREEN}🎊 API Testing Complete! 🎊${NC}"
echo

# Summary of what to expect
echo -e "${BLUE}📋 Expected Results:${NC}"
echo "   • Order actions should be handled by CafeOrderHandler"
echo "   • Contact actions should be handled by EmailHandler"
echo "   • Actions start in 'queued' status and move to 'executing' then 'completed'"
echo "   • Receipts are generated for successful actions"
echo "   • Real-time updates are broadcast via WebSocket"
echo

echo -e "${YELLOW}💡 Next Steps:${NC}"
echo "   • Connect to WebSocket at ws://localhost:3001 to see real-time updates"
echo "   • Check the server logs to see handler execution details"
echo "   • Try different item types to test handler selection logic"
echo

echo -e "${BLUE}🔧 Troubleshooting:${NC}"
echo "   • If SPACE_ID errors: Create a space first via POST /spaces"
echo "   • If handler errors: Check server logs for handler registration"
echo "   • If database errors: Run 'pnpm -w db:migrate' to apply schema changes"