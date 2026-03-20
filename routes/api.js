const Channel = require("@models/Channel")
const Video = require("@models/Video")
const { io } = require("../app")
const express = require("express")
const { subscribeChannel, unsubscribeChannel, notificationsChannel } = require("@controllers/channelController")
const passport = require("passport")

const crypto = require('crypto')
const { createUniqueHandle } = require("@lib/utils")
const { getShorts, getPublicVideos, getTagVideos } = require("@controllers/videoController")
const aiController = require("@controllers/aiController")

const { imageKit } = require("@lib/db")

const router = express.Router()

// ImageKit authentication endpoint
router.get("/imagekit-auth", (req, res) => {
    const result = imageKit.getAuthenticationParameters()
    res.send(result)
})

//AI Tutor Routes
router.post('/ai/ask', aiController.askTutor)
router.post('/ai/flashcards', aiController.generateFlashcards)

//check if handle is already registered
router.get('/checkHandle', async (req, res) => {
    if ((!!(await Channel.findOne({ handle: req.query.handle })) && req.query.handle !== req.channel?.handle))
        return res.json({ exists: true, suggestedHandel: await createUniqueHandle(req.query.handle) })
    res.json({ exists: false })
})

//subscribe to channel
router.get('/subscribe/:uid', subscribeChannel)

//unsubscribe a channel
router.get('/unsubscribe/:uid', unsubscribeChannel)

//notification mode 
router.get('/notification/:uid/:mode', notificationsChannel)


//get shorts
router.get('/shorts', getShorts)

//get videos
router.get('/videos', getPublicVideos)
router.get('/hashtag/:tag/videos', getTagVideos)


//login with google
router.get("/google", passport.authenticate("google", { scope: ["profile", "email"] }))

//google login callback
router.get("/auth/google/callback", passport.authenticate("google", { failureRedirect: "/" }), (req, res) => res.redirect("/"))

//logout
router.get('/logout', (req, res) => {
    req.logout((err) => {
        if (err) {
            console.error("Error logging out:", err)
            return res.status(500).send("Error logging out")
        }
        res.redirect('/')
    })
})

module.exports = router
