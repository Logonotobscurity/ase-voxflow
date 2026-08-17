# VOXFLOW — VOICE & VISION SPECIFICATION

Version: 1.0
Status: Foundational
Depends On:

- DEVELOPMENT_SPEC.md
- CODE_AGENT_MASTER_PROMPT.md
- ARCHITECTURE_DECISIONS.md
- EXECUTION_KERNEL_SPEC.md
- AGENT_RUNTIME_SPEC.md
- TOOL_AND_MCP_SPEC.md

Purpose: Define voice, audio, video, vision, screen, transcription, and realtime interaction as governed interfaces into the canonical VOXFLOW execution architecture.

# 01. PURPOSE

Voice and vision are not separate business systems.

They are multimodal interfaces into the same platform.

The system must support:

```text
VOICE
TEXT
IMAGE
VIDEO
SCREEN
```

while preserving one canonical execution model:

```text
PERCEIVE
   ↓
UNDERSTAND
   ↓
PLAN
   ↓
AUTHORIZE
   ↓
EXECUTE
   ↓
OBSERVE
   ↓
VERIFY
   ↓
RESPOND
```

The purpose of this layer is therefore not to create a "voice app" or "vision app."

It is to make the VOXFLOW execution system accessible through natural human interaction.

# 02. ARCHITECTURAL PRINCIPLE

The multimodal layer must remain separate from business execution.

```text
┌──────────────────────────────────────┐
│          EXPERIENCE LAYER            │
│                                      │
│ Voice · Text · Camera · Screen       │
└──────────────────┬───────────────────┘
                   │
                   ▼
┌──────────────────────────────────────┐
│       MULTIMODAL PROCESSING          │
│                                      │
│ STT · Vision · Intent · Context      │
└──────────────────┬───────────────────┘
                   │
                   ▼
┌──────────────────────────────────────┐
│          AGENT RUNTIME               │
│                                      │
│ Goal · Plan · Decide · Verify        │
└──────────────────┬───────────────────┘
                   │
                   ▼
┌──────────────────────────────────────┐
│          EXECUTION KERNEL            │
└──────────────────────────────────────┘
```

Voice and vision must never implement their own competing workflow or execution engine.

# 03. CURRENT ARCHITECTURAL DECISION

The current project specification establishes Pipecat as the canonical voice framework, replacing the earlier hand-built FastAPI voice bridge. It also identifies WhisperSTTService using a local faster-whisper backend and a deterministic VoiceCommandProcessor as the current intended path. The TTS provider remains unresolved and is explicitly a blocker before real TTS wiring.

Therefore:

```text
Pipecat
    ↓
VOICE PIPELINE
    ↓
VOXFLOW EXECUTION
```

is the active direction.

LiveKit Agents is not automatically part of the core voice architecture merely because the Vision Demo provides useful examples; the existing specification explicitly parks LiveKit Agents pending deliberate architectural reconsideration.

LiveKit may nevertheless be used as a realtime transport where the project explicitly adopts it for media infrastructure.

# 04. MULTIMODAL INPUT MODEL

The platform should normalize incoming modalities into a common perception context.

Conceptually:

```ts
MultimodalContext {
  sessionId;
  participantId;

  text?;
  audio?;
  images?;
  video?;
  screen?;

  language?;
  timestamp;
  metadata;
}
```

Do not force every modality to be present.

Do not copy raw media into every downstream component.

Only transmit what the current task requires.

# 05. VOICE PIPELINE

Canonical voice pipeline:

```text
MICROPHONE
   ↓
REALTIME TRANSPORT
   ↓
STT
   ↓
VOICE COMMAND / INTENT
   ↓
CONTEXT
   ↓
AGENT RUNTIME
   ↓
EXECUTION KERNEL
   ↓
RESULT
   ↓
RESPONSE GENERATION
   ↓
TTS
   ↓
REALTIME TRANSPORT
   ↓
USER
```

# 06. VOICE SEPARATION OF CONCERNS

The voice system must distinguish:

```text
Transport

Moves audio/media.
```

```text
STT

Transforms speech into text.
```

```text
Intent/Command Processing

Determines whether the user is:

conversing
asking a question
controlling a workflow
requesting a tool
initiating a consequential action
```

```text
Agent Runtime

Reasons about the request.
```

```text
Execution Kernel

Executes authorized work.
```

```text
TTS

Converts approved response content into speech.
```

Do not collapse all responsibilities into one bot.py.

# 07. LOCAL STT

The current architecture specifies local Whisper/faster-whisper STT.

The implementation should expose an adapter boundary:

```text
STT Interface
├── Local Whisper
└── Future Providers
```

This prevents the application from becoming permanently dependent on one STT implementation.

# 08. STT CONTRACT

Conceptual:

```ts
interface SpeechToTextProvider {
  transcribe(
    audio: AudioInput,
    context: STTContext
  ): Promise<Transcript>;
}
```

Transcript:

```ts
Transcript {
  text;
  language?;
  confidence?;
  participantId;
  sessionId;
  timestamp;
  final;
}
```

# 09. MULTI-USER TRANSCRIPTION

The system must preserve participant identity.

```text
Participant A
   ↓
Transcript A
```

```text
Participant B
   ↓
Transcript B
```

Every transcript must retain:

```text
participant ID
session ID
timestamp
final/interim status
language
confidence where available
```

The transcript layer must integrate with the existing event/persistence architecture rather than creating a separate transcript system.

# 10. PUSH-TO-TALK

Multi-user rooms should support push-to-talk where adopted.

Push-to-talk must be participant-scoped.

The system must distinguish:

```text
WHO IS SPEAKING
WHO HAS CONTROL
WHO IS BEING ADDRESSED
WHO SHOULD RECEIVE THE RESPONSE
```

Do not assume:

```text
one room = one user
```

# 11. PARTICIPANT CONTEXT

Participant context should conceptually contain:

```text
participantId
identity
role
permissions
locale
language
audio state
video state
active interaction
```

Never infer authorization solely from voice identity.

Voice recognition is not automatically authentication.

# 12. MULTI-USER RESPONSE POLICY

The system should support response modes:

```text
PRIVATE
DIRECTED
ROOM
```

Examples:

```text
PRIVATE:

Only one participant hears the response.
```

```text
DIRECTED:

Response is addressed to a named participant.
```

```text
ROOM:

Response is broadcast to the room.
```

The response mode must be determined by session policy.

# 13. BACKGROUND AUDIO

Background audio is a UX layer, not a reasoning system.

Support states such as:

```text
IDLE
LISTENING
THINKING
SPEAKING
ERROR
```

Example:

```text
IDLE
 ↓
AMBIENT
```

```text
LISTENING
 ↓
SUPPRESS AMBIENT
```

```text
THINKING
 ↓
THINKING AUDIO
```

```text
SPEAKING
 ↓
SUPPRESS / DUCK
```

```text
DONE
 ↓
RESTORE
```

Background audio must never interfere with speech recognition or TTS clarity.

# 14. BARGE-IN

Voice interaction must support interruption where the selected transport/audio stack permits it.

Example:

```text
Agent speaking
      ↓
User starts speaking
      ↓
Detect interruption
      ↓
Stop / fade TTS
      ↓
Listen
      ↓
Continue interaction
```

Barge-in must not corrupt agent state.

# 15. INTERRUPTION STATE

The system must distinguish:

```text
USER_INTERRUPTED
AGENT_INTERRUPTED
NETWORK_INTERRUPTED
SYSTEM_INTERRUPTED
```

The agent should resume from valid state rather than duplicating actions.

# 16. TURN DETECTION

Turn detection should determine when the user has completed a turn.

The implementation may use:

```text
transport signals
voice activity detection
semantic turn detection
provider-native realtime detection
```

Do not add a custom turn detector when an existing selected runtime already provides an adequate implementation.

# 17. VOICE COMMAND PROCESSOR

The existing architecture defines a deterministic VoiceCommandProcessor for command classification, publishing commands into the event path and persisting them through the application.

Do not recreate this flow.

Extend it where necessary.

Potential commands include:

```text
add_node
remove_node
connect
disconnect
configure
run
pause
resume
inspect
approve
reject
create_workflow
unknown
```

The exact command vocabulary must remain configurable and aligned with the existing application.

# 18. CONVERSATION VS COMMAND

The runtime must distinguish:

```text
CONVERSATION
```

from:

```text
COMMAND
```

Example:

```text
"Tell me what this workflow does."
```

Conversation/information request.

Versus:

```text
"Run this workflow."
```

Command.

The classifier should produce structured intent rather than relying on downstream code to interpret arbitrary text repeatedly.

# 19. COMMAND EVENT

Conceptually:

```json
{
  "event": "voice.command.received",
  "sessionId": "...",
  "participantId": "...",
  "intent": "run_workflow",
  "entities": {
    "workflowId": "..."
  },
  "timestamp": "..."
}
```

Publish through the project's canonical event architecture.

# 20. CONSEQUENTIALLY SAFE VOICE ACTIONS

Commands that can create meaningful external side effects require explicit authorization.

Example:

```text
User:
"Send the campaign."
```

```text
System:
"The campaign is ready to send to 3,821 contacts.
Do you want me to continue?"
```

```text
User:
"Yes."
```

→ policy check
→ execution

No direct speech-to-side-effect shortcut.

# 21. VOICE CONFIRMATION

Confirmation should be:

```text
explicit
contextual
short
unambiguous
tied to the pending action
```

Avoid:

```text
"Are you sure?"
```

Prefer:

```text
"This will send the campaign to 3,821 contacts. Send it?"
```

# 22. TTS ARCHITECTURE

TTS must remain provider-agnostic.

Conceptual:

```text
TTS Interface
├── Provider A
├── Provider B
└── Future Provider
```

The current project specification explicitly leaves the TTS provider unresolved and prohibits wiring Coqui XTTS because its stated licensing/deprecation situation is incompatible with the commercial product.

Therefore:

```text
Do not wire Coqui XTTS.
```

```text
Do not claim TTS is production-ready until an approved provider is selected and verified.
```

# 23. TTS PROVIDER CONTRACT

Conceptual:

```ts
interface TextToSpeechProvider {
  synthesize(
    text: string,
    options: TTSOptions
  ): Promise<AudioOutput>;
}
```

Potential options:

```text
voice
language
speed
tone
emotion
format
sampleRate
```

# 24. STRUCTURED TTS OUTPUT

Agent responses may provide structured speech metadata.

Example:

```json
{
  "text": "I found 12 qualified leads.",
  "tone": "confident",
  "emotion": "positive",
  "speed": 1.0
}
```

The TTS layer should consume structured metadata.

Never allow arbitrary model output to mutate the audio runtime configuration without validation.

# 25. TTS SAFETY

Generated speech should not silently claim an action occurred unless the execution system has verified it.

Bad:

```text
"Your payment has been processed."
```

when payment execution has not been confirmed.

Correct:

```text
"The payment request was submitted and is awaiting confirmation."
```

# 26. VISION

Vision is a perception layer.

Inputs may include:

```text
image
camera
video
screen
document
```

Flow:

```text
VISUAL INPUT
   ↓
PERCEPTION
   ↓
STRUCTURED OBSERVATION
   ↓
AGENT
   ↓
WORKFLOW / TOOL
   ↓
EXECUTION
```

# 27. VISION PROVIDER ABSTRACTION

The vision architecture must not hardcode one model provider.

Conceptually:

```ts
interface VisionProvider {
  analyze(
    input: VisualInput,
    context: VisionContext
  ): Promise<VisionObservation>;
}
```

Possible providers can be introduced through adapters.

# 28. VISUAL OBSERVATION

Visual output should become structured context.

Example:

```json
{
  "objects": [
    {
      "label": "invoice",
      "confidence": 0.98
    }
  ],
  "documentType": "invoice"
}
```

Do not dump arbitrary model prose directly into workflow state where a structured representation is appropriate.

# 29. LIVE CAMERA

Camera input should be:

```text
optional
permission-controlled
bandwidth-aware
configurable
privacy-aware
```

Do not continuously process high-resolution video if the task only requires occasional observation.

# 30. VIDEO SAMPLING

Sampling strategy should be configurable.

Conceptually:

```text
vision:
  sampling:
    active_fps: 1.0
    idle_fps: 0.3

  max_resolution:
    width: 1024
    height: 1024
```

These values are configuration examples, not mandatory defaults.

Do not process every frame by default.

# 31. ADAPTIVE VISION

Sampling may increase when:

```text
user is actively speaking
visual change is detected
a task requires detailed observation
```

Sampling may decrease when:

```text
scene is unchanged
user is idle
no active visual task exists
```

# 32. SCREEN SHARING

Screen sharing is a privileged visual modality.

The user must explicitly authorize it.

The system should communicate:

```text
SCREEN SHARING ACTIVE
```

clearly.

The agent should only receive screen frames while sharing is active and authorized.

# 33. SCREEN PRIVACY

The platform should consider:

```text
sensitive application windows
passwords
financial data
private messages
notifications
```

Where filtering is possible, provide privacy controls.

At minimum, screen-sharing status must be visible to the user.

# 34. DOCUMENT VISION

Documents may enter through:

```text
upload
camera
screen
workflow attachment
external connector
```

Pipeline:

```text
DOCUMENT
 ↓
TYPE DETECTION
 ↓
OCR / VISION
 ↓
STRUCTURED EXTRACTION
 ↓
VALIDATION
 ↓
WORKFLOW
```

# 35. OCR

OCR output is untrusted.

Extracted fields should include confidence where the provider supports it.

Example:

```json
{
  "invoiceNumber": {
    "value": "INV-1024",
    "confidence": 0.97
  }
}
```

Critical data should be validated before financial or external actions.

# 36. VISION + WORKFLOW

Vision should be usable as a workflow node.

Examples:

```text
IMAGE
 ↓
VISION
 ↓
CLASSIFICATION
 ↓
DECISION
 ↓
WORKFLOW
```

Or:

```text
DOCUMENT
 ↓
VISION / OCR
 ↓
EXTRACT
 ↓
VALIDATE
 ↓
APPROVAL
 ↓
TRANSACTION
```

# 37. VISION + AGENT

An agent may reason over visual observations.

```text
CAMERA
 ↓
VISION
 ↓
OBSERVATION
 ↓
AGENT
 ↓
TOOL
 ↓
RESULT
```

The agent must not receive unrestricted raw visual streams when a structured observation is sufficient.

# 38. MULTIMODAL MEMORY

Visual and audio observations should not automatically become permanent memory.

Memory persistence requires:

```text
relevance
retention policy
tenant scope
sensitivity policy
user/system permission
```

# 39. AUDIO DATA RETENTION

Do not retain raw audio by default unless explicitly required.

Prefer storing:

```text
transcript
metadata
timestamps
structured events
```

over indefinite raw recordings.

Recording policies must be explicit.

# 40. VIDEO DATA RETENTION

Do not retain raw video by default.

Store visual observations when they are actually useful to the workflow or audit process.

# 41. REALTIME TRANSPORT

Realtime transport is responsible for:

```text
audio
video
screen
participant events
```

It should not own:

```text
workflow state
permissions
business transactions
agent reasoning
persistence
```

# 42. TRANSPORT ABSTRACTION

Where practical:

```ts
RealtimeTransport
├── publishAudio()
├── publishVideo()
├── subscribeAudio()
├── subscribeVideo()
├── publishData()
├── subscribeData()
├── participantState()
└── disconnect()
```

Reuse the selected transport infrastructure rather than inventing a parallel media layer.

# 43. LIVEKIT REFERENCE POLICY

The existing LiveKit Vision Demo is useful as a reference for:

```text
realtime audio/video
iOS camera support
screen sharing
background interactions
multimodal agent behavior
visual sampling
```

The repository itself states that it is outdated and points to newer LiveKit vision/front-end approaches.

Therefore:

```text
Use current official documentation and current SDK versions when implementing any LiveKit integration.

Do not copy its obsolete architecture directly.
```

# 44. LIVEKIT ROLE

If LiveKit is adopted, prefer using it as:

```text
REALTIME MEDIA TRANSPORT
```

rather than allowing it to become an alternative business execution architecture.

The business path remains:

```text
LiveKit
 ↓
Pipecat / Multimodal Processing
 ↓
VOXFLOW Agent Runtime
 ↓
Execution Kernel
```

where that composition is actually selected.

# 45. BACKGROUND MODE

Background behavior must be platform-aware.

The application should distinguish:

```text
foreground
background
locked
reconnecting
disconnected
```

Do not assume background execution guarantees are identical across platforms.

# 46. IOS

Native iOS implementations should separate:

```text
Media Capture
Transport
Token Service
Session
Agent State
UI
```

Do not place business logic inside view components.

# 47. AUTHENTICATION

Voice presence does not equal identity.

Camera presence does not equal identity.

A realtime participant must be authenticated through the platform's identity model.

Short-lived realtime credentials should be generated by a trusted backend.

# 48. MULTIMODAL AUTHORIZATION

Before sensitive work:

```text
Participant
 ↓
Identity
 ↓
Tenant
 ↓
Permission
 ↓
Agent Policy
 ↓
Execution
```

Never authorize financial or destructive actions from:

```text
voice recognition alone
speaker identity alone
camera identity alone
```

# 49. REALTIME SESSION STATE

A realtime session should track:

```text
sessionId
participantId
roomId
state
connectedAt
disconnectedAt
audioEnabled
videoEnabled
screenEnabled
language
interactionMode
```

# 50. REALTIME SESSION STATES

Conceptually:

```text
CREATED
 ↓
CONNECTING
 ↓
CONNECTED
 ↓
ACTIVE
 ↓
PAUSED
 ↓
RECONNECTING
 ↓
ENDED
```

# 51. NETWORK FAILURE

Realtime systems must expect unreliable networks.

Handle:

```text
connection loss
reconnect
media loss
delayed events
duplicate events
session termination
```

Do not assume a clean disconnect.

# 52. VOICE + WORKFLOW

Voice commands must invoke the canonical workflow runtime.

Example:

```text
"Run customer research."
```

```text
Speech
 ↓
Transcript
 ↓
Intent
 ↓
Workflow Resolution
 ↓
Authorization
 ↓
Execution
 ↓
Run ID
 ↓
Voice Response
```

# 53. VOICE + CANVAS

Voice can manipulate the workflow editor.

Example:

```text
"Add a web search after the research node."
```

Flow:

```text
Voice
 ↓
Intent
 ↓
Structured Command
 ↓
Workflow Graph Mutation
 ↓
Validation
 ↓
Persist Draft
 ↓
Canvas Update
```

The command must modify the canonical workflow graph, not an isolated voice representation.

# 54. VOICE + RUN MONITOR

Voice can query execution state.

Example:

```text
"How is the customer research run doing?"
```

```text
Voice
 ↓
Intent
 ↓
Execution Lookup
 ↓
Structured Status
 ↓
Natural Language Response
```

# 55. VISION + CANVAS

Vision may inspect or understand a visual workflow.

Possible future pattern:

```text
SCREEN
 ↓
VISION
 ↓
CANVAS OBSERVATION
 ↓
AGENT
 ↓
ACTION
```

Any automated UI action must be explicitly authorized.

# 56. MULTIMODAL COMMAND EXAMPLE

User says:

```text
"Look at this invoice and create the purchase order."
```

System:

```text
VOICE
 ↓
COMMAND
 ↓
CAMERA / DOCUMENT
 ↓
VISION
 ↓
STRUCTURED INVOICE
 ↓
VALIDATION
 ↓
WORKFLOW
 ↓
APPROVAL
 ↓
PURCHASE ORDER
 ↓
VERIFICATION
```

This demonstrates the target multimodal architecture.

# 57. MULTIMODAL EVENT MODEL

Potential events:

```text
VoiceSessionStarted
VoiceSessionEnded
TranscriptReceived
VoiceCommandReceived
VoiceCommandExecuted

VisionInputReceived
VisionObservationCreated

ScreenShareStarted
ScreenShareEnded

ParticipantJoined
ParticipantLeft

TTSStarted
TTSCompleted
TTSInterrupted
```

These should integrate with the canonical event architecture.

# 58. COST CONTROL

Realtime multimodal workloads can be expensive.

Track:

```text
audio duration
model usage
video frames
image count
TTS duration
STT duration
tokens
session duration
```

Budget policies must be available where required.

# 59. PERFORMANCE

Measure:

```text
speech-to-intent latency
intent-to-execution latency
vision latency
voice response latency
TTS startup latency
reconnection time
frame processing latency
```

Optimize using evidence.

# 60. ACCESSIBILITY

Voice and vision interfaces must have non-voice alternatives where practical.

For example:

```text
Voice command
↔
Text command
```

```text
Visual state
↔
Accessible textual representation
```

Do not make critical workflows accessible only through audio or vision.

# 61. PRIVACY

Explicitly communicate when:

```text
microphone is active
camera is active
screen sharing is active
recording is active
data is being processed externally
```

The user should never have to infer recording state.

# 62. PROVIDER LICENSING

Before production use of any STT, TTS, realtime, avatar or vision provider:

Verify:

```text
commercial license
redistribution terms
supported languages
streaming support
deployment model
retention policy
data processing policy
```

Unverified providers must not be presented as production-approved.

# 63. TESTING

Voice tests

Test:

```text
transcription
intent classification
command routing
participant identity
barge-in
background audio
confirmation
workflow triggering
```

Vision tests

Test:

```text
image ingestion
frame sampling
screen sharing
OCR
structured extraction
workflow integration
```

Realtime tests

Test:

```text
connect
disconnect
reconnect
participant join/leave
microphone failure
camera failure
network interruption
```

# 64. SECURITY TESTING

Test:

```text
unauthorized microphone access
unauthorized camera access
unauthorized screen sharing
voice spoofing attempts
transcript injection
malicious visual content
cross-tenant media access
tool execution from voice without permission
malicious external visual/text content
```

# 65. ACCEPTANCE CRITERIA

The Voice & Vision layer is successful when:

```text
[ ] voice is an interface to the canonical execution model

[ ] vision is a perception layer rather than a parallel execution system

[ ] Pipecat remains the active voice architecture where specified

[ ] TTS provider remains unimplemented until officially resolved

[ ] STT is provider-abstracted

[ ] transcription retains participant identity

[ ] push-to-talk is participant-aware

[ ] barge-in is supported where transport permits

[ ] background audio cannot interfere with speech

[ ] sensitive commands require authorization

[ ] camera and screen sharing are explicit user capabilities

[ ] realtime transport remains separate from business logic

[ ] voice can trigger workflows

[ ] voice can inspect workflow runs

[ ] vision can feed workflows

[ ] multimodal events are observable

[ ] privacy states are visible

[ ] realtime failures are handled

[ ] tests cover multimodal failure modes
```

FINAL PRINCIPLE

Voice gives VOXFLOW a voice.

Vision gives VOXFLOW perception.

Realtime transport gives it presence.

But none of these become the product architecture.

The canonical flow remains:

```text
PERCEIVE
   ↓
UNDERSTAND
   ↓
PLAN
   ↓
AUTHORIZE
   ↓
EXECUTE
   ↓
OBSERVE
   ↓
VERIFY
   ↓
RESPOND
```

The user should be able to speak to the system, show it something, point it at a screen, or type into it — and regardless of modality, the request must converge on the same governed execution system.

END OF SPECIFICATION
