package org.uecfi.presenter.ui.main

import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.uecfi.presenter.model.LiveStateEnvelope
import org.uecfi.presenter.model.RemoteCommandPayload
import org.uecfi.presenter.network.PresenterWsClient

class MainScreenViewModelTest {
  @Test
  fun normalizeWsUrl_handlesIpPortAndRemoteUrls() {
    val client = PresenterWsClient()
    assertEquals("ws://192.168.1.50:4850", client.normalizeWsUrl("192.168.1.50"))
    assertEquals("ws://192.168.1.50:4900", client.normalizeWsUrl("192.168.1.50:4900"))
    assertEquals(
      "ws://192.168.1.50:4850",
      client.normalizeWsUrl("http://192.168.1.50:5173/?view=remote&wsPort=4850"),
    )
    assertEquals("ws://192.168.1.50:4850", client.normalizeWsUrl("ws://192.168.1.50:4850"))
    assertNull(client.normalizeWsUrl("   "))
  }

  @Test
  fun liveStateEnvelope_deserializesWithUnknownKeys() {
    val json = Json { ignoreUnknownKeys = true }
    val raw = """
      {
        "type": "LIVE_STATE",
        "payload": {
          "programId": "prog-1",
          "programName": "Sunday Service",
          "activeItemId": "item-1",
          "activeBlockIndex": 1,
          "override": "none",
          "lyricsMode": "slide",
          "bibleLayout": "stacked",
          "activeItem": {
            "id": "item-1",
            "title": "Amazing Grace",
            "type": "song",
            "blocks": [
              { "id": "b1", "label": "Verse 1", "lines": ["Amazing grace"] },
              { "id": "b2", "label": "Chorus", "lines": ["How sweet the sound"] }
            ]
          },
          "updatedAt": 1730000000
        }
      }
    """.trimIndent()

    val envelope = json.decodeFromString<LiveStateEnvelope>(raw)
    assertEquals("LIVE_STATE", envelope.type)
    assertEquals("Sunday Service", envelope.payload?.programName)
    assertEquals(1, envelope.payload?.activeBlockIndex)
    assertEquals("Chorus", envelope.payload?.activeItem?.blocks?.get(1)?.label)
  }

  @Test
  fun remoteCommandPayload_includesTypeFieldWhenEncoded() {
    val json = Json { encodeDefaults = true }
    val encoded = json.encodeToString(RemoteCommandPayload(action = "NEXT"))
    assertTrue(encoded.contains("\"type\":\"REMOTE_CMD\""))
    assertTrue(encoded.contains("\"action\":\"NEXT\""))
  }
}
