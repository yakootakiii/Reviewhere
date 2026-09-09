# Reviewhere — AI-Powered Study Quiz Generator

A web app that turns a student's PDF or PowerPoint (up to 150 pages) into a mixed reviewer: multiple-choice questions interleaved with identification questions, wrapped in an Apple-inspired, premium UI.

---

## 1. Product Overview

**Core promise:** Upload your notes → get a polished, ready-to-take quiz in under a minute.

**Primary user:** Students reviewing for exams who have lecture slides (PPTX) or reading material (PDF) and want an active-recall study tool instead of re-reading.

**Key differentiator:** Not just flashcards — a real quiz session (mixed MCQ + identification) with scoring, review, and history, in an interface polished enough to feel like a shipped Apple product.

---

## 2. Core Features

### 2.1 File Upload & Processing
- Accept `.pdf` and `.pptx` (and `.ppt` via conversion).
- **Hard limit: 150 pages/slides per file.** Reject with a clear, friendly error state above the limit (see §7.7).
- Drag-and-drop + "Browse files" input, with upload progress bar.
- Server-side text + image/diagram extraction (OCR fallback for scanned/image-heavy PDFs).
- Show a short "Analyzing your document…" loading state with a page/slide counter while parsing.

### 2.2 Quiz Generation
- User picks:
  - **Question count** (e.g., 10 / 20 / 30 / custom)
  - **Question mix** — slider or segmented control: % Multiple Choice vs % Identification (default 60/40)
  - **Difficulty** — Easy / Medium / Hard / Mixed
  - **Scope** — whole document, or a page/slide range

There are **two generation modes**. Mode A is primary; Mode B is a zero-cost fallback that works with any LLM, including ones we don't have API access to.

**Mode A — Automatic (OpenRouter free-tier models)**
1. Chunk extracted text by section/slide.
2. Send chunks to a free OpenRouter model (see §3.1) with a structured-output prompt requesting a JSON array of questions (type, prompt, choices, correct answer, accepted answer variants, explanation, source page).
3. Validate/parse/deduplicate questions server-side before saving. If the model returns malformed JSON, auto-retry once with a stricter "return ONLY valid JSON" instruction; if it still fails, surface an error state and offer Mode B.

**Mode B — Manual Copy-Paste (fallback / no-API-key mode)**
For when free OpenRouter models are rate-limited, unavailable, or the user just prefers their own LLM (ChatGPT, Claude, Gemini, etc.):
1. User picks quiz settings as usual (count, mix, difficulty, scope).
2. The website generates a **ready-to-copy prompt** that already embeds those settings and a strict CSV output format (see §2.2.1), plus a "Copy prompt" button. The user still needs to paste in their document's text — the app pre-fills an extracted-text block into the prompt automatically so they don't have to copy it by hand.
3. User pastes the prompt into any LLM of their choice, copies the CSV the LLM returns, and pastes it into an **"Import CSV"** box on our site (or uploads a `.csv` file).
4. The website parses and validates the CSV client/server-side, shows a preview ("18 questions detected — 11 MCQ, 7 Identification"), flags any malformed rows for the user to fix or skip, and lets them confirm to save it as a quiz.

Both modes write to the same `questions` schema (§4), so quiz-taking, scoring, and review work identically regardless of which mode created the quiz.

Questions are interleaved (not grouped by type) to mimic a real exam feel, unless the user chooses "group by type."

#### 2.2.1 Mode B Prompt & CSV Contract
The generated prompt instructs the target LLM to output **only** a CSV with this exact header, no prose before/after:

```
type,question,choice_a,choice_b,choice_c,choice_d,correct_answer,accepted_answers,explanation,source_page
```

- `type`: `mcq` or `identification`
- For `identification` rows, `choice_a`–`choice_d` are left blank.
- `accepted_answers`: pipe-separated alternate acceptable spellings/phrasings for identification (e.g., `mitochondria|mitochondrion`), used alongside the typo-tolerant matching in §2.3.
- Fields containing commas are quoted per standard CSV escaping; the prompt explicitly tells the LLM to follow RFC 4180 CSV quoting rules.
- The import parser (Papa Parse or equivalent) validates row-by-row: missing required fields, MCQ rows without 4 choices, or unknown `type` values are flagged in the preview instead of silently dropped.

### 2.3 Question Types
| Type | Behavior |
|---|---|
| **Multiple Choice** | 4 options, single correct answer, optional "select all that apply" mode |
| **Identification** | Free-text input, checked with **exact-match-with-typo-tolerance**: normalize case/whitespace/punctuation, then compare against `correctAnswer` and any `acceptedAnswers` using edit-distance matching (e.g., Levenshtein distance ≤1–2 depending on word length, roughly "1 typo per 5–6 characters"). This forgives small misspellings but does **not** accept synonyms or partial/related answers. An optional "reveal answer" fallback appears if the user gets it wrong twice |

- Every question stores a **source reference** (page/slide number) so the user can jump back to the original material.
- Every question has a short **explanation**, shown after answering.

### 2.4 Quiz-Taking Experience
- One question per screen (mobile) or a paginated card (desktop), with a progress bar/segmented step indicator.
- Immediate or end-of-quiz feedback mode (user-selectable in settings).
- Timer (optional, toggleable).
- Keyboard shortcuts on desktop (1–4 for MCQ, Enter to submit identification).
- Pause/resume — quiz state persists if the user leaves.

### 2.5 Results & Review
- Score summary screen: score %, time taken, breakdown by question type and by topic/section.
- Full review list: each question, the user's answer, correct answer, explanation, and a link back to the source page.
- "Retake incorrect only" action.
- Save quiz to history; allow re-attempting the same generated quiz later.

### 2.6 Library / My Reviewers
- Dashboard grid/list of all uploaded documents and generated quizzes.
- Each item: title, source filename, date, page count, number of attempts, best score.
- Rename, delete, regenerate (with new settings), duplicate.
- Folder/tagging by subject (e.g., "Biology," "Finals Week").

### 2.7 Profiles & Auth
- **Firebase Authentication** with:
  - Google OAuth
  - Apple OAuth (Sign in with Apple)
  - Email/password (with email verification) as fallback
- Profile page: display name, avatar, email, plan/usage (documents processed this month, storage used), theme preference (light/dark/system).
- Account settings: change password (email accounts), linked providers, delete account (with confirmation modal + typed confirmation, per destructive-action best practice).

### 2.8 Notifications & Feedback
- Toasts for: upload success/failure, quiz generated, quiz saved, error states.
- Empty states for: no documents yet, no quizzes yet, no search results.

---

## 3. Suggested Tech Stack

- **Frontend:** React (Next.js) + TypeScript, Tailwind CSS (for the design tokens in §7), Framer Motion for micro-interactions.
- **Auth:** Firebase Authentication (Google, Apple, Email/Password providers).
- **Database:** Firestore (documents, quizzes, questions, attempts, user profiles).
- **File storage:** Firebase Storage (uploaded PDFs/PPTX, capped per-file size in addition to the 150-page rule).
- **Backend/processing:** Firebase Cloud Functions (or a small dedicated Node/Python service) for:
  - PDF text extraction (e.g., `pdf-parse`, `pdfplumber`) and OCR fallback (Tesseract) for scanned pages.
  - PPTX parsing (e.g., `python-pptx` or `pptx2json`) for slide text/notes.
  - LLM calls via **OpenRouter free-tier models** for automatic question generation (Mode A); CSV import/parsing for the manual fallback (Mode B).
- **Hosting:** Firebase Hosting or Vercel.
- **Security:** Firestore Security Rules scoped per-user; Storage Rules restricting access to the owning `uid`; Cloud Functions validate file size/page count server-side (never trust the client-reported page count).

### 3.1 OpenRouter Free Tier — Notes & Tradeoffs
OpenRouter's free-tier models (e.g., free variants of Llama, Gemini Flash, Mistral, etc. — availability changes over time, so pick the current best free option at build time) are viable for this project's small, private usage (4–5 users), with caveats:

- **Rate limits:** free models are typically capped (e.g., a limited number of requests per minute/day). At 4–5 users this should rarely be hit, but the app should handle a 429 gracefully — queue the request, show "Still generating, this may take a bit longer," and offer Mode B as a one-tap fallback if it fails outright.
- **JSON reliability:** free models are less consistent at strict structured output than flagship paid models. Mitigate with: a strict system prompt demanding JSON-only output, a JSON-schema validator with one auto-retry on failure, and Mode B as the ultimate fallback.
- **Latency:** free models can be slower/queued behind paid traffic. Keep the generation loading state honest (§7.7) rather than implying a fixed time.
- **Cost:** $0, which fits the "completely free" requirement in §3.2.
- **No API key management needed for Mode B** — this is exactly why it exists as a permanent feature, not just a launch-day stopgap.

### 3.2 Usage Tier
This app is **single-tier and free** — no billing, no plan gating, no usage caps in the UI. Since it's built for a small private group (4–5 users), skip:
- Stripe/billing integration
- Plan/quota UI on the profile page
- Any "upgrade" prompts or paywalls

Still worth having, purely for cost/abuse protection (not monetization):
- A soft per-user daily cap on Mode A generations (e.g., a Cloud Function guard), just to avoid one runaway loop exhausting the free OpenRouter quota for everyone. This can be a fixed constant in code rather than user-facing plan logic.

---

## 4. Data Model (Firestore)

```
/users/{uid}
  displayName, email, photoURL, plan, createdAt, preferences: { theme, defaultMix, defaultDifficulty }

/documents/{docId}
  ownerId, fileName, storagePath, pageCount, fileType (pdf|pptx),
  status (uploading|processing|ready|failed), createdAt, sizeBytes

/quizzes/{quizId}
  ownerId, documentId, title, questionCount, mix { mcqPct, idPct },
  difficulty, createdAt, lastAttemptScore, generationMode (auto|manualCsv)

/quizzes/{quizId}/questions/{questionId}
  type (mcq|identification), prompt, choices[] (mcq only),
  correctAnswer, acceptedAnswers[] (identification only, pipe-separated variants),
  explanation, sourcePage, difficulty

/attempts/{attemptId}
  quizId, userId, startedAt, completedAt, score, answers[]
    { questionId, userAnswer, isCorrect, timeSpentSec }
```

---

## 5. Key Screens / User Flows

1. **Landing page** (marketing) → Sign in / Sign up (OAuth or email).
2. **Dashboard** — "My Reviewers" grid + "New Reviewer" primary button.
3. **Upload flow** — drag-drop → parsing progress → generation settings sheet → generating progress → done.
4. **Quiz settings modal/sheet** — question count, mix slider, difficulty, scope.
5. **Quiz-taking screen** — one question at a time, progress indicator, pause.
6. **Results screen** — score summary, breakdown, review list.
7. **Library detail** — a document's quizzes, attempts history, regenerate option.
8. **Profile / Settings** — account info, linked providers, theme, delete account.

---

## 6. Non-Functional Requirements

- **Accessibility:** WCAG 2.1 AA — proper contrast ratios even with the light gradient palette, focus-visible states on every interactive element, full keyboard navigation, ARIA labels on icon-only buttons, reduced-motion mode that disables spring animations.
- **Responsiveness:** Fluid layouts for desktop, tablet, and mobile; sidebar collapses to a bottom tab bar or drawer on mobile.
- **Performance:** Skeleton/loading states for anything >300ms; optimistic UI for non-destructive actions (rename, tag).
- **Privacy/Security:** Uploaded documents are private to the owning user by default; page-count and file-size limits enforced server-side; signed, time-limited URLs for any document preview.
- **Reliability:** Generation jobs are resumable/retryable; if the LLM step fails, the document stays in library with a "regenerate" action rather than being lost.

---

## 7. Design System — "Apple-Inspired Premium UI"

### 7.1 Design Language
- Minimalist, elegant, content-first — the UI recedes, the reviewer content leads.
- SF Pro–inspired typography (use **Inter** or **SF Pro Display/Text** if licensed; Inter is the closest open-source match).
- Light theme: white/near-white surfaces (`#FFFFFF`, `#F5F5F7`) with dark mode (`#000000`/`#1C1C1E` surfaces).
- Subtle gradients (e.g., a soft blue-to-violet accent on primary CTAs and progress rings), used sparingly.
- Consistent corner radius: **12px** for inputs/small components, **16–20px** for cards/modals.
- Soft shadows (`0 4px 20px rgba(0,0,0,0.06)`) and 1px hairline borders instead of heavy drop shadows.
- Large, confident headings (SF Pro Display-style, tight tracking); clear type scale (e.g., 34/28/22/17/15/13px).
- Generous whitespace — minimum 24px section padding, 16px internal card padding.
- Simple line-based icons (SF Symbols–style weight; Lucide icons are a good open-source match).
- No unnecessary card nesting, no gratuitous drop shadows, no clutter.

### 7.2 Color Tokens (example)
```
--color-bg: #F5F5F7        (dark: #000000)
--color-surface: #FFFFFF   (dark: #1C1C1E)
--color-surface-secondary: #F2F2F7 (dark: #2C2C2E)
--color-text-primary: #1D1D1F (dark: #F5F5F7)
--color-text-secondary: #6E6E73 (dark: #98989D)
--color-accent: #0A84FF        (system blue)
--color-accent-gradient: linear-gradient(135deg, #0A84FF, #7C5CFF)
--color-success: #34C759
--color-warning: #FF9F0A
--color-error: #FF3B30
--radius-sm: 12px
--radius-lg: 20px
--shadow-soft: 0 4px 20px rgba(0,0,0,0.06)
```

### 7.3 Interaction
- Micro-interactions: buttons scale to 0.97 on press, spring back on release.
- Hover states: subtle background tint (+4% surface shift) and slight elevation.
- Focus states: 2px accent-colored ring with 2px offset (never remove focus outlines).
- Page/modal transitions: 200–300ms ease-out fade + slight translate; spring easing for sheets sliding up.
- Segmented controls for view toggles (e.g., MCQ/Identification filter, Grid/List view).
- Sheets (bottom sheet on mobile, centered modal on desktop) for quiz settings, not full page navigation.

### 7.4 Component Inventory
- **Navigation bar** — logo/wordmark, search, profile avatar menu; translucent/blurred on scroll.
- **Sidebar** (desktop) — Dashboard, Library, Create New, Settings; collapsible.
- **Buttons** — Primary (gradient or solid accent fill), Secondary (outline/tinted), Destructive (red), Icon-only (circular, tinted background).
- **Cards** — Document card, Quiz card, Stat card; consistent 20px radius, hairline border, hover elevation.
- **Inputs** — Text field, textarea, file dropzone, all 12px radius with floating/inline labels and clear error text.
- **Search** — Global search bar with icon, subtle inset shadow, keyboard shortcut hint (⌘K).
- **Tabs / Segmented controls** — for quiz-type filters, settings sections.
- **Toggles** — iOS-style pill switches (immediate/end-of-quiz feedback, dark mode, timer on/off).
- **Dropdowns** — for sort/filter, subtle shadow, rounded 12px menu.
- **Modals / Sheets** — quiz generation settings, delete-confirmation, upgrade prompts.
- **Toast notifications** — top-right (desktop) / top (mobile), auto-dismiss, success/error/info variants.
- **Progress indicators** — linear bar for upload/generation, circular ring for quiz completion %, step indicator for quiz question progress.
- **Empty states** — friendly illustration + short copy + primary CTA ("Upload your first document").
- **Loading states** — skeleton cards for library grid, shimmer for question generation, animated progress copy ("Reading page 42 of 87…").
- **Error states** — inline for form fields; full-panel for failed generation/parsing, with a clear "Try again" action and plain-language reason (e.g., "This file has 210 pages — please trim it to 150 or fewer.").

### 7.5 Typography Scale
| Style | Size | Weight | Use |
|---|---|---|---|
| Display | 34px | Bold | Page titles |
| Title 1 | 28px | Semibold | Section headers |
| Title 2 | 22px | Semibold | Card titles |
| Body | 17px | Regular | Primary content, question text |
| Callout | 15px | Regular | Secondary content |
| Caption | 13px | Regular | Metadata, timestamps |

### 7.6 Responsive Behavior
- **Desktop (≥1024px):** Sidebar + content, multi-column library grid (3–4 cols).
- **Tablet (768–1023px):** Collapsible sidebar (icon-only or drawer), 2-column grid.
- **Mobile (<768px):** Bottom tab bar, single-column stacked cards, quiz-taking is full-screen single-question view.

### 7.7 Specific Empty/Error/Limit States to Design
- Empty library ("No reviewers yet").
- File too large / too many pages ("This PDF is 187 pages. Trim it to 150 pages or fewer and try again.").
- Unsupported file type.
- Generation failed (LLM/parsing error) with retry.
- No search results.
- Offline / network error toast.

---

## 8. Build Roadmap (Suggested Milestones)

1. **M1 — Auth & shell:** Firebase Auth (Google/Apple/email), app shell, nav/sidebar, profile page, dark mode.
2. **M2 — Upload & parsing:** file upload UI, Storage integration, page-count validation (150-page limit), text extraction pipeline.
3. **M3 — Quiz generation:** OpenRouter integration (Mode A), CSV prompt template + import/validation flow (Mode B), question schema, generation settings UI.
4. **M4 — Quiz-taking & results:** question flow, typo-tolerant identification matching, scoring, review screen, attempt history.
5. **M5 — Library & polish:** dashboard, folders/tags, empty/error/loading states, animations, accessibility pass.
6. **M6 — Launch hardening:** Firestore/Storage security rules audit, soft per-user daily generation cap, monitoring/analytics.

---

## 9. Decisions Log

| Question | Decision |
|---|---|
| LLM for question generation | OpenRouter free-tier models (Mode A), with a copy-paste prompt → CSV import fallback (Mode B) that works with any LLM |
| Free vs. paid tiers | Fully free, single tier, no billing — built for ~4–5 users; only a soft anti-abuse daily cap on Mode A generations |
| Identification matching | Exact-match with typo tolerance (small edit-distance allowance); no synonym/partial-credit matching |
| Offline/PWA support | Out of scope |

## 10. Remaining Open Questions

- Exact free OpenRouter model(s) to default to — worth re-checking at build time since free-tier model availability shifts.
- Exact typo-tolerance threshold for identification answers (e.g., fixed edit distance vs. scaled by answer length) — recommend starting with edit distance ≤1 for answers under 8 characters and ≤2 above that, then tuning by feel.
- Should Mode B's CSV import also accept re-uploading a corrected CSV after validation errors, or only inline row fixes?
