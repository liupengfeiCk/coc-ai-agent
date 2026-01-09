# CoC Chat Client

A simple web-based chat interface that saves user messages to the CoC memory system.

## Features

- Simple chat interface
- Messages are saved to the Memory Agent with timestamps
- Messages are stored in the SQLite database as game events
- Automatic session creation
- Message history loading

## How to Run

1. Install dependencies:
```bash
npm install
```

2. Start the chat server:
```bash
npm run chat
```

3. Open your browser and visit:
```
http://localhost:3000
```

## How It Works

1. User sends a message through the web interface
2. The message is sent to the `/api/message` endpoint
3. The server saves the message using `MemoryAgent.logEvent()`:
   - Event type: `dialogue`
   - Session ID: auto-generated based on client IP (format: `session-ip-{hash}`)
   - Timestamp: current time
   - Details: includes message content and type
   - Tags: `['user', 'chat']`
4. The message is stored in the `game_events` table in SQLite
5. A success response is returned with the event ID and timestamp

## API Endpoints

### POST /api/message
Save a user message to memory.

**Request:**
```json
{
  "message": "Hello, world!"
}
```

**Response:**
```json
{
  "success": true,
  "eventId": 123,
  "timestamp": "2025-12-11T10:30:00.000Z",
  "message": "Message saved to memory"
}
```

## Database Schema

Messages are stored in the `game_events` table with the following structure:

```sql
CREATE TABLE game_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,          -- 'dialogue'
  session_id TEXT NOT NULL,          -- auto-generated session ID
  timestamp DATETIME NOT NULL,       -- message timestamp
  details TEXT NOT NULL,             -- JSON with message content
  character_id TEXT,
  location TEXT,
  tags TEXT,                         -- JSON array: ['user', 'chat']
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## Session Management

- A new session is automatically created when the server starts
- Session ID format: `chat-session-YYYY-MM-DD`
- All messages in the same day are stored in the same session
- Session data is stored in the `sessions` table
