# Case study — Pulse

*[Leia em português](case-study.pt-BR.md)*

**Role:** product, UX and engineering, end to end · **Period:** 2026 – today, 24 releases · **Users:** two people in a
household, every training day

## The problem

Training programs were written in long conversations with an AI: 13-week blocks, weekly load progressions, deloads,
supersets. At the gym they lived in screenshots and notes. Loads were remembered (or not), rest was timed on another app,
and nobody could tell whether the block was working — so the next block was planned on impressions. Commercial apps either
ignored the program's structure or wanted to sell their own plans and video libraries.

## Goals

- Open the app and see **today's** workout with this week's prescription — nothing to type before the first set.
- Log a set in one tap, with the phone in one hand and no signal.
- Explain every exercise visually, without third-party videos or links.
- Send the AI real data (loads, RIR, pain, skipped days, body) to plan the next block, and import its answer safely.

## Key decisions

| Decision | Why | Trade-off |
|---|---|---|
| **A documented plan contract validated with Zod** | The AI writes programs the app is guaranteed to understand; errors are explained before import | The contract evolves with the prompt and the tests, never alone |
| **Draw the animations from motion data** | No video licensing, consistent style, 300+ exercises covered by ~a dozen movement families; the same data feeds 2D and 3D | Hand-tuning poses for unusual exercises, guarded by a test that requires a motion for every exercise |
| **Offline-first with per-record sync** | Gyms have bad signal; a set must never be lost | Last-write-wins per record and tombstones → a trash bin to recover deletes |
| **Derive the password on the device** | The free Workers plan allows ~10 ms of CPU per request; PBKDF2 with 600k iterations can't run there | The server stores a hash of the derived key, so the raw password never travels |
| **Live notification instead of a native app** | A web notification with the rest ring and action buttons covers the gym use case without an app store | Limits of web notifications on a locked screen; a native shell was built and then parked |

## What came out

- The week's workout opens in one tap; supersets, warm-ups and cardio are part of the same flow.
- Personal records are recognised at the moment they happen; adherence, volume per muscle and body composition are always
  one screen away.
- The AI receives a structured report and returns the next block through an MCP connector, after showing what changes.
- A household bridge: body weight is shared with the family nutrition app (Mesa) and the training schedule tells Mesa which
  days are training days.

## What I would do next

A coach mode where a personal trainer publishes programs for several athletes from the same contract, and licensing the
motion engine on its own.
