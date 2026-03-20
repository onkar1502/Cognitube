// Import necessary modules and utilities
const { imageKit } = require("@lib/db")
const { generateID } = require("@lib/utils")
const Channel = require("@models/Channel")
const Subscription = require("@models/Subscription")
const { default: axios } = require('axios')

// Create a new channel
const createChannel = async (req, res) => {
  try {
    const channel = req.channel
    const uid = generateID(channel.id)

    // Check if the handle already exists and is not the same as the current channel's handle
    if (req.query.handle && (await Channel.findOne({ handle: req.query.handle })) && req.query.handle !== req.channel.uid) {
      return res.status(400).json({ message: "Channel handle already exists" })
    }

    // Upload logo to ImageKit if file is attached
    if (req.file) {
      const response = await imageKit.upload({
        file: req.file.buffer,
        fileName: req.file.originalname,
      })

      if (response.url) channel.logoURL = response.url
    }

    // Update channel details
    Object.assign(channel, {
      handle: req.body.handle,
      name: req.body.name,
      uid
    })

    // Save the channel to the database
    await channel.save()

    res.status(200).json({ message: "Channel created successfully", uid })
  } catch (error) {
    console.error("Channel creation error:", error)
    res.status(500).json({ error: "Oops! Something went wrong while creating the channel." })
  }
}

const updateChannel = async (req, res) => {
  try {
    const channel = req.channel

    if (req.files?.logo) {
      const response = await imageKit.upload({
        file: req.files.logo[0].buffer,
        fileName: req.files.logo[0].originalname,
      })

      if (response.url) channel.logoURL = response.url
    }

    if (req.files?.banner) {
      const response = await imageKit.upload({
        file: req.files.banner[0].buffer,
        fileName: req.files.banner[0].originalname,
      })

      if (response.url) channel.bannerImageURL = response.url
    }

    // Update channel details
    Object.assign(channel, {
      handle: req.body.handle,
      name: req.body.name,
      description: req.body.description,
    })

    // Save the channel to the database
    await channel.save()

    res.status(200).json({ message: "Channel updated successfully" })
  } catch (error) {
    console.error("Channel update error:", error)
    res.status(500).json({ error: "Oops! Something went wrong while creating the channel." })
  }
}


// Fetch a channel by its handle
const getChannelByHandle = async (handle) => {
  try {
    return await Channel.findOne({ handle })
  } catch (error) {
    console.error("Error fetching channel by handle:", error)
    throw new Error("Failed to fetch channel by handle")
  }
}

// Fetch a channel by its UID
const getChannelByUid = async (uid) => {
  try {
    return await Channel.findOne({ uid })
  } catch (error) {
    console.error("Error fetching channel by UID:", error)
    throw new Error("Failed to fetch channel by UID")
  }
}

// Fetch a channel by its ID
const getChannelById = async (id) => {
  try {
    return await Channel.findById(id)
  } catch (error) {
    console.error("Error fetching channel by ID:", error)
    throw new Error("Failed to fetch channel by ID")
  }
}

// Fetch a subscription by subscriber and channel
const getSubscription = async ({ subscriber, channel }) => {
  try {
    return await Subscription.findOne({ subscriber, channel })
  } catch (error) {
    console.error("Error fetching Subscription:", error)
    throw new Error("Failed to fetch Subscription")
  }
}

// Fetch channel and subscription information
const getChannelAndSubscription = async (req, res, isHandle = true) => {
  try {
    const Video = require("@models/Video")
    const currentChannel = isHandle ? await getChannelByHandle(req.params[0]) : await getChannelByUid(req.params[0])

    if (!currentChannel) res.redirect("/404")

    const totalVideos = await Video.countDocuments({
      channel: currentChannel._id,
      privacySettings: 'public',
      isDraft: false
    })

    const subscription = await getSubscription({ subscriber: req.channel?.id, channel: currentChannel.id })

    res.render("cognitube", { currentChannel, subscription, page: 'channel', totalVideos })
  } catch (error) {
    console.error("Error fetching ", error)
    throw new Error("Failed to fetch ")
  }
}

// Subscribe to a channel
const subscribeChannel = async (req, res) => {
  if (!req.channel) return res.status(401).json({ error: "Login to subscribe" })

  try {
    const channel = await Channel.findOne({ uid: req.params.uid })

    if (!channel) return res.status(404).json({ error: "Channel not found" })

    // Check if the user is already subscribed
    const existingSub = await getSubscription({ subscriber: req.channel.id, channel: channel.id })
    if (existingSub) {
      return res.status(400).json({ error: "Already subscribed to this channel" })
    }

    const subscription = await Subscription.create({
      subscriber: req.channel.id,
      channel: channel.id,
      mode: "notification"
    })

    await Promise.all([
      Channel.findByIdAndUpdate(req.channel.id, { $addToSet: { subscriptions: subscription._id } }),
      Channel.findByIdAndUpdate(channel.id, { $addToSet: { subscribers: req.channel.id } })
    ])

    res.status(200).json({ message: "Subscription successful! Welcome to the club 🎉" })
  } catch (error) {
    console.error("Subscription error:", error)
    res.status(500).json({ error: "Oops! Something went wrong while subscribing." })
  }
}

// Unsubscribe from a channel
const unsubscribeChannel = async (req, res) => {
  try {
    const channel = await Channel.findOne({ uid: req.params.uid })

    if (!channel) return res.status(404).json({ error: "Channel not found" })

    const subscription = await Subscription.findOne({ subscriber: req.channel.id, channel: channel.id })

    if (!subscription) return res.status(404).json({ error: "Not subscribed to this channel" })

    // Use findOneAndUpdate to pull from arrays, or use the pulled document
    await Promise.all([
      Channel.findByIdAndUpdate(req.channel.id, { $pull: { subscriptions: subscription._id } }),
      Channel.findByIdAndUpdate(channel.id, { $pull: { subscribers: req.channel.id } }),
      Subscription.findByIdAndDelete(subscription._id)
    ])

    res.status(200).json({ message: "Unsubscribed successfully" })
  } catch (error) {
    console.error("Unsubscription error:", error)
    res.status(500).json({ error: "Oops! Something went wrong while unsubscribing." })
  }
}

// Update notification settings for a subscription
const notificationsChannel = async (req, res) => {
  try {
    const channel = await Channel.findOne({ uid: req.params.uid })

    if (!channel) return res.status(404).json({ error: "Channel not found" })

    const subscription = await getSubscription({ subscriber: req.channel._id, channel: channel._id })

    if (!subscription) return res.status(404).json({ error: "Not subscribed to this channel" })

    subscription.mode = req.params.mode === "notification" ? "notification" : "silent"

    await subscription.save()

    res.status(200).json({ message: "Notifications successfully updated" })
  } catch (error) {
    console.error("Notifications error:", error)
    res.status(500).json({ error: "Oops! Something went wrong while setting notifications." })
  }
}

// Get videos from all channels the user subscribes to
const getSubscriptionFeed = async (req, res) => {
  try {
    const myChannel = req.channel
    if (!myChannel) return res.status(403).json({ error: 'Not logged in' })

    // Find the full channel with subscribers list
    const fullChannel = await Channel.findById(myChannel._id).populate('subscribers')

    // The channels we subscribed TO are the ones in our subscribers list? No - we need subscriptions.
    // Actually: "subscribers" = people who subscribe to ME
    // We need the channels that have ME in their subscribers list
    const subscribedTo = await Channel.find({ subscribers: myChannel._id })
      .select('_id name uid handle logoURL')
      .lean()

    if (!subscribedTo.length) {
      return res.json({ items: [], channels: [], totalItems: 0, next: false })
    }

    const Video = require('@models/Video')
    const page = parseInt(req.query.page) || 1
    const limit = parseInt(req.query.limit) || 20
    const channelIds = subscribedTo.map(c => c._id)

    const query = {
      channel: { $in: channelIds },
      privacySettings: 'public',
      isDraft: false,
      isShort: false
    }

    const totalItems = await Video.countDocuments(query)
    const videos = await Video.find(query)
      .select('title videoId description isDraft privacySettings uid uploadDate status ikUrl ikFileId length views')
      .sort({ uploadDate: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean()
      .populate({ path: 'channel', select: 'name uid logoURL handle' })

    res.json({
      items: videos,
      channels: subscribedTo,
      totalItems,
      page,
      next: page * limit < totalItems
    })
  } catch (error) {
    console.error('getSubscriptionFeed error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

module.exports = {
  updateChannel,
  getSubscription,
  createChannel,
  getChannelByHandle,
  getChannelAndSubscription,
  notificationsChannel,
  getChannelByUid,
  getChannelById,
  subscribeChannel,
  unsubscribeChannel,
  getSubscriptionFeed
}
