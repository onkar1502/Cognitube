require('dotenv').config();
const mongoose = require('mongoose');

const ChannelSchema = new mongoose.Schema({
    name: { type: String, required: true },
    uid: { type: String },
    email: { type: String },
    handle: { type: String },
    collectionId: { type: String },
});
const Channel = mongoose.model("Channel_Test", ChannelSchema, "channels");

const url = process.env.MONGODB_URI;

async function check() {
    try {
        await mongoose.connect(url, { useNewUrlParser: true, useUnifiedTopology: true });
        const user = await Channel.findOne({ email: 'onkarsonawane2003@gmail.com' });
        if (user) {
            console.log("USER_DATA_START");
            console.log(JSON.stringify(user, null, 2));
            console.log("USER_DATA_END");
        } else {
            console.log("User not found");
        }
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

check();
