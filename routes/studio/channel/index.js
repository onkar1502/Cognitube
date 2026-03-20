const express = require("express")
const router = express.Router({ mergeParams: true })

const comments = require('./comments')
const analytics = require('./analytics')
const editing = require('./editing')
const content = require('./content')


const Video = require("@models/Video")

//dashboard 
router.get('/', async (req, res) => {
    const totalVideos = await Video.countDocuments({ channel: req.channel.id })
    res.render('studio', { page: 'dashboard', totalVideos })
})

//Forwarded routes
router.use("/content", content)
router.use("/analytics", analytics)
router.use("/comments", comments)
router.use("/editing", editing)

module.exports = router
