# Rouh Spaces Setup Guide

Complete setup guide to run the Action Execution Engine demo with your friends.

## 🚀 Quick Demo (No Database Required)

**Want to see the execution engine work immediately?**

```bash
node test-execution-engine.js
```

This shows the complete action execution flow without needing any infrastructure.

## 🏗️ Full Setup (For Frontend Demo)

### Step 1: Fix Your Environment

Your current `.env` file is mostly correct, but let's clean it up:

```env
# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/rouh

# Redis
REDIS_URL=redis://localhost:6379

# MinIO (Object Storage)
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=rouh-local

# OpenAI (for AI features)
OPENAI_API_KEY=your-openai-key-here

# Auth (can leave as placeholders for demo)
CLERK_PUBLISHABLE_KEY=pk_xxx
CLERK_SECRET_KEY=sk_xxx
JWT_SECRET=devsecret

# Ports
API_PORT=3001
WEB_PORT=3000
AI_PORT=8000
NODE_ENV=development

# Frontend API URL (add this)
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_API_WS=http://localhost:3001
```

### Step 2: Install Dependencies

```bash
# Install Node.js dependencies
npm install

# Install Python dependencies for AI service
pip install -r apps/ai/requirements.txt
```

### Step 3: Start Infrastructure

**Option A: With Docker (Recommended)**
```bash
docker compose -f infra/docker-compose.yml up -d
```

**Option B: Without Docker (Install locally)**
```bash
# Install PostgreSQL
brew install postgresql@15
brew services start postgresql@15

# Install Redis
brew install redis
brew services start redis

# Create database
createdb rouh
```

### Step 4: Setup Database

```bash
# Run migrations to create tables
npm run db:migrate

# Setup database policies and extensions
npm run db:setup

# Seed demo data
npm run seed
```

### Step 5: Start All Services

```bash
# Start all services (API, Web, AI)
npm run dev
```

This starts:
- **Web**: http://localhost:3000 (Frontend)
- **API**: http://localhost:3001 (Backend + Action Execution Engine)
- **AI**: http://localhost:8000 (AI embeddings and RAG)

## 🎯 Demo URLs for Your Friends

Once running, share these URLs:

### **Main Demo Homepage**
```
http://localhost:3000
```
Beautiful homepage with 4 interactive demo spaces

### **Direct Demo Links**
```
http://localhost:3000/s/demo-cafe/demo        # ☕ Café ordering demo
http://localhost:3000/s/demo-school/demo      # 🏫 School meetings demo
http://localhost:3000/s/demo-car/demo         # 🚗 Car dealership demo
http://localhost:3000/s/demo-expert/demo      # 👨‍💼 Expert consultation demo
```

### **Create a Real Space**
```bash
# Create a space for real testing
curl -X POST http://localhost:3001/spaces \
  -H 'Content-Type: application/json' \
  -d '{"name":"My Demo Space"}'

# Use the returned space ID at:
http://localhost:3000/s/YOUR-SPACE-ID
```

## 🎭 What Your Friends Will See

### **1. Homepage Experience**
- Beautiful landing page explaining the Action Execution Engine
- 4 interactive demo cards for different use cases
- Clear before/after comparison

### **2. Demo Space Experience**
- Click "Order Coffee" → See real-time status updates
- Watch execution flow: "Queuing → Executing → Completed"
- Get actual receipts with order numbers and details
- Real WebSocket notifications in top-right corner

### **3. Different Execution Methods**
- **Café**: Shows Square POS integration → Email fallback
- **School**: Shows calendar booking → Email coordination
- **Car**: Shows CRM integration → Email inquiry
- **Expert**: Shows Calendly booking → Manual task creation

## 🔧 Troubleshooting

### **Database Connection Issues**
```bash
# Check if PostgreSQL is running
brew services list | grep postgresql

# Create database if it doesn't exist
createdb rouh
```

### **Port Already in Use**
```bash
# Find what's using port 3000/3001
lsof -i :3000
lsof -i :3001

# Kill if needed
kill -9 <PID>
```

### **NPM Module Issues**
```bash
# Clear and reinstall
rm -rf node_modules package-lock.json
npm install
```

### **Migration Issues**
```bash
# Reset database (WARNING: deletes all data)
dropdb rouh && createdb rouh
npm run db:migrate
npm run seed
```

## 🚀 Demo Script for Friends

**"Let me show you something cool. This is Rouh - instead of just organizing information, it actually completes actions."**

1. **Open Homepage**: "See these demo spaces? Each one shows a different real-world scenario."

2. **Pick Café Demo**: "Let's order coffee. Watch what happens when I click 'Order Coffee'..."

3. **Point to Notifications**: "See those blue notifications in the corner? That's the action executing in real-time."

4. **Show Receipt**: "Look - it generated an actual receipt with order number, total, pickup time. This isn't just a log entry."

5. **Try Another**: "Let's try the school demo - schedule a parent-teacher meeting..."

6. **Explain Magic**: "The system automatically picks the best method - API integration first, then email, then manual task. It always completes somehow."

**"That's the difference - users get outcomes, not tasks!"**

## 🎊 What Makes This Special

- **Real Execution**: Actions actually complete, don't just get logged
- **Graceful Degradation**: API → Email → Manual (always works)
- **Real-time Updates**: Live status via WebSocket
- **Actual Receipts**: Proof of completion with external references
- **Multiple Use Cases**: Café, School, Car, Expert scenarios
- **Beautiful UX**: Clean, professional interface your friends will love

## 📱 Sharing Tips

- **Desktop works best** for the full experience
- **Mobile works** but demo is optimized for desktop
- **Multiple people can use simultaneously** - each gets their own real-time updates
- **Actions are isolated** - everyone can try without conflicts

Have fun showing off your Action Execution Engine! 🚀