/**
 * CoC Agent Model Generation System
 * Handles model selection and text generation with appropriate model classes
 */

import { ChatOpenAI } from "@langchain/openai";
import { ChatDeepSeek } from "@langchain/deepseek";
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { models } from "./configuration.js";
import { ModelClass, ModelProviderName, GenerationOptions, ModelSettings } from "./types.js";

/**
 * Model class usage guidelines:
 * - SMALL: Quick responses, simple classifications, basic conversational turns
 * - MEDIUM: Standard gameplay interactions, character agent responses, memory queries
 * - LARGE: Complex reasoning, rule interpretations, comprehensive analysis, keeper responses
 */

/**
 * Resolves the effective model class based on runtime settings and overrides
 */
export function resolveModelClass(
  runtime: any,
  requested: ModelClass = ModelClass.MEDIUM
): ModelClass {
  // Force small model if environment variable is set (for cost optimization)
  if (
    process.env.FORCE_SMALL_MODEL === "true" &&
    requested !== ModelClass.SMALL
  ) {
    console.debug(
      `FORCE_SMALL_MODEL enabled; overriding requested model class`,
      { requested, resolved: ModelClass.SMALL }
    );
    return ModelClass.SMALL;
  }

  // Force medium for large if cost optimization is enabled (default: true)
  if (
    (process.env.FORCE_MEDIUM_FOR_LARGE ?? "true") === "true" &&
    requested === ModelClass.LARGE
  ) {
    console.debug(
      `FORCE_MEDIUM_FOR_LARGE enabled; overriding requested model class`,
      { requested, resolved: ModelClass.MEDIUM }
    );
    return ModelClass.MEDIUM;
  }

  return requested;
}

/**
 * Gets model settings for a specific provider and class
 */
export function getModelSettings(
  provider: ModelProviderName,
  modelClass: ModelClass
): ModelSettings | undefined {
  return models[provider]?.model[modelClass] as ModelSettings | undefined;
}

/**
 * Gets the endpoint for a specific provider
 */
export function getEndpoint(provider: ModelProviderName): string | undefined {
  return models[provider]?.endpoint;
}

/**
 * Creates the appropriate chat model based on provider and settings
 */
export function createChatModel(
  provider: ModelProviderName,
  modelClass: ModelClass
): any {
  const settings = getModelSettings(provider, modelClass);
  const endpoint = getEndpoint(provider);

  if (!settings) {
    throw new Error(`No settings found for provider ${provider} and model class ${modelClass}`);
  }

  switch (provider) {
    case ModelProviderName.OPENAI:
      return new ChatOpenAI({
        modelName: settings.name,
        temperature: settings.temperature,
        maxTokens: settings.maxOutputTokens,
        openAIApiKey: process.env.OPENAI_API_KEY,
        configuration: {
          baseURL: endpoint,
        },
      });

    case ModelProviderName.ANTHROPIC:
      return new ChatAnthropic({
        modelName: settings.name,
        temperature: settings.temperature,
        maxTokens: settings.maxOutputTokens,
        anthropicApiKey: process.env.ANTHROPIC_API_KEY,
        clientOptions: {
          baseURL: endpoint,
        },
      });

    case ModelProviderName.GOOGLE:
      return new ChatGoogleGenerativeAI({
        modelName: settings.name,
        temperature: settings.temperature,
        maxOutputTokens: settings.maxOutputTokens,
        apiKey: process.env.GOOGLE_API_KEY,
      });
    
    case ModelProviderName.DEEPSEEK:
      return new ChatDeepSeek({
        modelName: settings.name,
        temperature: settings.temperature,
        maxTokens: settings.maxOutputTokens,
        apiKey: process.env.DEEPSEEK_API_KEY,
      });

    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}

/**
 * Generates text using the appropriate model class for CoC scenarios
 */
export async function generateText(options: GenerationOptions): Promise<string> {
  const {
    runtime,
    context,
    modelClass = ModelClass.MEDIUM,
    customSystemPrompt,
    maxRetries = 3
  } = options;

  // Get provider from environment variable, runtime, or default to OpenAI
  const envProvider = process.env.MODEL_PROVIDER as ModelProviderName;
  const provider = envProvider || runtime.modelProvider || ModelProviderName.OPENAI;
  
  // Resolve effective model class
  const effectiveModelClass = resolveModelClass(runtime, modelClass);
  
  // Create chat model
  const chatModel = createChatModel(provider, effectiveModelClass);

  // Prepare messages
  const messages = [];
  
  // Calculate total input characters
  let totalInputChars = 0;
  
  if (customSystemPrompt) {
    messages.push({
      role: "system",
      content: customSystemPrompt,
    });
    totalInputChars += customSystemPrompt.length;
  }

  messages.push({
    role: "user",
    content: context,
  });
  totalInputChars += context.length;

  // Generate with retries
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(
        `🤖 Generating text (attempt ${attempt}/${maxRetries}) using ${provider}/${effectiveModelClass}`
      );

      const response = await chatModel.invoke(messages);
      
      if (!response?.content) {
        throw new Error("Empty response from model");
      }

      const outputChars = response.content.length;
      console.log(`✅ Generated text successfully`);
      console.log(`📊 Token Stats: Input=${totalInputChars} chars, Output=${outputChars} chars, Total=${totalInputChars + outputChars} chars`);
      
      return response.content;

    } catch (error) {
      lastError = error as Error;
      console.error(
        `❌ Generation attempt ${attempt} failed:`,
        error
      );

      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw new Error(`Failed to generate text after ${maxRetries} attempts: ${lastError?.message}`);
}