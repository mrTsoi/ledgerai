import type OpenAIType from 'openai'

export async function createOpenAIClient(options: { apiKey?: string; baseURL?: string; defaultHeaders?: Record<string,string> } = {}) {
  const mod = await import('openai')
  const OpenAI = (mod as any).default ?? mod
  return new OpenAI(options as any) as InstanceType<typeof OpenAIType>
}
