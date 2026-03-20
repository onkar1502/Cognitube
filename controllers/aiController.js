const aiService = require("@lib/aiService");
const Video = require("@models/Video");

/**
 * Controller for AI-related operations
 */
const aiController = {
    /**
     * Handles "Ask the Tutor" requests
     */
    async askTutor(req, res) {
        const { videoId, question } = req.body;

        if (!videoId || !question) {
            return res.status(400).json({ error: "Missing videoId or question" });
        }

        try {
            // Find the video to get context (title and description)
            const video = await Video.findOne({ videoId });
            if (!video) {
                return res.status(404).json({ error: "Video not found" });
            }

            // Call AI service
            const answer = await aiService.askTutor(video.title, video.description, question);

            res.status(200).json({ answer });
        } catch (error) {
            console.error("aiController Error:", error);
            const isRateLimit = error?.status === 429 || error?.message?.includes("429") || error?.message?.includes("quota");
            const errorMessage = isRateLimit ? "AI Tutor is currently busy (Rate Limit). Please try again in a minute." : "Internal Server Error";
            res.status(isRateLimit ? 429 : 500).json({ error: errorMessage });
        }
    },

    /**
     * Handles flashcard generation requests
     */
    async generateFlashcards(req, res) {
        const { videoId } = req.body;

        if (!videoId) {
            return res.status(400).json({ error: "Missing videoId" });
        }

        try {
            const video = await Video.findOne({ videoId });
            if (!video) {
                return res.status(404).json({ error: "Video not found" });
            }

            // Call AI service to generate flashcards
            const flashcards = await aiService.generateFlashcards(video.title, video.description);

            res.status(200).json({ flashcards });
        } catch (error) {
            console.error("aiController Flashcards Error:", error);
            const isRateLimit = error?.status === 429 || error?.message?.includes("429") || error?.message?.includes("quota");
            const errorMessage = isRateLimit ? "AI Service is busy. Please try generating flashcards again shortly." : "Internal Server Error";
            res.status(isRateLimit ? 429 : 500).json({ error: errorMessage });
        }
    }
};

module.exports = aiController;
