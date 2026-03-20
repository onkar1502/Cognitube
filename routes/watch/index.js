const { getVideos, updateVideoLikesDislikes } = require('@controllers/videoController')
const { getSubscription } = require('@controllers/channelController')
const { isloggedIn } = require('@lib/middlewares')
const express = require('express')
const router = express.Router()

//Watch Video Page
router.get('/', async (req, res) => {
    const uid = req.query.v;
    if (!uid) return res.redirect('/');

    try {
        const videoData = await getVideos({ uid });
        const video = videoData.items[0];

        if (!video) return res.status(404).render('404');

        let subscription = null;
        if (req.channel) {
            subscription = await getSubscription({
                subscriber: req.channel.id,
                channel: video.channel._id
            });
        }

        res.render('cognitube', { page: 'player', video, subscription });
    } catch (error) {
        console.error('Error fetching video for player:', error);
        res.status(500).send('Internal Server Error');
    }
})

router.get('/react/:videoId', isloggedIn, updateVideoLikesDislikes)


module.exports = router