# Conversational understanding

The server advertises `conversation: 1` in health. An authenticated chat request containing `context.dialogue.schema: 1` uses the conversational prompt. Older clients retain the plain-text interface; local app-tools mode retains the deterministic fallback.

The existing route is browser → private Cloudflare relay → PC server → n8n webhook → Hermes profile → configured model. The model returns one bounded decision: reply, clarification, WhatsApp intent, or task/cleaning request for an editable review. n8n transports the model response; the PC validates its shape. Unsupported output becomes a clarification and executes nothing. This does not install a new n8n workflow or move the WhatsApp socket into n8n.

The client executes WhatsApp decisions through the existing authenticated inbox/review/read/send endpoints. State includes the pending recipient, owner-written draft, numbered choices and last recipient, so follow-up answers and pronouns do not need command phrases. Contact keys are resolved against the current inbox. Duplicate contacts still require a choice. Incoming WhatsApp bodies and approval tokens are excluded from model context. Incoming-message automatic AI drafts remain off; drafting/rewording happens only at the owner's request.

Approval is never a model decision. The owner's literal “Approve and send” is handled locally. Voice approval requires completed read-back of the recipient and exact text. A new AI turn suspends the previous approval while it is understood; edits require fresh review and playback. The backend still binds chat, version, text, expiry and a single-use token, and never retries an uncertain send. Closing, a new conversation and unrelated conversation clear the pending draft.

Hermes keeps its existing limited memory/session-search tools. The prompt permits saving durable preferences and explicitly confirmed aliases after clarification, never outgoing bodies, transient requests, tokens or guesses. A remembered alias must still resolve to a current contact. This is saved memory, not model training. Current operational snapshots and dialogue state override historical records.

No new relay operations, Cloudflare bindings or database migrations are required. Publishing browser files alone is insufficient: restart the existing PC server with its private Hermes/n8n keys and installed WhatsApp runtime. The relay can remain running. Use fictional connector fixtures to test approval, never real contact sends.
