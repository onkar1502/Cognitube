const express = require('express')
const router = express.Router()
const api = require('./api')
const channel = require('./channel')
const studio = require('./studio')
const watch = require('./watch')
const { getPlayerLink, getTagVideos, getPublicVideos, getShorts } = require('@controllers/videoController')
const { getChannelAndSubscription, getSubscriptionFeed } = require('@controllers/channelController')

const { default: axios } = require('axios')

const { checkChannel, isloggedIn } = require('@lib/middlewares')
const Tag = require('@models/Tag')


//Home page
router.get('/', async (req, res) => {
    res.render('cognitube', {
        page: 'home',
    })
})
router.get('/search', async (req, res) => {
    res.render('cognitube', {
        page: 'search',
        search: req.query.search
    })
})

//route for getting channel by handle for e.g. /@some_channel_handle
router.get(/^\/@(\w+)$/, getChannelAndSubscription)
router.get(/^\/@(\w+)\/videos$/, getChannelAndSubscription)
router.get(/^\/@(\w+)\/shorts$/, getChannelAndSubscription)

//upload  redirect
router.get('/upload', checkChannel, isloggedIn, (req, res) => {
    res.redirect(`/studio/channel/${req.channel.uid}/content?d=ud`)
})

//hashtag
router.get("/hashtag/:name", async (req, res) => {
    const hashTag = await Tag.findOne({ name: req.params.name })
    res.render("cognitube", { page: 'hashTag', hashTag })
})

//shorts page 
router.get('/shorts/:uid', async (req, res) => res.render('cognitube', {
    page: 'shorts',
    uid: req.params.uid
}))

// Subscriptions page
router.get('/subscriptions', (req, res) => res.render('cognitube', { page: 'subscriptions' }))
// Subscriptions feed API
router.get('/api/subscriptions', getSubscriptionFeed)


// Simple page routes for sidebar links
const simplePage = (page) => (req, res) => res.render('cognitube', { page })
router.get('/history', simplePage('history'))
router.get('/playlist', simplePage('playlist'))
router.get('/your-videos', simplePage('your-videos'))
router.get('/watch-later', simplePage('watch-later'))
router.get('/liked-videos', simplePage('liked-videos'))
router.get('/trending', simplePage('trending'))
router.get('/settings', simplePage('settings'))
router.get('/report-history', simplePage('report-history'))

//404
router.get('/404', async (req, res) => res.render("404"))

const comment = require('./comment')

//Forwarded routes
router.use('/api', api)
router.use('/watch', watch)
router.use('/channel', channel)
router.use('/studio', isloggedIn, checkChannel, studio)
router.use('/comment', comment)

module.exports = router