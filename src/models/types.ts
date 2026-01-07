/**
 * CoC Agent Model Types and Configuration
 * Model selection system with small/medium/large categorization
 */

/**
 * Model size/type classification for different tasks
 */
export enum ModelClass {
  SMALL = "small",   // Fast, lightweight models for simple tasks
  MEDIUM = "medium", // Balanced models for general conversational tasks
  LARGE = "large",   // Heavy models for complex reasoning and analysis
  EMBEDDING = "embedding", // Specialized for vector embeddings
  IMAGE = "image"    // Image generation models
}

/**
 * Supported AI providers
 */
export enum ModelProviderName {
  OPENAI = "openai",
  ANTHROPIC = "anthropic",
  GOOGLE = "google",
  GROQ = "groq",
  OLLAMA = "ollama",
  OPENROUTER = "openrouter",
  DEEPSEEK = "deepseek"
}

/**
 * Model settings interface
 */
export interface ModelSettings {
  name: string;
  stop?: string[];
  maxInputTokens?: number;
  maxOutputTokens?: number;
  temperature?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
}

/**
 * Embedding model settings
 */
export interface EmbeddingModelSettings {
  name: string;
  dimensions?: number;
}

/**
 * Image model settings
 */
export interface ImageModelSettings {
  name: string;
  steps?: number;
}

/**
 * Provider configuration
 */
export interface ProviderConfig {
  endpoint?: string;
  model: {
    [ModelClass.SMALL]?: ModelSettings;
    [ModelClass.MEDIUM]?: ModelSettings;
    [ModelClass.LARGE]?: ModelSettings;
    [ModelClass.EMBEDDING]?: EmbeddingModelSettings;
    [ModelClass.IMAGE]?: ImageModelSettings;
  };
}

/**
 * Complete models configuration
 */
export interface Models {
  [key: string]: ProviderConfig;
}

/**
 * Generation options for AI calls
 */
export interface GenerationOptions {
  runtime: any; // CoC runtime interface
  context: string;
  modelClass?: ModelClass;
  customSystemPrompt?: string;
  maxRetries?: number;
}