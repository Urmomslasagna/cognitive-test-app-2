# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a cognitive health screening web application implementing MoCA (Montreal Cognitive Assessment) standardized tests. The application is deployed on Vercel as a serverless application with a static HTML frontend and serverless API functions.

**Available Tests (26/30 MoCA points):**
- Memory Test (5 pts) - 5-word delayed recall
- Trail Making Test (1 pt) - Alternating numbers and letters
- Animal Fluency Test (1 pt) - 60-second animal naming
- Letter Fluency Test (1 pt) - 60-second F-words naming
- Orientation Test (6 pts) - Date, month, year, day, city, country
- Naming Test (3 pts) - Identify lion, rhino, camel from descriptions
- Digit Span Test (2 pts) - Forward and backward digit recall
- Serial 7 Test (3 pts) - Subtract 7 from 100 repeatedly
- Vigilance/Attention Test (1 pt) - Tap when letter A appears
- Abstraction Test (2 pts) - Find similarities between word pairs
- Sentence Repetition Test (2 pts) - Repeat complex sentences

## Architecture

### Deployment Model
- **Platform**: Vercel serverless functions
- **Frontend**: Single-page application in [public/index.html](public/index.html) (~2700 lines)
- **Backend**: [api/supabase-api.js](api/supabase-api.js) - Serverless function with scoring algorithms and Whisper integration

### Key Features
- **Voice Input**: OpenAI Whisper integration for speech-to-text transcription
- **Server-side Scoring**: All MoCA test scoring algorithms implemented in API
- **Multilingual**: English, Spanish, Chinese (EN/ES/ZH)
- **Mobile-first**: Responsive design with touch support

### Data Flow
1. User loads [public/index.html](public/index.html)
2. Session created via `/api/supabase-api?action=create-session`
3. User takes test
4. Test scored via `/api/supabase-api?action=score-test`
5. Results saved via `/api/supabase-api?action=save-test`
6. MoCA composite calculated via `/api/supabase-api?action=calculate-moca`

## Development Commands

```bash
# Start development server
npm run dev

# Deploy to production
npm run deploy
```

## Environment Variables (Vercel Dashboard)

```
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJ...
OPENAI_API_KEY=sk-...  # For Whisper transcription
ALLOWED_ORIGINS=https://your-domain.vercel.app  # Optional, defaults to *
```

## API Endpoints

All endpoints use `/api/supabase-api?action=ACTION_NAME`

| Action | Method | Description |
|--------|--------|-------------|
| `create-session` | POST | Create new session |
| `save-test` | POST | Save test result |
| `score-test` | POST | Score a test (server-side) |
| `calculate-moca` | POST | Calculate MoCA composite score |
| `save-moca` | POST | Save MoCA session results |
| `get-results` | GET | Get results for session |
| `get-moca` | GET | Get MoCA history |
| `transcribe` | POST | Whisper speech-to-text |
| `health` | GET | Health check |

## Code Structure

### Frontend ([public/index.html](public/index.html))
- **CSS**: Lines 1-580 (inline styles, mobile-first)
- **HTML**: Lines 580-1100 (test interfaces)
- **Translations**: Lines 1130-1450 (EN/ES/ZH)
- **JavaScript**: Lines 1450-2700 (test logic, API calls)

### API ([api/supabase-api.js](api/supabase-api.js))
- **CognitiveTestScorer class**: Lines 5-580 (all scoring algorithms)
- **Handler function**: Lines 580-920 (API routing)

### Scoring Algorithms (in api/supabase-api.js)
| Method | MoCA Points | Pass Threshold |
|--------|-------------|----------------|
| `scoreMocaMemoryTest()` | 0-5 | 3+ words |
| `scoreTrailTest()` | 0-1 | Complete with 0 errors |
| `scoreFluencyTest()` | 0-1 | 11+ items |
| `scoreOrientationTest()` | 0-6 | 4+ correct |
| `scoreNamingTest()` | 0-3 | 2+ correct |
| `scoreDigitSpanTest()` | 0-2 | 1+ correct |
| `scoreSerial7Test()` | 0-3 | 2+ correct subtractions |
| `scoreVigilanceTest()` | 0-1 | <2 errors |
| `scoreAbstractionTest()` | 0-2 | 1+ correct |
| `scoreRepetitionTest()` | 0-2 | 1+ exact match |

## Database Schema (Supabase)

```sql
-- Sessions table
sessions (session_id, language, created_at)

-- Test results
test_results (session_id, test_type, scores, test_data, interpretation,
              metadata, moca_category, moca_points, created_at)

-- MoCA composite scores
moca_sessions (session_id, total_score, max_score, tests_completed,
               education_adjustment, created_at)
```

## Adding New Tests

1. Add test card to home screen (around line 630)
2. Add test interface HTML section (before Results section)
3. Add translations for all 3 languages
4. Add JavaScript test logic and submission handler
5. Add scoring method to `CognitiveTestScorer` class in API
6. Add `score-test` case handler in API switch statement
7. Update valid test types array in `save-test` handler

## Vercel Configuration

[vercel.json](vercel.json):
- Function timeout: 30 seconds (for Whisper transcription)
- Rewrite: `/` → `/public/index.html`

## Voice Input (Whisper)

Voice recording is available on multiple tests using Web Audio API:
- Memory Test (recall phase)
- Animal Fluency Test
- Letter Fluency Test
- Naming Test (3 inputs)
- Abstraction Test (2 inputs)
- Repetition Test (2 sentences)

**How it works:**
1. User clicks Record button
2. Audio captured as webm/mp4 blob
3. Converted to base64 and sent to `/api/supabase-api?action=transcribe`
4. Whisper API returns transcript
5. Transcript populated in input field

Requires `OPENAI_API_KEY` environment variable.

## MoCA Scoring

Total score: 26 points (excludes clock drawing which requires manual evaluation)
- Normal: ≥26
- Possible cognitive impairment: <26
- Education adjustment: +1 point if ≤12 years education
