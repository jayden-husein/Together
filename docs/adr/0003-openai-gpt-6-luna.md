# OpenAI GPT-6 Luna for the AI steps

The AI steps (Itinerary extraction now; the Potential incident summary and urgency triage to follow) call OpenAI's `gpt-6-luna` through the Responses API with strict structured output, in place of Claude Sonnet 5.5 as first planned. The model is called only from an Edge Function, so the `OPENAI_API_KEY` stays a Supabase Edge Function secret and never reaches the browser.

## Consequences

- The AI output check doesn't depend on the provider: every reply is checked by plain code before anyone sees it, and its tests use recorded replies, so they don't change.
- Each AI step keeps its manual fallback for an error, a timeout, a refusal or an incomplete reply.
- The spec's AI section ([#4](https://github.com/jayden-husein/Together/issues/4)) names Claude; this ADR replaces that choice.
