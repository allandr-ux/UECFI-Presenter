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
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.Send
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.VerticalDivider
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
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
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import org.uecfi.presenter.model.OperatorChatMessage

private val ChatBgDark = Color(0xFF070A10)
private val ChatPanelBg = Color(0xFF0F1420)
private val ChatSurfaceElevated = Color(0xFF171E2E)
private val ChatTextPrimary = Color(0xFFF8FAFC)
private val ChatTextMuted = Color(0xFF94A3B8)
private val ChatAccentSky = Color(0xFF3B82F6)
private val ChatKeyBg = Color(0xFF1C2538)
private val ChatKeyNumBg = Color(0xFF141C2C)
private val ChatKeyActionBg = Color(0xFF172033)
private val ChatBorderSubtle = Color(0x2894A3B8)

/**
 * Tablet-optimized Chat modal mirroring VerseSelectorModal's layout:
 * Left 1/3 shows conversation bubbles; Right 2/3 shows the read-only message box
 * and an always-ready on-screen QWERTY keyboard (never triggers the OS keyboard).
 */
@Composable
fun ChatModal(
  messages: List<OperatorChatMessage>,
  onSendMessage: (String) -> Unit,
  onDismiss: () -> Unit,
) {
  var draft by remember { mutableStateOf("") }
  var shiftEnabled by remember { mutableStateOf(true) }
  var capsLock by remember { mutableStateOf(false) }
  var lastShiftTapMs by remember { mutableLongStateOf(0L) }
  var lastSpaceTapMs by remember { mutableLongStateOf(0L) }
  val isUpper = capsLock || shiftEnabled
  val listState = rememberLazyListState()
  val timeFormatter = remember { SimpleDateFormat("h:mm a", Locale.getDefault()) }

  LaunchedEffect(messages.size) {
    if (messages.isNotEmpty()) {
      listState.animateScrollToItem(messages.lastIndex)
    }
  }

  fun updateAutoShift(text: String) {
    if (capsLock) return
    shiftEnabled = text.isEmpty() || Regex("""[.!?]\s*$""").containsMatchIn(text)
  }

  fun appendText(str: String) {
    if (draft.length >= 500) return
    draft += str
    if (!capsLock) {
      if (str.any { it.isLetter() }) {
        shiftEnabled = false
      } else {
        updateAutoShift(draft)
      }
    }
  }

  fun handleBackspace() {
    if (draft.isEmpty()) return
    draft = draft.dropLast(1)
    lastSpaceTapMs = 0L
    updateAutoShift(draft)
  }

  fun handleSpaceTap() {
    val now = System.currentTimeMillis()
    if (
      now - lastSpaceTapMs <= 350L &&
      draft.length >= 2 &&
      draft.endsWith(" ") &&
      draft[draft.length - 2].isLetterOrDigit()
    ) {
      draft = draft.dropLast(1) + ". "
      lastSpaceTapMs = 0L
      updateAutoShift(draft)
    } else {
      appendText(" ")
      lastSpaceTapMs = now
    }
  }

  fun handleShiftTap() {
    val now = System.currentTimeMillis()
    if (capsLock) {
      capsLock = false
      shiftEnabled = false
      lastShiftTapMs = 0L
    } else if (now - lastShiftTapMs <= 350L) {
      capsLock = true
      shiftEnabled = true
      lastShiftTapMs = 0L
    } else {
      shiftEnabled = !shiftEnabled
      lastShiftTapMs = now
    }
  }

  fun submitDraft() {
    val clean = draft.trim()
    if (clean.isEmpty()) return
    onSendMessage(clean)
    draft = ""
    capsLock = false
    shiftEnabled = true
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
      color = ChatBgDark,
      border = BorderStroke(1.dp, ChatBorderSubtle),
    ) {
      Row(modifier = Modifier.fillMaxSize()) {
        // Left Pane (1/3): Conversation Bubbles
        Column(
          modifier = Modifier
            .weight(1f)
            .fillMaxHeight()
            .background(Color(0xFF0B101B)),
        ) {
          Row(
            modifier = Modifier
              .fillMaxWidth()
              .background(Color(0xFF101726))
              .padding(horizontal = 14.dp, vertical = 12.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
          ) {
            Text(
              text = "OPERATOR CHAT",
              color = ChatTextMuted,
              fontSize = 12.sp,
              fontWeight = FontWeight.Bold,
              letterSpacing = 0.8.sp,
            )
            Text(
              text = "${messages.size}",
              color = ChatTextMuted.copy(alpha = 0.7f),
              fontSize = 12.sp,
              fontWeight = FontWeight.SemiBold,
            )
          }
          HorizontalDivider(thickness = 1.dp, color = ChatBorderSubtle)

          if (messages.isEmpty()) {
            Box(
              modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
                .padding(20.dp),
              contentAlignment = Alignment.Center,
            ) {
              Text(
                text = "No messages yet.\nType on the right to message the Operator.",
                color = ChatTextMuted,
                fontSize = 13.sp,
                lineHeight = 19.sp,
              )
            }
          } else {
            LazyColumn(
              state = listState,
              modifier = Modifier
                .weight(1f)
                .fillMaxWidth(),
              contentPadding = PaddingValues(12.dp),
              verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
              items(messages, key = { it.id }) { msg ->
                val isAndroid = msg.sender == "android"
                Column(
                  modifier = Modifier.fillMaxWidth(),
                  horizontalAlignment = if (isAndroid) Alignment.End else Alignment.Start,
                ) {
                  Surface(
                    shape = RoundedCornerShape(14.dp),
                    color = if (isAndroid) ChatAccentSky else ChatSurfaceElevated,
                    border = if (isAndroid) null else BorderStroke(1.dp, ChatBorderSubtle),
                    modifier = Modifier.widthIn(max = 260.dp),
                  ) {
                    Column(
                      modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                      verticalArrangement = Arrangement.spacedBy(2.dp),
                    ) {
                      if (!isAndroid) {
                        Text(
                          text = "Operator",
                          color = ChatAccentSky,
                          fontSize = 10.sp,
                          fontWeight = FontWeight.Bold,
                        )
                      }
                      Text(
                        text = msg.text,
                        color = if (isAndroid) Color.White else ChatTextPrimary,
                        fontSize = 14.sp,
                        lineHeight = 19.sp,
                      )
                    }
                  }
                  if (msg.timestamp > 0L) {
                    Text(
                      text = timeFormatter.format(Date(msg.timestamp)),
                      color = ChatTextMuted.copy(alpha = 0.7f),
                      fontSize = 10.sp,
                      modifier = Modifier.padding(horizontal = 4.dp, vertical = 2.dp),
                    )
                  }
                }
              }
            }
          }
        }

        VerticalDivider(thickness = 1.dp, color = ChatBorderSubtle)

        // Right Pane (2/3): Close Button + Message Input + On-Screen QWERTY Keyboard
        Column(
          modifier = Modifier
            .weight(2f)
            .fillMaxHeight()
            .background(ChatPanelBg)
            .padding(14.dp),
          verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
          // Top-right Close button
          Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.End,
            verticalAlignment = Alignment.CenterVertically,
          ) {
            Surface(
              onClick = onDismiss,
              shape = RoundedCornerShape(10.dp),
              color = ChatSurfaceElevated,
              border = BorderStroke(1.dp, ChatBorderSubtle),
            ) {
              Row(
                modifier = Modifier.padding(horizontal = 12.dp, vertical = 7.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
              ) {
                Icon(
                  imageVector = Icons.Rounded.Close,
                  contentDescription = "Close",
                  tint = ChatTextMuted,
                  modifier = Modifier.size(16.dp),
                )
                Text(
                  text = "Close",
                  color = ChatTextPrimary,
                  fontSize = 13.sp,
                  fontWeight = FontWeight.SemiBold,
                )
              }
            }
          }

          // Fixed-height Read-only Message Input + Send Button
          Row(
            modifier = Modifier
              .fillMaxWidth()
              .height(52.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
          ) {
            Surface(
              modifier = Modifier
                .weight(1f)
                .fillMaxHeight(),
              shape = RoundedCornerShape(12.dp),
              color = Color(0xFF080B12),
              border = BorderStroke(1.5.dp, ChatAccentSky.copy(alpha = 0.6f)),
            ) {
              Row(
                modifier = Modifier
                  .fillMaxSize()
                  .padding(horizontal = 14.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
              ) {
                Text(
                  text = draft.ifEmpty { "Type a message to Operator..." },
                  modifier = Modifier.weight(1f),
                  color = if (draft.isEmpty()) ChatTextMuted else ChatTextPrimary,
                  fontSize = 15.sp,
                  fontWeight = if (draft.isEmpty()) FontWeight.Normal else FontWeight.Medium,
                  maxLines = 1,
                  overflow = TextOverflow.Ellipsis,
                )
                if (draft.isNotEmpty()) {
                  Surface(
                    onClick = {
                      draft = ""
                      shiftEnabled = true
                    },
                    shape = RoundedCornerShape(7.dp),
                    color = ChatSurfaceElevated,
                    border = BorderStroke(1.dp, ChatBorderSubtle),
                  ) {
                    Text(
                      text = "CLR",
                      modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                      color = ChatTextMuted,
                      fontSize = 11.sp,
                      fontWeight = FontWeight.Bold,
                    )
                  }
                }
              }
            }

            Surface(
              onClick = { submitDraft() },
              enabled = draft.isNotBlank(),
              modifier = Modifier.fillMaxHeight(),
              shape = RoundedCornerShape(12.dp),
              color = if (draft.isNotBlank()) ChatAccentSky else ChatSurfaceElevated,
              border = BorderStroke(1.dp, ChatBorderSubtle),
            ) {
              Row(
                modifier = Modifier.padding(horizontal = 18.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
              ) {
                Icon(
                  imageVector = Icons.AutoMirrored.Rounded.Send,
                  contentDescription = "Send",
                  tint = if (draft.isNotBlank()) Color.White else ChatTextMuted,
                  modifier = Modifier.size(18.dp),
                )
                Text(
                  text = "Send",
                  color = if (draft.isNotBlank()) Color.White else ChatTextMuted,
                  fontSize = 14.sp,
                  fontWeight = FontWeight.Bold,
                )
              }
            }
          }

          // Number Row: 1..0
          Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
          ) {
            listOf("1", "2", "3", "4", "5", "6", "7", "8", "9", "0").forEach { d ->
              QwertyKey(
                label = d,
                bgColor = ChatKeyNumBg,
                textColor = Color(0xFFBFDBFE),
                modifier = Modifier.weight(1f).height(44.dp),
                onClick = { appendText(d) },
              )
            }
          }

          // QWERTY Row 1: Q..P
          Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
          ) {
            listOf("Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P").forEach { k ->
              val shown = if (isUpper) k else k.lowercase()
              QwertyKey(
                label = shown,
                bgColor = ChatKeyBg,
                textColor = ChatTextPrimary,
                modifier = Modifier.weight(1f).height(48.dp),
                onClick = { appendText(shown) },
              )
            }
          }

          // QWERTY Row 2: A..L
          Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
          ) {
            Spacer(modifier = Modifier.weight(0.5f))
            listOf("A", "S", "D", "F", "G", "H", "J", "K", "L").forEach { k ->
              val shown = if (isUpper) k else k.lowercase()
              QwertyKey(
                label = shown,
                bgColor = ChatKeyBg,
                textColor = ChatTextPrimary,
                modifier = Modifier.weight(1f).height(48.dp),
                onClick = { appendText(shown) },
              )
            }
            Spacer(modifier = Modifier.weight(0.5f))
          }

          // QWERTY Row 3: Shift + Z..M + Backspace
          Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
          ) {
            QwertyKey(
              label = if (capsLock) "⇪" else "⇧",
              bgColor = when {
                capsLock -> ChatAccentSky
                shiftEnabled -> ChatAccentSky.copy(alpha = 0.25f)
                else -> ChatKeyActionBg
              },
              textColor = when {
                capsLock -> Color.White
                shiftEnabled -> ChatAccentSky
                else -> ChatTextMuted
              },
              fontSize = 18.sp,
              modifier = Modifier.weight(1.4f).height(48.dp),
              onClick = { handleShiftTap() },
            )
            listOf("Z", "X", "C", "V", "B", "N", "M").forEach { k ->
              val shown = if (isUpper) k else k.lowercase()
              QwertyKey(
                label = shown,
                bgColor = ChatKeyBg,
                textColor = ChatTextPrimary,
                modifier = Modifier.weight(1f).height(48.dp),
                onClick = { appendText(shown) },
              )
            }
            QwertyKey(
              label = "⌫",
              bgColor = ChatKeyActionBg,
              textColor = ChatTextMuted,
              fontSize = 17.sp,
              modifier = Modifier.weight(1.4f).height(48.dp),
              repeatOnLongPress = true,
              onClick = { handleBackspace() },
            )
          }

          // Bottom Row: , | SPACE | . | ? | !
          Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
          ) {
            QwertyKey(
              label = ",",
              bgColor = ChatKeyActionBg,
              textColor = ChatTextPrimary,
              modifier = Modifier.weight(1f).height(46.dp),
              onClick = { appendText(",") },
            )
            QwertyKey(
              label = "SPACE",
              bgColor = ChatKeyBg,
              textColor = ChatTextMuted,
              fontSize = 13.sp,
              modifier = Modifier.weight(5f).height(46.dp),
              onClick = { handleSpaceTap() },
            )
            QwertyKey(
              label = ".",
              bgColor = ChatKeyActionBg,
              textColor = ChatTextPrimary,
              modifier = Modifier.weight(1f).height(46.dp),
              onClick = { appendText(".") },
            )
            QwertyKey(
              label = "?",
              bgColor = ChatKeyActionBg,
              textColor = ChatTextPrimary,
              modifier = Modifier.weight(1f).height(46.dp),
              onClick = { appendText("?") },
            )
            QwertyKey(
              label = "!",
              bgColor = ChatKeyActionBg,
              textColor = ChatTextPrimary,
              modifier = Modifier.weight(1f).height(46.dp),
              onClick = { appendText("!") },
            )
          }

          Spacer(modifier = Modifier.weight(1f))
        }
      }
    }
  }
}

@Composable
private fun QwertyKey(
  label: String,
  bgColor: Color,
  textColor: Color,
  modifier: Modifier = Modifier,
  fontSize: TextUnit = 16.sp,
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
    border = BorderStroke(1.dp, ChatBorderSubtle),
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
