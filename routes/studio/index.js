const express = require("express")
const router = express.Router()
const channel = require('./channel')
const { getStudioVideos, getStudioShorts, getStudioAnalytics } = require("@controllers/videoController")
const { getAllStudioComments } = require("@controllers/commentController")

//Stdio page redirect
router.get('/', async (req, res) => res.redirect('/studio/channel/' + req.channel.uid))


//api
router.get('/videos', getStudioVideos)
router.get('/shorts', getStudioShorts)
router.get('/analytics', getStudioAnalytics)
router.get('/comments-api', getAllStudioComments)

//Forwarded routes
router.use("/channel/:uid", channel)
router.use("/channel", channel)

module.exports = router
