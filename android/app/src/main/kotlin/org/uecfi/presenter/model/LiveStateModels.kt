package org.uecfi.presenter.model

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

/**
 * Envelope sent over LAN WebSocket by the desktop LocalRemoteServer.
 */
@Serializable
data class LiveStateEnvelope(
  val type: String = "",
  val payload: LiveState? = null,
)

@Serializable
data class ProgramItemSummary(
  val id: String = "",
  val title: String = "",
  val subtitle: String? = null,
  val type: String = "slide",
  val lyricsMode: String? = null,
  val blockCount: Int = 0,
)

/**
 * Mirrors desktop `LiveState` from `shared/types.ts`.
 */
@Serializable
data class LiveState(
  val protocolVersion: Int = 2,
  val programId: String = "",
  val programName: String = "",
  val activeItemId: String? = null,
  val activeBlockIndex: Int = 0,
  val override: String = "none", // "none" | "clearText" | "blackout" | "showLogo"
  val lyricsMode: String = "slide", // "slide" | "timed"
  val audioCurrentTimeSec: Double? = null,
  val audioPlaying: Boolean = false,
  val audioVolume: Float = 1f,
  val bibleLayout: String = "primary", // "primary" | "secondary" | "stacked"
  val verseMaxFontSize: Int? = null,
  val activeItem: ProgramItem? = null,
  val programItems: List<ProgramItemSummary> = emptyList(),
  val nextItemTitle: String? = null,
  val logoSlide: ProgramItem? = null,
  val returnAudioActive: Boolean = false,
  val returnAudioMuted: Boolean = false,
  val updatedAt: Long = 0L,
)

@Serializable
data class ProgramItem(
  val id: String = "",
  val title: String = "",
  val subtitle: String? = null,
  val type: String = "slide", // "song" | "verse" | "slide" | "programItem"
  val lyricsMode: String? = null,
  val bibleLayout: String? = null,
  val verseMaxFontSize: Int? = null,
  val themeBackground: String? = null,
  val verseStackedThemeBackground: String? = null,
  val verseBgDim: Int? = null,
  val verseStackedBgDim: Int? = null,
  val blocks: List<SlideBlock> = emptyList(),
)

@Serializable
data class SlideBlock(
  val id: String = "",
  val label: String? = null,
  val groupHeader: String? = null,
  val lines: List<String> = emptyList(),
  val secondaryLabel: String? = null,
  val secondaryLines: List<String>? = null,
  val startTimeSec: Double? = null,
  val lineTimingsSec: List<Double?>? = null,
  val notes: String? = null,
)

/**
 * Outgoing remote operator command sent to desktop `LocalRemoteServer`.
 */
@Serializable
data class RemoteCommandPayload(
  val type: String = "REMOTE_CMD",
  val action: String,
  val blockIndex: Int? = null,
  val itemId: String? = null,
  val volume: Float? = null,
  val bookIndex: Int? = null,
  val chapterNum: Int? = null,
  val verseNum: Int? = null,
  val pin: String? = null,
)

@Serializable
data class BibleVerseModel(
  val number: Int = 1,
  val text: String = "",
)

@Serializable
data class BibleChapterModel(
  val number: Int = 1,
  val verses: List<BibleVerseModel> = emptyList(),
)

@Serializable
data class BibleBookModel(
  val name: String = "",
  val chapters: List<BibleChapterModel> = emptyList(),
)

@Serializable
data class BibleVersionModel(
  val id: String = "",
  val title: String = "",
  val books: List<BibleBookModel> = emptyList(),
)

@Serializable
data class BibleSyncBundle(
  val version: Int = 0,
  val primaryBible: BibleVersionModel? = null,
  val secondaryBible: BibleVersionModel? = null,
  val verseStyle: JsonObject? = null,
)

@Serializable
data class OperatorChatMessage(
  val id: String = "",
  val sender: String = "android", // "desktop" | "android"
  val senderName: String = "",
  val text: String = "",
  val timestamp: Long = 0L,
)
