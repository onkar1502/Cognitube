const { GoogleGenerativeAI } = require("@google/generative-ai");
const axios = require("axios");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Model configuration
const GEMINI_MODELS = ["gemini-2.0-flash", "gemini-1.5-flash"];
const GROQ_MODELS = ["llama-3.3-70b-versatile", "llama3-8b-8192"];

/**
 * AI Service for CogniTube
 */
const aiService = {
    /**
     * Internal helper to handle Gemini generation
     */
    async _tryGemini(videoTitle, videoDescription, studentQuestion, isFlashcard = false) {
        for (const modelName of GEMINI_MODELS) {
            try {
                const model = genAI.getGenerativeModel({
                    model: modelName,
                    ...(isFlashcard && { generationConfig: { responseMimeType: "application/json" } })
                });

                const prompt = isFlashcard
                    ? `Generate exactly 5 study flashcards for: Title: ${videoTitle}, Description: ${videoDescription}. Return ONLY valid JSON array with "question" and "answer" fields.`
                    : `You are an expert AI Tutor for CogniTube. Context: Title: ${videoTitle}, Description: ${videoDescription}. Question: "${studentQuestion}". Be concise.`;

                const result = await model.generateContent(prompt);
                return result.response.text();
            } catch (error) {
                const isRetryable = error?.status === 429 || error?.status === 404 || error?.message?.includes("429") || error?.message?.includes("404");
                if (isRetryable && GEMINI_MODELS.indexOf(modelName) < GEMINI_MODELS.length - 1) continue;
                throw error;
            }
        }
    },

    /**
     * Internal helper to handle Groq generation via REST
     */
    async _tryGroq(videoTitle, videoDescription, studentQuestion, isFlashcard = false) {
        for (const modelName of GROQ_MODELS) {
            try {
                const prompt = isFlashcard
                    ? `Generate exactly 5 study flashcards for the following video content. Title: ${videoTitle}, Description: ${videoDescription}. Return ONLY a valid JSON array where each object has "question" and "answer" string fields. Include the word 'JSON' in your response.`
                    : `You are an expert AI Tutor for CogniTube. Context: Video Title: ${videoTitle}, Video Description: ${videoDescription}. Student Question: "${studentQuestion}". Instructions: Give a concise, helpful answer based on context. Format with bold text and bullet points.`;

                const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
                    messages: [{ role: "user", content: prompt }],
                    model: modelName,
                    ...(isFlashcard && { response_format: { type: "json_object" } })
                }, {
                    headers: {
                        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 10000
                });

                return response.data.choices[0]?.message?.content || "";
            } catch (error) {
                console.warn(`[AI] Groq model ${modelName} failed:`, error.message);
                if (GROQ_MODELS.indexOf(modelName) < GROQ_MODELS.length - 1) continue;
                throw error;
            }
        }
    },

    async askTutor(videoTitle, videoDescription, studentQuestion) {
        try {
            // Try Gemini first
            return await this._tryGemini(videoTitle, videoDescription, studentQuestion);
        } catch (geminiError) {
            console.warn("[AI] Gemini failed or rate limited, switching to Groq...");
            try {
                return await this._tryGroq(videoTitle, videoDescription, studentQuestion);
            } catch (groqError) {
                console.error("[AI] Both Gemini and Groq failed.");
                throw geminiError;
            }
        }
    },

    async generateFlashcards(videoTitle, videoDescription) {
        let result;
        let provider = "Gemini";
        try {
            result = await this._tryGemini(videoTitle, videoDescription, null, true);
        } catch (geminiError) {
            console.warn("[AI] Gemini failed for flashcards, switching to Groq...");
            try {
                result = await this._tryGroq(videoTitle, videoDescription, null, true);
                provider = "Groq";
            } catch (groqError) {
                console.error("[AI] Both providers failed for flashcards.");
                throw geminiError;
            }
        }

        try {
            // Clean markdown fences if present
            const clean = result.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
            const parsed = JSON.parse(clean);

            // Handle different JSON structures (direct array or object with array)
            if (Array.isArray(parsed)) return parsed;
            if (parsed.flashcards && Array.isArray(parsed.flashcards)) return parsed.flashcards;
            if (parsed.cards && Array.isArray(parsed.cards)) return parsed.cards;

            // If it's an object but we can find an array, return the first array found
            const firstArray = Object.values(parsed).find(v => Array.isArray(v));
            if (firstArray) return firstArray;

            throw new Error("Could not find flashcard array in AI response");
        } catch (parseError) {
            console.error(`[AI] Failed to parse ${provider} response:`, parseError.message);
            throw new Error(`Invalid AI response format from ${provider}`);
        }
    },

    /**
     * Generates a structural embedding for search using Gemini text-embedding-004
     */
    async generateEmbedding(textToEmbed) {
        try {
            // "gemini-embedding-001" is the latest recommended embedding model
            const embeddingModel = genAI.getGenerativeModel({ model: "gemini-embedding-001" });
            const result = await embeddingModel.embedContent(textToEmbed);
            return result.embedding.values;
        } catch (error) {
            console.error("[AI] Error generating embedding:");
            console.dir(error, { depth: null });
            return null;
        }
    }
};

module.exports = aiService;
