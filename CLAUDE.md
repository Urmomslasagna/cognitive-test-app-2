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
npm run start

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
| `transcribe` | POST | Whisper speech-to-text (supports verboseOutput for word timestamps) |
| `health` | GET | Health check |
| `update-session-consent` | POST | Store voice analysis consent |
| `analyze-speech` | POST | Extract speech features (v2.0: extended features + task signal) |
| `get-speech-analysis` | GET | Retrieve speech analysis for session (includes composite) |
| `calculate-session-composite` | POST | Calculate aggregate composite score for session |
| `compare-sessions` | POST | Compare two sessions by ID, return trend analysis |

## Code Structure

### Frontend ([public/index.html](public/index.html))
- **CSS**: Lines 1-580 (inline styles, mobile-first)
- **HTML**: Lines 580-1100 (test interfaces)
- **Translations**: Lines 1130-1450 (EN/ES/ZH)
- **JavaScript**: Lines 1450-2700 (test logic, API calls)

### API ([api/supabase-api.js](api/supabase-api.js))
- **CognitiveTestScorer class**: Lines 5-580 (all scoring algorithms)
- **SpeechFeatureExtractor class**: Lines 583-1043 (experimental speech analysis v2.0)
- **SpeechSignalCalculator class**: Lines 1045-1223 (composite scoring)
- **Handler function**: Lines 1225-1880 (API routing)

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

## Experimental Voice Analysis Feature (v2.0)

An **optional, experimental** speech pattern analysis feature that analyzes speech from test recordings.

**CRITICAL: NOT a diagnostic tool** - Results are informational only. Avoids medical terminology.

### User Flow
1. User clicks "Speech Patterns" tile on home screen (marked "Experimental")
2. Consent screen shown with disclaimers about limitations
3. If consented, dashboard shows aggregated speech patterns
4. Analysis runs automatically after each voice-enabled test

### Features Extracted (Basic)
- Speech rate (words per minute)
- Pause count and duration
- Response latency (time to first word)
- Lexical diversity (unique/total words ratio)
- Filler word count
- Repetition detection

### Enhanced Features (v2.0)
- **Articulation rate** - WPM excluding pauses (phonation time only)
- **Hesitation patterns** - Short/medium/long pause distribution
- **Rate decay** - Production decline over time (first/middle/last thirds)
- **Inter-word variability** - Rhythm consistency (coefficient of variation)
- **Mean Length of Utterance (MLU)** - Average words per sentence
- **Disfluency analysis** - Fillers, restarts, fragments
- **POS ratios** - Content vs function word estimation
- **Semantic coherence** - Task-specific vocabulary matching

### Composite Scoring System
- **Task Signal (0-100)** - Per-test weighted score based on task type
- **Session Composite** - Aggregated "Cognitive Speech Signal Index"
- **Reliability score** - Based on data completeness
- **Session comparison** - Compare signals between two sessions

### Task-Aware Analysis
Different tests have different speech expectations:
| Test Type | Key Metrics | Expectations |
|-----------|-------------|--------------|
| Fluency | Rate decay, clustering | Rapid generation |
| Memory | Response latency, hesitation | Retrieval effort visible |
| Repetition | Articulation clarity, rhythm | Careful, accurate speech |
| Naming | Word retrieval time | Response timing reflects retrieval |
| Abstraction | Thinking pauses, elaboration | Pauses reflect conceptual processing |

### API Endpoints (Speech Analysis)
| Action | Method | Description |
|--------|--------|-------------|
| `update-session-consent` | POST | Store voice analysis consent |
| `analyze-speech` | POST | Extract features, extended features, task signal |
| `get-speech-analysis` | GET | Retrieve analysis for session (includes composite) |
| `calculate-session-composite` | POST | Calculate aggregate composite for session |
| `compare-sessions` | POST | Compare two sessions, return trend |

### Database Schema (Speech Analysis)
```sql
-- Add to sessions table
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS voice_analysis_consent BOOLEAN DEFAULT FALSE;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS consent_timestamp TIMESTAMP;

-- Speech analysis table (enhanced v2.0)
CREATE TABLE IF NOT EXISTS speech_analysis (
    id SERIAL PRIMARY KEY,
    session_id VARCHAR(100) NOT NULL,
    test_type VARCHAR(50) NOT NULL,
    features JSONB NOT NULL,
    interpretation JSONB,
    language VARCHAR(10) DEFAULT 'en',
    extended_features JSONB,
    task_signal INTEGER,
    signal_confidence DECIMAL(3,2),
    version VARCHAR(10) DEFAULT '2.0',
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_speech_analysis_session ON speech_analysis(session_id);

-- Session composite table (v2.0)
CREATE TABLE IF NOT EXISTS session_speech_composite (
    id SERIAL PRIMARY KEY,
    session_id VARCHAR(100) NOT NULL,
    composite_signal INTEGER,
    tasks_included INTEGER,
    task_breakdown JSONB,
    reliability DECIMAL(3,2),
    interpretation TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_composite_session ON session_speech_composite(session_id);

-- Enable RLS (run if using Supabase Row Level Security)
ALTER TABLE speech_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_speech_composite ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Allow anonymous insert speech_analysis" ON speech_analysis
    FOR INSERT WITH CHECK (true);
CREATE POLICY IF NOT EXISTS "Allow anonymous read speech_analysis" ON speech_analysis
    FOR SELECT USING (true);
CREATE POLICY IF NOT EXISTS "Allow anonymous insert composite" ON session_speech_composite
    FOR INSERT WITH CHECK (true);
CREATE POLICY IF NOT EXISTS "Allow anonymous read composite" ON session_speech_composite
    FOR SELECT USING (true);
```

### Key Files
- `SpeechFeatureExtractor` class in [api/supabase-api.js](api/supabase-api.js) - 8 enhanced extraction methods
- `SpeechSignalCalculator` class in [api/supabase-api.js](api/supabase-api.js) - Composite scoring
- Consent/Dashboard UI in [public/index.html](public/index.html)
- Translations: 50+ keys in EN/ES/ZH for voice analysis feature
