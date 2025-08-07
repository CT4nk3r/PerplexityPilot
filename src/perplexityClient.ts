import OpenAI from "openai";

export function createPerplexityClient(apiKey: string) {
  return new OpenAI({
    apiKey,
    baseURL: "https://api.perplexity.ai"
  });
}
