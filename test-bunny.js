require('dotenv').config();
const axios = require('axios');

async function testBunny() {
    try {
        const response = await axios.get(
            `https://video.bunnycdn.com/library/${process.env.BUNNY_LIBRARY_ID}/videos?page=1&limit=1`,
            {
                headers: { accept: "application/json", AccessKey: process.env.BUNNY_API_KEY },
            }
        );
        console.log("BUNNY_TEST_START");
        console.log("Status:", response.status);
        console.log("Data:", JSON.stringify(response.data, null, 2));
        console.log("BUNNY_TEST_END");
    } catch (error) {
        console.error("BUNNY_TEST_ERROR_START");
        if (error.response) {
            console.error("Status:", error.response.status);
            console.error("Data:", JSON.stringify(error.response.data, null, 2));
        } else {
            console.error("Error:", error.message);
        }
        console.error("BUNNY_TEST_ERROR_END");
    }
}

testBunny();
