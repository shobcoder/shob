// Desktop builds are production-only; there is no dev/beta channel anymore.
const appId = "ai.shob.desktop"
const productName = "Shob"
const summary = "Open source AI coding agent"

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<component type="desktop-application">
  <id>${appId}</id>

  <metadata_license>CC0-1.0</metadata_license>
  <project_license>MIT</project_license>

  <name>${productName}</name>
  <summary>${summary}</summary>

  <developer id="ly.anoma">
    <name>Anomaly Innovations Inc.</name>
  </developer>

  <description>
    <p>
      Shob is a standalone AI coding agent that helps you write and run code with any AI model.
    </p>
  </description>

  <launchable type="desktop-id">${appId}.desktop</launchable>

  <content_rating type="oars-1.1" />

  <url type="bugtracker">https://github.com/anomalyco/shob/issues</url>
  <url type="homepage">https://shob.ai</url>
  <url type="vcs-browser">https://github.com/anomalyco/shob</url>

  <screenshots>
    <screenshot type="default">
      <image>https://raw.githubusercontent.com/anomalyco/shob/dev/packages/web/src/assets/lander/screenshot.png</image>
    </screenshot>
  </screenshots>
</component>
`

await Bun.write(`resources/${appId}.metainfo.xml`, xml)
console.log(`Generated metainfo for ${productName} at resources/${appId}.metainfo.xml`)
