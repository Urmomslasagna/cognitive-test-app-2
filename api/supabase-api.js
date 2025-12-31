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

// ============= SPEECH FEATURE EXTRACTOR v2.0 =============
// Enhanced experimental feature for analyzing speech patterns
// NOTE: This is NOT a diagnostic tool - results are informational only
class SpeechFeatureExtractor {
    // Pause thresholds in seconds
    static PAUSE_SHORT = 0.5;
    static PAUSE_MEDIUM = 1.5;
    static PAUSE_LONG = 3.0;

    /**
     * Extract base speech features from transcription data
     */
    static extractFeatures(data) {
        const { transcript, words = [], duration = 0, recordingDuration = 0 } = data;

        const text = transcript || '';
        const wordArray = text.split(/\s+/).filter(w => w.length > 0);
        const wordCount = wordArray.length;

        const durationMinutes = (duration || recordingDuration / 1000) / 60;
        const speechRate = durationMinutes > 0 ? Math.round(wordCount / durationMinutes) : 0;

        let pauseCount = 0;
        let totalPauseDuration = 0;

        if (words && words.length > 1) {
            for (let i = 1; i < words.length; i++) {
                const gap = words[i].start - words[i - 1].end;
                if (gap > this.PAUSE_SHORT) {
                    pauseCount++;
                    totalPauseDuration += gap;
                }
            }
        }

        const responseLatency = words && words.length > 0 ? words[0].start : null;

        const uniqueWords = new Set(wordArray.map(w => w.toLowerCase()));
        const lexicalDiversity = wordCount > 0 ? uniqueWords.size / wordCount : 0;

        const fillerWords = ['um', 'uh', 'er', 'ah', 'like', 'you know', 'eh'];
        const fillerCount = wordArray.filter(w =>
            fillerWords.includes(w.toLowerCase())
        ).length;

        let repetitionCount = 0;
        for (let i = 1; i < wordArray.length; i++) {
            if (wordArray[i].toLowerCase() === wordArray[i - 1].toLowerCase()) {
                repetitionCount++;
            }
        }

        return {
            wordCount,
            speechRate,
            pauseCount,
            avgPauseDuration: pauseCount > 0 ? Math.round((totalPauseDuration / pauseCount) * 100) / 100 : 0,
            responseLatency: responseLatency !== null ? Math.round(responseLatency * 100) / 100 : null,
            lexicalDiversity: Math.round(lexicalDiversity * 100) / 100,
            fillerCount,
            repetitionCount,
            totalDuration: Math.round((duration || recordingDuration / 1000) * 100) / 100
        };
    }

    /**
     * Calculate articulation rate (WPM excluding pauses)
     */
    static calculateArticulationRate(words, totalDuration) {
        if (!words || words.length < 2) return null;

        let phonationTime = 0;
        words.forEach(w => {
            if (w.end && w.start) {
                phonationTime += (w.end - w.start);
            }
        });

        const phonationMinutes = phonationTime / 60;
        return phonationMinutes > 0 ? Math.round(words.length / phonationMinutes) : 0;
    }

    /**
     * Analyze hesitation patterns - short, medium, long pauses
     */
    static analyzeHesitationPatterns(words, totalDuration) {
        if (!words || words.length < 2) return null;

        let shortPauses = 0, mediumPauses = 0, longPauses = 0;
        let totalSilence = 0;
        const pausePositions = [];

        for (let i = 1; i < words.length; i++) {
            const gap = words[i].start - words[i - 1].end;
            if (gap > this.PAUSE_SHORT) {
                const relativePosition = i / words.length;
                pausePositions.push(relativePosition);
                totalSilence += gap;

                if (gap >= this.PAUSE_LONG) longPauses++;
                else if (gap >= this.PAUSE_MEDIUM) mediumPauses++;
                else shortPauses++;
            }
        }

        const avgPausePosition = pausePositions.length > 0
            ? pausePositions.reduce((a, b) => a + b, 0) / pausePositions.length
            : 0.5;

        return {
            shortPauses,
            mediumPauses,
            longPauses,
            pausePositionTendency: Math.round(avgPausePosition * 100) / 100,
            silenceRatio: totalDuration > 0 ? Math.round((totalSilence / totalDuration) * 100) / 100 : 0
        };
    }

    /**
     * Analyze rate decay - production decline over time (for fluency tests)
     */
    static analyzeRateDecay(words, totalDuration) {
        if (!words || words.length < 6 || totalDuration < 3) return null;

        const thirdDuration = totalDuration / 3;
        const firstThird = words.filter(w => w.start < thirdDuration);
        const secondThird = words.filter(w => w.start >= thirdDuration && w.start < thirdDuration * 2);
        const lastThird = words.filter(w => w.start >= thirdDuration * 2);

        const rateBySegment = [
            firstThird.length / (thirdDuration / 60),
            secondThird.length / (thirdDuration / 60),
            lastThird.length / (thirdDuration / 60)
        ];

        const decaySlope = (rateBySegment[2] - rateBySegment[0]) / 2;

        return {
            segmentRates: rateBySegment.map(r => Math.round(r * 10) / 10),
            decaySlope: Math.round(decaySlope * 100) / 100,
            decayPattern: decaySlope < -2 ? 'declining' : decaySlope > 2 ? 'increasing' : 'stable'
        };
    }

    /**
     * Analyze inter-word interval variability (rhythm consistency)
     */
    static analyzeInterWordVariability(words) {
        if (!words || words.length < 3) return null;

        const intervals = [];
        for (let i = 1; i < words.length; i++) {
            intervals.push(words[i].start - words[i - 1].end);
        }

        const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
        const variance = intervals.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / intervals.length;
        const stdDev = Math.sqrt(variance);
        const coefficientOfVariation = mean > 0 ? stdDev / mean : 0;

        return {
            meanInterval: Math.round(mean * 1000) / 1000,
            intervalVariability: Math.round(coefficientOfVariation * 100) / 100,
            rhythmPattern: coefficientOfVariation < 0.5 ? 'regular' :
                           coefficientOfVariation < 1.0 ? 'moderate' : 'irregular'
        };
    }

    /**
     * Calculate Mean Length of Utterance (MLU)
     */
    static calculateMLU(transcript) {
        if (!transcript) return null;

        const utterances = transcript
            .split(/[.!?;]|\s{2,}/)
            .filter(u => u.trim().length > 0);

        if (utterances.length === 0) return { mlu: 0, utteranceCount: 0 };

        const wordsPerUtterance = utterances.map(u =>
            u.split(/\s+/).filter(w => w.length > 0).length
        );

        const mlu = wordsPerUtterance.reduce((a, b) => a + b, 0) / utterances.length;

        return {
            mlu: Math.round(mlu * 10) / 10,
            utteranceCount: utterances.length,
            minUtterance: Math.min(...wordsPerUtterance),
            maxUtterance: Math.max(...wordsPerUtterance)
        };
    }

    /**
     * Enhanced disfluency detection - fillers, restarts, fragments
     */
    static analyzeDisfluencies(transcript) {
        if (!transcript) return null;

        const text = transcript.toLowerCase();
        const wordArray = text.split(/\s+/).filter(w => w.length > 0);

        const fillerWords = [
            'um', 'uh', 'er', 'ah', 'like', 'you know', 'eh', 'hmm',
            'so', 'well', 'basically', 'actually', 'literally', 'right'
        ];

        let fillerCount = 0;
        const fillerDetails = {};
        fillerWords.forEach(filler => {
            const regex = new RegExp(`\\b${filler}\\b`, 'gi');
            const matches = text.match(regex);
            if (matches) {
                fillerCount += matches.length;
                fillerDetails[filler] = matches.length;
            }
        });

        // Detect restarts: "I... I mean", "the the"
        const restartPattern = /\b(\w+)\s*\.{2,3}\s*\1\b|\b(\w+)\s+\2\b/gi;
        const restarts = (text.match(restartPattern) || []).length;

        // Detect fragments (words ending in hyphen or isolated short)
        const fragments = wordArray.filter(w =>
            w.endsWith('-') || (w.length <= 2 && !['a', 'i', 'an', 'is', 'it', 'to', 'of', 'or', 'on', 'in', 'at', 'by', 'no', 'so', 'we', 'he', 'me', 'my', 'up', 'do', 'go', 'if', 'as', 'be'].includes(w))
        ).length;

        return {
            fillerCount,
            fillerDetails,
            restartCount: restarts,
            fragmentCount: fragments,
            disfluencyRate: wordArray.length > 0
                ? Math.round((fillerCount + restarts + fragments) / wordArray.length * 100) / 100
                : 0
        };
    }

    /**
     * Estimate POS ratios using word lists (lightweight, no NLP library)
     */
    static estimatePOSRatios(transcript) {
        if (!transcript) return null;

        const words = transcript.toLowerCase().split(/\s+/).filter(w => w.length > 0);
        if (words.length === 0) return null;

        const functionWords = new Set([
            // Articles
            'a', 'an', 'the',
            // Prepositions
            'in', 'on', 'at', 'to', 'for', 'with', 'by', 'from', 'of', 'about', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'between', 'under', 'over',
            // Pronouns
            'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them', 'my', 'your', 'his', 'its', 'our', 'their', 'mine', 'yours', 'hers', 'ours', 'theirs', 'this', 'that', 'these', 'those', 'who', 'which', 'what', 'whom', 'whose',
            // Conjunctions
            'and', 'but', 'or', 'nor', 'for', 'yet', 'so', 'because', 'although', 'while', 'if', 'when', 'unless', 'until', 'since',
            // Auxiliaries
            'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can', 'shall'
        ]);

        let functionCount = 0;
        let contentCount = 0;

        words.forEach(word => {
            const cleanWord = word.replace(/[^a-z]/g, '');
            if (!cleanWord) return;

            if (functionWords.has(cleanWord)) {
                functionCount++;
            } else {
                contentCount++;
            }
        });

        return {
            contentRatio: Math.round(contentCount / words.length * 100) / 100,
            functionRatio: Math.round(functionCount / words.length * 100) / 100,
            contentToFunction: functionCount > 0 ? Math.round(contentCount / functionCount * 100) / 100 : contentCount
        };
    }

    /**
     * Assess semantic coherence (lightweight - task-specific vocabulary matching)
     */
    static assessSemanticCoherence(transcript, testType, language = 'en') {
        if (!transcript) return null;

        const words = transcript.toLowerCase().split(/\s+/).filter(w => w.length > 0);
        if (words.length < 3) return { coherenceScore: null, reason: 'insufficient_words' };

        // For fluency tests - measure semantic clustering
        if (testType === 'fluency') {
            const animalCategories = {
                mammals: ['dog', 'cat', 'lion', 'tiger', 'elephant', 'horse', 'cow', 'pig', 'bear', 'wolf', 'fox', 'deer', 'rabbit', 'mouse', 'rat', 'monkey', 'gorilla', 'zebra', 'giraffe', 'hippo', 'rhino', 'sheep', 'goat', 'donkey', 'camel'],
                birds: ['bird', 'eagle', 'hawk', 'owl', 'parrot', 'chicken', 'duck', 'goose', 'turkey', 'crow', 'sparrow', 'robin', 'penguin', 'flamingo', 'ostrich', 'pigeon'],
                fish: ['fish', 'shark', 'whale', 'dolphin', 'salmon', 'tuna', 'cod', 'bass', 'trout', 'goldfish'],
                reptiles: ['snake', 'lizard', 'turtle', 'crocodile', 'alligator', 'gecko', 'iguana'],
                insects: ['ant', 'bee', 'butterfly', 'spider', 'fly', 'mosquito', 'beetle', 'grasshopper', 'cricket']
            };

            let currentCategory = null;
            let switches = 0;
            let validAnimals = 0;
            const clusters = [];
            let currentClusterSize = 0;

            words.forEach(word => {
                let foundCategory = null;
                for (const [category, animals] of Object.entries(animalCategories)) {
                    if (animals.includes(word)) {
                        foundCategory = category;
                        validAnimals++;
                        break;
                    }
                }

                if (foundCategory) {
                    if (currentCategory && foundCategory !== currentCategory) {
                        switches++;
                        if (currentClusterSize > 0) clusters.push(currentClusterSize);
                        currentClusterSize = 1;
                    } else {
                        currentClusterSize++;
                    }
                    currentCategory = foundCategory;
                }
            });
            if (currentClusterSize > 0) clusters.push(currentClusterSize);

            const avgClusterSize = clusters.length > 0
                ? clusters.reduce((a, b) => a + b, 0) / clusters.length
                : 0;

            return {
                coherenceScore: words.length > 0 ? Math.round(validAnimals / words.length * 100) / 100 : 0,
                clusteringBehavior: {
                    averageClusterSize: Math.round(avgClusterSize * 10) / 10,
                    switchCount: switches,
                    clusterCount: clusters.length
                },
                validItemRatio: words.length > 0 ? Math.round(validAnimals / words.length * 100) / 100 : 0
            };
        }

        // For other tests: use lexical diversity as proxy
        const uniqueWords = new Set(words);
        return {
            coherenceScore: Math.round(uniqueWords.size / words.length * 100) / 100,
            interpretation: 'lexical_diversity_based'
        };
    }

    /**
     * Extract all extended features
     */
    static extractExtendedFeatures(data) {
        const { transcript, words = [], duration = 0, recordingDuration = 0, testType, language = 'en' } = data;
        const totalDuration = duration || recordingDuration / 1000;

        return {
            articulationRate: this.calculateArticulationRate(words, totalDuration),
            hesitationPatterns: this.analyzeHesitationPatterns(words, totalDuration),
            rateDecay: this.analyzeRateDecay(words, totalDuration),
            interWordVariability: this.analyzeInterWordVariability(words),
            mlu: this.calculateMLU(transcript),
            disfluencies: this.analyzeDisfluencies(transcript),
            posRatios: this.estimatePOSRatios(transcript),
            semanticCoherence: this.assessSemanticCoherence(transcript, testType, language)
        };
    }

    /**
     * Generate enhanced task-aware analysis with observations
     */
    static generateTaskAwareAnalysis(features, extendedFeatures, testType) {
        const observations = [];

        const expectations = {
            fluency: { context: 'Word generation task', notes: 'Rapid item generation expected' },
            letterFluency: { context: 'Letter-based word generation', notes: 'Rapid generation expected' },
            memory: { context: 'Delayed recall task', notes: 'Pauses may reflect retrieval effort' },
            repetition: { context: 'Verbal repetition task', notes: 'Accurate speech expected' },
            naming: { context: 'Object naming task', notes: 'Response timing reflects retrieval' },
            abstraction: { context: 'Verbal reasoning task', notes: 'Pauses may reflect thinking' }
        };

        const taskContext = expectations[testType] || { context: 'General speech task', notes: 'Standard patterns' };

        // Generate observations based on features
        if (extendedFeatures.rateDecay?.decaySlope < -3) {
            observations.push('Declining production rate observed over time');
        }
        if (extendedFeatures.hesitationPatterns?.longPauses > 2) {
            observations.push('Extended pauses observed');
        }
        if (extendedFeatures.hesitationPatterns?.pausePositionTendency > 0.7) {
            observations.push('Pauses tended toward later in response');
        }
        if (features.responseLatency > 2.0) {
            observations.push('Extended initial response time observed');
        }
        if (extendedFeatures.disfluencies?.disfluencyRate > 0.1) {
            observations.push('Notable disfluency patterns observed');
        }
        if (extendedFeatures.semanticCoherence?.clusteringBehavior?.averageClusterSize > 3) {
            observations.push('Tendency to group related items together');
        }
        if (extendedFeatures.interWordVariability?.rhythmPattern === 'irregular') {
            observations.push('Variable speech rhythm observed');
        }

        // Task-specific metrics
        let taskSpecificMetrics = {};
        switch (testType) {
            case 'fluency':
            case 'letterFluency':
                taskSpecificMetrics = {
                    productionPattern: extendedFeatures.rateDecay?.decayPattern || 'unknown',
                    clusteringScore: extendedFeatures.semanticCoherence?.clusteringBehavior?.averageClusterSize || 0,
                    switchCount: extendedFeatures.semanticCoherence?.clusteringBehavior?.switchCount || 0
                };
                break;
            case 'memory':
                taskSpecificMetrics = {
                    retrievalLatency: features.responseLatency,
                    hesitationLevel: extendedFeatures.hesitationPatterns?.mediumPauses || 0 + (extendedFeatures.hesitationPatterns?.longPauses || 0),
                    repairBehavior: extendedFeatures.disfluencies?.restartCount || 0
                };
                break;
            case 'repetition':
                taskSpecificMetrics = {
                    articulationClarity: extendedFeatures.articulationRate || 0,
                    rhythmConsistency: extendedFeatures.interWordVariability?.rhythmPattern || 'unknown',
                    speechPace: features.speechRate < 180 ? 'careful' : 'rapid'
                };
                break;
            case 'naming':
                taskSpecificMetrics = {
                    wordRetrievalTime: features.responseLatency,
                    tipOfTongueIndicators: extendedFeatures.disfluencies?.fragmentCount || 0
                };
                break;
            case 'abstraction':
                taskSpecificMetrics = {
                    thinkingPauses: extendedFeatures.hesitationPatterns?.mediumPauses || 0,
                    responseElaboration: extendedFeatures.mlu?.mlu || 0
                };
                break;
        }

        return {
            testType,
            taskContext: taskContext.context,
            notes: taskContext.notes,
            observations,
            taskSpecificMetrics,
            experimentalNote: 'These patterns are experimental observations, not clinical indicators.'
        };
    }
}

// ============= SPEECH SIGNAL CALCULATOR =============
// Calculates composite scores from speech features
class SpeechSignalCalculator {
    // Reference ranges for normalization
    static NORMATIVE_RANGES = {
        speechRate: { min: 100, max: 180 },
        articulationRate: { min: 150, max: 220 },
        pauseCount: { min: 0, max: 10 },
        lexicalDiversity: { min: 0.3, max: 0.9 },
        responseLatency: { min: 0.3, max: 3.0 },
        disfluencyRate: { min: 0, max: 0.15 },
        mlu: { min: 3, max: 12 }
    };

    // Task importance weights
    static TASK_IMPORTANCE = {
        fluency: 1.2,
        letterFluency: 1.0,
        memory: 1.3,
        repetition: 0.9,
        naming: 0.8,
        abstraction: 1.0,
        orientation: 0.7
    };

    /**
     * Normalize a feature value to 0-1 scale
     */
    static normalizeFeature(value, featureName) {
        const range = this.NORMATIVE_RANGES[featureName];
        if (!range || value === null || value === undefined) return null;

        const normalized = (value - range.min) / (range.max - range.min);
        return Math.max(0, Math.min(1, normalized));
    }

    /**
     * Get feature weights for a specific test type
     */
    static getTaskWeights(testType) {
        const weights = {
            fluency: {
                speechRate: 0.25,
                lexicalDiversity: 0.15,
                pauseCount: 0.15,
                disfluencyRate: 0.15,
                rateDecayStability: 0.30
            },
            letterFluency: {
                speechRate: 0.30,
                pauseCount: 0.20,
                disfluencyRate: 0.20,
                rateDecayStability: 0.30
            },
            memory: {
                responseLatency: 0.30,
                pauseCount: 0.25,
                lexicalDiversity: 0.20,
                disfluencyRate: 0.25
            },
            repetition: {
                articulationRate: 0.30,
                speechRate: 0.25,
                pauseCount: 0.20,
                disfluencyRate: 0.25
            },
            naming: {
                responseLatency: 0.35,
                pauseCount: 0.25,
                disfluencyRate: 0.20,
                speechRate: 0.20
            },
            abstraction: {
                mlu: 0.30,
                pauseCount: 0.25,
                lexicalDiversity: 0.25,
                disfluencyRate: 0.20
            }
        };

        return weights[testType] || {
            speechRate: 0.25,
            pauseCount: 0.25,
            lexicalDiversity: 0.25,
            disfluencyRate: 0.25
        };
    }

    /**
     * Calculate task signal (0-100) from features
     */
    static calculateTaskSignal(features, extendedFeatures, testType) {
        const weights = this.getTaskWeights(testType);
        let weightedSum = 0;
        let totalWeight = 0;

        // Map feature names to values
        const featureValues = {
            speechRate: features.speechRate,
            articulationRate: extendedFeatures?.articulationRate,
            pauseCount: 10 - Math.min(features.pauseCount || 0, 10), // Invert: fewer pauses = better
            lexicalDiversity: features.lexicalDiversity,
            responseLatency: features.responseLatency ? (3.0 - Math.min(features.responseLatency, 3.0)) / 3.0 : null, // Invert: faster = better
            disfluencyRate: extendedFeatures?.disfluencies?.disfluencyRate ? (0.15 - Math.min(extendedFeatures.disfluencies.disfluencyRate, 0.15)) / 0.15 : null, // Invert
            mlu: extendedFeatures?.mlu?.mlu,
            rateDecayStability: extendedFeatures?.rateDecay?.decayPattern === 'stable' ? 1 : extendedFeatures?.rateDecay?.decayPattern === 'declining' ? 0.3 : 0.7
        };

        for (const [feature, weight] of Object.entries(weights)) {
            let value = featureValues[feature];
            if (value !== null && value !== undefined) {
                // Normalize if it's a raw value
                if (feature === 'speechRate' || feature === 'articulationRate' || feature === 'mlu') {
                    value = this.normalizeFeature(value, feature);
                }
                if (value !== null) {
                    weightedSum += value * weight;
                    totalWeight += weight;
                }
            }
        }

        const taskSignal = totalWeight > 0 ? Math.round((weightedSum / totalWeight) * 100) : null;
        const confidence = totalWeight / Object.keys(weights).length;

        return {
            taskSignal,
            confidence: Math.round(confidence * 100) / 100
        };
    }

    /**
     * Calculate session composite from multiple task results
     */
    static calculateSessionComposite(taskResults) {
        if (!taskResults || taskResults.length === 0) return null;

        let weightedSum = 0;
        let totalWeight = 0;
        const taskBreakdown = {};

        taskResults.forEach(result => {
            if (result.taskSignal !== null && result.confidence > 0.3) {
                const importance = this.TASK_IMPORTANCE[result.testType] || 1.0;
                const effectiveWeight = importance * result.confidence;

                weightedSum += result.taskSignal * effectiveWeight;
                totalWeight += effectiveWeight;

                taskBreakdown[result.testType] = {
                    signal: result.taskSignal,
                    confidence: result.confidence,
                    contribution: Math.round(result.taskSignal * effectiveWeight)
                };
            }
        });

        const compositeSignal = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : null;

        return {
            compositeSignal,
            tasksIncluded: Object.keys(taskBreakdown).length,
            taskBreakdown,
            reliability: Math.round((totalWeight / taskResults.length) * 100) / 100,
            interpretation: this.interpretCompositeScore(compositeSignal)
        };
    }

    /**
     * Generate non-diagnostic interpretation
     */
    static interpretCompositeScore(score) {
        if (score === null) return 'Insufficient data for pattern analysis';
        if (score >= 70) return 'Speech patterns within commonly observed ranges';
        if (score >= 50) return 'Some variation from common patterns observed';
        if (score >= 30) return 'Notable variation in some speech patterns';
        return 'Speech patterns showed variation from typical ranges';
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

                const { audio, language = 'en', verboseOutput = false } = body;

                // Decode base64 audio
                const audioBuffer = Buffer.from(audio, 'base64');

                // Create form data for OpenAI
                const formData = new FormData();
                const blob = new Blob([audioBuffer], { type: 'audio/webm' });
                formData.append('file', blob, 'audio.webm');
                formData.append('model', 'whisper-1');
                formData.append('language', language);

                // Request verbose output with word timestamps if needed for speech analysis
                if (verboseOutput) {
                    formData.append('response_format', 'verbose_json');
                    formData.append('timestamp_granularities[]', 'word');
                }

                const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${OPENAI_API_KEY}`
                    },
                    body: formData
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    console.error('Whisper API error:', errorText);
                    throw new Error('Transcription failed');
                }

                const result = await response.json();

                // Return enhanced response if verbose output was requested
                if (verboseOutput) {
                    return res.json({
                        success: true,
                        transcript: result.text,
                        language: result.language || language,
                        duration: result.duration || 0,
                        words: result.words || [] // Word-level timestamps
                    });
                }

                return res.json({
                    success: true,
                    transcript: result.text,
                    language: language
                });
            }

            // ============= SPEECH ANALYSIS ENDPOINTS =============
            // Experimental feature - NOT for diagnostic purposes

            case 'update-session-consent': {
                const body = req.body || {};
                validateRequired(['sessionId', 'voiceAnalysisConsent'], body);

                const { sessionId, voiceAnalysisConsent } = body;

                // Update session with consent (if sessions table has these columns)
                try {
                    await supabaseRequest(
                        `sessions?session_id=eq.${encodeURIComponent(sessionId)}`,
                        'PATCH',
                        {
                            voice_analysis_consent: voiceAnalysisConsent,
                            consent_timestamp: new Date().toISOString()
                        }
                    );
                } catch (e) {
                    console.log('Consent storage note:', e.message);
                    // Don't fail - columns might not exist yet
                }

                return res.json({ success: true });
            }

            case 'analyze-speech': {
                const body = req.body || {};
                validateRequired(['sessionId', 'testType'], body);

                const {
                    sessionId,
                    testType,
                    language = 'en',
                    recordingDuration = 0,
                    transcript = '',
                    words = [],
                    duration = 0
                } = body;

                const analysisData = {
                    transcript,
                    words,
                    duration,
                    recordingDuration,
                    testType,
                    language
                };

                // Extract basic speech features
                const features = SpeechFeatureExtractor.extractFeatures(analysisData);

                // Extract extended features (v2.0 enhancement)
                const extendedFeatures = SpeechFeatureExtractor.extractExtendedFeatures(analysisData);

                // Generate task-aware interpretation with enhanced analysis
                const interpretation = SpeechFeatureExtractor.generateTaskAwareAnalysis(
                    features,
                    extendedFeatures,
                    testType
                );

                // Calculate task signal (0-100 score)
                const taskSignal = SpeechSignalCalculator.calculateTaskSignal(
                    features,
                    extendedFeatures,
                    testType
                );

                // Save to database with extended features
                try {
                    await supabaseRequest('speech_analysis', 'POST', {
                        session_id: sessionId,
                        test_type: testType,
                        features: features,
                        interpretation: interpretation,
                        language: language,
                        extended_features: extendedFeatures,
                        task_signal: taskSignal.signal,
                        signal_confidence: taskSignal.confidence,
                        version: '2.0',
                        created_at: new Date().toISOString()
                    });
                } catch (e) {
                    console.log('Speech analysis storage note:', e.message);
                    // Table might not exist yet or missing columns - that's okay
                }

                return res.json({
                    success: true,
                    features,
                    extendedFeatures,
                    interpretation,
                    taskSignal
                });
            }

            case 'get-speech-analysis': {
                const sessionId = req.query.sessionId || (req.body && req.body.sessionId);

                if (!sessionId) {
                    return res.status(400).json({ error: 'sessionId required' });
                }

                try {
                    const results = await supabaseRequest(
                        `speech_analysis?session_id=eq.${encodeURIComponent(sessionId)}&order=created_at.asc`,
                        'GET'
                    );

                    // Also try to fetch composite score if it exists
                    let composite = null;
                    try {
                        const compositeResults = await supabaseRequest(
                            `session_speech_composite?session_id=eq.${encodeURIComponent(sessionId)}&order=created_at.desc&limit=1`,
                            'GET'
                        );
                        if (compositeResults && compositeResults.length > 0) {
                            composite = compositeResults[0];
                        }
                    } catch (ce) {
                        // Table might not exist yet
                    }

                    return res.json({
                        success: true,
                        results: results || [],
                        composite
                    });
                } catch (e) {
                    console.log('Speech analysis fetch note:', e.message);
                    return res.json({ success: true, results: [], composite: null });
                }
            }

            case 'calculate-session-composite': {
                const body = req.body || {};
                validateRequired(['sessionId'], body);

                const { sessionId } = body;

                // Fetch all speech analysis results for this session
                let analysisResults = [];
                try {
                    analysisResults = await supabaseRequest(
                        `speech_analysis?session_id=eq.${encodeURIComponent(sessionId)}&order=created_at.asc`,
                        'GET'
                    );
                } catch (e) {
                    return res.json({
                        success: false,
                        error: 'Could not fetch analysis results'
                    });
                }

                if (!analysisResults || analysisResults.length === 0) {
                    return res.json({
                        success: true,
                        composite: null,
                        message: 'No speech analysis data available for this session'
                    });
                }

                // Prepare task analyses for composite calculation
                const taskAnalyses = analysisResults.map(r => ({
                    testType: r.test_type,
                    features: r.features || {},
                    extendedFeatures: r.extended_features || {},
                    taskSignal: r.task_signal,
                    confidence: r.signal_confidence
                }));

                // Calculate session composite
                const composite = SpeechSignalCalculator.calculateSessionComposite(taskAnalyses);

                // Save composite to database
                try {
                    await supabaseRequest('session_speech_composite', 'POST', {
                        session_id: sessionId,
                        composite_signal: composite.compositeSignal,
                        tasks_included: composite.tasksIncluded,
                        task_breakdown: composite.taskBreakdown,
                        reliability: composite.reliability,
                        interpretation: composite.interpretation,
                        created_at: new Date().toISOString()
                    });
                } catch (e) {
                    console.log('Composite storage note:', e.message);
                    // Table might not exist yet
                }

                return res.json({
                    success: true,
                    composite
                });
            }

            case 'compare-sessions': {
                const body = req.body || {};
                validateRequired(['sessionId1', 'sessionId2'], body);

                const { sessionId1, sessionId2 } = body;

                // Fetch composites for both sessions
                let composite1 = null;
                let composite2 = null;

                try {
                    const results1 = await supabaseRequest(
                        `session_speech_composite?session_id=eq.${encodeURIComponent(sessionId1)}&order=created_at.desc&limit=1`,
                        'GET'
                    );
                    if (results1 && results1.length > 0) {
                        composite1 = results1[0];
                    }
                } catch (e) {
                    console.log('Fetch composite 1 note:', e.message);
                }

                try {
                    const results2 = await supabaseRequest(
                        `session_speech_composite?session_id=eq.${encodeURIComponent(sessionId2)}&order=created_at.desc&limit=1`,
                        'GET'
                    );
                    if (results2 && results2.length > 0) {
                        composite2 = results2[0];
                    }
                } catch (e) {
                    console.log('Fetch composite 2 note:', e.message);
                }

                if (!composite1 || !composite2) {
                    return res.json({
                        success: true,
                        comparison: null,
                        message: 'One or both sessions do not have composite scores. Complete more voice-enabled tests first.'
                    });
                }

                // Calculate comparison
                const signalChange = composite2.composite_signal - composite1.composite_signal;
                const percentChange = composite1.composite_signal > 0
                    ? ((signalChange / composite1.composite_signal) * 100).toFixed(1)
                    : 0;

                // Determine trend
                let trend = 'stable';
                if (signalChange > 5) trend = 'improvement';
                else if (signalChange < -5) trend = 'decline';

                // Compare task breakdowns
                const taskComparison = {};
                const breakdown1 = composite1.task_breakdown || {};
                const breakdown2 = composite2.task_breakdown || {};
                const allTasks = new Set([...Object.keys(breakdown1), ...Object.keys(breakdown2)]);

                for (const task of allTasks) {
                    const signal1 = breakdown1[task]?.signal || null;
                    const signal2 = breakdown2[task]?.signal || null;

                    if (signal1 !== null && signal2 !== null) {
                        const change = signal2 - signal1;
                        taskComparison[task] = {
                            session1: signal1,
                            session2: signal2,
                            change,
                            trend: change > 3 ? 'improvement' : (change < -3 ? 'decline' : 'stable')
                        };
                    } else {
                        taskComparison[task] = {
                            session1: signal1,
                            session2: signal2,
                            change: null,
                            trend: 'incomplete'
                        };
                    }
                }

                return res.json({
                    success: true,
                    comparison: {
                        session1: {
                            id: sessionId1,
                            compositeSignal: composite1.composite_signal,
                            tasksIncluded: composite1.tasks_included,
                            createdAt: composite1.created_at
                        },
                        session2: {
                            id: sessionId2,
                            compositeSignal: composite2.composite_signal,
                            tasksIncluded: composite2.tasks_included,
                            createdAt: composite2.created_at
                        },
                        signalChange,
                        percentChange: parseFloat(percentChange),
                        trend,
                        taskComparison,
                        disclaimer: 'Day-to-day variation is normal. This comparison is informational only and does not indicate any health condition.'
                    }
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
