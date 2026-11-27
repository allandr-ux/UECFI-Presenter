package org.uecfi.presenter.ui.main

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.waitForUpOrCancellation
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.VerticalDivider
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.input.pointer.pointerInput
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import org.uecfi.presenter.data.BibleBookSearch
import org.uecfi.presenter.model.BibleSyncBundle
import org.uecfi.presenter.model.LiveState

private val BgDark = Color(0xFF070A10)
private val SurfaceElevated = Color(0xFF171E2E)
private val TextPrimary = Color(0xFFF8FAFC)
private val TextMuted = Color(0xFF94A3B8)
private val AccentSky = Color(0xFF3B82F6)
private val KeyBg = Color(0xFF1C2538)
private val KeyNumBg = Color(0xFF141C2C)
private val KeyActionBg = Color(0xFF172033)
private val PanelBg = Color(0xFF0F1420)
private val ColBg = Color(0xFF0B101B)
private val ColHeaderBg = Color(0xFF101726)
private val BorderSubtle = Color(0x2894A3B8)

/**
 * Tablet-optimized Bible Verse Selector with an always-ready Netflix-style on-screen
 * keyboard (no Android soft keyboard popup) that filters book names using Desktop
 * `smartSearchBooks` parity, paired with a 3-column Books | Chapter | Verse browser.
 */
@Composable
fun VerseSelectorModal(
  bibleBundle: BibleSyncBundle?,
  liveState: LiveState? = null,
  onPresentVerse: (bookIndex: Int, chapterNum: Int, verseNum: Int) -> Unit,
  onDismiss: () -> Unit,
) {
  val primaryBible = bibleBundle?.primaryBible
  val secondaryBible = bibleBundle?.secondaryBible
  val books = primaryBible?.books.orEmpty()

  val liveVerseRef = remember(liveState?.activeItem?.id, liveState?.activeItem?.type, liveState?.activeBlockIndex, books) {
    val item = liveState?.activeItem
    if (item == null || item.type != "verse" || books.isEmpty()) return@remember null
    val rawLabel = item.blocks.getOrNull(liveState.activeBlockIndex)?.label ?: return@remember null
    val clean = rawLabel.replace(Regex("""\s*\([^)]*\)\s*$"""), "").trim()
    val match = Regex("""^(.+?)\s+(\d+):(\d+)$""").find(clean) ?: return@remember null
    val bName = match.groupValues[1].trim()
    val cNum = match.groupValues[2].toIntOrNull() ?: return@remember null
    val vNum = match.groupValues[3].toIntOrNull() ?: return@remember null
    val bIdx = books.indexOfFirst { it.name.equals(bName, ignoreCase = true) }
    if (bIdx < 0) null else Triple(bIdx, cNum, vNum)
  }

  var query by remember { mutableStateOf("") }
  var selectedBookIdx by remember { mutableIntStateOf(liveVerseRef?.first ?: 0) }
  var selectedChapterNum by remember { mutableIntStateOf(liveVerseRef?.second ?: 1) }

  // Sync highlighted Book/Chapter when Desktop's live verse changes (while user isn't typing a book filter)
  LaunchedEffect(liveVerseRef) {
    if (liveVerseRef != null && query.isBlank()) {
      selectedBookIdx = liveVerseRef.first
      selectedChapterNum = liveVerseRef.second
    }
  }

  val rankedBooks = remember(books, query, secondaryBible) {
    BibleBookSearch.smartSearchBooks(books, query, secondaryBible)
  }

  // Keep selectedBookIdx valid and auto-select top ranked book while typing
  LaunchedEffect(query, rankedBooks) {
    if (query.isNotBlank() && rankedBooks.isNotEmpty()) {
      val top = rankedBooks.first()
      if (top.idx != selectedBookIdx) {
        selectedBookIdx = top.idx
        selectedChapterNum = top.book.chapters.firstOrNull()?.number ?: 1
      }
    } else if (selectedBookIdx !in books.indices && books.isNotEmpty()) {
      selectedBookIdx = 0
      selectedChapterNum = books[0].chapters.firstOrNull()?.number ?: 1
    }
  }

  val activeBook = books.getOrNull(selectedBookIdx)
  val chapters = activeBook?.chapters.orEmpty()
  val activeChapter = chapters.firstOrNull { it.number == selectedChapterNum } ?: chapters.firstOrNull()

  val secBook = remember(secondaryBible, activeBook, selectedBookIdx) {
    if (secondaryBible == null || activeBook == null) null
    else {
      secondaryBible.books.firstOrNull { it.name.equals(activeBook.name, ignoreCase = true) }
        ?: secondaryBible.books.getOrNull(selectedBookIdx)
    }
  }
  val secChapter = remember(secBook, activeChapter) {
    val chNum = activeChapter?.number ?: return@remember null
    secBook?.chapters?.firstOrNull { it.number == chNum }
  }

  val booksListState = rememberLazyListState()
  val chaptersListState = rememberLazyListState()
  val versesListState = rememberLazyListState()

  LaunchedEffect(selectedBookIdx, rankedBooks.size) {
    val pos = rankedBooks.indexOfFirst { it.idx == selectedBookIdx }
    if (pos >= 0) {
      booksListState.animateScrollToItem(pos)
    }
  }

  LaunchedEffect(selectedBookIdx) {
    chaptersListState.scrollToItem(0)
  }

  LaunchedEffect(selectedBookIdx, activeChapter?.number) {
    val targetVerseNum = if (
      liveVerseRef != null &&
      liveVerseRef.first == selectedBookIdx &&
      liveVerseRef.second == activeChapter?.number
    ) {
      liveVerseRef.third
    } else {
      null
    }
    val verseIdx = if (targetVerseNum != null) {
      activeChapter?.verses?.indexOfFirst { it.number == targetVerseNum } ?: -1
    } else {
      -1
    }
    if (verseIdx >= 0) {
      versesListState.animateScrollToItem(verseIdx)
    } else {
      versesListState.scrollToItem(0)
    }
  }

  Dialog(
    onDismissRequest = onDismiss,
    properties = DialogProperties(
      usePlatformDefaultWidth = false,
      dismissOnBackPress = true,
      dismissOnClickOutside = true,
    ),
  ) {
    Surface(
      modifier = Modifier
        .fillMaxSize()
        .padding(16.dp),
      shape = RoundedCornerShape(20.dp),
      color = BgDark,
      border = BorderStroke(1.dp, BorderSubtle),
    ) {
      if (books.isEmpty()) {
        Box(
          modifier = Modifier.fillMaxSize(),
          contentAlignment = Alignment.Center,
        ) {
          Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(12.dp),
          ) {
            Text(
              text = "No Bibles synced from Desktop yet.",
              style = MaterialTheme.typography.titleMedium,
              color = TextPrimary,
              fontWeight = FontWeight.SemiBold,
            )
            Text(
              text = "Import or select a Primary Bible on Desktop to browse verses here.",
              style = MaterialTheme.typography.bodyMedium,
              color = TextMuted,
            )
            Surface(
              onClick = onDismiss,
              shape = RoundedCornerShape(10.dp),
              color = SurfaceElevated,
              border = BorderStroke(1.dp, BorderSubtle),
            ) {
              Text(
                text = "Close",
                modifier = Modifier.padding(horizontal = 18.dp, vertical = 10.dp),
                color = TextPrimary,
                fontWeight = FontWeight.SemiBold,
              )
            }
          }
        }
        return@Surface
      }

      Row(modifier = Modifier.fillMaxSize()) {
        // Left Pane: 3-Column Books | Chapter | Verse Browser
        Column(
          modifier = Modifier
            .weight(1f)
            .fillMaxHeight()
            .padding(14.dp),
          verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
          // Toolbar
          Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.Start,
            verticalAlignment = Alignment.CenterVertically,
          ) {
            Text(
              text = if (activeBook != null && activeChapter != null) {
                "${activeBook.name} ${activeChapter.number}"
              } else {
                "Select Verse"
              },
              style = MaterialTheme.typography.titleMedium,
              color = TextPrimary,
              fontWeight = FontWeight.Bold,
            )
          }

          // 3-Column Grid
          Surface(
            modifier = Modifier
              .weight(1f)
              .fillMaxWidth(),
            shape = RoundedCornerShape(14.dp),
            color = ColBg,
            border = BorderStroke(1.dp, BorderSubtle),
          ) {
            Row(modifier = Modifier.fillMaxSize()) {
              // Column 1: Books (2-line: Primary + Secondary)
              Column(
                modifier = Modifier
                  .weight(1.15f)
                  .fillMaxHeight(),
              ) {
                ColumnHeader(title = "BOOKS", count = rankedBooks.size)
                if (rankedBooks.isEmpty()) {
                  Box(
                    modifier = Modifier.fillMaxSize().padding(16.dp),
                    contentAlignment = Alignment.Center,
                  ) {
                    Text(
                      text = "No matching books for \"$query\"",
                      color = TextMuted,
                      fontSize = 13.sp,
                      textAlign = TextAlign.Center,
                    )
                  }
                } else {
                  LazyColumn(
                    state = booksListState,
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(6.dp),
                    verticalArrangement = Arrangement.spacedBy(4.dp),
                  ) {
                    items(rankedBooks, key = { it.idx }) { item ->
                      val isSelected = item.idx == selectedBookIdx
                      val secBookName = secondaryBible?.books?.getOrNull(item.idx)?.name
                      Surface(
                        onClick = {
                          selectedBookIdx = item.idx
                          selectedChapterNum = item.book.chapters.firstOrNull()?.number ?: 1
                        },
                        shape = RoundedCornerShape(8.dp),
                        color = if (isSelected) AccentSky.copy(alpha = 0.18f) else Color.Transparent,
                        border = if (isSelected) BorderStroke(1.dp, AccentSky.copy(alpha = 0.55f)) else null,
                      ) {
                        Column(
                          modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 10.dp, vertical = 8.dp),
                          verticalArrangement = Arrangement.spacedBy(2.dp),
                        ) {
                          Text(
                            text = item.book.name,
                            color = if (isSelected) Color.White else TextPrimary,
                            fontSize = 14.sp,
                            fontWeight = FontWeight.SemiBold,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                          )
                          if (!secBookName.isNullOrBlank()) {
                            SecondaryLineText(
                              text = secBookName,
                              isSelected = isSelected,
                            )
                          }
                        }
                      }
                    }
                  }
                }
              }

              VerticalDivider(thickness = 1.dp, color = BorderSubtle)

              // Column 2: Chapter
              Column(
                modifier = Modifier
                  .weight(0.68f)
                  .fillMaxHeight(),
              ) {
                ColumnHeader(title = "CHAPTER", count = chapters.size)
                LazyColumn(
                  state = chaptersListState,
                  modifier = Modifier.fillMaxSize(),
                  contentPadding = PaddingValues(6.dp),
                  verticalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                  items(chapters, key = { it.number }) { ch ->
                    val isSelected = ch.number == activeChapter?.number
                    Surface(
                      onClick = { selectedChapterNum = ch.number },
                      shape = RoundedCornerShape(8.dp),
                      color = if (isSelected) AccentSky.copy(alpha = 0.18f) else Color.Transparent,
                      border = if (isSelected) BorderStroke(1.dp, AccentSky.copy(alpha = 0.55f)) else null,
                    ) {
                      Text(
                        text = ch.number.toString(),
                        modifier = Modifier
                          .fillMaxWidth()
                          .padding(vertical = 9.dp),
                        textAlign = TextAlign.Center,
                        color = if (isSelected) Color.White else TextMuted,
                        fontSize = 18.sp,
                        fontWeight = FontWeight.Bold,
                      )
                    }
                  }
                }
              }

              VerticalDivider(thickness = 1.dp, color = BorderSubtle)

              // Column 3: Verse (2-line snippet: Primary + Secondary, tap to present & close)
              val verses = activeChapter?.verses.orEmpty()
              Column(
                modifier = Modifier
                  .weight(1.82f)
                  .fillMaxHeight(),
              ) {
                ColumnHeader(title = "VERSE", count = verses.size)
                LazyColumn(
                  state = versesListState,
                  modifier = Modifier.fillMaxSize(),
                  contentPadding = PaddingValues(6.dp),
                  verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                  items(verses, key = { it.number }) { v ->
                    val secText = secChapter?.verses?.firstOrNull { it.number == v.number }?.text
                    val isLiveVerse = liveVerseRef != null &&
                      liveVerseRef.first == selectedBookIdx &&
                      liveVerseRef.second == activeChapter?.number &&
                      liveVerseRef.third == v.number
                    Surface(
                      onClick = {
                        val chapNum = activeChapter?.number ?: 1
                        onPresentVerse(selectedBookIdx, chapNum, v.number)
                        onDismiss()
                      },
                      shape = RoundedCornerShape(10.dp),
                      color = if (isLiveVerse) AccentSky.copy(alpha = 0.20f) else Color(0xFF101726).copy(alpha = 0.7f),
                      border = BorderStroke(
                        1.dp,
                        if (isLiveVerse) AccentSky.copy(alpha = 0.75f) else BorderSubtle,
                      ),
                    ) {
                      Row(
                        modifier = Modifier
                          .fillMaxWidth()
                          .padding(horizontal = 10.dp, vertical = 9.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                      ) {
                        Text(
                          text = v.number.toString(),
                          color = AccentSky,
                          fontSize = 18.sp,
                          fontWeight = FontWeight.Bold,
                          textAlign = TextAlign.Center,
                          modifier = Modifier.width(34.dp),
                        )
                        Column(
                          modifier = Modifier.weight(1f),
                          verticalArrangement = Arrangement.spacedBy(3.dp),
                        ) {
                          Text(
                            text = v.text,
                            color = TextPrimary,
                            fontSize = 13.sp,
                            fontWeight = FontWeight.Medium,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                          )
                          if (!secText.isNullOrBlank()) {
                            SecondaryLineText(
                              text = secText,
                              isSelected = false,
                            )
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }

        VerticalDivider(thickness = 1.dp, color = BorderSubtle)

        // Right Pane: Always-ready Netflix-style Book Search Keyboard (~20% wider)
        Column(
          modifier = Modifier
            .width(410.dp)
            .fillMaxHeight()
            .background(PanelBg)
            .padding(14.dp),
          verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
          Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.End,
            verticalAlignment = Alignment.CenterVertically,
          ) {
            Surface(
              onClick = onDismiss,
              shape = RoundedCornerShape(10.dp),
              color = SurfaceElevated,
              border = BorderStroke(1.dp, BorderSubtle),
            ) {
              Row(
                modifier = Modifier.padding(horizontal = 12.dp, vertical = 7.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
              ) {
                Icon(
                  imageVector = Icons.Rounded.Close,
                  contentDescription = "Close",
                  tint = TextMuted,
                  modifier = Modifier.size(16.dp),
                )
                Text(
                  text = "Close",
                  color = TextPrimary,
                  fontSize = 13.sp,
                  fontWeight = FontWeight.SemiBold,
                )
              }
            }
          }

          // Fixed-height Read-only Query Display (never triggers Android soft keyboard)
          Surface(
            modifier = Modifier
              .fillMaxWidth()
              .height(48.dp),
            shape = RoundedCornerShape(12.dp),
            color = Color(0xFF080B12),
            border = BorderStroke(1.5.dp, AccentSky.copy(alpha = 0.6f)),
          ) {
            Row(
              modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 12.dp),
              verticalAlignment = Alignment.CenterVertically,
              horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
              Icon(
                imageVector = Icons.Rounded.Search,
                contentDescription = null,
                tint = AccentSky,
                modifier = Modifier.size(18.dp),
              )
              Text(
                text = query.ifEmpty { "Type book (e.g. jn, 1co, awit)..." },
                modifier = Modifier.weight(1f),
                color = if (query.isEmpty()) TextMuted else TextPrimary,
                fontSize = 15.sp,
                fontWeight = if (query.isEmpty()) FontWeight.Normal else FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
              )
              if (query.isNotEmpty()) {
                Surface(
                  onClick = { query = "" },
                  shape = RoundedCornerShape(7.dp),
                  color = SurfaceElevated,
                  border = BorderStroke(1.dp, BorderSubtle),
                ) {
                  Text(
                    text = "CLR",
                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                    color = TextMuted,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold,
                  )
                }
              }
            }
          }

          Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
          ) {
            Text(
              text = "Book Names & Aliases",
              color = TextMuted,
              fontSize = 12.sp,
            )
            Text(
              text = if (query.isBlank()) "${books.size} books" else "${rankedBooks.size} matching",
              color = AccentSky,
              fontSize = 12.sp,
              fontWeight = FontWeight.SemiBold,
            )
          }

          Spacer(modifier = Modifier.weight(1f))

          // Number Row (1, 2, 3 for numbered books)
          Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
          ) {
            listOf("1", "2", "3").forEach { digit ->
              KeyboardKeyButton(
                label = digit,
                bgColor = KeyNumBg,
                textColor = Color(0xFFBFDBFE),
                modifier = Modifier.weight(1f).height(42.dp),
                onClick = { if (query.length < 24) query += digit },
              )
            }
          }

          // 6-Column A-Z Grid (compact fixed row height)
          val letters = remember { ('A'..'Z').map { it.toString() } }
          val rows = remember { letters.chunked(6) }
          Column(
            verticalArrangement = Arrangement.spacedBy(6.dp),
          ) {
            rows.forEach { rowLetters ->
              Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
              ) {
                rowLetters.forEach { ch ->
                  KeyboardKeyButton(
                    label = ch,
                    bgColor = KeyBg,
                    textColor = TextPrimary,
                    modifier = Modifier
                      .weight(1f)
                      .height(46.dp),
                    onClick = { if (query.length < 24) query += ch.lowercase() },
                  )
                }
                // Pad final row (Y, Z) so key widths match
                repeat(6 - rowLetters.size) {
                  Spacer(modifier = Modifier.weight(1f))
                }
              }
            }
          }

          // Action Row: SPACE / DEL / CLEAR
          Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
          ) {
            KeyboardKeyButton(
              label = "SPACE",
              bgColor = KeyActionBg,
              textColor = TextMuted,
              fontSize = 12.sp,
              modifier = Modifier.weight(1.5f).height(44.dp),
              onClick = { if (query.length < 24) query += " " },
            )
            KeyboardKeyButton(
              label = "⌫ DEL",
              bgColor = KeyActionBg,
              textColor = TextMuted,
              fontSize = 12.sp,
              modifier = Modifier.weight(1f).height(44.dp),
              repeatOnLongPress = true,
              onClick = { if (query.isNotEmpty()) query = query.dropLast(1) },
            )
            KeyboardKeyButton(
              label = "CLEAR",
              bgColor = KeyActionBg,
              textColor = Color(0xFFFCA5A5),
              fontSize = 12.sp,
              modifier = Modifier.weight(1f).height(44.dp),
              onClick = { query = "" },
            )
          }

          Spacer(modifier = Modifier.weight(1f))
        }
      }
    }
  }
}

@Composable
private fun KeyboardKeyButton(
  label: String,
  bgColor: Color,
  textColor: Color,
  modifier: Modifier = Modifier,
  fontSize: androidx.compose.ui.unit.TextUnit = 16.sp,
  repeatOnLongPress: Boolean = false,
  onClick: () -> Unit,
) {
  val currentOnClick by rememberUpdatedState(onClick)
  val scope = rememberCoroutineScope()
  val repeatModifier = if (repeatOnLongPress) {
    modifier.pointerInput(Unit) {
      awaitEachGesture {
        awaitFirstDown(requireUnconsumed = false)
        val job = scope.launch {
          delay(350L)
          while (true) {
            currentOnClick()
            delay(55L)
          }
        }
        waitForUpOrCancellation()
        job.cancel()
      }
    }
  } else {
    modifier
  }
  Surface(
    onClick = onClick,
    modifier = repeatModifier,
    shape = RoundedCornerShape(10.dp),
    color = bgColor,
    border = BorderStroke(1.dp, BorderSubtle),
  ) {
    Box(
      modifier = Modifier.fillMaxSize(),
      contentAlignment = Alignment.Center,
    ) {
      Text(
        text = label,
        color = textColor,
        fontSize = fontSize,
        fontWeight = FontWeight.Bold,
      )
    }
  }
}

@Composable
private fun ColumnHeader(
  title: String,
  count: Int,
) {
  Column {
    Row(
      modifier = Modifier
        .fillMaxWidth()
        .background(ColHeaderBg)
        .padding(horizontal = 12.dp, vertical = 9.dp),
      horizontalArrangement = Arrangement.SpaceBetween,
      verticalAlignment = Alignment.CenterVertically,
    ) {
      Text(
        text = title,
        color = TextMuted,
        fontSize = 11.sp,
        fontWeight = FontWeight.Bold,
        letterSpacing = 0.8.sp,
      )
      Text(
        text = count.toString(),
        color = TextMuted.copy(alpha = 0.7f),
        fontSize = 11.sp,
        fontWeight = FontWeight.SemiBold,
      )
    }
    HorizontalDivider(thickness = 1.dp, color = BorderSubtle)
  }
}

@Composable
private fun SecondaryLineText(
  text: String,
  isSelected: Boolean,
) {
  Row(
    modifier = Modifier.fillMaxWidth(),
    verticalAlignment = Alignment.CenterVertically,
  ) {
    Box(
      modifier = Modifier
        .width(2.dp)
        .height(12.dp)
        .background(
          color = if (isSelected) Color(0x7394A3B8) else Color(0x4094A3B8),
          shape = RoundedCornerShape(1.dp),
        ),
    )
    Spacer(modifier = Modifier.width(6.dp))
    Text(
      text = text,
      color = if (isSelected) Color(0xFF94A3B8) else TextMuted,
      fontSize = 12.sp,
      fontWeight = FontWeight.Normal,
      maxLines = 1,
      overflow = TextOverflow.Ellipsis,
    )
  }
}
