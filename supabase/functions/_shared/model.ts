// The one model call every AI step makes: GPT-6 Luna through Dartmouth Chat's OpenAI-compatible API (ADR-0003),
// with a strict JSON schema. Returns the parsed reply for the step's AI output check; throws on an error, a timeout,
// a refusal or a cut-off reply, so the caller falls back.
import OpenAI from 'openai'

export async function askModel({ name, schema, system, user, maxTokens, timeout = 15_000 }: {
  name: string; schema: Record<string, unknown>; system: string; user: string; maxTokens: number; timeout?: number
}): Promise<unknown> {
  const dartmouth = new OpenAI({ apiKey: Deno.env.get('DARTMOUTH_CHAT_API_KEY'), baseURL: 'https://chat.dartmouth.edu/api', timeout, maxRetries: 0 })
  const completion = await dartmouth.chat.completions.create({
    model: 'openai.gpt-6-luna',
    max_completion_tokens: maxTokens,
    response_format: { type: 'json_schema', json_schema: { name, schema, strict: true } },
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
  })
  // A cut-off reply or a refusal has no usable JSON.
  const choice = completion.choices[0]
  if (choice?.finish_reason !== 'stop' || !choice.message.content) throw new Error(`finish reason ${choice?.finish_reason}`)
  return JSON.parse(choice.message.content)
}
