# Action Execution Engine Demo

This demonstrates how the new Action Execution Engine transforms Rouh from an "information organizer" to an "action completer."

## What We Built

### 1. **Database Schema Extensions**
- `ActionExecution` - Tracks execution attempts with retry logic
- `Handler` - Configurable provider integrations
- `Receipt` - Proof of completed actions
- `ActionStatusUpdate` - Real-time status tracking

### 2. **Execution Architecture**
- **ActionExecutionService** - Core execution engine
- **HandlerRegistry** - Plugin system for provider integrations
- **BaseActionHandler** - Framework for building handlers
- **Specialized Handlers**:
  - `CafeOrderHandler` - Orders food with POS integration + fallbacks
  - `EmailHandler` - Structured emails for any action type
  - `ManualTaskHandler` - Human operator tasks when automation fails

### 3. **Real Flow Example: Café Ordering**

#### Before (MVP):
```
User clicks "Contact" → Action created → Nothing happens
```

#### After (Action Execution Engine):
```
User clicks "Order Coffee" →
  Action queued →
  CafeOrderHandler selected →
  Checks for Square POS integration →
  If available: Places order via Square API →
  If not: Sends structured email to café →
  If no email: Creates manual task for operator →
  Status updates broadcast in real-time →
  Receipt generated with confirmation →
  User gets: "Order #DC-1547 ready in 12 minutes! 🚀"
```

## Demo API Calls

### 1. Create a Café Order Action
```bash
curl -X POST http://localhost:3001/actions \
  -H "x-space-id: your-space-id" \
  -H "x-user-id: user123" \
  -H "Content-Type: application/json" \
  -d '{
    "itemId": "cafe-item-123",
    "type": "order",
    "parameters": {
      "items": [
        {"name": "Latte", "price": 5.50, "quantity": 1, "modifications": ["oat milk", "extra shot"]},
        {"name": "Croissant", "price": 3.25, "quantity": 1}
      ],
      "pickup_time": "15 minutes",
      "customer_name": "John Doe",
      "customer_phone": "+1234567890",
      "special_instructions": "Make it extra hot"
    }
  }'
```

**Response:**
```json
{
  "action": {
    "id": "action-456",
    "type": "order",
    "status": "queued",
    "parameters": { ... },
    "createdAt": "2024-01-15T10:00:00Z"
  },
  "lead": null,
  "ledger": { ... }
}
```

### 2. Watch Real-Time Status Updates
```javascript
// Connect to WebSocket
const socket = io('http://localhost:3001');

// Listen for status updates
socket.on('action.status', (data) => {
  console.log('Status Update:', data);
  // { actionId: "action-456", status: "executing", message: "Placing order with Downtown Café...", timestamp: "..." }
});

// Listen for completion
socket.on('action.completed', (data) => {
  console.log('Action Completed!', data);
  // { actionId: "action-456", externalReference: "sq_order_789", receiptData: { ... } }
});
```

### 3. Check Action Status
```bash
curl -X GET "http://localhost:3001/actions/action-456/status"
```

**Response:**
```json
{
  "action": {
    "id": "action-456",
    "status": "completed",
    "executions": [{
      "handlerType": "api",
      "handlerName": "cafe_order_handler",
      "status": "completed",
      "externalRef": "sq_order_789"
    }],
    "receipts": [{
      "receiptNumber": "RCP-1705320012-abc123",
      "status": "confirmed",
      "data": {
        "provider": "Downtown Café",
        "order_number": "DC-1547",
        "total": "$8.75",
        "pickup_time": "12 minutes",
        "items": [...]
      }
    }]
  },
  "statusUpdates": [
    { "status": "queued", "message": "Action queued for execution", "timestamp": "..." },
    { "status": "executing", "message": "Placing order with Downtown Café...", "timestamp": "..." },
    { "status": "completed", "message": "Order confirmed! Order #DC-1547", "timestamp": "..." }
  ]
}
```

## Handler Priority Logic

The system automatically selects the best handler:

1. **API Integration** (if available)
   - Square POS, Toast, Calendly, etc.
   - Direct system integration - best experience

2. **Webhook Integration** (if configured)
   - Provider accepts structured webhooks
   - Good automation with confirmation

3. **Email Handler** (if email available)
   - Structured, professional emails
   - Human-readable with all context

4. **Manual Task Handler** (always available)
   - Creates tasks for human operators
   - Ensures no request is lost

## Key Benefits

### For Users:
- **Real Outcomes**: Click "Order Coffee" → Get coffee, not a todo
- **Live Updates**: See execution happening in real-time
- **Reliable**: Always completes via some method (graceful degradation)
- **Transparent**: Know exactly what happened and when

### For Providers:
- **Works with existing systems**: Integrates with POS, booking tools, etc.
- **Structured requests**: Clean, actionable information
- **No vendor lock-in**: Uses their tools, doesn't replace them

### For Operators:
- **Extensible**: Add new handlers easily
- **Configurable**: Set priorities and fallback chains
- **Observable**: Full audit trail of all executions

## What's Next

The foundation is ready for your vision! Next steps:

1. **Production Queue**: Replace setTimeout with BullMQ for reliable job processing
2. **More Handlers**: School booking, car marketplace, expert consultations
3. **Provider Onboarding**: Tools for providers to configure their integrations
4. **Receipt System**: Enhanced receipts with refund capabilities
5. **Web UI Updates**: Real-time status in the frontend

The transformation from "information organizer" to "action completer" is complete! 🚀