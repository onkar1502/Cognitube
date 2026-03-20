const express = require('express')
const router = express.Router()
const { updateCommentLikesDislikes, deleteComment } = require('@controllers/commentController')
const { isloggedIn } = require('@lib/middlewares')

router.get('/react/:id', isloggedIn, updateCommentLikesDislikes)
router.delete('/:id', isloggedIn, deleteComment)

module.exports = router
