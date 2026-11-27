package org.uecfi.presenter.ui.main

import android.annotation.SuppressLint
import android.os.Build
import android.view.ViewGroup
import android.webkit.JavascriptInterface
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.automirrored.rounded.ArrowForward
import androidx.compose.material.icons.automirrored.rounded.VolumeOff
import androidx.compose.material.icons.automirrored.rounded.VolumeUp
import androidx.compose.material.icons.rounded.ClearAll
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Description
import androidx.compose.material.icons.rounded.Image
import androidx.compose.material.icons.rounded.Menu
import androidx.compose.material.icons.rounded.MenuBook
import androidx.compose.material.icons.rounded.Mic
import androidx.compose.material.icons.rounded.MicOff
import androidx.compose.material.icons.rounded.MusicNote
import androidx.compose.material.icons.rounded.Pause
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.PresentToAll
import androidx.compose.material.icons.rounded.Replay
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material.icons.rounded.Stop
import androidx.compose.material.icons.rounded.SubtitlesOff
import androidx.compose.material.icons.rounded.VisibilityOff
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DrawerValue
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalDrawerSheet
import androidx.compose.material3.ModalNavigationDrawer
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDrawerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation3.runtime.NavKey
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import org.uecfi.presenter.R
import org.uecfi.presenter.data.CacheStats
import org.uecfi.presenter.model.LiveState
import org.uecfi.presenter.model.ProgramItemSummary
import org.uecfi.presenter.model.SlideBlock
import org.uecfi.presenter.network.AudioTimeSync
import org.uecfi.presenter.network.ConnectionStatus
import org.uecfi.presenter.network.DiscoveredServer
import java.util.Locale

private val BgDark = Color(0xFF090D16)
private val SurfaceDark = Color(0xFF131B2E)
private val CardDark = Color(0xFF1B263B)
private val BorderSubtle = Color(0xFF2B3A55)
private val AccentSky = Color(0xFF38BDF8)
private val AccentAmber = Color(0xFFF59E0B)
private val AccentEmerald = Color(0xFF10B981)
private val AccentRose = Color(0xFFF43F5E)
private val TextPrimary = Color(0xFFF8FAFC)
private val TextMuted = Color(0xFF94A3B8)

@Composable
fun MainScreen(
  onItemClick: (NavKey) -> Unit,
  modifier: Modifier = Modifier,
  viewModel: MainScreenViewModel = viewModel(),
) {
  val serverInput by viewModel.serverInput.collectAsStateWithLifecycle()
  val pinInput by viewModel.pinInput.collectAsStateWithLifecycle()
  val connectionStatus by viewModel.connectionStatus.collectAsStateWithLifecycle()
  val statusMessage by viewModel.statusMessage.collectAsStateWithLifecycle()
  val liveState by viewModel.liveState.collectAsStateWithLifecycle()
  val mirrorHttpUrl by viewModel.mirrorHttpUrl.collectAsStateWithLifecycle()
  val discoveredServers by viewModel.discoveredServers.collectAsStateWithLifecycle()
  val isDiscovering by viewModel.isDiscovering.collectAsStateWithLifecycle()
  val authRequired by viewModel.authRequired.collectAsStateWithLifecycle()
  val authError by viewModel.authError.collectAsStateWithLifecycle()
  val cacheStats by viewModel.cacheStats.collectAsStateWithLifecycle()

  val drawerState = rememberDrawerState(initialValue = DrawerValue.Closed)
  val scope = rememberCoroutineScope()
  var showSettingsModal by remember { mutableStateOf(false) }
  var pendingItemSwitch by remember { mutableStateOf<ProgramItemSummary?>(null) }

  // Close settings modal automatically when connection succeeds.
  LaunchedEffect(connectionStatus) {
    if (connectionStatus == ConnectionStatus.Connected && showSettingsModal) {
      showSettingsModal = false
    }
  }

  // RTL on ModalNavigationDrawer makes the drawer slide in from the right edge;
  // inner providers restore LTR so text and controls render normally.
  CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
    ModalNavigationDrawer(
      modifier = modifier.fillMaxSize(),
      drawerState = drawerState,
      drawerContent = {
        ModalDrawerSheet(
          drawerContainerColor = SurfaceDark,
          drawerContentColor = TextPrimary,
          modifier = Modifier.width(320.dp),
        ) {
          CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
            ProgramItemsDrawerContent(
              programName = liveState?.programName.orEmpty(),
              programItems = liveState?.programItems.orEmpty(),
              activeItemId = liveState?.activeItemId,
              isConnected = connectionStatus == ConnectionStatus.Connected,
              onSelectItem = { itemId ->
                val isPlayingAudio = liveState?.audioPlaying == true
                val activeId = liveState?.activeItemId
                if (isPlayingAudio && activeId != null && activeId != itemId) {
                  val target = liveState?.programItems?.firstOrNull { it.id == itemId }
                    ?: ProgramItemSummary(id = itemId, title = "this item")
                  pendingItemSwitch = target
                } else {
                  viewModel.selectItem(itemId)
                  scope.launch { drawerState.close() }
                }
              },
              onCloseDrawer = { scope.launch { drawerState.close() } },
            )
          }
        }
      },
    ) {
      CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
        val isConnected = connectionStatus == ConnectionStatus.Connected

        // Single Full-Screen Main Screen Mirror + Corner Overlay Controls
        Box(modifier = Modifier.fillMaxSize()) {
          MainScreenMirrorContent(
            liveState = liveState,
            liveStateJsonFlow = viewModel.liveStateJson,
            audioTimeSyncFlow = viewModel.audioTimeSync,
            mirrorHttpUrl = mirrorHttpUrl,
            connectionStatus = connectionStatus,
            statusMessage = statusMessage,
            serverInput = serverInput,
            isDiscovering = isDiscovering,
            openCachedMedia = viewModel::openCachedMedia,
            onOpenSettings = { showSettingsModal = true },
          )

          // Top overlay bar: Centro Mic button + muted notice (left), Settings & Program (right)
          Row(
            modifier = Modifier
              .fillMaxWidth()
              .align(Alignment.TopCenter)
              .windowInsetsPadding(WindowInsets.safeDrawing)
              .padding(horizontal = 14.dp, vertical = 10.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.CenterVertically,
          ) {
            // Top-left: Larger Centro Mic Mute/Unmute button + inline muted notice
            Row(
              modifier = Modifier.weight(1f),
              horizontalArrangement = Arrangement.spacedBy(10.dp),
              verticalAlignment = Alignment.CenterVertically,
            ) {
              if (isConnected && liveState?.returnAudioActive == true) {
                val isMicMuted = liveState?.returnAudioMuted == true
                Surface(
                  onClick = viewModel::toggleReturnAudio,
                  shape = RoundedCornerShape(999.dp),
                  color = if (isMicMuted) {
                    Color(0xFFD97706).copy(alpha = 0.90f)
                  } else {
                    Color(0xFF059669).copy(alpha = 0.92f)
                  },
                  border = BorderStroke(
                    width = 1.5.dp,
                    color = if (isMicMuted) {
                      Color(0xFFFDE68A).copy(alpha = 0.85f)
                    } else {
                      Color(0xFF6EE7B7).copy(alpha = 0.85f)
                    },
                  ),
                ) {
                  Row(
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                  ) {
                    Icon(
                      imageVector = if (isMicMuted) Icons.Rounded.MicOff else Icons.Rounded.Mic,
                      contentDescription = if (isMicMuted) {
                        "Unmute Centro audio to remote speaker"
                      } else {
                        "Mute Centro audio to remote speaker"
                      },
                      tint = Color.White,
                      modifier = Modifier.size(24.dp),
                    )
                    Text(
                      text = if (isMicMuted) "Mic Muted — Unmute" else "Centro Mic Live",
                      style = MaterialTheme.typography.titleSmall,
                      color = Color.White,
                      fontWeight = FontWeight.Bold,
                    )
                  }
                }

                if (isMicMuted) {
                  Surface(
                    onClick = viewModel::toggleReturnAudio,
                    shape = RoundedCornerShape(14.dp),
                    color = Color(0xFF78350F).copy(alpha = 0.94f),
                    border = BorderStroke(1.5.dp, Color(0xFFFBBF24).copy(alpha = 0.85f)),
                  ) {
                    Row(
                      modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
                      verticalAlignment = Alignment.CenterVertically,
                      horizontalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                      Icon(
                        imageVector = Icons.Rounded.MicOff,
                        contentDescription = null,
                        tint = Color(0xFFFDE68A),
                        modifier = Modifier.size(22.dp),
                      )
                      Text(
                        text = "Remote speaker cannot hear you — tap Unmute before speaking.",
                        style = MaterialTheme.typography.titleMedium,
                        color = Color(0xFFFEF3C7),
                        fontWeight = FontWeight.Bold,
                      )
                    }
                  }
                }
              }
            }

            Row(
              verticalAlignment = Alignment.CenterVertically,
              horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
              Surface(
                onClick = { showSettingsModal = true },
                shape = RoundedCornerShape(999.dp),
                color = Color.Black.copy(alpha = 0.48f),
                border = BorderStroke(1.dp, Color.White.copy(alpha = 0.14f)),
              ) {
                Row(
                  modifier = Modifier.padding(horizontal = 10.dp, vertical = 8.dp),
                  verticalAlignment = Alignment.CenterVertically,
                  horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                  StatusDot(status = connectionStatus)
                  Icon(
                    imageVector = Icons.Rounded.Settings,
                    contentDescription = "Settings",
                    tint = TextPrimary,
                    modifier = Modifier.size(18.dp),
                  )
                }
              }

              Surface(
                onClick = { scope.launch { drawerState.open() } },
                shape = RoundedCornerShape(999.dp),
                color = Color.Black.copy(alpha = 0.48f),
                border = BorderStroke(1.dp, Color.White.copy(alpha = 0.14f)),
              ) {
                Row(
                  modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                  verticalAlignment = Alignment.CenterVertically,
                  horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                  Text(
                    text = "Program",
                    style = MaterialTheme.typography.labelMedium,
                    color = TextPrimary,
                    fontWeight = FontWeight.SemiBold,
                  )
                  Icon(
                    imageVector = Icons.Rounded.Menu,
                    contentDescription = "Open program items",
                    tint = TextPrimary,
                    modifier = Modifier.size(18.dp),
                  )
                }
              }
            }
          }

          // Bottom-Left Corner Overlay: PREV
          CornerNavButton(
            label = "PREV",
            icon = Icons.AutoMirrored.Rounded.ArrowBack,
            iconFirst = true,
            enabled = isConnected,
            accent = false,
            onClick = viewModel::sendPrev,
            modifier = Modifier
              .align(Alignment.BottomStart)
              .windowInsetsPadding(WindowInsets.safeDrawing)
              .padding(start = 16.dp, bottom = 16.dp),
          )

          // Bottom-Center Overlay: Audio Controls (only for audio-synced songs)
          val isTimedSong = isConnected &&
            liveState?.activeItem?.type == "song" &&
            (liveState?.lyricsMode == "timed" || liveState?.activeItem?.lyricsMode == "timed")
          if (isTimedSong) {
            AudioControlBar(
              isPlaying = liveState?.audioPlaying == true,
              volume = liveState?.audioVolume ?: 1f,
              onTogglePlay = viewModel::toggleAudioPlay,
              onStop = viewModel::stopAudio,
              onRestart = viewModel::restartAudio,
              onVolumeChange = viewModel::setAudioVolume,
              modifier = Modifier
                .align(Alignment.BottomCenter)
                .windowInsetsPadding(WindowInsets.safeDrawing)
                .padding(bottom = 16.dp),
            )
          }

          // Bottom-Right Corner Overlay: NEXT
          CornerNavButton(
            label = "NEXT",
            icon = Icons.AutoMirrored.Rounded.ArrowForward,
            iconFirst = false,
            enabled = isConnected,
            accent = true,
            onClick = viewModel::sendNext,
            modifier = Modifier
              .align(Alignment.BottomEnd)
              .windowInsetsPadding(WindowInsets.safeDrawing)
              .padding(end = 16.dp, bottom = 16.dp),
          )
        }
      }
    }
  }

  if (showSettingsModal) {
    SettingsModalDialog(
      serverInput = serverInput,
      pinInput = pinInput,
      status = connectionStatus,
      statusMessage = statusMessage,
      currentOverride = liveState?.override ?: "none",
      discoveredServers = discoveredServers,
      isDiscovering = isDiscovering,
      onInputChange = viewModel::updateServerInput,
      onPinChange = viewModel::updatePinInput,
      onConnect = viewModel::connect,
      onDisconnect = viewModel::disconnect,
      onScanLan = { viewModel.discoverServers(autoConnect = true) },
      onSelectServer = viewModel::connectToDiscovered,
      onToggleClearText = viewModel::toggleClearText,
      onToggleBlackout = viewModel::toggleBlackout,
      onToggleLogo = viewModel::toggleLogo,
      onClearOverride = viewModel::clearOverride,
      cacheStats = cacheStats,
      onResyncCache = viewModel::resyncCache,
      onClearCache = viewModel::clearCache,
      onDismiss = { showSettingsModal = false },
    )
  }

  if (authRequired) {
    AlertDialog(
      onDismissRequest = {},
      containerColor = SurfaceDark,
      titleContentColor = TextPrimary,
      textContentColor = TextMuted,
      title = {
        Text("Remote Control PIN", fontWeight = FontWeight.Bold)
      },
      text = {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
          Text("Enter the 6-digit PIN shown in the desktop Display Setup window.")
          OutlinedTextField(
            value = pinInput,
            onValueChange = viewModel::updatePinInput,
            singleLine = true,
            placeholder = { Text("6-digit PIN", color = TextMuted.copy(alpha = 0.6f)) },
            colors = OutlinedTextFieldDefaults.colors(
              focusedTextColor = TextPrimary,
              unfocusedTextColor = TextPrimary,
              focusedBorderColor = AccentSky,
              unfocusedBorderColor = BorderSubtle,
              cursorColor = AccentSky,
            ),
          )
          if (!authError.isNullOrBlank()) {
            Text(text = authError ?: "", color = AccentRose, style = MaterialTheme.typography.bodySmall)
          }
        }
      },
      confirmButton = {
        Button(
          onClick = { viewModel.submitPin(pinInput) },
          colors = ButtonDefaults.buttonColors(containerColor = AccentSky, contentColor = BgDark),
        ) {
          Text("Unlock", fontWeight = FontWeight.Bold)
        }
      },
    )
  }

  pendingItemSwitch?.let { target ->
    val currentTitle = liveState?.activeItem?.title?.takeIf { it.isNotBlank() } ?: "Current song"
    AlertDialog(
      onDismissRequest = { pendingItemSwitch = null },
      containerColor = SurfaceDark,
      titleContentColor = TextPrimary,
      textContentColor = TextMuted,
      title = {
        Text(
          text = "Replace Playing Song?",
          fontWeight = FontWeight.Bold,
        )
      },
      text = {
        Text(
          text = "\"$currentTitle\" is currently playing. Stop it and switch to \"${target.title}\"?",
        )
      },
      confirmButton = {
        Button(
          onClick = {
            viewModel.selectItem(target.id)
            pendingItemSwitch = null
            scope.launch { drawerState.close() }
          },
          colors = ButtonDefaults.buttonColors(
            containerColor = AccentSky,
            contentColor = BgDark,
          ),
        ) {
          Text("Switch Item", fontWeight = FontWeight.Bold)
        }
      },
      dismissButton = {
        TextButton(onClick = { pendingItemSwitch = null }) {
          Text("Cancel", color = TextMuted)
        }
      },
    )
  }
}

@Composable
private fun ProgramItemsDrawerContent(
  programName: String,
  programItems: List<ProgramItemSummary>,
  activeItemId: String?,
  isConnected: Boolean,
  onSelectItem: (String) -> Unit,
  onCloseDrawer: () -> Unit,
) {
  val listState = rememberLazyListState()

  LaunchedEffect(activeItemId, programItems.size) {
    val activeIdx = programItems.indexOfFirst { it.id == activeItemId }
    if (activeIdx >= 0) {
      listState.animateScrollToItem(activeIdx)
    }
  }

  Column(
    modifier = Modifier
      .fillMaxHeight()
      .fillMaxWidth()
      .windowInsetsPadding(WindowInsets.safeDrawing)
      .padding(16.dp),
    verticalArrangement = Arrangement.spacedBy(12.dp),
  ) {
    Row(
      modifier = Modifier.fillMaxWidth(),
      horizontalArrangement = Arrangement.SpaceBetween,
      verticalAlignment = Alignment.CenterVertically,
    ) {
      Column(modifier = Modifier.weight(1f)) {
        Text(
          text = programName.ifBlank { "Program Items" },
          style = MaterialTheme.typography.titleMedium,
          fontWeight = FontWeight.Bold,
          color = TextPrimary,
          maxLines = 1,
          overflow = TextOverflow.Ellipsis,
        )
        Text(
          text = "${programItems.size} item${if (programItems.size == 1) "" else "s"}",
          style = MaterialTheme.typography.labelSmall,
          color = TextMuted,
        )
      }
      IconButton(onClick = onCloseDrawer, modifier = Modifier.size(32.dp)) {
        Icon(Icons.Rounded.Close, contentDescription = "Close program panel", tint = TextMuted)
      }
    }

    HorizontalDivider(color = BorderSubtle.copy(alpha = 0.6f))

    if (programItems.isEmpty()) {
      Box(
        modifier = Modifier
          .weight(1f)
          .fillMaxWidth()
          .clip(RoundedCornerShape(12.dp))
          .background(BgDark.copy(alpha = 0.5f)),
        contentAlignment = Alignment.Center,
      ) {
        Text(
          text = if (isConnected) "No items in the current program." else "Connect to desktop in Settings to load program items.",
          style = MaterialTheme.typography.bodySmall,
          color = TextMuted,
          textAlign = TextAlign.Center,
          modifier = Modifier.padding(20.dp),
        )
      }
    } else {
      LazyColumn(
        state = listState,
        verticalArrangement = Arrangement.spacedBy(8.dp),
        modifier = Modifier.weight(1f).fillMaxWidth(),
      ) {
        items(programItems, key = { it.id }) { item ->
          val isActive = item.id == activeItemId
          val itemIcon = when (item.type) {
            "verse" -> Icons.Rounded.MenuBook
            "song" -> Icons.Rounded.MusicNote
            "programItem" -> Icons.Rounded.Description
            else -> Icons.Rounded.PresentToAll
          }
          val typeLabel = when (item.type) {
            "verse" -> "Verses"
            "song" -> if (item.lyricsMode == "timed") "Songs \u2022 Audio-Synced" else "Songs"
            "programItem" -> "Docs"
            else -> "Slides"
          }

          Surface(
            onClick = { if (isConnected) onSelectItem(item.id) },
            shape = RoundedCornerShape(10.dp),
            color = if (isActive) Color(0xFF1A2D4D) else CardDark,
            border = BorderStroke(
              width = if (isActive) 1.5.dp else 1.dp,
              color = if (isActive) AccentSky else BorderSubtle.copy(alpha = 0.65f),
            ),
            modifier = Modifier.fillMaxWidth(),
          ) {
            Row(
              modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp, vertical = 11.dp),
              verticalAlignment = Alignment.CenterVertically,
              horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
              Icon(
                imageVector = itemIcon,
                contentDescription = typeLabel,
                tint = if (isActive) AccentSky else TextMuted,
                modifier = Modifier.size(20.dp),
              )
              Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(2.dp),
              ) {
                Text(
                  text = item.title,
                  style = MaterialTheme.typography.bodyMedium,
                  color = TextPrimary,
                  fontWeight = FontWeight.SemiBold,
                  maxLines = 1,
                  overflow = TextOverflow.Ellipsis,
                )
                Text(
                  text = typeLabel,
                  style = MaterialTheme.typography.bodySmall,
                  color = TextMuted,
                  maxLines = 1,
                  overflow = TextOverflow.Ellipsis,
                )
              }
              if (isActive) {
                Surface(
                  shape = RoundedCornerShape(999.dp),
                  color = AccentEmerald.copy(alpha = 0.18f),
                  border = BorderStroke(1.dp, AccentEmerald.copy(alpha = 0.55f)),
                ) {
                  Text(
                    text = "LIVE",
                    style = MaterialTheme.typography.labelSmall,
                    color = AccentEmerald,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp),
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

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun SettingsModalDialog(
  serverInput: String,
  pinInput: String,
  status: ConnectionStatus,
  statusMessage: String?,
  currentOverride: String,
  discoveredServers: List<DiscoveredServer>,
  isDiscovering: Boolean,
  onInputChange: (String) -> Unit,
  onPinChange: (String) -> Unit,
  onConnect: () -> Unit,
  onDisconnect: () -> Unit,
  onScanLan: () -> Unit,
  onSelectServer: (DiscoveredServer) -> Unit,
  onToggleClearText: () -> Unit,
  onToggleBlackout: () -> Unit,
  onToggleLogo: () -> Unit,
  onClearOverride: () -> Unit,
  cacheStats: CacheStats,
  onResyncCache: () -> Unit,
  onClearCache: () -> Unit,
  onDismiss: () -> Unit,
) {
  val keyboardController = LocalSoftwareKeyboardController.current
  val isConnected = status == ConnectionStatus.Connected

  Dialog(
    onDismissRequest = onDismiss,
    properties = DialogProperties(usePlatformDefaultWidth = false),
  ) {
    Surface(
      modifier = Modifier
        .fillMaxWidth(0.92f)
        .padding(vertical = 24.dp),
      shape = RoundedCornerShape(20.dp),
      color = SurfaceDark,
      border = BorderStroke(1.dp, BorderSubtle),
      tonalElevation = 8.dp,
    ) {
      Column(
        modifier = Modifier.padding(18.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
      ) {
        Row(
          modifier = Modifier.fillMaxWidth(),
          horizontalArrangement = Arrangement.SpaceBetween,
          verticalAlignment = Alignment.CenterVertically,
        ) {
          Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
          ) {
            StatusDot(status = status)
            Text(
              text = "Settings",
              style = MaterialTheme.typography.titleMedium,
              fontWeight = FontWeight.Bold,
              color = TextPrimary,
            )
          }
          IconButton(onClick = onDismiss, modifier = Modifier.size(30.dp)) {
            Icon(Icons.Rounded.Close, contentDescription = "Close settings", tint = TextMuted)
          }
        }

        HorizontalDivider(color = BorderSubtle.copy(alpha = 0.6f))

        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
          Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
          ) {
            Text(
              text = "DESKTOP SERVER",
              style = MaterialTheme.typography.labelSmall,
              color = AccentSky,
              fontWeight = FontWeight.Bold,
            )
            OutlinedButton(
              onClick = onScanLan,
              enabled = !isDiscovering,
              contentPadding = PaddingValues(horizontal = 10.dp, vertical = 2.dp),
              border = BorderStroke(1.dp, AccentSky.copy(alpha = 0.5f)),
              colors = ButtonDefaults.outlinedButtonColors(contentColor = AccentSky),
              modifier = Modifier.height(28.dp),
            ) {
              if (isDiscovering) {
                CircularProgressIndicator(
                  modifier = Modifier.size(12.dp),
                  strokeWidth = 2.dp,
                  color = AccentSky,
                )
                Spacer(modifier = Modifier.width(6.dp))
                Text("Scanning...", style = MaterialTheme.typography.labelSmall)
              } else {
                Icon(Icons.Rounded.Search, contentDescription = "Scan LAN", modifier = Modifier.size(14.dp))
                Spacer(modifier = Modifier.width(4.dp))
                Text("Scan LAN", style = MaterialTheme.typography.labelSmall)
              }
            }
          }

          if (discoveredServers.isNotEmpty()) {
            FlowRow(
              horizontalArrangement = Arrangement.spacedBy(6.dp),
              verticalArrangement = Arrangement.spacedBy(6.dp),
              modifier = Modifier.fillMaxWidth(),
            ) {
              discoveredServers.forEach { server ->
                Surface(
                  onClick = {
                    keyboardController?.hide()
                    onSelectServer(server)
                  },
                  shape = RoundedCornerShape(999.dp),
                  color = AccentSky.copy(alpha = 0.14f),
                  border = BorderStroke(1.dp, AccentSky.copy(alpha = 0.45f)),
                ) {
                  Text(
                    text = "${server.name} (${server.host}:${server.wsPort})",
                    style = MaterialTheme.typography.labelSmall,
                    color = AccentSky,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                  )
                }
              }
            }
          }

          Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
          ) {
            OutlinedTextField(
              value = serverInput,
              onValueChange = onInputChange,
              modifier = Modifier.weight(1f),
              singleLine = true,
              placeholder = {
                Text(
                  text = "192.168.1.50:4850",
                  color = TextMuted.copy(alpha = 0.6f),
                  style = MaterialTheme.typography.bodySmall,
                )
              },
              keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
              keyboardActions = KeyboardActions(
                onDone = {
                  keyboardController?.hide()
                  onConnect()
                },
              ),
              colors = OutlinedTextFieldDefaults.colors(
                focusedTextColor = TextPrimary,
                unfocusedTextColor = TextPrimary,
                focusedBorderColor = AccentSky,
                unfocusedBorderColor = BorderSubtle,
                cursorColor = AccentSky,
              ),
            )

            if (status == ConnectionStatus.Connected || status == ConnectionStatus.Connecting) {
              OutlinedButton(
                onClick = onDisconnect,
                border = BorderStroke(1.dp, AccentRose.copy(alpha = 0.6f)),
                colors = ButtonDefaults.outlinedButtonColors(contentColor = AccentRose),
              ) {
                Text("Stop")
              }
            } else {
              Button(
                onClick = {
                  keyboardController?.hide()
                  onConnect()
                },
                colors = ButtonDefaults.buttonColors(
                  containerColor = AccentSky,
                  contentColor = BgDark,
                ),
              ) {
                Text("Connect", fontWeight = FontWeight.Bold)
              }
            }
          }

            if (!statusMessage.isNullOrBlank()) {
            Text(
              text = statusMessage,
              style = MaterialTheme.typography.bodySmall,
              color = when (status) {
                ConnectionStatus.Error -> AccentRose
                ConnectionStatus.Connected -> AccentEmerald
                else -> TextMuted
              },
            )
          }

          OutlinedTextField(
            value = pinInput,
            onValueChange = onPinChange,
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            label = { Text("Remote Control PIN", color = TextMuted) },
            placeholder = {
              Text(
                text = "6-digit PIN from desktop",
                color = TextMuted.copy(alpha = 0.6f),
                style = MaterialTheme.typography.bodySmall,
              )
            },
            colors = OutlinedTextFieldDefaults.colors(
              focusedTextColor = TextPrimary,
              unfocusedTextColor = TextPrimary,
              focusedBorderColor = AccentSky,
              unfocusedBorderColor = BorderSubtle,
              cursorColor = AccentSky,
            ),
          )
        }

        HorizontalDivider(color = BorderSubtle.copy(alpha = 0.6f))

        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
          Text(
            text = "SCREEN OVERRIDES",
            style = MaterialTheme.typography.labelSmall,
            color = AccentSky,
            fontWeight = FontWeight.Bold,
          )
          Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
          ) {
            OverrideButton(
              label = "Clear",
              icon = Icons.Rounded.SubtitlesOff,
              active = currentOverride == "clearText",
              activeColor = AccentAmber,
              enabled = isConnected,
              onClick = onToggleClearText,
              modifier = Modifier.weight(1f),
            )
            OverrideButton(
              label = "Blackout",
              icon = Icons.Rounded.VisibilityOff,
              active = currentOverride == "blackout",
              activeColor = AccentRose,
              enabled = isConnected,
              onClick = onToggleBlackout,
              modifier = Modifier.weight(1f),
            )
            OverrideButton(
              label = "Logo",
              icon = Icons.Rounded.Image,
              active = currentOverride == "showLogo",
              activeColor = AccentSky,
              enabled = isConnected,
              onClick = onToggleLogo,
              modifier = Modifier.weight(1f),
            )
          }
          if (currentOverride != "none") {
            FilledTonalButton(
              onClick = onClearOverride,
              enabled = isConnected,
              modifier = Modifier.fillMaxWidth(),
              colors = ButtonDefaults.filledTonalButtonColors(
                containerColor = AccentEmerald.copy(alpha = 0.2f),
                contentColor = AccentEmerald,
              ),
            ) {
              Icon(Icons.Rounded.ClearAll, contentDescription = null, modifier = Modifier.size(18.dp))
              Spacer(modifier = Modifier.width(6.dp))
              Text("Restore Live Screen", fontWeight = FontWeight.SemiBold)
            }
          }
        }

        HorizontalDivider(color = BorderSubtle.copy(alpha = 0.6f))

        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
          Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
          ) {
            Column(modifier = Modifier.weight(1f)) {
              Text(
                text = "OFFLINE CACHE",
                style = MaterialTheme.typography.labelSmall,
                color = AccentSky,
                fontWeight = FontWeight.Bold,
              )
              val formattedSize = when {
                cacheStats.totalBytes >= 1024L * 1024L ->
                  String.format("%.1f MB", cacheStats.totalBytes / (1024.0 * 1024.0))
                cacheStats.totalBytes >= 1024L ->
                  String.format("%.0f KB", cacheStats.totalBytes / 1024.0)
                else -> "${cacheStats.totalBytes} B"
              }
              val summaryText = when {
                cacheStats.isSyncing -> "Syncing program & visual media..."
                cacheStats.version > 0 -> {
                  val progLabel = cacheStats.programName.ifBlank { "Program" }
                  "$progLabel (v${cacheStats.version}) • ${cacheStats.itemCount} items • ${cacheStats.mediaFileCount} media • $formattedSize"
                }
                else -> "Not synced yet"
              }
              Text(
                text = summaryText,
                style = MaterialTheme.typography.bodySmall,
                color = if (cacheStats.isSyncing) AccentSky else TextMuted,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
              )
            }
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
              if (isConnected) {
                OutlinedButton(
                  onClick = onResyncCache,
                  enabled = !cacheStats.isSyncing,
                  contentPadding = PaddingValues(horizontal = 10.dp, vertical = 2.dp),
                  border = BorderStroke(1.dp, BorderSubtle),
                ) {
                  Text("Sync", style = MaterialTheme.typography.labelSmall, color = AccentSky)
                }
              }
              OutlinedButton(
                onClick = onClearCache,
                enabled = cacheStats.totalBytes > 0L && !cacheStats.isSyncing,
                contentPadding = PaddingValues(horizontal = 10.dp, vertical = 2.dp),
                border = BorderStroke(1.dp, BorderSubtle),
              ) {
                Text("Clear", style = MaterialTheme.typography.labelSmall, color = TextMuted)
              }
            }
          }
        }
      }
    }
  }
}

@Composable
private fun CornerNavButton(
  label: String,
  icon: ImageVector,
  iconFirst: Boolean,
  enabled: Boolean,
  accent: Boolean,
  onClick: () -> Unit,
  modifier: Modifier = Modifier,
) {
  val containerColor = when {
    !enabled -> Color.Black.copy(alpha = 0.25f)
    accent -> AccentSky.copy(alpha = 0.88f)
    else -> Color.Black.copy(alpha = 0.56f)
  }
  val contentColor = when {
    !enabled -> TextMuted.copy(alpha = 0.45f)
    accent -> BgDark
    else -> TextPrimary
  }
  val borderColor = when {
    !enabled -> Color.White.copy(alpha = 0.08f)
    accent -> AccentSky
    else -> Color.White.copy(alpha = 0.2f)
  }

  Surface(
    onClick = { if (enabled) onClick() },
    modifier = modifier.height(54.dp),
    shape = RoundedCornerShape(16.dp),
    color = containerColor,
    border = BorderStroke(1.dp, borderColor),
    shadowElevation = if (enabled) 6.dp else 0.dp,
  ) {
    Row(
      modifier = Modifier.padding(horizontal = 18.dp),
      verticalAlignment = Alignment.CenterVertically,
      horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
      if (iconFirst) {
        Icon(icon, contentDescription = label, tint = contentColor, modifier = Modifier.size(20.dp))
      }
      Text(
        text = label,
        color = contentColor,
        fontWeight = FontWeight.ExtraBold,
        fontSize = 15.sp,
        letterSpacing = 0.5.sp,
      )
      if (!iconFirst) {
        Icon(icon, contentDescription = label, tint = contentColor, modifier = Modifier.size(20.dp))
      }
    }
  }
}

@Composable
private fun AudioControlBar(
  isPlaying: Boolean,
  volume: Float,
  onTogglePlay: () -> Unit,
  onStop: () -> Unit,
  onRestart: () -> Unit,
  onVolumeChange: (Float) -> Unit,
  modifier: Modifier = Modifier,
) {
  var sliderValue by remember { mutableStateOf(volume.coerceIn(0f, 1f)) }
  var isDragging by remember { mutableStateOf(false) }

  LaunchedEffect(volume) {
    if (!isDragging) {
      sliderValue = volume.coerceIn(0f, 1f)
    }
  }

  Surface(
    modifier = modifier.height(54.dp),
    shape = RoundedCornerShape(16.dp),
    color = Color.Black.copy(alpha = 0.56f),
    border = BorderStroke(1.dp, Color.White.copy(alpha = 0.2f)),
    shadowElevation = 6.dp,
  ) {
    Row(
      modifier = Modifier.padding(horizontal = 6.dp),
      verticalAlignment = Alignment.CenterVertically,
      horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
      // Play / Pause
      Surface(
        onClick = onTogglePlay,
        shape = RoundedCornerShape(12.dp),
        color = if (isPlaying) AccentSky.copy(alpha = 0.88f) else Color.White.copy(alpha = 0.12f),
        modifier = Modifier.size(40.dp),
      ) {
        Box(contentAlignment = Alignment.Center) {
          Icon(
            imageVector = if (isPlaying) Icons.Rounded.Pause else Icons.Rounded.PlayArrow,
            contentDescription = if (isPlaying) "Pause" else "Play",
            tint = if (isPlaying) BgDark else TextPrimary,
            modifier = Modifier.size(22.dp),
          )
        }
      }

      // Stop
      Surface(
        onClick = onStop,
        shape = RoundedCornerShape(12.dp),
        color = Color.Transparent,
        modifier = Modifier.size(40.dp),
      ) {
        Box(contentAlignment = Alignment.Center) {
          Icon(
            imageVector = Icons.Rounded.Stop,
            contentDescription = "Stop",
            tint = TextPrimary,
            modifier = Modifier.size(22.dp),
          )
        }
      }

      // Restart
      Surface(
        onClick = onRestart,
        shape = RoundedCornerShape(12.dp),
        color = Color.Transparent,
        modifier = Modifier.size(40.dp),
      ) {
        Box(contentAlignment = Alignment.Center) {
          Icon(
            imageVector = Icons.Rounded.Replay,
            contentDescription = "Restart",
            tint = TextPrimary,
            modifier = Modifier.size(20.dp),
          )
        }
      }

      Box(
        modifier = Modifier
          .padding(horizontal = 2.dp)
          .width(1.dp)
          .height(24.dp)
          .background(Color.White.copy(alpha = 0.16f)),
      )

      // Volume Slider on the right of Restart
      Row(
        modifier = Modifier.padding(start = 4.dp, end = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp),
      ) {
        Icon(
          imageVector = if (sliderValue <= 0.01f) {
            Icons.AutoMirrored.Rounded.VolumeOff
          } else {
            Icons.AutoMirrored.Rounded.VolumeUp
          },
          contentDescription = "Volume",
          tint = TextPrimary,
          modifier = Modifier.size(18.dp),
        )
        Slider(
          value = sliderValue,
          onValueChange = { next ->
            isDragging = true
            sliderValue = next
            onVolumeChange(next)
          },
          onValueChangeFinished = {
            isDragging = false
            onVolumeChange(sliderValue)
          },
          valueRange = 0f..1f,
          colors = SliderDefaults.colors(
            thumbColor = AccentSky,
            activeTrackColor = AccentSky,
            inactiveTrackColor = Color.White.copy(alpha = 0.24f),
          ),
          modifier = Modifier.width(88.dp),
        )
      }
    }
  }
}

@Composable
private fun StatusDot(status: ConnectionStatus) {
  val color = when (status) {
    ConnectionStatus.Connected -> AccentEmerald
    ConnectionStatus.Connecting -> AccentAmber
    ConnectionStatus.Error -> AccentRose
    ConnectionStatus.Disconnected -> TextMuted
  }
  Box(
    modifier = Modifier
      .size(8.dp)
      .clip(CircleShape)
      .background(color),
  )
}

@Composable
private fun OverrideButton(
  label: String,
  icon: ImageVector,
  active: Boolean,
  activeColor: Color,
  enabled: Boolean,
  onClick: () -> Unit,
  modifier: Modifier = Modifier,
) {
  Surface(
    onClick = { if (enabled) onClick() },
    modifier = modifier.height(42.dp),
    shape = RoundedCornerShape(10.dp),
    color = if (active) activeColor.copy(alpha = 0.22f) else CardDark,
    border = BorderStroke(1.dp, if (active) activeColor else BorderSubtle),
  ) {
    Row(
      modifier = Modifier.padding(horizontal = 6.dp),
      verticalAlignment = Alignment.CenterVertically,
      horizontalArrangement = Arrangement.Center,
    ) {
      Icon(
        imageVector = icon,
        contentDescription = label,
        tint = if (active) activeColor else TextMuted,
        modifier = Modifier.size(15.dp),
      )
      Spacer(modifier = Modifier.width(4.dp))
      Text(
        text = label,
        style = MaterialTheme.typography.labelSmall,
        color = if (active) activeColor else TextPrimary,
        fontWeight = if (active) FontWeight.Bold else FontWeight.Medium,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
      )
    }
  }
}

// Constant JS snippet that instructs the WebView to pull and JSON.parse the latest state
// from AndroidPresenterBridge.getLatestState(), avoiding multi-MB string concatenation on
// the Android Main Thread and avoiding V8 compiling large JSON payloads as JS AST expressions.
private const val PULL_LIVE_STATE_JS =
  "if (window.__pullAndroidLiveState) { window.__pullAndroidLiveState(); } " +
    "else if (window.__setAndroidLiveState && window.AndroidPresenterBridge) { " +
    "try { var s = window.AndroidPresenterBridge.getLatestState(); if (s) window.__setAndroidLiveState(JSON.parse(s)); } catch (e) {} }"

@SuppressLint("SetJavaScriptEnabled")
@Composable
private fun ExactMainScreenWebView(
  url: String,
  liveStateJsonFlow: StateFlow<String?>,
  audioTimeSyncFlow: StateFlow<AudioTimeSync?>,
  connectionStatus: ConnectionStatus,
  openCachedMedia: (String) -> WebResourceResponse?,
  modifier: Modifier = Modifier,
) {
  // Collecting liveStateJson and audioTimeSync inside ExactMainScreenWebView scopes
  // 10Hz audio time updates strictly to this leaf composable instead of recomposing MainScreen.
  val liveStateJson by liveStateJsonFlow.collectAsStateWithLifecycle()
  val audioTimeSync by audioTimeSyncFlow.collectAsStateWithLifecycle()

  var webViewRef by remember { mutableStateOf<WebView?>(null) }
  var loadedInputUrl by remember { mutableStateOf<String?>(null) }
  var hadLoadError by remember { mutableStateOf(false) }
  // Incremented if the system ever reclaims the WebView sandboxed renderer process so
  // Compose cleanly mounts a fresh WebView instance instead of crashing the host app.
  var webViewGeneration by remember { mutableIntStateOf(0) }
  val latestJson by rememberUpdatedState(liveStateJson)

  // Only fires on structural state changes (e.g., new song/slide/override), not on 10Hz audio ticks.
  LaunchedEffect(liveStateJson, webViewRef) {
    if (liveStateJson == null) return@LaunchedEffect
    val wv = webViewRef ?: return@LaunchedEffect
    wv.evaluateJavascript(PULL_LIVE_STATE_JS, null)
  }

  // Lightweight ~75-byte JS call for 10Hz audio playback clock & block index ticks during timed lyrics.
  LaunchedEffect(audioTimeSync, webViewRef) {
    val sync = audioTimeSync ?: return@LaunchedEffect
    val wv = webViewRef ?: return@LaunchedEffect
    val timeArg = sync.timeSec?.toString() ?: "null"
    val blockArg = sync.activeBlockIndex?.toString() ?: "null"
    wv.evaluateJavascript(
      "window.__setAndroidAudioTime && window.__setAndroidAudioTime($timeArg, $blockArg);",
      null,
    )
  }

  LaunchedEffect(connectionStatus, hadLoadError, webViewRef) {
    if (connectionStatus == ConnectionStatus.Connected && hadLoadError) {
      hadLoadError = false
      webViewRef?.loadUrl(url)
    }
  }

  key(webViewGeneration) {
    AndroidView(
      modifier = modifier.fillMaxSize(),
      factory = { context ->
        WebView(context).apply {
          layoutParams = ViewGroup.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT,
          )
          setBackgroundColor(android.graphics.Color.BLACK)
          settings.javaScriptEnabled = true
          settings.domStorageEnabled = true
          settings.mediaPlaybackRequiresUserGesture = false
          settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
          settings.allowFileAccess = false
          settings.allowContentAccess = false
          addJavascriptInterface(
            object {
              @JavascriptInterface
              fun getLatestState(): String? = latestJson
            },
            "AndroidPresenterBridge",
          )
          webChromeClient = WebChromeClient()
          webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(
              view: WebView?,
              request: WebResourceRequest?,
            ): WebResourceResponse? {
              val reqUrl = request?.url?.toString() ?: return null
              return openCachedMedia(reqUrl) ?: super.shouldInterceptRequest(view, request)
            }

            override fun shouldOverrideUrlLoading(
              view: WebView?,
              request: WebResourceRequest?,
            ): Boolean {
              val targetUri = request?.url ?: return true
              val allowedUri = runCatching { android.net.Uri.parse(loadedInputUrl ?: url) }.getOrNull()
                ?: return true
              val sameOrigin =
                targetUri.scheme == allowedUri.scheme &&
                  targetUri.host == allowedUri.host &&
                  targetUri.port == allowedUri.port
              return !sameOrigin
            }

            override fun onReceivedError(
              view: WebView?,
              request: WebResourceRequest?,
              error: WebResourceError?,
            ) {
              if (request?.isForMainFrame == true) {
                hadLoadError = true
              }
            }

            override fun onPageFinished(view: WebView?, loadedUrl: String?) {
              if (latestJson == null) return
              view?.evaluateJavascript(PULL_LIVE_STATE_JS, null)
            }

            // Intercept renderer process termination (e.g., OOM or WebView APK update) and
            // return true so Chromium does not terminate the Android host process.
            override fun onRenderProcessGone(
              view: WebView?,
              detail: RenderProcessGoneDetail?,
            ): Boolean {
              if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                runCatching {
                  (view?.parent as? ViewGroup)?.removeView(view)
                  view?.destroy()
                }
                if (webViewRef === view) {
                  webViewRef = null
                }
                loadedInputUrl = null
                webViewGeneration += 1
              }
              return true
            }
          }
          loadedInputUrl = url
          loadUrl(url)
          webViewRef = this
        }
      },
      update = { wv ->
        if (loadedInputUrl != url) {
          loadedInputUrl = url
          hadLoadError = false
          wv.loadUrl(url)
        }
        webViewRef = wv
      },
    )
  }
}

@Composable
private fun MainScreenMirrorContent(
  liveState: LiveState?,
  liveStateJsonFlow: StateFlow<String?>,
  audioTimeSyncFlow: StateFlow<AudioTimeSync?>,
  mirrorHttpUrl: String?,
  connectionStatus: ConnectionStatus,
  statusMessage: String?,
  serverInput: String,
  isDiscovering: Boolean,
  openCachedMedia: (String) -> WebResourceResponse?,
  onOpenSettings: () -> Unit,
) {
  val isWaitingForPresentation =
    liveState == null || (liveState.activeItem == null && liveState.override == "none")

  if (connectionStatus == ConnectionStatus.Connected && !mirrorHttpUrl.isNullOrBlank() && !isWaitingForPresentation) {
    ExactMainScreenWebView(
      url = mirrorHttpUrl,
      liveStateJsonFlow = liveStateJsonFlow,
      audioTimeSyncFlow = audioTimeSyncFlow,
      connectionStatus = connectionStatus,
      openCachedMedia = openCachedMedia,
    )
    return
  }

  Box(
    modifier = Modifier
      .fillMaxSize()
      .background(Brush.verticalGradient(listOf(Color(0xFF0A1120), Color(0xFF050811))))
      .padding(horizontal = 28.dp, vertical = 24.dp),
    contentAlignment = Alignment.Center,
  ) {
    Column(
      horizontalAlignment = Alignment.CenterHorizontally,
      verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
      Image(
        painter = painterResource(id = R.drawable.uecfi_logo),
        contentDescription = "UECFI Logo",
        contentScale = ContentScale.Fit,
        modifier = Modifier.size(164.dp),
      )

      val headline = when {
        connectionStatus == ConnectionStatus.Connected -> "Waiting for presentation to start..."
        connectionStatus == ConnectionStatus.Connecting -> "Connecting to desktop presenter..."
        isDiscovering -> "Scanning LAN for desktop presenter..."
        connectionStatus == ConnectionStatus.Error -> "Connection lost — retrying..."
        else -> "Not connected to desktop"
      }

      Text(
        text = headline,
        color = TextPrimary,
        style = MaterialTheme.typography.titleMedium,
        fontWeight = FontWeight.SemiBold,
        textAlign = TextAlign.Center,
      )

      val detail = when {
        connectionStatus == ConnectionStatus.Connected && !liveState?.programName.isNullOrBlank() ->
          "Program: ${liveState?.programName}"
        !statusMessage.isNullOrBlank() -> statusMessage
        serverInput.isNotBlank() -> "Server: $serverInput"
        else -> "Ensure device and desktop are on the same Wi-Fi"
      }

      Text(
        text = detail,
        color = TextMuted,
        style = MaterialTheme.typography.bodySmall,
        textAlign = TextAlign.Center,
      )

      if (connectionStatus != ConnectionStatus.Connected) {
        OutlinedButton(
          onClick = onOpenSettings,
          border = BorderStroke(1.dp, AccentSky.copy(alpha = 0.6f)),
          colors = ButtonDefaults.outlinedButtonColors(contentColor = AccentSky),
        ) {
          Text("Open Settings")
        }
      }
    }
  }
}

@Composable
private fun RenderBlockLines(
  block: SlideBlock,
  isTimed: Boolean,
  audioTimeSec: Double?,
) {
  if (!isTimed || block.lineTimingsSec.isNullOrEmpty() || audioTimeSec == null) {
    Text(
      text = block.lines.joinToString("\n"),
      color = TextPrimary,
      fontSize = 28.sp,
      lineHeight = 38.sp,
      fontWeight = FontWeight.SemiBold,
      textAlign = TextAlign.Center,
    )
    return
  }

  val timings = block.lineTimingsSec
  var activeLineIdx = -1
  for (i in block.lines.indices) {
    val t = timings.getOrNull(i)
    if (t != null && audioTimeSec >= t) {
      activeLineIdx = i
    }
  }

  Column(
    horizontalAlignment = Alignment.CenterHorizontally,
    verticalArrangement = Arrangement.spacedBy(8.dp),
  ) {
    block.lines.forEachIndexed { idx, line ->
      val isCurrent = idx == activeLineIdx
      Text(
        text = line,
        color = if (isCurrent) AccentSky else TextPrimary.copy(alpha = 0.65f),
        fontSize = if (isCurrent) 29.sp else 24.sp,
        fontWeight = if (isCurrent) FontWeight.Bold else FontWeight.Medium,
        textAlign = TextAlign.Center,
      )
    }
  }
}
