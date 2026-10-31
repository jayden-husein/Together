# OpenAI GPT-6 Luna through Dartmouth Chat for the AI steps

The AI steps (Itinerary extraction and the Potential incident summary now; urgency triage to follow) call OpenAI's GPT-6 Luna (`openai.gpt-6-luna`) through the Dartmouth Chat API (`https://chat.dartmouth.edu/api`), which is OpenAI-compatible, using Chat Completions with a strict JSON schema. This replaces Claude Sonnet 5.5, the model first planned. The model is called only from an Edge Function, so the `DARTMOUTH_CHAT_API_KEY` stays a Supabase Edge Function secret and never reaches the browser.

## Consequences

- The AI output check doesn't depend on the provider: every reply is checked by plain code before anyone sees it, and its tests use recorded replies, so they don't change.
- Each AI step keeps its manual fallback for an error, a timeout, a refusal or a cut-off reply. That fallback also covers a reply that isn't valid JSON, in case Dartmouth Chat doesn't pass the JSON schema through to the model.
- The key belongs to one Dartmouth Chat account, so every extraction and summary counts against that account's usage limits.
- The spec's AI section ([#4](https://github.com/jayden-husein/Together/issues/4)) names Claude; this ADR replaces that choice.
