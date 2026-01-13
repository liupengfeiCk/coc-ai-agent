#!/usr/bin/env tsx

/**
 * Test script for ScenarioLoader functionality
 * Tests parsing and processing of scenario documents
 */

import { config } from "dotenv";
config();

import fs from "fs";
import path from "path";
import { CoCDatabase } from "./src/coc_multiagents_system/agents/memory/database/schema.js";
import { ScenarioLoader } from "./src/coc_multiagents_system/agents/memory/scenarioloader/index.js";

// Configure logging for terminal display
const logger = {
  info: (msg: string) => console.log(`ℹ️  ${msg}`),
  success: (msg: string) => console.log(`✅ ${msg}`),
  error: (msg: string) => console.log(`❌ ${msg}`),
  warn: (msg: string) => console.log(`⚠️  ${msg}`),
  debug: (msg: string) => console.log(`🔍 ${msg}`),
  section: (msg: string) => console.log(`\n📋 === ${msg} ===\n`)
};

async function testScenarioLoader() {
  logger.section("Scenario Loader Test - Document Processing");

  try {
    // Check for required environment variables
    const hasGoogleApi = !!process.env.GOOGLE_API_KEY;
    const hasOpenAiApi = !!process.env.OPENAI_API_KEY;
    
    if (!hasGoogleApi && !hasOpenAiApi) {
      logger.error("No API keys found. Please set either GOOGLE_API_KEY or OPENAI_API_KEY environment variable.");
      return;
    }
    
    logger.success(`API Key available: ${hasGoogleApi ? 'Google Gemini' : 'OpenAI'}`);

    // Initialize database
    logger.info("Initializing database...");
    const dbPath = path.join(process.cwd(), "data", "test_scenario.db");
    
    // Remove existing test database if it exists
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
      logger.info("Removed existing test database");
    }

    const db = new CoCDatabase(dbPath);
    logger.success("Database initialized successfully");

    // Initialize Scenario Loader
    // DEPRECATED: ScenarioLoader.loadScenariosFromDirectory() is no longer supported
    // Use TemplateScenarioLoader.loadScenariosToTemplate() instead
    console.warn('⚠️  Test skipped: ScenarioLoader.loadScenariosFromDirectory() is DEPRECATED');
    console.warn('    Use TemplateScenarioLoader instead for loading scenarios');
    return;
    
    const scenarioLoader = new ScenarioLoader(db);
    logger.success("Scenario Loader initialized");

    // Create test scenarios directory
    const scenarioDocDir = path.join(process.cwd(), "data", "scenarios");
    if (!fs.existsSync(scenarioDocDir)) {
      fs.mkdirSync(scenarioDocDir, { recursive: true });
      logger.info(`Created scenarios directory: ${scenarioDocDir}`);
      
      // Create a sample scenario document for testing
      const sampleScenario = `
# The Old Library Investigation

## Overview
The investigators are called to investigate mysterious disappearances at the Miskatonic University Library.

## Timeline

### Day 1 - Morning (9:00 AM)
**Location**: Miskatonic University Library - Main Reading Room

The library appears normal during the day. Librarian Eleanor Ward is at her desk, looking nervous and tired. Several students are studying quietly.

**Characters Present**:
- Eleanor Ward: Head Librarian, obviously distressed
- Dr. Marcus Thompson: Professor of Ancient History, researching 
- Sarah Chen: Graduate student, working on thesis
- Tom Bradley: Undergraduate, seems disinterested

**Available Clues**:
- Missing person reports on Eleanor's desk (Difficulty: Regular, Discovery: Spot Hidden)
- Strange symbols carved into reading table (Difficulty: Hard, Discovery: Library Use or Archaeology)
- Cold spots near the eastern wall (Difficulty: Automatic, Discovery: Anyone entering)

**Environmental Conditions**:
- Lighting: Bright fluorescent lighting, slightly flickering near east wall
- Temperature: Noticeably colder than normal
- Sound: Quiet whispers occasionally heard from empty aisles

**Events**: 
- Eleanor approaches investigators nervously
- Dr. Thompson leaves abruptly when asked about the missing students

### Day 1 - Evening (10:00 PM) 
**Location**: Miskatonic University Library - After Hours

The library takes on a sinister atmosphere after closing. Strange phenomena begin to manifest.

**Characters Present**:
- Night security guard (asleep at desk)
- Ghostly figures in the stacks (if investigators stay)

**Available Clues**:
- Security logs showing missing time gaps (Difficulty: Regular, Discovery: Search office)
- Ancient book left open to specific page (Difficulty: Extreme, Discovery: Occult)
- Scratch marks on eastern wall behind bookshelves (Difficulty: Hard, Discovery: Flashlight examination)
- Blood stains on library floor (Difficulty: Regular, Discovery: Spot Hidden with proper lighting)

**Environmental Conditions**:
- Lighting: Dim emergency lighting only
- Temperature: Frigid near eastern section
- Sound: Scratching sounds from within the walls

**Events**:
- Books fall from shelves without cause
- Shadowy figures glimpsed in peripheral vision
- Possible encounter with otherworldly entity

### Day 2 - Dawn (6:00 AM)
**Location**: Miskatonic University Library - Discovery

The aftermath of the night's events. Evidence of supernatural activity is more apparent.

**Characters Present**:
- Eleanor Ward (if she survived the night)
- Campus security and police

**Available Clues**:
- Physical damage to eastern wall revealing hidden chamber (Difficulty: Automatic)
- Ancient artifacts discovered in hidden chamber (Difficulty: Regular, Discovery: Archaeology)
- Personal belongings of missing students (Difficulty: Regular, Discovery: Search)

**Environmental Conditions**:
- Lighting: Natural dawn light streaming through windows
- Temperature: Returned to normal except near hidden chamber
- Sound: Police radio chatter, concerned voices

**Events**:
- Official investigation begins
- Hidden chamber fully revealed
- Truth about the disappearances becomes clear

## Connections
This scenario can lead to "The Dunwich Horror" investigation if the ancient artifacts are related to Whateley research.

## Keeper Notes
This is designed as an introductory investigation to introduce players to the university setting and establish ongoing NPCs like Eleanor Ward and Dr. Thompson.
`;
      
      const samplePath = path.join(scenarioDocDir, "old-library.md");
      fs.writeFileSync(samplePath, sampleScenario);
      logger.info("Created sample scenario document");
    }

    // Check what files are available
    if (fs.existsSync(scenarioDocDir)) {
      const files = fs.readdirSync(scenarioDocDir);
      const scenarioFiles = files.filter(f => {
        const ext = path.extname(f).toLowerCase();
        return ext === '.docx' || ext === '.pdf' || ext === '.md';
      });
      
      logger.info(`Found ${scenarioFiles.length} scenario document(s): ${scenarioFiles.join(', ')}`);
      
      if (scenarioFiles.length === 0) {
        logger.warn("No .docx, .pdf, or .md files found in the scenarios directory");
        return;
      }
    } else {
      logger.error(`Scenario document directory does not exist: ${scenarioDocDir}`);
      return;
    }

    // Process the scenarios
    logger.section("Processing Scenario Documents");
    
    // For .md files, we'll need to simulate the process since our parser only handles docx/pdf
    // In a real implementation, you'd extend the parser to handle markdown
    const markdownFiles = fs.readdirSync(scenarioDocDir).filter(f => f.endsWith('.md'));
    
    if (markdownFiles.length > 0) {
      logger.info("Found markdown files - creating mock scenario data for testing");
      
      // Create a mock scenario for testing (single snapshot design - no timeline)
      const mockScenarioData = {
        name: "The Old Library Investigation",
        description: "The investigators are called to investigate mysterious disappearances at the Miskatonic University Library.",
        snapshot: {
          location: "Miskatonic University Library - Main Reading Room",
          description: "The library appears normal during the day. Librarian Eleanor Ward is at her desk, looking nervous and tired. Strange phenomena have been reported.",
          characters: [
            {
              name: "Eleanor Ward",
              role: "Head Librarian",
              status: "distressed",
              location: "Front desk",
              notes: "Obviously nervous about recent events"
            },
            {
              name: "Dr. Marcus Thompson", 
              role: "Professor",
              status: "researching",
              location: "Reading room",
              notes: "Professor of Ancient History"
            },
            {
              name: "Night security guard",
              role: "Security",
              status: "on duty",
              location: "Security desk",
              notes: "Often found asleep during shifts"
            }
          ],
          clues: [
            {
              clueText: "Missing person reports on Eleanor's desk",
              category: "document",
              difficulty: "regular",
              location: "Librarian's desk",
              discoveryMethod: "Spot Hidden",
              reveals: ["Names of missing students", "Timeline of disappearances"]
            },
            {
              clueText: "Strange symbols carved into reading table",
              category: "physical",
              difficulty: "hard", 
              location: "Reading room table",
              discoveryMethod: "Library Use or Archaeology",
              reveals: ["Connection to ancient texts"]
            },
            {
              clueText: "Security logs showing missing time gaps",
              category: "document",
              difficulty: "regular",
              location: "Security office",
              discoveryMethod: "Search",
              reveals: ["Pattern of supernatural interference"]
            },
            {
              clueText: "Ancient book left open to specific page",
              category: "knowledge",
              difficulty: "extreme",
              location: "Reading room",
              discoveryMethod: "Occult",
              reveals: ["Summoning ritual details"]
            }
          ],
          conditions: [
            {
              type: "lighting",
              description: "Bright fluorescent lighting, slightly flickering near east wall",
              mechanicalEffect: "No penalty to vision normally, -2 penalty at night"
            },
            {
              type: "temperature",
              description: "Noticeably colder than normal, especially near eastern section",
              mechanicalEffect: "Suggests supernatural presence, CON check if staying long"
            },
            {
              type: "sound",
              description: "Scratching sounds occasionally heard from within the walls",
              mechanicalEffect: "Sanity check (0/1d3) if encountered at night"
            }
          ],
          events: [
            "Eleanor approaches investigators nervously",
            "Dr. Thompson leaves abruptly when questioned",
            "Books fall from shelves without cause (at night)",
            "Shadowy figures glimpsed in peripheral vision",
            "Possible encounter with otherworldly entity"
          ],
          exits: [
            {
              direction: "East", 
              destination: "Restricted stacks",
              description: "Locked door to special collections"
            },
            {
              direction: "West",
              destination: "Main entrance",
              description: "Public entrance/exit"
            }
          ]
        },
        tags: ["investigation", "university", "supernatural", "library"],
        connections: [
          {
            scenarioName: "The Dunwich Horror",
            relationshipType: "leads_to",
            description: "Ancient artifacts connect to Whateley research"
          }
        ]
      };

      // Manually create and save scenario using our loader
      const scenarioProfile = scenarioLoader['convertToScenarioProfile'](mockScenarioData);
      scenarioLoader['saveScenarioToDatabase'](scenarioProfile);
      
      logger.success(`Successfully processed mock scenario: ${scenarioProfile.name}`);
      logger.info(`📜 Scenario: ${scenarioProfile.name}`);
      logger.info(`🆔 ID: ${scenarioProfile.id}`);
      logger.info(`📝 Description: ${scenarioProfile.description.substring(0, 100)}...`);

      // Display scenario snapshot information
      logger.section("Scenario Snapshot Analysis");
      const snapshot = scenarioProfile.snapshot;
      logger.info(`📍 Location: ${snapshot.location}`);
      logger.debug(`   👥 Characters: ${snapshot.characters.length}`);
      logger.debug(`   🔍 Clues: ${snapshot.clues.length}`);
      logger.debug(`   🌤️  Conditions: ${snapshot.conditions.length}`);
      logger.debug(`   📅 Events: ${snapshot.events.length}`);
      
      // Show character details
      if (snapshot.characters.length > 0) {
        logger.debug(`   Characters: ${snapshot.characters.map(c => `${c.name} (${c.role}, ${c.status})`).join(', ')}`);
      }
      
      // Show clue summary
      if (snapshot.clues.length > 0) {
        logger.debug(`   Clues: ${snapshot.clues.map(c => `${c.category}/${c.difficulty}: ${c.clueText.substring(0, 40)}...`).join('; ')}`);
      }

      // Test database operations
      logger.section("Testing Database Operations");
      
      // Test retrieval
      logger.debug("Testing scenario retrieval from database...");
      const retrievedScenario = scenarioLoader.getScenarioById(scenarioProfile.id);
      if (retrievedScenario) {
        logger.success(`✓ Successfully retrieved scenario: ${retrievedScenario.name}`);
      } else {
        logger.error("✗ Failed to retrieve scenario from database");
      }
      
      // Test existence check
      const exists = scenarioLoader.scenarioExists(scenarioProfile.id);
      logger.success(`✓ Scenario existence check: ${exists ? 'Found' : 'Not found'}`);
      
      // Test getting all scenarios
      const allScenarios = scenarioLoader.getAllScenarios();
      logger.success(`✓ Retrieved ${allScenarios.length} total scenarios from database`);
      
      // Test clue management
      logger.section("Testing Clue Discovery System");
      const undiscoveredClues = scenarioLoader.getUndiscoveredClues(scenarioProfile.id);
      logger.info(`Found ${undiscoveredClues.length} undiscovered clues`);
      
      if (undiscoveredClues.length > 0) {
        const firstClue = undiscoveredClues[0];
        logger.debug(`Testing clue discovery: ${firstClue.clueText.substring(0, 50)}...`);
        
        scenarioLoader.discoverClue(firstClue.id, "Test Investigator", "Spot Hidden check");
        logger.success("✓ Marked clue as discovered");
        
        const remainingClues = scenarioLoader.getUndiscoveredClues(scenarioProfile.id);
        logger.success(`✓ Remaining undiscovered clues: ${remainingClues.length}`);
      }

      // Test search functionality
      logger.section("Testing Search Functionality");
      
      const searchResult = scenarioLoader.searchScenarios({
        tags: ["library"]
      });
      
      logger.success(`✓ Search results: ${searchResult.scenarios.length} scenarios found`);
    }

    // Try to load from actual documents if they exist
    const actualDocuments = fs.readdirSync(scenarioDocDir).filter(f => f.endsWith('.docx') || f.endsWith('.pdf'));
    
    if (actualDocuments.length > 0) {
      logger.section("Processing Real Documents");
      const loadedScenarios = await scenarioLoader.loadScenariosFromDirectory(scenarioDocDir);
      
      if (loadedScenarios.length > 0) {
        logger.success(`Successfully processed ${loadedScenarios.length} scenarios from documents`);
        
        for (const scenario of loadedScenarios) {
          logger.info(`📜 ${scenario.name} - Location: ${scenario.snapshot.location}`);
        }
      }
    }

    // Cleanup
    db.close();
    logger.success("Database connection closed");

    logger.section("🎉 Scenario Loader Test Completed Successfully");

  } catch (error) {
    logger.error(`Test failed: ${error}`);
    if (error instanceof Error) {
      logger.debug(`Error details: ${error.stack}`);
    }
    process.exit(1);
  }
}

// Run the test
if (import.meta.url === `file://${process.argv[1]}`) {
  testScenarioLoader().catch(error => {
    console.error("Unhandled error:", error);
    process.exit(1);
  });
}
