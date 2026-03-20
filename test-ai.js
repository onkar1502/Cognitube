require('dotenv').config();
require('module-alias/register');
const aiService = require('./lib/aiService');

async function testAI() {
    try {
        console.log("Testing AI Tutor...");
        const answer = await aiService.askTutor(
            "Introduction to Calculus",
            "This video explains the basics of derivatives and integrals.",
            "What is a derivative?"
        );
        console.log("AI Answer:", answer);

        console.log("\nTesting Flashcard Generation...");
        const flashcards = await aiService.generateFlashcards(
            "Introduction to Calculus",
            "This video explains the basics of derivatives and integrals."
        );
        console.log("Flashcards:", JSON.stringify(flashcards, null, 2));

        process.exit(0);
    } catch (error) {
        console.error("Test Failed:", error);
        process.exit(1);
    }
}

testAI();
