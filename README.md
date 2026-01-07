# CoC Multi-Agent System

> AI-powered Call of Cthulhu (7th Edition) game master using LangGraph multi-agent architecture.

**Note: This documentation is for the `weaktime` branch only.**

## What is This?

CoC Multi-Agent System is an AI framework that runs complete Call of Cthulhu tabletop RPG sessions. Instead of a human game master, **7 specialized AI agents** work together to:

- 🎭 **Control intelligent NPCs** with memories, personalities, and secrets
- 🎲 **Handle all game mechanics** (dice rolls, skill checks, combat, sanity)
- 📖 **Generate immersive narratives** based on your actions
- 🗺️ **Manage a persistent world** with 40+ locations and dynamic storytelling

**Technology:** TypeScript + LangGraph + LangChain + SQLite + React

**Supported AI Models:** OpenAI GPT-4, Google Gemini

---

## Key Capabilities

### 1. Multi-Agent Game Master

The system uses a **sequential pipeline** of specialized agents:

```
Player Input → Orchestrator → Memory → Action → Character → Director → Keeper → Output
```

| Agent | Role |
|-------|------|
| **Orchestrator** | Analyzes what you're trying to do |
| **Memory** | Retrieves relevant rules and context |
| **Action** | Rolls dice, updates character stats, manages inventory |
| **Character** | Determines which NPCs respond and how |
| **Director** | Decides when to change scenes or advance story |
| **Keeper** | Generates the narrative description you read |

### 2. Intelligent NPCs

NPCs are not scripted—they **dynamically respond** based on:

- **Personality & Background**: Each NPC has goals, secrets, and motivations
- **Relationship Tracking**: Attitude ranges from -100 (hostile) to +100 (devoted)
- **Knowledge System**: NPCs reveal clues based on trust level and skill checks
- **Autonomous Behavior**: NPCs can initiate conversations, attack, or flee based on context

**Example NPC Profile:**
```json
{
  "name": "",
  "personality": "",
  "goals": ["", ""],
  "secrets": [""],
  "clues": [
    {
      "clueText": "",
      "difficulty": "regular"
    },
    {
      "clueText": "",
      "difficulty": ""
    }
  ],
  "relationships": [
    {"character": "", "attitude":, "relationship": ""}
  ]
}
```

### 3. Complete CoC 7e Rules

- **8 Action Types**: Exploration, Social, Combat, Stealth, Chase, Mental, Environmental, Narrative
- **Skill System**: 40+ skills (Spot Hidden, Persuade, Fighting, Occult, etc.)
- **Sanity Mechanics**: Cosmic horror encounters reduce sanity and cause madness
- **Inventory Management**: Pick up items, use equipment, track resources
- **Time Tracking**: In-game clock with day/night cycles

### 4. Open-World Investigation

- **Non-linear storytelling**: Choose which locations to visit and NPCs to interrogate
- **40+ Scenarios**: Crime scenes, NPC homes, churches, hotels, wilderness areas
- **Persistent Changes**: Actions have permanent consequences (NPCs remember, locations change)
- **Multiple Solutions**: Different paths to solve the mystery

---

## Installation & Setup

### Prerequisites

- **Node.js** >= 18.0.0
- **pnpm** >= 9.0.0
- **API Key**: OpenAI or Google

### Quick Start

```bash
# Clone and install
git clone <repository-url>
cd CoC-AI-agent
pnpm install

# Configure API key
cp .env.example .env
# Edit .env and add: OPENAI_API_KEY=sk-...

# Build
pnpm build
```

---

## How to Use

### Option 1: Web Interface (Recommended)

**Step 1: Start the backend server**

```bash
pnpm chat
```

You'll see:
```
Server running on http://localhost:3000
Game initialized with session: abc123
```

**Step 2: Start the frontend (in a new terminal)**

```bash
pnpm chat:frontend
```

**Step 3: Open browser**

Navigate to `http://localhost:5173`

**Step 4: Play!**

- Create your character or use the default investigator
- Type actions in natural language: *"I search the crime scene for clues"*
- The AI Keeper will respond with narrative descriptions
- Track your inventory, HP, sanity, and discovered clues in the UI


---

## How to Upload Your Own Module

A "module" is a complete mystery scenario with NPCs, locations, and clues. Here's how to add your own:

### Step 1: Create Module Structure

```bash
mkdir -p "data/Mods/My Mystery/My Mystery_npc"
mkdir -p "data/Mods/My Mystery/My Mystery_Scenarios"
```

### Step 2: Create Module Digest

Create `data/Mods/My Mystery/module_digest.json`:

```json
{
  "title": "My Mystery Name",
  "background": "A dark secret lurks in the small town of...",
  "storyOutline": "Players must investigate a series of disappearances...",
  "keeperGuidance": "Start by having players discover the first body...",
  "moduleLimitations": "Mystery must be solved within...",
  "initialGameTime": "Day 1 18:00",
  "tags": ["murder_mystery", "small_town", "cult"],
  "introduction": "You arrive in town on a cold October evening..."
}
```

### Step 3: Add NPCs

Create JSON files in `My Mystery_npc/`:

**Example: `My Mystery_npc/detective_miller.json`**

*Small tips: You can use GPT or gemini to extract the npc files from the Module Document.

```json
{
  "name": "Detective Miller",
  "occupation": "Private Investigator",
  "age": 42,
  "appearance": "Weathered face, rumpled trench coat, always smoking",
  "personality": "Cynical, determined, has a dark sense of humor",
  "background": "Former police detective, left force after corruption scandal",
  "goals": [
    "Solve the current case",
    "Redeem his reputation",
    "Find evidence against the corrupt mayor"
  ],
  "secrets": [
    "He was framed by the mayor",
    "He knows the victims are connected to a cult"
  ],
  "clues": [
    {
      "clueText": "All three victims had the same tattoo—a strange spiral symbol",
      "category": "knowledge",
      "difficulty": "regular",
      "relatedEntities": ["Mayor", "Cult Leader"]
    },
    {
      "clueText": "The mayor was at the first crime scene before police arrived",
      "category": "observation",
      "difficulty": "hard",
      "relatedEntities": ["Mayor Thompson"]
    }
  ],
  "relationships": [
    {
      "character": "Mayor Thompson",
      "attitude": -80,
      "relationship": "enemy",
      "notes": "The mayor framed Miller and forced him off the police force"
    }
  ],
  "attributes": {
    "STR": 60, "CON": 55, "DEX": 50, "APP": 45,
    "POW": 65, "SIZ": 70, "INT": 75, "EDU": 65
  },
  "status": {
    "hp": 12, "maxHp": 12,
    "sanity": 45, "maxSanity": 65,
    "luck": 50,
    "conditions": []
  },
  "skills": {
    "Spot Hidden": 70,
    "Psychology": 60,
    "Persuade": 55,
    "Intimidate": 50,
    "Fighting (Brawl)": 65,
    "Firearms (Handgun)": 60,
    "Law": 50
  },
  "inventory": [
    {"name": "Revolver", "quantity": 1},
    {"name": "Bullets", "quantity": 12},
    {"name": "Badge (former)", "quantity": 1},
    {"name": "Notebook", "quantity": 1}
  ],
  "currentLocation": "Detective Office",
  "isNPC": true
}
```

**Alternative: Use Documents**

You can also write NPCs as `.docx` or `.pdf` files with structured text:

```
Name: Detective Miller
Occupation: Private Investigator
Age: 42
Appearance: Weathered face, rumpled trench coat

Personality:
Cynical but determined. Has a dark sense of humor...

Background:
Former police detective who left the force after...

Goals:
- Solve the current case
- Redeem his reputation

Secrets:
- He was framed by the mayor
- He knows the victims are connected to a cult

Clues:
[Regular] All three victims had the same spiral tattoo
[Hard] The mayor was at the crime scene before police
```

### Step 4: Add Scenarios (Locations)

Create JSON files in `My Mystery_Scenarios/`:

**Example: `My Mystery_Scenarios/crime_scene.json`**

*Small tips: You can use GPT or gemini to extract the scenario files from the Module Document.

```json
{
  "id": "crime_scene_alley",
  "name": "Dark Alley Behind Hotel",
  "location": "Downtown",
  "description": "A narrow alley thick with shadows. The smell of rotting garbage mingles with something more sinister—the metallic tang of blood. Police tape flutters in the cold wind.",

  "characters": [
    {"name": "Detective Miller", "role": "investigating"},
    {"name": "Officer Chen", "role": "guarding scene"}
  ],

  "clues": [
    {
      "id": "bloodstain_pattern",
      "clueText": "Arterial spray suggests victim was standing when attacked",
      "category": "physical",
      "difficulty": "regular",
      "location": "brick wall near dumpster",
      "discoveryMethod": "Spot Hidden check or forensics knowledge",
      "reveals": ["weapon_type", "killer_height"],
      "discovered": false
    },
    {
      "id": "cultist_symbol",
      "clueText": "A spiral symbol drawn in the victim's blood",
      "category": "physical",
      "difficulty": "automatic",
      "location": "ground near body outline",
      "reveals": ["cult_connection"],
      "discovered": false
    }
  ],

  "conditions": [
    {
      "type": "lighting",
      "description": "Dim streetlight, deep shadows",
      "mechanicalEffect": "Spot Hidden checks at -20% penalty at night"
    },
    {
      "type": "smell",
      "description": "Overwhelming stench of decay",
      "mechanicalEffect": "May trigger CON check to avoid nausea"
    }
  ],

  "exits": [
    {
      "direction": "north",
      "targetScenarioId": "main_street",
      "description": "The alley opens onto Main Street"
    },
    {
      "direction": "south",
      "targetScenarioId": "hotel_back_entrance",
      "description": "A rusty door leads to the hotel's service entrance"
    }
  ],

  "permanentChanges": [],
  "keeperNotes": "This is where the first victim was found. If players investigate thoroughly, they can connect this murder to the cult.",
  "estimatedShortActions": 3
}
```

### Step 5: Load Your Module

**Option A: Auto-load on startup**

The system automatically loads modules from `data/Mods/` when you start:

```bash
pnpm chat
# Your module will be loaded automatically
```

**Option B: Specify module explicitly**

Modify `src/index.ts` to load your specific module:

```typescript
const moduleDigest = await loadModuleDigest("My Mystery");
```

### Module File Formats

You can use **JSON** or **documents** (.docx, .pdf):

**JSON Format:**
- Structured, easy to parse
- Best for complex data (multiple NPCs, intricate relationships)
- See examples above

**Document Format:**
- Write NPCs/scenarios as narrative text
- System extracts information using AI
- Good for rapid prototyping

**Example .docx NPC:**
```
CHARACTER PROFILE: Sarah Chen

Age: 28
Occupation: Librarian
Appearance: Short black hair, glasses, always wears cardigans

Sarah is quiet and observant. She notices things others miss...

CLUES:
- [Automatic] She saw a suspicious man at the library three nights ago
- [Regular] She found an old newspaper with articles about similar deaths
- [Hard] She's been researching the cult in secret and has a hidden journal
```

### Tips for Good Modules

1. **Start Small**: 3-5 NPCs and 5-10 locations is enough for a 4-6 hour mystery
2. **Clear Clue Trails**: Make sure players can discover clues that lead to other clues
3. **Varied Difficulties**: Mix automatic, regular, and hard clues
4. **NPC Relationships**: Create tension with conflicting goals and hidden alliances
5. **Multiple Paths**: Don't require a single solution—let players be creative

---

## Project Structure

```
CoC-AI-agent/
├── src/
│   ├── agents/           # 7 specialized AI agents
│   ├── database/         # SQLite schema and repositories
│   ├── loaders/          # NPC/scenario loading from JSON/docs
│   ├── rules/            # CoC 7e mechanics (8 action types)
│   └── graph/            # LangGraph workflow
│
├── client/               # React web interface
│   ├── components/       # GameChat, CharacterSheet
│   └── server.ts         # Express API server
│
├── data/
│   ├── coc_game.db       # SQLite database (auto-generated)
│   └── Mods/
│       └── Cassandra's Black Carnival/   # Example module
│           ├── module_digest.json
│           ├── Cassandra's_npc/          # 28 NPC profiles
│           └── Cassandra's_Scenarios/     # 40+ locations
│
├── .env                  # Your API keys (create from .env.example)
└── README.md
```

---

## Configuration

### Environment Variables

Create `.env` file:

```bash
# Required: Choose provider
MODEL_PROVIDER=openai

# OpenAI
OPENAI_API_KEY=sk-...
SMALL_OPENAI_MODEL=gpt-4o-mini
MEDIUM_OPENAI_MODEL=gpt-4o


# Or use Google
MODEL_PROVIDER=google
GOOGLE_API_KEY=...
SMALL_GOOGLE_MODEL=gemini-1.5-flash
MEDIUM_GOOGLE_MODEL=gemini-1.5-pro

# Optional
DATABASE_PATH=./data/coc_game.db
PORT=3000

# Game Configuration
ENABLE_AUTO_PROGRESSION=false  # Enable automatic story progression (default: false)
```

### Game Configuration Options

#### Auto Story Progression

**`ENABLE_AUTO_PROGRESSION`** (default: `false`)

Controls whether the Director Agent automatically advances the story when:
- Player has taken X turns in current scene (X depends on tension level: 1-4 turns)
- Player has been idle for 3+ minutes

**When enabled (`true`):**
- ✅ Director Agent analyzes player intent and generates simulated queries
- ✅ Story naturally progresses to prevent getting stuck
- ✅ Useful for testing or assisted gameplay

**When disabled (`false`):**
- 🔒 Story only progresses based on explicit player actions
- 🎮 Full player control over pacing
- 📊 Metrics still logged (turns, idle time, tension)

**Example:**
```bash
# Default: Player has full control
ENABLE_AUTO_PROGRESSION=false

# Enable auto-progression for faster gameplay
ENABLE_AUTO_PROGRESSION=true
```

### Model Selection Strategy

- **SMALL models** (gpt-4o-mini, gemini-2.0-flash): Fast analysis, structured output
- **MEDIUM models** (gpt-4o, gemini-2.5-flash): Creative storytelling, complex reasoning

Only the **Keeper** agent use MEDIUM models—everything else uses SMALL for cost efficiency.

---

## Current Limitations & Future Improvements

### Known Limitations

**Single Player Only**
- The current version supports **single-player gameplay only**
- Multiplayer functionality (multiple human players in one session) is **under development**
- Planned features include:
  - Multiple player characters in one game session
  - Turn-based coordination between players
  - Shared investigation and collaborative problem-solving

**RAG System Under Improvement**
- The Retrieval-Augmented Generation (RAG) system for knowledge retrieval is **currently being redesigned**
- Current status: RAG is disabled by default (`SKIP_RAG = true`)
- Improvements in progress:
  - Better semantic search for scenario clues and NPC knowledge
  - Optimized graph traversal for relationship discovery
  - Enhanced context retrieval for more accurate rule application

**Frontend UI Improvements**
- The web interface user experience is **currently being enhanced**
- Improvements in progress:
  - Better game state visualization
  - Improved character sheet and inventory management
  - Enhanced clue tracking and relationship displays
  - More intuitive action input and command suggestions

### Roadmap

We're actively working on:
1. **Multiplayer Support** - Multiple players sharing one investigation
2. **Enhanced RAG** - Smarter context retrieval and clue connections
3. **Frontend UI/UX** - More intuitive and immersive web interface
4. **Autonomous AI Players** - LLM agents that can play alongside or instead of humans
5. **Additional Modules** - More Call of Cthulhu scenarios and mysteries

---

## Troubleshooting

### "Module not found"
- Check that your module folder is in `data/Mods/`
- Verify `module_digest.json` exists and is valid JSON


### "API rate limit exceeded"
- Use SMALL models for most agents (cheaper, faster)
- Add delays between turns if needed

### NPCs not responding
- Check that NPC names match exactly (case-sensitive)
- Verify NPC has `currentLocation` set to match scenario
- Check NPC's `attitude` (below -50 may refuse to talk)

---

## License

MIT License

---

---

**Start your investigation now!** 🎲🔍
