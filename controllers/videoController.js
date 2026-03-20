// Import necessary modules and models
const Video = require("@models/Video")
const { generateID, formatNumber, getTimestamp } = require("@lib/utils")
const { conn } = require("@lib/db")
const { default: axios } = require("axios")
const crypto = require("crypto")
const fs = require('fs')
const Channel = require("@models/Channel")
const Tag = require("@models/Tag")
const Comment = require("@models/Comment")
const { channel } = require("diagnostics_channel")
const { getSubscription } = require("./channelController")

// Environment variables for ImageKit
const IMAGEKIT_PUBLIC_KEY = process.env.IMAGEKIT_PUBLIC_KEY
const IMAGEKIT_PRIVATE_KEY = process.env.IMAGEKIT_PRIVATE_KEY
const IMAGEKIT_URL_ENDPOINT = process.env.IMAGEKIT_URL_ENDPOINT

const { imageKit } = require("@lib/db")


const extractHashtags = (text, limit) => (text.match(/#[\w]+/g) || []).map(ht => ht.slice(1)).slice(0, limit || undefined)

// Endpoint to create a new video (called after ImageKit upload is successful)
const createVideo = async (req, res) => {
  const { visibility, videoId, tags, title, description, comments, view, ikFileId, ikUrl } = req.body
  const tagsArray = JSON.parse(tags)

  try {
    let video = await Video.findOne({ videoId })
    const isShortDetected = (title || "").toLowerCase().includes('#shorts') ||
      (description || "").toLowerCase().includes('#shorts') ||
      req.body.isShort === 'true' || req.body.isShort === true ||
      (video && video.isShort)

    const updateData = {
      isDraft: false,
      privacySettings: visibility,
      title,
      description,
      commentsStatus: (comments || "").toLowerCase() === 'on',
      viewsEnabled: (view || "").toLowerCase() === 'on',
      status: 'Finished',
      isShort: !!isShortDetected
    }

    console.log(`Categorizing video ${videoId} as Short: ${updateData.isShort}`);

    if (ikFileId) updateData.ikFileId = ikFileId
    if (ikUrl) updateData.ikUrl = ikUrl

    video = await Video.findOneAndUpdate({ videoId }, {
      $set: updateData
    }, { upsert: true, new: true })

    // Delete video reference from all existing tags
    await Tag.updateMany(
      { videos: video._id },
      { $pull: { videos: video._id } }
    )

    const hashTags = extractHashtags(title + " " + description)

    const updatedTags = await Promise.all(tagsArray.map(async tagName => {
      let tag = await Tag.findOne({ name: tagName })
      if (!tag) tag = new Tag({ name: tagName })
      tag.videos.push(video._id)
      await tag.save()
      return tag
    }))

    const updatedHashTags = await Promise.all(hashTags.map(async hashTagName => {
      let tag = await Tag.findOne({ name: hashTagName })
      if (!tag) tag = new Tag({ name: hashTagName })
      tag.videos.push(video._id)
      await tag.save()
      return tag
    }))

    if (!video.uploadDate && visibility == 'public') video.uploadDate = new Date()

    video.tags = updatedTags.map(tag => tag._id)
    video.hashTags = updatedHashTags.map(hashTag => hashTag._id)
    
    await video.save()

    res.status(200).json({ message: 'Video Updated' })

    // Background: Generate and save embedding for semantic search
    const textToEmbed = `${title} ${description} ${tagsArray.join(" ")}`.trim();
    if (textToEmbed) {
      (async () => {
        try {
          const aiService = require("@lib/aiService")
          const embedding = await aiService.generateEmbedding(textToEmbed)
          if (embedding) {
            await Video.findByIdAndUpdate(video._id, { $set: { embedding } })
            console.log(`Background embedding generated for video: ${videoId}`)
          }
        } catch (embError) {
          console.error("Error generating background embedding:", embError)
        }
      })()
    }

  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Something went wrong!' })
  }
}


// Endpoint to get video details
const getVideo = async (req, res) => {
  try {
    // Fetch video details from the local database
    const video = await Video.findOne({ videoId: req.params.id }).populate("tags")
    if (!video) return res.status(404).send("Video Not Found")

    const tagNames = video.tags.map(tag => tag.name)
    const tags = tagNames.join(",")

    const { description, title, viewsEnabled, commentsStatus, status, privacySettings, uid, ikUrl } = video

    res.send({
      viewsEnabled,
      filename: title, // Use title as fallback filename
      thumbnailFileName: ikUrl ? `${ikUrl}/ik-thumbnail.jpg` : '', // ImageKit thumbnail pattern
      title,
      description,
      status,
      tags,
      uid,
      commentsStatus,
      privacySettings,
      availableResolutions: '360,480,720,1080', // Static or dynamic based on IK
      category: 'none'
    })
  } catch (error) {
    console.error(error.message)
    res.status(500).send("Internal Server Error")
  }
}


// Endpoint to get the video player link
const getPlayerLink = async (req, res) => {
  const video = await Video.findOne({ uid: req.query.v }).populate('channel comments').populate({
    path: 'hashTags',
    select: 'name'
  })


  if (!video) return res.render("error", { message: "Video Not Found" })

  const isOwner = video.channel.id === req.channel?.id

  if ((video.isDraft || video.privacySettings === 'private') && !isOwner) return res.render("error", { message: "This video isn't available anymore" })

  video.timestamp = getTimestamp(video?.uploadDate || video?.createdAt)

  const subscription = await getSubscription({ subscriber: req.channel?.id, channel: video.channel.id })

  return { subscription, video, page: 'player' }
}

// Endpoint to create a video upload (Draft)
const createUpload = async (req, res) => {
  const { filename, isShort } = req.body
  const channel = await Channel.findOne({ _id: req.channel.id })
  if (!channel) return res.status(404).send("Channel not found")

  // Generate a random videoId for the draft (will be replaced by ImageKit fileId later or kept)
  const videoId = crypto.randomBytes(16).toString('hex')

  // Generate a unique UID for the video
  let uid
  let tempVideo
  do {
    uid = generateID(videoId, 11, ' ')
    tempVideo = await Video.findOne({ uid })
  } while (tempVideo)

  const newVideo = new Video({
    filename,
    videoId,
    uid,
    channel: channel.id,
    title: filename,
    uploadDate: new Date(),
    isShort: isShort === true || isShort === 'true' || (filename || "").toLowerCase().includes('#shorts')
  })
  await newVideo.save()

  channel.videos.push(newVideo._id)
  await channel.save()

  res.json({ videoId }) // Returns local videoId to associate with ImageKit upload on client
}

// Endpoint to get all videos
const getStudioVideos = async (req, res) => {
  try {
    const videos = await getVideos({
      channel: req.channel._id,
      page: req.query?.page || 1,
      limit: req.query?.limit || 10,
      isShort: false
    })
    res.status(200).json(videos)
  } catch (error) {
    console.error(error)
    res.status(500).send("Internal Server Error")
  }
}

// Endpoint to get all shorts
const getStudioShorts = async (req, res) => {
  try {
    const shorts = await getVideos({
      channel: req.channel._id,
      page: req.query?.page || 1,
      limit: req.query?.limit || 10,
      isShort: true
    })
    res.status(200).json(shorts)
  } catch (error) {
    console.error(error)
    res.status(500).send("Internal Server Error")
  }
}

// Endpoint to get all tag short
const getTagShorts = async (req, res) => {
  try {
    const shorts = await getVideos({
      page: req.query?.page || 1,
      tag: req.params.tag,
      privacySettings: 'public',
      limit: req.query?.limit || 10,
      isShort: true
    })
    res.status(200).json(shorts)
  } catch (error) {
    console.error(error)
    res.status(500).send("Internal Server Error")
  }
}

// Endpoint to get all tag video
const getTagVideos = async (req, res) => {
  try {
    const videos = await getVideos({
      tag: req.params.tag,
      privacySettings: 'public',
      page: req.query?.page || 1,
      limit: req.query?.limit || 10,
    })
    res.status(200).json(videos)
  } catch (error) {
    console.error(error)
    res.status(500).send("Internal Server Error")
  }
}


// Endpoint to delete a video
const deleteVideo = async (req, res) => {
  try {
    const video = await Video.findOne({
      videoId: req.params.videoId,
      channel: req.channel.id,
    })

    if (!video) return res.status(404).send("Video not found")

    // Delete from ImageKit if ikFileId exists
    if (video.ikFileId) {
      try {
        await imageKit.deleteFile(video.ikFileId)
      } catch (ikError) {
        console.error("ImageKit deletion error:", ikError)
      }
    }

    // Remove video reference from Channel
    await Channel.findByIdAndUpdate(req.channel.id, {
      $pull: { videos: video._id }
    })

    await video.remove()
    res.status(200).send("Video deleted successfully")
  } catch (error) {
    console.error("Delete video error:", error)
    res.status(500).send("Internal Server Error")
  }
}

// Endpoint to check if the user can edit the video
const canEdit = async (req, res) => {
  const video = await Video.findOne({ videoId: req.params.id })
  if (!video) return res.status(404).send("Video not found")
  if (video.channel.toString() == req.channel.id.toString())
    return res.status(200).send("You can edit this video")
  else
    return res.status(403).send("You are not authorized to edit this video")
}

// Function to update video likes & dislikes
const updateVideoLikesDislikes = async (req, res) => {
  try {
    const video = await Video.findById(req.params.videoId)
    if (!video) return res.status(404).json({ error: 'Video not found' })

    const isLiked = video.likes.map(id => id.toString()).includes(req.channel.id)
    const isDisliked = video.dislikes.map(id => id.toString()).includes(req.channel.id)

    const update = {
      $pull: { [req.query.action === 'like' ? 'dislikes' : 'likes']: req.channel.id },
      ...(req.query.action === 'like'
        ? { [isLiked ? '$pull' : '$addToSet']: { likes: req.channel.id } }
        : { [isDisliked ? '$pull' : '$addToSet']: { dislikes: req.channel.id } })
    }

    const updatedVideo = await Video.findByIdAndUpdate(req.params.videoId, update, { new: true })
    res.status(200).json({ likes: formatNumber(updatedVideo.likes.length) })
  } catch (error) {
    res.status(500).json({ error: `Error updating video: ${error.message}` })
  }
}


//Get All public video

const getPublicVideos = async (req, res) => {
  try {
    const videos = await getVideos({
      privacySettings: 'public',
      page: req.query?.page || 1,
      limit: req.query?.limit || 10,
      channel: req.query?.channel,
      tag: req.query?.tag,
      searchText: req.query?.search,
      isShort: false
    })
    res.status(200).json(videos)
  } catch (error) {
    console.error(error)
    res.status(500).send("Internal Server Error")
  }
}

const getShorts = async (req, res) => {
  try {
    const { uid, notUid, page, limit, channel, tag } = req.query
    const videos = await getVideos({
      privacySettings: 'public',
      page: page || 1,
      limit: parseInt(limit) || 1,
      uid: uid === 'latest' ? undefined : uid,
      notUid: notUid === 'latest' ? undefined : notUid,
      channel,
      tag,
      isShort: true,
      sortOrder: 'desc'
    })
    res.status(200).json(videos)
  } catch (error) {
    console.error(error)
    res.status(500).send("Internal Server Error")
  }
}


// Function to get videos
const getVideos = async (criteria) => {
  var {
    channel,
    lengthGreaterThan,
    lengthLessThan,
    privacySettings,
    category,
    title,
    description,
    sortOrder = 'desc',
    isShort,
    page = 1,
    limit = 10,
    tag,
    searchText,
    uid,
    notUid
  } = criteria

  limit = parseInt(limit)

  const query = {}

  if (channel) query.channel = channel

  if (lengthGreaterThan !== undefined) query.length = { ...query.length, $gt: lengthGreaterThan }

  if (lengthLessThan !== undefined) query.length = { ...query.length, $lt: lengthLessThan }

  if (privacySettings) query.privacySettings = privacySettings

  if (title) query.title = { $regex: title, $options: 'i' }  // case-insensitive regex search
  if (description) query.description = { $regex: description, $options: 'i' }  // case-insensitive regex search

  if (searchText) {
    query.$or = [
      { title: { $regex: searchText.trim(), $options: 'i' } },
      { description: { $regex: searchText.trim(), $options: 'i' } }
    ];
  }


  if (category) query.category = category.toLowerCase()


  if (isShort !== undefined) query.isShort = isShort  // Add check for isShort

  if (uid) { query.uid = uid }

  if (notUid) { query.uid = { $ne: notUid } }

  if (tag) {
    const tagData = await Tag.findOne({ name: tag })
    query.$or = [
      { tags: { $in: [tagData?._id || null] } },
      { hashTags: { $in: [tagData?._id || null] } }
    ]
  }

  const sortOptions = {}
  if (sortOrder) sortOptions.uploadDate = sortOrder === 'asc' ? 1 : -1

  try {
    let videos = []
    let totalItems = 0

    // If searchText is provided, perform semantic vector search
    if (searchText) {
      const aiService = require("@lib/aiService")
      const queryEmbedding = await aiService.generateEmbedding(searchText.trim())

      if (queryEmbedding && queryEmbedding.length > 0) {
        // Construct the Atlas Vector Search pipeline
        const pipeline = [
          {
            $vectorSearch: {
              index: "vector_index", // The name of the Atlas Search Index we will create
              path: "embedding",
              queryVector: queryEmbedding,
              numCandidates: 100, // Number of documents to scan
              limit: limit // Number of top semantic matches to return
            }
          },
          { $addFields: { score: { $meta: "vectorSearchScore" } } },
          { $match: { score: { $gt: 0.81 }, privacySettings: 'public' } }
        ];
        
        // Add additional match conditions if they exist (e.g., isShort, etc.)
        const matchStage = { ...query }
        delete matchStage.$or // Remove the old text regex search
        delete matchStage.privacySettings // Already handled in the dedicated match stage
        
        if (Object.keys(matchStage).length > 0) {
            pipeline.push({ $match: matchStage })
        }
        
        pipeline.push({ $skip: (page - 1) * limit })

        videos = await Video.aggregate(pipeline)
        
        // We use the length as an approximation for vector search since count doesn't work the same way
        totalItems = videos.length
      } else {
        // Fallback to standard regex search if embedding generation failed
        query.$or = [
          { title: { $regex: searchText.trim(), $options: 'i' } },
          { description: { $regex: searchText.trim(), $options: 'i' } }
        ];
        totalItems = await Video.countDocuments(query).exec()
        videos = await Video.find(query).sort(sortOptions).skip((page - 1) * limit).limit(limit).lean()
      }
      
      // Manually populate since aggregate doesn't do it automatically like .find()
      videos = await Video.populate(videos, [
        { path: 'channel', select: 'name uid logoURL subscribers' },
        { path: 'hashTags' }
      ])
    } else {
      // Standard search logic (no search text provided)
      totalItems = await Video.countDocuments(query).exec()
      videos = await Video.find(query)
        .select('title videoId description isDraft isShort privacySettings likes dislikes uid uploadDate comments status ikUrl ikFileId length category aspect hashTags views')
        .sort(sortOptions)
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .populate({
          path: 'channel',
          select: 'name uid logoURL subscribers'
        })
        .populate('hashTags')
        .exec()
    }

    // Determine if there are next and previous pages
    const next = page * limit < totalItems ? page + 1 : null
    const previous = page > 1 ? page - 1 : null
    const videosWithDetails = await Promise.all(videos.map(async video => {
      const { _id, videoId, channel, description, isDraft, uploadDate, privacySettings, title, comments, uid, likes, dislikes, ikUrl, length, category, aspect, hashTags, views } = video

      return {
        id: _id,
        restrictions: (category && (category.toLowerCase() === 'adult' || category.toLowerCase() === 'hentai')) ? '18+' : 'none',
        thumbnailFileName: ikUrl ? `${ikUrl}/ik-thumbnail.jpg` : '',
        uid,
        videoId,
        channel,
        likes: likes || [],
        dislikes: dislikes || [],
        aspect: aspect || 56.25,
        hashTags: hashTags || [],
        timestamp: getTimestamp(uploadDate),
        views: views || 0,
        length: length || 0,
        description: description || '',
        isDraft: isDraft || false,
        uploadDate,
        privacySettings: privacySettings || 'private',
        title: title || 'Untitled',
        comments: comments || [],
        ikUrl,
        likeDislike: (likes?.length + dislikes?.length === 0 || !likes || !dislikes) ? 0 : (likes.length / (likes.length + dislikes.length)) * 100
      }
    }))

    return {
      totalItems,
      currentPage: page,
      next,
      previous,
      items: videosWithDetails
    }
  } catch (error) {
    console.error("Error fetching videos:", error)
    throw error
  }
}

const updateIkInfo = async (req, res) => {
  const { videoId, ikFileId, ikUrl, isShort } = req.body
  try {
    const updateData = {
      ikFileId,
      ikUrl,
      status: 'Finished'
    }
    if (isShort !== undefined) updateData.isShort = isShort === true || isShort === 'true'

    const video = await Video.findOneAndUpdate({ videoId }, {
      $set: updateData
    }, { new: true })
    if (!video) return res.status(404).json({ error: 'Video not found' })
    res.status(200).json({ message: 'IK Info Updated', video })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Failed to update IK info' })
  }
}

const getStudioAnalytics = async (req, res) => {
  try {
    const channelId = req.channel.id

    // Get all videos for the channel
    const videos = await Video.find({ channel: channelId })

    // Get 5 most recent videos
    const recentVideos = await Video.find({ channel: channelId })
      .sort({ uploadDate: -1 })
      .limit(5)
      .select('title views uid videoId uploadDate')
      .lean()

    res.json({
      totalVideos: videos.length,
      topVideos: recentVideos
    })
  } catch (error) {
    console.error('Error fetching studio analytics:', error)
    res.status(500).json({ error: 'Server error' })
  }
}

module.exports = { getShorts, getTagVideos, getPublicVideos, getTagShorts, updateVideoLikesDislikes, createVideo, canEdit, createUpload, getPlayerLink, getVideo, getVideos, deleteVideo, getStudioVideos, getStudioShorts, updateIkInfo, getStudioAnalytics }
