// api/supabase-api.js - Enhanced API for Vercel using Supabase
// Includes scoring algorithms, Whisper transcription, and MoCA support

// ============= SCORING ALGORITHMS =============
class CognitiveTestScorer {
    // MoCA standard 5-word memory test
    static scoreMocaMemoryTest(recalled, language = 'en') {
        const wordLists = {
            en: ['face', 'velvet', 'church', 'daisy', 'red'],
            es: ['cara', 'terciopelo', 'iglesia', 'margarita', 'rojo'],
            zh: ['脸', '天鹅绒', '教堂', '雏菊', '红色']
        };

        const targetWords = wordLists[language] || wordLists.en;
        const recalledWords = recalled.map(w => w.toLowerCase().trim());

        const correctRecalls = recalledWords.filter(w =>
            targetWords.some(target => target.toLowerCase() === w)
        ).length;

        const falsePositives = recalledWords.filter(w =>
            !targetWords.some(target => target.toLowerCase() === w)
        ).length;

        const score = {
            correct: correctRecalls,
            total: targetWords.length,
            falsePositives: falsePositives,
            mocaPoints: correctRecalls, // 1 point per word, max 5
            passed: correctRecalls >= 3
        };

        const interpretation = {
            passed: score.passed,
            flagsForConcern: [],
            recommendations: []
        };

        if (correctRecalls < 3) {
            interpretation.flagsForConcern.push('Below expected recall range');
            interpretation.recommendations.push('Consider comprehensive memory assessment');
        }

        if (falsePositives > 2) {
            interpretation.flagsForConcern.push('Elevated false positive responses');
            interpretation.recommendations.push('May indicate confusion or confabulation');
        }

        return { score, interpretation };
    }

    // Legacy 10-word memory test (keeping for backwards compatibility)
    static scoreMemoryTest(recalled, original, language = 'en') {
        const wordLists = {
            en: ['apple', 'table', 'penny', 'garden', 'pencil', 'house', 'car', 'book', 'tree', 'shoe'],
            es: ['manzana', 'mesa', 'moneda', 'jardín', 'lápiz', 'casa', 'carro', 'libro', 'árbol', 'zapato'],
            zh: ['苹果', '桌子', '硬币', '花园', '铅笔', '房子', '汽车', '书', '树', '鞋子']
        };

        const targetWords = wordLists[language] || wordLists.en;
        const recalledWords = recalled.map(w => w.toLowerCase().trim());

        const correctRecalls = recalledWords.filter(w =>
            targetWords.some(target => target.toLowerCase() === w)
        ).length;

        const falsePositives = recalledWords.filter(w =>
            !targetWords.some(target => target.toLowerCase() === w)
        ).length;

        const score = {
            correct: correctRecalls,
            total: targetWords.length,
            falsePositives: falsePositives,
            percentage: (correctRecalls / targetWords.length) * 100,
            passed: correctRecalls >= 4
        };

        const interpretation = {
            passed: score.passed,
            flagsForConcern: [],
            recommendations: []
        };

        if (correctRecalls < 4) {
            interpretation.flagsForConcern.push('Below expected recall range');
            interpretation.recommendations.push('Consider comprehensive memory assessment');
        }

        if (falsePositives > 2) {
            interpretation.flagsForConcern.push('Elevated false positive responses');
            interpretation.recommendations.push('May indicate confusion or confabulation');
        }

        return { score, interpretation };
    }

    static scoreTrailTest(part, connections, errors, completed, timeTaken) {
        const norms = {
            'A': { mean: 31.78, sd: 9.93 },
            'B': { mean: 63.76, sd: 14.42 }
        };

        const norm = norms[part] || norms['A'];
        let score = 100;

        if (!completed) {
            score = 0;
        } else {
            const zScore = (timeTaken - norm.mean) / norm.sd;
            score = Math.max(0, Math.min(100, 75 - (zScore * 15)));
        }

        score -= errors * 5;
        score = Math.max(0, score);

        const passed = completed && score >= 50 && errors <= 3;

        // MoCA Trail Making B awards 1 point if completed without errors
        const mocaPoints = (part === 'B' && completed && errors === 0) ? 1 : 0;

        const rawScore = {
            part: part,
            time: timeTaken,
            errors: errors,
            completed: completed,
            connectionsCount: connections ? connections.length : 0,
            score: Math.round(score),
            mocaPoints: mocaPoints
        };

        const interpretation = {
            passed: passed,
            flagsForConcern: [],
            recommendations: []
        };

        if (!completed) {
            interpretation.flagsForConcern.push('Test not completed');
            interpretation.recommendations.push('May indicate significant processing difficulties');
        }

        if (errors > 3) {
            interpretation.flagsForConcern.push('Multiple errors made');
            interpretation.recommendations.push('May indicate attention or sequencing difficulties');
        }

        return { score: rawScore, interpretation };
    }

    static scoreFluencyTest(items, timeInSeconds = 60, type = 'animal') {
        const uniqueItems = [...new Set(items.map(a => a.toLowerCase().trim()))];
        const validItems = uniqueItems.filter(a => a.length > 0);

        // MoCA uses 11+ for animal fluency, same threshold for letter fluency
        const threshold = 11;
        const mocaPoints = validItems.length >= threshold ? 1 : 0;

        const score = {
            count: validItems.length,
            uniqueCount: validItems.length,
            averagePerMinute: (validItems.length / timeInSeconds) * 60,
            passed: validItems.length >= threshold,
            mocaPoints: mocaPoints,
            type: type
        };

        const interpretation = {
            passed: score.passed,
            flagsForConcern: [],
            recommendations: []
        };

        if (validItems.length < threshold) {
            interpretation.flagsForConcern.push(`Below expected range for ${type} fluency`);
            interpretation.recommendations.push('May indicate word-finding difficulties');
        }

        return { score, interpretation };
    }

    // MoCA Orientation Test (6 points)
    static scoreOrientationTest(responses) {
        const now = new Date();
        let points = 0;
        const details = {};

        // Date (1 point)
        if (parseInt(responses.date) === now.getDate()) {
            points++;
            details.date = true;
        } else {
            details.date = false;
        }

        // Month (1 point)
        const correctMonth = now.getMonth() + 1;
        if (parseInt(responses.month) === correctMonth) {
            points++;
            details.month = true;
        } else {
            details.month = false;
        }

        // Year (1 point)
        if (parseInt(responses.year) === now.getFullYear()) {
            points++;
            details.year = true;
        } else {
            details.year = false;
        }

        // Day of week (1 point)
        const days = {
            en: ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'],
            es: ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'],
            zh: ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']
        };
        const correctDay = now.getDay();
        const userDay = responses.day?.toLowerCase().trim();
        if (days.en[correctDay] === userDay ||
            days.es[correctDay] === userDay ||
            days.zh[correctDay] === userDay) {
            points++;
            details.day = true;
        } else {
            details.day = false;
        }

        // Place/City (1 point) - User provides expected answer
        if (responses.city && responses.expectedCity &&
            responses.city.toLowerCase().trim() === responses.expectedCity.toLowerCase().trim()) {
            points++;
            details.city = true;
        } else if (responses.city && !responses.expectedCity) {
            // If no expected city, trust user input
            points++;
            details.city = true;
        } else {
            details.city = false;
        }

        // Country (1 point)
        if (responses.country && responses.expectedCountry &&
            responses.country.toLowerCase().trim() === responses.expectedCountry.toLowerCase().trim()) {
            points++;
            details.country = true;
        } else if (responses.country && !responses.expectedCountry) {
            points++;
            details.country = true;
        } else {
            details.country = false;
        }

        return {
            score: {
                points: points,
                maxPoints: 6,
                mocaPoints: points,
                details: details,
                passed: points >= 4
            },
            interpretation: {
                passed: points >= 4,
                flagsForConcern: points < 4 ? ['Orientation difficulties detected'] : [],
                recommendations: points < 4 ? ['May indicate disorientation to time or place'] : []
            }
        };
    }

    // MoCA Digit Span Test (2 points)
    static scoreDigitSpanTest(forwardResponse, backwardResponse) {
        const correctForward = '21854';
        const correctBackward = '247'; // User enters reversed: 7-4-2 becomes 2-4-7

        let points = 0;
        const details = {};

        // Forward: 2-1-8-5-4 (1 point)
        if (forwardResponse.replace(/\D/g, '') === correctForward) {
            points++;
            details.forward = true;
        } else {
            details.forward = false;
        }

        // Backward: 7-4-2 -> user types 2-4-7 (1 point)
        if (backwardResponse.replace(/\D/g, '') === correctBackward) {
            points++;
            details.backward = true;
        } else {
            details.backward = false;
        }

        return {
            score: {
                points: points,
                maxPoints: 2,
                mocaPoints: points,
                details: details,
                passed: points >= 1
            },
            interpretation: {
                passed: points >= 1,
                flagsForConcern: points === 0 ? ['Attention difficulties with digit span'] : [],
                recommendations: points === 0 ? ['May indicate attention or working memory issues'] : []
            }
        };
    }

    // MoCA Vigilance Test - Letter A (1 point)
    static scoreVigilanceTest(taps, errors) {
        // Sequence has 11 A's, user should tap for each
        // Pass if errors < 2 (misses or false positives)
        const totalErrors = errors || 0;
        const points = totalErrors < 2 ? 1 : 0;

        return {
            score: {
                taps: taps,
                errors: totalErrors,
                mocaPoints: points,
                passed: points === 1
            },
            interpretation: {
                passed: points === 1,
                flagsForConcern: points === 0 ? ['Sustained attention difficulties'] : [],
                recommendations: points === 0 ? ['May indicate attention or concentration issues'] : []
            }
        };
    }

    // MoCA Serial 7 Test (3 points)
    static scoreSerial7Test(responses) {
        const correctSequence = [93, 86, 79, 72, 65];
        let points = 0;
        const details = [];

        // Score based on correct subtractions (4-5 correct = 3 pts, 2-3 = 2 pts, 1 = 1 pt)
        for (let i = 0; i < Math.min(responses.length, 5); i++) {
            const userAnswer = parseInt(responses[i]);
            const expected = correctSequence[i];
            // Also accept if difference from previous is 7
            const prevExpected = i === 0 ? 100 : correctSequence[i-1];
            const prevUser = i === 0 ? 100 : parseInt(responses[i-1]);

            if (userAnswer === expected || (prevUser - userAnswer === 7)) {
                details.push({ index: i, correct: true, answer: userAnswer });
            } else {
                details.push({ index: i, correct: false, answer: userAnswer, expected: expected });
            }
        }

        const correctCount = details.filter(d => d.correct).length;
        if (correctCount >= 4) points = 3;
        else if (correctCount >= 2) points = 2;
        else if (correctCount >= 1) points = 1;

        return {
            score: {
                correctCount: correctCount,
                mocaPoints: points,
                maxPoints: 3,
                details: details,
                passed: points >= 2
            },
            interpretation: {
                passed: points >= 2,
                flagsForConcern: points < 2 ? ['Calculation or attention difficulties'] : [],
                recommendations: points < 2 ? ['May indicate issues with attention or calculation'] : []
            }
        };
    }

    // MoCA Sentence Repetition (2 points)
    static scoreRepetitionTest(sentence1Response, sentence2Response, language = 'en') {
        const sentences = {
            en: [
                'i only know that john is the one to help today',
                'the cat always hid under the couch when dogs were in the room'
            ],
            es: [
                'solo sé que juan es el único que puede ayudar hoy',
                'el gato siempre se escondía debajo del sofá cuando los perros estaban en la habitación'
            ],
            zh: [
                '我只知道约翰是今天唯一能帮忙的人',
                '当狗在房间里时猫总是躲在沙发下面'
            ]
        };

        const targets = sentences[language] || sentences.en;
        let points = 0;
        const details = {};

        // Normalize and compare (allow minor punctuation differences)
        const normalize = (str) => str.toLowerCase().replace(/[.,!?]/g, '').trim();

        if (normalize(sentence1Response) === normalize(targets[0])) {
            points++;
            details.sentence1 = true;
        } else {
            details.sentence1 = false;
        }

        if (normalize(sentence2Response) === normalize(targets[1])) {
            points++;
            details.sentence2 = true;
        } else {
            details.sentence2 = false;
        }

        return {
            score: {
                points: points,
                maxPoints: 2,
                mocaPoints: points,
                details: details,
                passed: points >= 1
            },
            interpretation: {
                passed: points >= 1,
                flagsForConcern: points === 0 ? ['Language repetition difficulties'] : [],
                recommendations: points === 0 ? ['May indicate language processing issues'] : []
            }
        };
    }

    // MoCA Abstraction Test (2 points)
    static scoreAbstractionTest(response1, response2, language = 'en') {
        const acceptableAnswers = {
            en: {
                pair1: ['fruit', 'fruits', 'food', 'foods', 'edible', 'eat'],
                pair2: ['transport', 'transportation', 'vehicle', 'vehicles', 'travel', 'ride', 'moving']
            },
            es: {
                pair1: ['fruta', 'frutas', 'comida', 'alimento'],
                pair2: ['transporte', 'vehículo', 'vehículos', 'viaje']
            },
            zh: {
                pair1: ['水果', '食物', '吃的'],
                pair2: ['交通', '交通工具', '车辆', '运输']
            }
        };

        const answers = acceptableAnswers[language] || acceptableAnswers.en;
        let points = 0;
        const details = {};

        const normalize = (str) => str.toLowerCase().trim();

        if (answers.pair1.includes(normalize(response1))) {
            points++;
            details.pair1 = true;
        } else {
            details.pair1 = false;
        }

        if (answers.pair2.includes(normalize(response2))) {
            points++;
            details.pair2 = true;
        } else {
            details.pair2 = false;
        }

        return {
            score: {
                points: points,
                maxPoints: 2,
                mocaPoints: points,
                details: details,
                passed: points >= 1
            },
            interpretation: {
                passed: points >= 1,
                flagsForConcern: points === 0 ? ['Abstract thinking difficulties'] : [],
                recommendations: points === 0 ? ['May indicate issues with conceptual thinking'] : []
            }
        };
    }

    // MoCA Naming Test (3 points)
    static scoreNamingTest(responses, language = 'en') {
        const acceptableAnswers = {
            en: {
                animal1: ['lion', 'lions'],
                animal2: ['rhinoceros', 'rhino', 'rhinoceroses', 'rhinos'],
                animal3: ['camel', 'camels', 'dromedary']
            },
            es: {
                animal1: ['león', 'leon', 'leones'],
                animal2: ['rinoceronte', 'rinocerontes'],
                animal3: ['camello', 'camellos', 'dromedario']
            },
            zh: {
                animal1: ['狮子', '獅子'],
                animal2: ['犀牛'],
                animal3: ['骆驼', '駱駝']
            }
        };

        const answers = acceptableAnswers[language] || acceptableAnswers.en;
        let points = 0;
        const details = {};

        const normalize = (str) => str.toLowerCase().trim();

        if (answers.animal1.includes(normalize(responses.animal1 || ''))) {
            points++;
            details.animal1 = true;
        } else {
            details.animal1 = false;
        }

        if (answers.animal2.includes(normalize(responses.animal2 || ''))) {
            points++;
            details.animal2 = true;
        } else {
            details.animal2 = false;
        }

        if (answers.animal3.includes(normalize(responses.animal3 || ''))) {
            points++;
            details.animal3 = true;
        } else {
            details.animal3 = false;
        }

        return {
            score: {
                points: points,
                maxPoints: 3,
                mocaPoints: points,
                details: details,
                passed: points >= 2
            },
            interpretation: {
                passed: points >= 2,
                flagsForConcern: points < 2 ? ['Naming difficulties detected'] : [],
                recommendations: points < 2 ? ['May indicate language or visual processing issues'] : []
            }
        };
    }

    // Calculate total MoCA score
    static calculateMoCATotal(testResults) {
        let total = 0;
        const breakdown = {};

        const testScores = {
            trail: testResults.trail?.score?.mocaPoints || 0,
            naming: testResults.naming?.score?.mocaPoints || 0,
            memory: testResults.memory?.score?.mocaPoints || 0,
            digitSpan: testResults.digitSpan?.score?.mocaPoints || 0,
            vigilance: testResults.vigilance?.score?.mocaPoints || 0,
            serial7: testResults.serial7?.score?.mocaPoints || 0,
            repetition: testResults.repetition?.score?.mocaPoints || 0,
            fluency: testResults.fluency?.score?.mocaPoints || 0,
            abstraction: testResults.abstraction?.score?.mocaPoints || 0,
            orientation: testResults.orientation?.score?.mocaPoints || 0
        };

        Object.entries(testScores).forEach(([test, points]) => {
            total += points;
            breakdown[test] = points;
        });

        // Education adjustment: +1 if ≤12 years education
        const educationAdjustment = testResults.educationYears <= 12 ? 1 : 0;

        return {
            rawScore: total,
            adjustedScore: Math.min(total + educationAdjustment, 30),
            maxScore: 26, // Excluding clock drawing
            educationAdjustment: educationAdjustment,
            breakdown: breakdown,
            interpretation: total >= 26 ? 'normal' : 'possible_cognitive_impairment',
            passed: total >= 26
        };
    }
}

// ============= MAIN HANDLER =============
export default async function handler(req, res) {
    // CORS - Allow specific origins or all for development
    const allowedOrigins = process.env.ALLOWED_ORIGINS
        ? process.env.ALLOWED_ORIGINS.split(',')
        : ['*'];

    const origin = req.headers.origin;
    if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin || '*');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Get environment variables INSIDE the handler
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

    // Validate required env vars
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
        return res.status(500).json({ error: 'Server configuration error' });
    }

    // Helper to make Supabase requests
    async function supabaseRequest(endpoint, method = 'GET', body = null) {
        const options = {
            method,
            headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=representation'
            }
        };

        if (body) {
            options.body = JSON.stringify(body);
        }

        const response = await fetch(`${SUPABASE_URL}/rest/v1/${endpoint}`, options);

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Database error: ${response.statusText}`);
        }

        return response.json();
    }

    // Generate session ID
    function generateSessionId() {
        return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    // Input validation helper
    function validateRequired(fields, body) {
        const missing = fields.filter(f => !body || body[f] === undefined || body[f] === null);
        if (missing.length > 0) {
            throw new Error(`Missing required fields: ${missing.join(', ')}`);
        }
    }

    const { action } = req.query;

    try {
        switch (action) {
            case 'create-session': {
                const { language = 'en' } = req.body || {};
                const sessionId = generateSessionId();

                await supabaseRequest('sessions', 'POST', {
                    session_id: sessionId,
                    language
                });

                return res.json({
                    success: true,
                    sessionId,
                    message: 'Session created'
                });
            }

            case 'save-test': {
                const body = req.body || {};
                validateRequired(['sessionId', 'testType'], body);

                const { sessionId, testType, scores, testData, interpretation, metadata } = body;

                // Validate testType
                const validTypes = [
                    'memory', 'moca-memory', 'trail', 'fluency', 'letter-fluency',
                    'orientation', 'naming', 'digit-span', 'vigilance',
                    'serial7', 'repetition', 'abstraction'
                ];
                if (!validTypes.includes(testType)) {
                    return res.status(400).json({ error: 'Invalid test type' });
                }

                await supabaseRequest('test_results', 'POST', {
                    session_id: sessionId,
                    test_type: testType,
                    scores,
                    test_data: testData,
                    interpretation,
                    metadata,
                    moca_category: testType,
                    moca_points: scores?.mocaPoints || null
                });

                return res.json({
                    success: true,
                    message: 'Test saved'
                });
            }

            case 'score-test': {
                const body = req.body || {};
                validateRequired(['testType', 'responses'], body);

                const { testType, responses, language = 'en' } = body;
                let result;

                switch (testType) {
                    case 'memory':
                        result = CognitiveTestScorer.scoreMemoryTest(
                            responses.recalled || [],
                            responses.original,
                            language
                        );
                        break;
                    case 'moca-memory':
                        result = CognitiveTestScorer.scoreMocaMemoryTest(
                            responses.recalled || [],
                            language
                        );
                        break;
                    case 'trail':
                        result = CognitiveTestScorer.scoreTrailTest(
                            responses.part,
                            responses.connections,
                            responses.errors,
                            responses.completed,
                            responses.timeTaken
                        );
                        break;
                    case 'fluency':
                        result = CognitiveTestScorer.scoreFluencyTest(
                            responses.items || responses.animals || [],
                            responses.timeInSeconds || 60,
                            'animal'
                        );
                        break;
                    case 'letter-fluency':
                        result = CognitiveTestScorer.scoreFluencyTest(
                            responses.items || [],
                            responses.timeInSeconds || 60,
                            'letter'
                        );
                        break;
                    case 'orientation':
                        result = CognitiveTestScorer.scoreOrientationTest(responses);
                        break;
                    case 'naming':
                        result = CognitiveTestScorer.scoreNamingTest(responses, language);
                        break;
                    case 'digit-span':
                        result = CognitiveTestScorer.scoreDigitSpanTest(
                            responses.forward || '',
                            responses.backward || ''
                        );
                        break;
                    case 'vigilance':
                        result = CognitiveTestScorer.scoreVigilanceTest(
                            responses.taps || 0,
                            responses.errors || 0
                        );
                        break;
                    case 'serial7':
                        result = CognitiveTestScorer.scoreSerial7Test(responses.answers || []);
                        break;
                    case 'repetition':
                        result = CognitiveTestScorer.scoreRepetitionTest(
                            responses.sentence1 || '',
                            responses.sentence2 || '',
                            language
                        );
                        break;
                    case 'abstraction':
                        result = CognitiveTestScorer.scoreAbstractionTest(
                            responses.pair1 || '',
                            responses.pair2 || '',
                            language
                        );
                        break;
                    default:
                        return res.status(400).json({ error: 'Unknown test type' });
                }

                return res.json({
                    success: true,
                    result
                });
            }

            case 'calculate-moca': {
                const body = req.body || {};
                validateRequired(['testResults'], body);

                const total = CognitiveTestScorer.calculateMoCATotal(body.testResults);

                return res.json({
                    success: true,
                    result: total
                });
            }

            case 'save-moca': {
                const body = req.body || {};
                validateRequired(['sessionId', 'testResults'], body);

                const total = CognitiveTestScorer.calculateMoCATotal(body.testResults);

                await supabaseRequest('moca_sessions', 'POST', {
                    session_id: body.sessionId,
                    total_score: total.adjustedScore,
                    max_score: total.maxScore,
                    tests_completed: total.breakdown,
                    education_adjustment: total.educationAdjustment
                });

                return res.json({
                    success: true,
                    result: total
                });
            }

            case 'get-results': {
                const { sessionId } = req.query;

                if (!sessionId) {
                    return res.status(400).json({ error: 'Session ID required' });
                }

                const results = await supabaseRequest(
                    `test_results?session_id=eq.${sessionId}&order=created_at.desc`
                );

                return res.json({
                    success: true,
                    results
                });
            }

            case 'get-moca': {
                const { sessionId } = req.query;

                if (!sessionId) {
                    return res.status(400).json({ error: 'Session ID required' });
                }

                const results = await supabaseRequest(
                    `moca_sessions?session_id=eq.${sessionId}&order=created_at.desc`
                );

                return res.json({
                    success: true,
                    results
                });
            }

            case 'transcribe': {
                if (!OPENAI_API_KEY) {
                    return res.status(500).json({ error: 'Transcription not configured' });
                }

                const body = req.body || {};
                validateRequired(['audio'], body);

                const { audio, language = 'en' } = body;

                // Decode base64 audio
                const audioBuffer = Buffer.from(audio, 'base64');

                // Create form data for OpenAI
                const formData = new FormData();
                const blob = new Blob([audioBuffer], { type: 'audio/webm' });
                formData.append('file', blob, 'audio.webm');
                formData.append('model', 'whisper-1');
                formData.append('language', language);

                const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${OPENAI_API_KEY}`
                    },
                    body: formData
                });

                if (!response.ok) {
                    const error = await response.text();
                    throw new Error('Transcription failed');
                }

                const result = await response.json();

                return res.json({
                    success: true,
                    transcript: result.text,
                    language: language
                });
            }

            case 'health': {
                return res.json({
                    status: 'ok',
                    timestamp: new Date().toISOString(),
                    features: {
                        supabase: !!SUPABASE_URL,
                        whisper: !!OPENAI_API_KEY
                    }
                });
            }

            default:
                return res.status(400).json({ error: 'Invalid action' });
        }
    } catch (error) {
        console.error('API Error:', error);
        return res.status(500).json({
            error: 'Server error',
            message: error.message
        });
    }
}
