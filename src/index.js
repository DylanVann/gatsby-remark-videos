const select = require(`unist-util-select`)
const path = require(`path`)
const isRelativeUrl = require(`is-relative-url`)
const _ = require(`lodash`)
const slash = require(`slash`)
const { transcode } = require(`@dylanvann/gatsby-plugin-ffmpeg`)
const allowedFiletypes = ['avi', 'mp4', 'mov', 'mkv']

module.exports = async (
  { files, markdownNode, markdownAST, getNode, reporter },
  pluginOptions
) => {
  const defaults = {
    pipelines: [
      {
        name: 'vp9',
        transcode: (chain) =>
          chain
            .videoCodec('libvpx-vp9')
            .noAudio()
            .outputOptions(['-crf 20', '-b:v 0']),
        maxHeight: 480,
        maxWidth: 900,
        fileExtension: 'webm',
      },
      {
        name: 'h264',
        transcode: (chain) => chain.videoCodec('libx264').noAudio(),
        maxHeight: 480,
        maxWidth: 900,
        fileExtension: 'mp4',
      },
    ],
  }

  const options = _.defaults(pluginOptions, defaults)

  // This will only work for markdown syntax image tags
  const markdownVideoNodes = select(markdownAST, `image`)

  // Takes a node and generates the needed videos and then returns
  // the needed HTML replacement for the video
  const generateVideosAndUpdateNode = async function (node) {
    // Check if this markdownNode has a File parent. This plugin
    // won't work if the video isn't hosted locally.
    const parentNode = getNode(markdownNode.parent)
    let videoPath
    if (parentNode && parentNode.dir) {
      videoPath = slash(path.join(parentNode.dir, node.url))
    } else {
      return null
    }

    const videoNode = _.find(files, (file) => {
      if (file && file.absolutePath) {
        return file.absolutePath === videoPath
      }
      return null
    })

    if (!videoNode || !videoNode.absolutePath) {
      return undefined
    }

    let transcodeResult = await transcode({
      file: videoNode,
      options,
      reporter,
    })

    // Calculate the paddingBottom %

    const sourceTags = transcodeResult.videos.map((video) => {
      return `<source src="${video.src}" type="video/${video.fileExtension}">`
    })
    let wrapperAspectStyle
    let videoAspectStyle

    const { width, height } = transcodeResult
    wrapperAspectStyle = `max-width: ${width}px; max-height: ${height}px; margin-left: auto; margin-right: auto;`
    videoAspectStyle = `height: 100%; width: 100%; margin: 0 auto; display: block; max-height: ${height}px;`

    const videoTag = `<video autoplay loop muted preload playsinline style="${videoAspectStyle}">${sourceTags.join(
      ''
    )}</video>`

    let rawHTML = `<div class="gatsby-video-aspect-ratio" style="${wrapperAspectStyle}">${videoTag}</div>`

    return rawHTML.trim().replace(/\n/gm, '')
  }

  // Simple because there is no nesting in markdown.
  const promises = markdownVideoNodes.map(async (node) => {
    const fileType = node.url.split('.').pop()

    if (isRelativeUrl(node.url) && allowedFiletypes.includes(fileType)) {
      const rawHTML = await generateVideosAndUpdateNode(node)

      if (rawHTML) {
        // Replace the video node with an inline HTML node.
        node.type = `html`
        node.value = rawHTML
      }
      return node
    } else {
      // Video isn't relative so there's nothing for us to do.
      return undefined
    }
  })

  await Promise.all(promises)
}
