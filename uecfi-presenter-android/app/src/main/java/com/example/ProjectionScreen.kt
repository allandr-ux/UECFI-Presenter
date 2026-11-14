package com.example

import android.annotation.SuppressLint
import android.graphics.Color as AndroidColor
import android.view.View
import android.view.ViewGroup
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.focusable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material.icons.outlined.TvOff
import androidx.compose.material.icons.outlined.WifiFind
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.scale
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.positionChange
import androidx.compose.ui.input.pointer.util.VelocityTracker
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.ui.theme.ErrorRed
import com.example.ui.theme.ObsidianBorder
import com.example.ui.theme.ObsidianCard
import com.example.ui.theme.ObsidianSurface
import com.example.ui.theme.PresenterCyan
import com.example.ui.theme.PresenterGold
import com.example.ui.theme.PureBlack
import com.example.ui.theme.TextMuted
import com.example.ui.theme.TextPrimary
import com.example.ui.theme.TextSecondary
import kotlin.math.abs

private const val VIRTUAL_W = 1920
private const val VIRTUAL_H = 1080

@Composable
fun ProjectionScreen(
    viewModel: MainViewModel = viewModel(),
    isTvDevice: Boolean = false,
    onReapplyImmersiveMode: () -> Unit = {}
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val focusManager = LocalFocusManager.current
    val stageFocusRequester = remember { FocusRequester() }

    var webViewRef by remember { mutableStateOf<WebView?>(null) }
    var isPageLoaded by remember { mutableStateOf(false) }
    var lastInjectedJson by remember { mutableStateOf<String?>(null) }
    var lastSyncedVersion by remember { mutableIntStateOf(0) }
    var isSidePanelOpen by remember { mutableStateOf(false) }

    // Whenever the app transitions to CONNECTED or dismisses the manual dialog,
    // clear text input focus, return D-Pad focus to the stage, and re-apply immersive sticky mode.
    LaunchedEffect(uiState.status, uiState.showManualFallback) {
        if (uiState.status != ConnectionStatus.CONNECTED || uiState.showManualFallback || isTvDevice) {
            isSidePanelOpen = false
        }
        if (uiState.status == ConnectionStatus.CONNECTED && !uiState.showManualFallback) {
            focusManager.clearFocus()
            onReapplyImmersiveMode()
            try {
                stageFocusRequester.requestFocus()
            } catch (_: Exception) {
            }
        } else if (!uiState.showManualFallback) {
            focusManager.clearFocus()
            onReapplyImmersiveMode()
        }
    }

    // Inject state into the WebView whenever the 1920x1080-normalized JSON changes
    // or when the page finishes loading.
    val presenterState = uiState.presenterState
    LaunchedEffect(presenterState?.forced16x9Json, isPageLoaded, webViewRef, uiState.webViewSyncVersion) {
        val wv = webViewRef ?: return@LaunchedEffect
        val st = presenterState ?: return@LaunchedEffect
        if (!isPageLoaded) return@LaunchedEffect

        if (st.live && (st.forced16x9Json != lastInjectedJson || lastSyncedVersion != uiState.webViewSyncVersion)) {
            val forceUpdate = lastSyncedVersion != uiState.webViewSyncVersion
            lastInjectedJson = st.forced16x9Json
            lastSyncedVersion = uiState.webViewSyncVersion
            inject16x9PreviewState(wv, st.forced16x9Json, forceUpdate = forceUpdate)
        }
    }

    // Gesture parameters
    val density = LocalDensity.current
    val minSwipeDistancePx = remember(density) { with(density) { 60.dp.toPx() } }
    val currentStatus by rememberUpdatedState(uiState.status)
    val currentShowManual by rememberUpdatedState(uiState.showManualFallback)

    // Root pure-black (#000000) full-screen stage
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(PureBlack)
            .onPreviewKeyEvent { keyEvent ->
                val isVolumeKey = keyEvent.key == Key.VolumeUp || keyEvent.key == Key.VolumeDown
                if (isVolumeKey &&
                    currentStatus == ConnectionStatus.CONNECTED &&
                    !currentShowManual
                ) {
                    if (keyEvent.type == KeyEventType.KeyDown && keyEvent.nativeKeyEvent.repeatCount == 0) {
                        if (keyEvent.key == Key.VolumeUp) {
                            viewModel.sendSlideSwipeCommand(SlideCommand.NEXT)
                        } else {
                            viewModel.sendSlideSwipeCommand(SlideCommand.PREVIOUS)
                        }
                    }
                    return@onPreviewKeyEvent true
                }
                if (keyEvent.type != KeyEventType.KeyDown) {
                    return@onPreviewKeyEvent false
                }
                when (keyEvent.key) {
                    Key.Menu, Key.Settings -> {
                        if (!uiState.showManualFallback) {
                            viewModel.openManualConnection()
                            true
                        } else {
                            false
                        }
                    }
                    Key.Back -> {
                        if (uiState.showManualFallback && uiState.status == ConnectionStatus.CONNECTED) {
                            viewModel.dismissManualConnection()
                            true
                        } else {
                            false
                        }
                    }
                    else -> false
                }
            }
            .testTag("projection_root_stage"),
        contentAlignment = Alignment.Center
    ) {
        val isOffAir = uiState.activeHost != null &&
            presenterState != null &&
            !presenterState.live &&
            !uiState.showManualFallback

        // 1. Strict 16:9 Projection Preview Container (centered with pure black letterboxing/pillarboxing)
        Box(
            modifier = Modifier
                .aspectRatio(16f / 9f)
                .fillMaxSize()
                .background(PureBlack)
                .testTag("projection_16x9_container"),
            contentAlignment = Alignment.Center
        ) {
            val host = uiState.activeHost
            if (host != null) {
                val targetUrl = "http://$host:${uiState.activePort}/presentation.htm"
                ProjectionWebView(
                    targetUrl = targetUrl,
                    syncVersion = uiState.webViewSyncVersion,
                    onWebViewCreated = { wv -> webViewRef = wv },
                    onPageStarted = {
                        isPageLoaded = false
                        lastInjectedJson = null
                    },
                    onPageLoaded = {
                        isPageLoaded = true
                        lastInjectedJson = null // Force fresh state injection upon reload/reconnect
                        uiState.presenterState?.let { st ->
                            if (st.live) {
                                webViewRef?.let { wv ->
                                    inject16x9PreviewState(wv, st.forced16x9Json, forceUpdate = true)
                                    lastInjectedJson = st.forced16x9Json
                                    lastSyncedVersion = uiState.webViewSyncVersion
                                }
                            }
                        }
                    }
                )
            }

            // Cover preview with minimal dark "OFF AIR" state on #000000 when live == false
            if (isOffAir) {
                OffAirOverlay()
            }
        }

        // 2. Full-screen transparent touch/gesture & TV D-Pad overlay above WebView
        // Intercepts all touches so WebView never receives accidental clicks on #presentationContent,
        // detects horizontal swipes (Left = Next Slide, Right = Previous Slide),
        // and handles TV remote D-Pad Left/Right/Page/Media keys for slide navigation.
        if (!uiState.showManualFallback) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .focusRequester(stageFocusRequester)
                    .focusable()
                    .onPreviewKeyEvent { keyEvent ->
                        if (keyEvent.type != KeyEventType.KeyDown ||
                            currentStatus != ConnectionStatus.CONNECTED ||
                            currentShowManual
                        ) {
                            return@onPreviewKeyEvent false
                        }
                        when (keyEvent.key) {
                            Key.DirectionRight, Key.PageDown, Key.MediaNext, Key.ChannelUp -> {
                                viewModel.sendSlideSwipeCommand(SlideCommand.NEXT)
                                true
                            }
                            Key.DirectionLeft, Key.PageUp, Key.MediaPrevious, Key.ChannelDown -> {
                                viewModel.sendSlideSwipeCommand(SlideCommand.PREVIOUS)
                                true
                            }
                            else -> false
                        }
                    }
                    .testTag("swipe_gesture_overlay")
                    .pointerInput(minSwipeDistancePx) {
                        awaitEachGesture {
                            val down = awaitFirstDown(requireUnconsumed = true)
                            down.consume()

                            val velocityTracker = VelocityTracker()
                            velocityTracker.addPosition(down.uptimeMillis, down.position)

                            var totalDx = 0f
                            var totalDy = 0f
                            var pointerId = down.id

                            while (true) {
                                val event = awaitPointerEvent()
                                val change = event.changes.firstOrNull { it.id == pointerId }
                                    ?: event.changes.firstOrNull()
                                    ?: break

                                pointerId = change.id
                                velocityTracker.addPosition(change.uptimeMillis, change.position)

                                val delta = change.positionChange()
                                totalDx += delta.x
                                totalDy += delta.y
                                change.consume()

                                if (!change.pressed) {
                                    break
                                }
                            }

                            val velocity = velocityTracker.calculateVelocity()
                            val absDx = abs(totalDx)
                            val absDy = abs(totalDy)
                            val isHorizontalSwipe = absDx >= minSwipeDistancePx &&
                                absDx > (absDy * 1.5f) &&
                                (abs(velocity.x) >= abs(velocity.y) || absDx >= minSwipeDistancePx * 1.3f)

                            if (isHorizontalSwipe &&
                                currentStatus == ConnectionStatus.CONNECTED &&
                                !currentShowManual
                            ) {
                                if (totalDx < 0f) {
                                    // Swipe Left (right-to-left) -> Next Slide (command=2)
                                    viewModel.sendSlideSwipeCommand(SlideCommand.NEXT)
                                } else if (totalDx > 0f) {
                                    // Swipe Right (left-to-right) -> Previous Slide (command=3)
                                    viewModel.sendSlideSwipeCommand(SlideCommand.PREVIOUS)
                                }
                            }
                        }
                    }
            )
        }

        // 3. Minimal Searching Indicator (during initial 4-second discovery window before manual overlay)
        AnimatedVisibility(
            visible = uiState.status != ConnectionStatus.CONNECTED &&
                !uiState.showManualFallback &&
                uiState.activeHost == null,
            enter = fadeIn(),
            exit = fadeOut()
        ) {
            SearchingIndicator()
        }

        // 4. Non-Blocking Manual IP / Port Fallback Dialog
        // Shown after 4 seconds of searching/reconnecting (or via TV Menu/Settings key);
        // automatically dismissed the instant the continuous background reconnection loop detects the server!
        AnimatedVisibility(
            visible = uiState.showManualFallback,
            enter = fadeIn(),
            exit = fadeOut()
        ) {
            val errorTemplate = stringResource(R.string.connection_failed_error)
            val errorText = if (uiState.manualErrorHost != null && uiState.manualErrorPort != null) {
                String.format(errorTemplate, uiState.manualErrorHost, uiState.manualErrorPort)
            } else {
                null
            }

            ManualConnectionFallbackCard(
                hostInput = uiState.manualHostInput,
                portInput = uiState.manualPortInput,
                isConnecting = uiState.isManualConnecting,
                errorMessage = errorText,
                isTvDevice = isTvDevice,
                onHostChange = viewModel::updateManualHostInput,
                onPortChange = viewModel::updateManualPortInput,
                onConnectClick = {
                    focusManager.clearFocus()
                    viewModel.connectManually()
                },
                onRetryAutoDetectClick = {
                    focusManager.clearFocus()
                    onReapplyImmersiveMode()
                    viewModel.retryAutoDetect()
                }
            )
        }

        // 5. Attention Active Notice on Church Projector (shown on non-TV speaker remotes when attention screen is on)
        AnimatedVisibility(
            visible = !isTvDevice &&
                presenterState?.attentionActive == true &&
                !isOffAir &&
                !uiState.showManualFallback,
            enter = fadeIn(),
            exit = fadeOut(),
            modifier = Modifier
                .align(Alignment.TopEnd)
                .padding(
                    top = if (isTvDevice) 28.dp else 16.dp,
                    end = if (isTvDevice) 28.dp else 68.dp
                )
        ) {
            AttentionNoticeBadge()
        }

        // 6. Dedicated Navigation Controls (for Bible verses OR any multi-slide item)
        // Hidden on Android TV / Google TV so the TV projection remains clean and distraction-free.
        val isConnected = uiState.status == ConnectionStatus.CONNECTED
        val isLive = presenterState?.live == true
        val isVerse = presenterState?.isVerse == true
        val isMultiSlide = isLive && (presenterState?.last ?: 0) > 0
        val showNavControls = !isTvDevice && isConnected && !uiState.showManualFallback && (isVerse || isMultiSlide || !isLive)

        AnimatedVisibility(
            visible = showNavControls,
            enter = fadeIn(),
            exit = fadeOut(),
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
        ) {
            VerseNavigationControls(
                isNavActive = isLive && (isVerse || isMultiSlide),
                isVerse = isVerse || !isLive,
                isNavigating = uiState.isNavigating,
                canPrev = presenterState?.canPrev != false,
                canNext = presenterState?.canNext != false,
                isTvDevice = isTvDevice,
                onPrevClick = {
                    if (isVerse) {
                        viewModel.sendVerseCommand(VerseCommand.PREVIOUS)
                    } else {
                        viewModel.sendSlideSwipeCommand(SlideCommand.PREVIOUS)
                    }
                },
                onNextClick = {
                    if (isVerse) {
                        viewModel.sendVerseCommand(VerseCommand.NEXT)
                    } else {
                        viewModel.sendSlideSwipeCommand(SlideCommand.NEXT)
                    }
                }
            )
        }

        // 7. Non-TV Pop-Out Side Panel for Custom Speaker Remote Buttons (`/api/buttons`)
        if (!isTvDevice && isConnected && !uiState.showManualFallback) {
            // Top-right hamburger menu trigger button
            AnimatedVisibility(
                visible = !isSidePanelOpen,
                enter = fadeIn(),
                exit = fadeOut(),
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .padding(16.dp)
            ) {
                Surface(
                    onClick = {
                        viewModel.refreshCustomButtons()
                        isSidePanelOpen = true
                    },
                    shape = CircleShape,
                    color = ObsidianSurface.copy(alpha = 0.88f),
                    border = BorderStroke(1.dp, PresenterCyan.copy(alpha = 0.55f)),
                    modifier = Modifier
                        .size(42.dp)
                        .testTag("quick_buttons_handle")
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(
                            imageVector = Icons.Filled.Menu,
                            contentDescription = stringResource(R.string.quick_buttons),
                            tint = PresenterCyan,
                            modifier = Modifier.size(20.dp)
                        )
                    }
                }
            }

            // Scrim to dismiss side panel when tapping outside
            if (isSidePanelOpen) {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(PureBlack.copy(alpha = 0.45f))
                        .clickable(
                            interactionSource = remember { MutableInteractionSource() },
                            indication = null,
                            onClick = { isSidePanelOpen = false }
                        )
                )
            }

            // Slide-out drawer panel on the right edge
            AnimatedVisibility(
                visible = isSidePanelOpen,
                enter = slideInHorizontally(initialOffsetX = { it }) + fadeIn(),
                exit = slideOutHorizontally(targetOffsetX = { it }) + fadeOut(),
                modifier = Modifier.align(Alignment.CenterEnd)
            ) {
                QuickButtonsSidePanel(
                    buttons = uiState.customButtons,
                    isLoading = uiState.isLoadingButtons,
                    isNavigating = uiState.isNavigating,
                    onButtonClick = { button ->
                        viewModel.sendCustomButtonCommand(button)
                        isSidePanelOpen = false
                    },
                    onRefreshClick = { viewModel.refreshCustomButtons() },
                    onCloseClick = { isSidePanelOpen = false }
                )
            }
        }
    }
}

@SuppressLint("SetJavaScriptEnabled", "ClickableViewAccessibility")
@Composable
private fun ProjectionWebView(
    targetUrl: String,
    syncVersion: Int,
    onWebViewCreated: (WebView) -> Unit,
    onPageStarted: () -> Unit,
    onPageLoaded: (String) -> Unit
) {
    val currentOnPageStarted by rememberUpdatedState(onPageStarted)
    val currentOnPageLoaded by rememberUpdatedState(onPageLoaded)
    var appliedSyncVersion by remember { mutableIntStateOf(-1) }
    var appliedUrl by remember { mutableStateOf<String?>(null) }

    AndroidView(
        modifier = Modifier
            .fillMaxSize()
            .background(PureBlack)
            .testTag("projection_webview"),
        factory = { context ->
            WebView(context).apply {
                layoutParams = ViewGroup.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT
                )
                setBackgroundColor(AndroidColor.BLACK)
                setLayerType(View.LAYER_TYPE_HARDWARE, null)

                isVerticalScrollBarEnabled = false
                isHorizontalScrollBarEnabled = false
                overScrollMode = View.OVER_SCROLL_NEVER
                isFocusable = false
                isFocusableInTouchMode = false
                isClickable = false
                isLongClickable = false

                // Never allow WebView to consume touch events or trigger #presentationContent click listeners
                setOnTouchListener { _, _ -> true }

                // Re-apply 1920x1080 -> container scale whenever the Android WebView layout size changes
                addOnLayoutChangeListener { v, left, top, right, bottom, oldLeft, oldTop, oldRight, oldBottom ->
                    val newW = right - left
                    val oldW = oldRight - oldLeft
                    if (newW > 0 && newW != oldW && v is WebView) {
                        val density = v.resources.displayMetrics.density.takeIf { it > 0f } ?: 1f
                        val cssW = newW / density
                        v.evaluateJavascript(
                            "if (typeof window.__uecfiApply16x9Scale === 'function') window.__uecfiApply16x9Scale($cssW);",
                            null
                        )
                    }
                }

                settings.apply {
                    javaScriptEnabled = true
                    domStorageEnabled = true
                    databaseEnabled = true
                    mediaPlaybackRequiresUserGesture = false
                    setSupportZoom(false)
                    builtInZoomControls = false
                    displayZoomControls = false
                    useWideViewPort = false
                    loadWithOverviewMode = false
                    textZoom = 100
                    cacheMode = WebSettings.LOAD_DEFAULT
                    mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
                    allowFileAccess = true
                    allowContentAccess = true
                }

                val cacheManager = WebResourceCacheManager(this.context)

                webChromeClient = WebChromeClient()
                webViewClient = object : WebViewClient() {
                    override fun shouldInterceptRequest(
                        view: WebView?,
                        request: WebResourceRequest?
                    ): WebResourceResponse? {
                        val cached = cacheManager.interceptRequest(request)
                        if (cached != null) return cached
                        return super.shouldInterceptRequest(view, request)
                    }

                    override fun onPageFinished(view: WebView?, url: String?) {
                        super.onPageFinished(view, url)
                        if (view != null && url != null) {
                            installBase16x9ViewportScript(view)
                            currentOnPageLoaded(url)
                        }
                    }

                    override fun onReceivedError(
                        view: WebView?,
                        request: WebResourceRequest?,
                        error: WebResourceError?
                    ) {
                        super.onReceivedError(view, request, error)
                    }
                }

                onWebViewCreated(this)
                appliedUrl = targetUrl
                appliedSyncVersion = syncVersion
                loadUrl(targetUrl)
            }
        },
        update = { webView ->
            onWebViewCreated(webView)
            if (appliedUrl != targetUrl || appliedSyncVersion != syncVersion) {
                appliedUrl = targetUrl
                appliedSyncVersion = syncVersion
                currentOnPageStarted()
                webView.loadUrl(targetUrl)
            }
        }
    )
}

/**
 * Installs base CSS reset, click-blocker on `#presentationContent`, and constant
 * `1920 x 1080` -> `containerClientWidth / 1920` scaling on `presentation.htm`.
 */
private fun installBase16x9ViewportScript(webView: WebView) {
    val density = webView.resources.displayMetrics.density.takeIf { it > 0f } ?: 1f
    val containerWidthCss = if (webView.width > 0) (webView.width / density) else 0f

    val js = """
        (function() {
          try {
            const VIRTUAL_W = $VIRTUAL_W;
            const VIRTUAL_H = $VIRTUAL_H;
            window.__uecfiLastJson = null;

            document.documentElement.style.backgroundColor = '#000000';
            document.documentElement.style.margin = '0';
            document.documentElement.style.padding = '0';
            document.documentElement.style.width = '100%';
            document.documentElement.style.height = '100%';
            document.documentElement.style.overflow = 'hidden';

            if (!window.__uecfiClickGuard) {
              window.__uecfiClickGuard = true;
              document.addEventListener('click', function(e) {
                e.stopPropagation();
                e.preventDefault();
              }, true);
            }

            window.__uecfiApply16x9Scale = function(overrideClientWidth) {
              const containerClientWidth = overrideClientWidth ||
                document.documentElement.clientWidth ||
                window.innerWidth ||
                $containerWidthCss ||
                VIRTUAL_W;
              const scale = containerClientWidth / VIRTUAL_W;
              if (document.body) {
                document.body.style.backgroundColor = '#000000';
                document.body.style.margin = '0';
                document.body.style.padding = '0';
                document.body.style.overflow = 'hidden';
                document.body.style.userSelect = 'none';
                document.body.style.webkitUserSelect = 'none';
                document.body.style.width = VIRTUAL_W + 'px';
                document.body.style.height = VIRTUAL_H + 'px';
                document.body.style.transformOrigin = 'top left';
                document.body.style.transform = 'scale(' + scale + ')';
              }
            };

            window.__uecfiApply16x9Scale($containerWidthCss);

            if (!window.__uecfiResizeBound) {
              window.__uecfiResizeBound = true;
              window.addEventListener('resize', function() {
                if (typeof window.__uecfiApply16x9Scale === 'function') {
                  window.__uecfiApply16x9Scale();
                }
              });
            }
          } catch (err) {}
        })();
    """.trimIndent()

    webView.evaluateJavascript(js, null)
}

/**
 * Injects `window.previewState` with a constant fixed 16:9 virtual resolution of `1920 x 1080`
 * (`st.winX = 1920; st.winY = 1080;`), skips re-layout if the normalized JSON has not changed,
 * triggers `passVariable()`, `updatePresentation()`, and `updateContent2()` / `updateContent()`,
 * and scales the `1920 x 1080` stage by `containerClientWidth / 1920`.
 */
private fun inject16x9PreviewState(
    webView: WebView,
    forced16x9Json: String,
    forceUpdate: Boolean = false
) {
    val density = webView.resources.displayMetrics.density.takeIf { it > 0f } ?: 1f
    val containerWidthCss = if (webView.width > 0) (webView.width / density) else 0f

    val js = """
        (function(st, force) {
          if (!st) return;
          try {
            const VIRTUAL_W = $VIRTUAL_W;
            const VIRTUAL_H = $VIRTUAL_H;

            // Unconditionally lock virtual stage resolution to 1920 x 1080
            st.winX = VIRTUAL_W;
            st.winY = VIRTUAL_H;

            // Compare normalized JSON (with winX=1920, winY=1080) so desktop monitor resolution
            // changes never trigger a re-layout
            const normalizedJson = JSON.stringify(st);
            if (!force && window.__uecfiLastJson === normalizedJson) {
              return;
            }
            window.__uecfiLastJson = normalizedJson;
            window.previewState = st;

            if (typeof window.__uecfiApply16x9Scale === 'function') {
              window.__uecfiApply16x9Scale($containerWidthCss);
            } else if (document.body) {
              const containerClientWidth = $containerWidthCss ||
                document.documentElement.clientWidth ||
                window.innerWidth ||
                VIRTUAL_W;
              const scale = containerClientWidth / VIRTUAL_W;
              document.body.style.margin = '0';
              document.body.style.padding = '0';
              document.body.style.overflow = 'hidden';
              document.body.style.backgroundColor = '#000000';
              document.body.style.width = VIRTUAL_W + 'px';
              document.body.style.height = VIRTUAL_H + 'px';
              document.body.style.transformOrigin = 'top left';
              document.body.style.transform = 'scale(' + scale + ')';
            }

            if (typeof window.passVariable === 'function') {
              window.passVariable();
            }
            if (typeof window.updatePresentation === 'function') {
              window.updatePresentation();
            }
            if (typeof window.updateContent2 === 'function') {
              window.updateContent2();
            } else if (typeof window.updateContent === 'function') {
              window.updateContent();
            }
          } catch (e) {}
        })($forced16x9Json, $forceUpdate);
    """.trimIndent()

    webView.evaluateJavascript(js, null)
}

@Composable
private fun OffAirOverlay() {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(PureBlack)
            .testTag("off_air_overlay"),
        contentAlignment = Alignment.Center
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            modifier = Modifier
                .background(
                    color = ObsidianSurface.copy(alpha = 0.75f),
                    shape = RoundedCornerShape(50)
                )
                .border(
                    width = 1.dp,
                    color = ObsidianBorder.copy(alpha = 0.8f),
                    shape = RoundedCornerShape(50)
                )
                .padding(horizontal = 20.dp, vertical = 10.dp)
        ) {
            Box(
                modifier = Modifier
                    .size(8.dp)
                    .background(color = TextMuted, shape = CircleShape)
            )
            Icon(
                imageVector = Icons.Outlined.TvOff,
                contentDescription = stringResource(R.string.off_air),
                tint = TextMuted,
                modifier = Modifier.size(16.dp)
            )
            Text(
                text = stringResource(R.string.off_air),
                color = TextMuted,
                fontSize = 13.sp,
                fontWeight = FontWeight.SemiBold,
                letterSpacing = 2.sp
            )
        }
    }
}

@Composable
private fun AttentionNoticeBadge() {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        modifier = Modifier
            .background(
                color = ObsidianSurface.copy(alpha = 0.92f),
                shape = RoundedCornerShape(50)
            )
            .border(
                width = 1.dp,
                color = PresenterGold.copy(alpha = 0.8f),
                shape = RoundedCornerShape(50)
            )
            .padding(horizontal = 14.dp, vertical = 7.dp)
            .testTag("attention_notice_badge")
    ) {
        Box(
            modifier = Modifier
                .size(8.dp)
                .background(color = PresenterGold, shape = CircleShape)
        )
        Text(
            text = stringResource(R.string.attention_on_projector),
            color = PresenterGold,
            fontSize = 11.sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = 0.5.sp
        )
    }
}

@Composable
private fun SearchingIndicator() {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(PureBlack)
            .testTag("searching_indicator"),
        contentAlignment = Alignment.Center
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(14.dp),
            modifier = Modifier
                .background(
                    color = ObsidianSurface.copy(alpha = 0.9f),
                    shape = RoundedCornerShape(50)
                )
                .border(
                    width = 1.dp,
                    color = ObsidianBorder,
                    shape = RoundedCornerShape(50)
                )
                .padding(horizontal = 24.dp, vertical = 14.dp)
        ) {
            CircularProgressIndicator(
                modifier = Modifier.size(18.dp),
                color = PresenterCyan,
                strokeWidth = 2.dp
            )
            Text(
                text = stringResource(R.string.searching_presenter),
                color = TextSecondary,
                fontSize = 14.sp,
                fontWeight = FontWeight.Medium
            )
        }
    }
}

@Composable
private fun ManualConnectionFallbackCard(
    hostInput: String,
    portInput: String,
    isConnecting: Boolean,
    errorMessage: String?,
    isTvDevice: Boolean = false,
    onHostChange: (String) -> Unit,
    onPortChange: (String) -> Unit,
    onConnectClick: () -> Unit,
    onRetryAutoDetectClick: () -> Unit
) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(PureBlack.copy(alpha = 0.92f))
            .padding(24.dp)
            .testTag("manual_fallback_dialog"),
        contentAlignment = Alignment.Center
    ) {
        Surface(
            modifier = Modifier
                .widthIn(max = 460.dp)
                .fillMaxWidth()
                .border(
                    width = 1.dp,
                    color = ObsidianBorder,
                    shape = RoundedCornerShape(20.dp)
                ),
            shape = RoundedCornerShape(20.dp),
            color = ObsidianCard,
            tonalElevation = 8.dp
        ) {
            Column(
                modifier = Modifier.padding(horizontal = 24.dp, vertical = 22.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp)
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Icon(
                        imageVector = Icons.Outlined.WifiFind,
                        contentDescription = stringResource(R.string.manual_connect_title),
                        tint = PresenterCyan,
                        modifier = Modifier.size(24.dp)
                    )
                    Column(modifier = Modifier.weight(1f)) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Text(
                                text = stringResource(R.string.manual_connect_title),
                                style = MaterialTheme.typography.titleMedium,
                                color = TextPrimary,
                                fontWeight = FontWeight.SemiBold
                            )
                            CircularProgressIndicator(
                                modifier = Modifier.size(12.dp),
                                color = PresenterCyan,
                                strokeWidth = 1.5.dp
                            )
                        }
                        Text(
                            text = stringResource(R.string.manual_connect_subtitle),
                            style = MaterialTheme.typography.bodySmall,
                            color = TextSecondary
                        )
                    }
                }

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    verticalAlignment = Alignment.Top
                ) {
                    OutlinedTextField(
                        value = hostInput,
                        onValueChange = onHostChange,
                        label = { Text(stringResource(R.string.ip_address_label)) },
                        placeholder = { Text(stringResource(R.string.ip_address_placeholder)) },
                        singleLine = true,
                        enabled = !isConnecting,
                        keyboardOptions = KeyboardOptions(
                            keyboardType = KeyboardType.Uri,
                            imeAction = ImeAction.Next
                        ),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = PresenterCyan,
                            unfocusedBorderColor = ObsidianBorder,
                            focusedLabelColor = PresenterCyan,
                            unfocusedLabelColor = TextSecondary,
                            focusedTextColor = TextPrimary,
                            unfocusedTextColor = TextPrimary,
                            cursorColor = PresenterCyan
                        ),
                        modifier = Modifier
                            .weight(0.68f)
                            .testTag("ip_address_input")
                    )

                    OutlinedTextField(
                        value = portInput,
                        onValueChange = onPortChange,
                        label = { Text(stringResource(R.string.port_label)) },
                        placeholder = { Text(stringResource(R.string.port_placeholder)) },
                        singleLine = true,
                        enabled = !isConnecting,
                        keyboardOptions = KeyboardOptions(
                            keyboardType = KeyboardType.Number,
                            imeAction = ImeAction.Done
                        ),
                        keyboardActions = KeyboardActions(
                            onDone = { onConnectClick() }
                        ),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = PresenterCyan,
                            unfocusedBorderColor = ObsidianBorder,
                            focusedLabelColor = PresenterCyan,
                            unfocusedLabelColor = TextSecondary,
                            focusedTextColor = TextPrimary,
                            unfocusedTextColor = TextPrimary,
                            cursorColor = PresenterCyan
                        ),
                        modifier = Modifier
                            .weight(0.32f)
                            .testTag("port_input")
                    )
                }

                if (!errorMessage.isNullOrBlank()) {
                    Text(
                        text = errorMessage,
                        color = ErrorRed,
                        style = MaterialTheme.typography.bodySmall,
                        modifier = Modifier.testTag("connection_error_text")
                    )
                }

                Spacer(modifier = Modifier.height(2.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    var retryFocused by remember { mutableStateOf(false) }
                    var connectFocused by remember { mutableStateOf(false) }

                    OutlinedButton(
                        onClick = onRetryAutoDetectClick,
                        enabled = !isConnecting,
                        shape = RoundedCornerShape(12.dp),
                        border = BorderStroke(
                            width = if (retryFocused) 2.dp else 1.dp,
                            color = if (retryFocused) PresenterCyan else ObsidianBorder
                        ),
                        colors = ButtonDefaults.outlinedButtonColors(
                            contentColor = if (retryFocused) TextPrimary else TextSecondary
                        ),
                        modifier = Modifier
                            .weight(1f)
                            .height(48.dp)
                            .scale(if (retryFocused) 1.03f else 1f)
                            .onFocusChanged { retryFocused = it.isFocused }
                            .testTag("retry_auto_detect_button")
                    ) {
                        Icon(
                            imageVector = Icons.Outlined.Refresh,
                            contentDescription = stringResource(R.string.retry_auto_detect),
                            modifier = Modifier.size(18.dp)
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = stringResource(R.string.retry_auto_detect),
                            fontSize = 13.sp,
                            fontWeight = FontWeight.Medium
                        )
                    }

                    Button(
                        onClick = onConnectClick,
                        enabled = !isConnecting && hostInput.isNotBlank(),
                        shape = RoundedCornerShape(12.dp),
                        border = if (connectFocused) BorderStroke(2.dp, TextPrimary) else null,
                        colors = ButtonDefaults.buttonColors(
                            containerColor = PresenterCyan,
                            contentColor = PureBlack
                        ),
                        modifier = Modifier
                            .weight(1f)
                            .height(48.dp)
                            .scale(if (connectFocused) 1.03f else 1f)
                            .onFocusChanged { connectFocused = it.isFocused }
                            .testTag("connect_button")
                    ) {
                        if (isConnecting) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(18.dp),
                                color = PureBlack,
                                strokeWidth = 2.dp
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(
                                text = stringResource(R.string.connecting_status),
                                fontSize = 13.sp,
                                fontWeight = FontWeight.SemiBold
                            )
                        } else {
                            Text(
                                text = stringResource(R.string.connect_button),
                                fontSize = 14.sp,
                                fontWeight = FontWeight.SemiBold
                            )
                        }
                    }
                }

                if (isTvDevice) {
                    Text(
                        text = stringResource(R.string.tv_remote_hint),
                        style = MaterialTheme.typography.labelSmall,
                        color = TextMuted
                    )
                }
            }
        }
    }
}

@Composable
private fun VerseNavigationControls(
    isNavActive: Boolean,
    isVerse: Boolean,
    isNavigating: Boolean = false,
    canPrev: Boolean,
    canNext: Boolean,
    isTvDevice: Boolean = false,
    onPrevClick: () -> Unit,
    onNextClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val prevLabel = stringResource(if (isVerse) R.string.prev_verse else R.string.prev_slide)
    val nextLabel = stringResource(if (isVerse) R.string.next_verse else R.string.next_slide)

    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(
                horizontal = if (isTvDevice) 48.dp else 24.dp,
                vertical = if (isTvDevice) 28.dp else 16.dp
            ),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        VerseNavButton(
            text = prevLabel,
            icon = Icons.AutoMirrored.Filled.ArrowBack,
            enabled = !isNavigating && isNavActive && canPrev,
            onClick = onPrevClick,
            testTag = "prev_verse_button",
            isNext = false
        )

        VerseNavButton(
            text = nextLabel,
            icon = Icons.AutoMirrored.Filled.ArrowForward,
            enabled = !isNavigating && isNavActive && canNext,
            onClick = onNextClick,
            testTag = "next_verse_button",
            isNext = true
        )
    }
}

@Composable
private fun QuickButtonsSidePanel(
    buttons: List<CustomRemoteButton>,
    isLoading: Boolean,
    isNavigating: Boolean,
    onButtonClick: (CustomRemoteButton) -> Unit,
    onRefreshClick: () -> Unit,
    onCloseClick: () -> Unit
) {
    Surface(
        modifier = Modifier
            .width(268.dp)
            .fillMaxHeight()
            .border(
                width = 1.dp,
                color = ObsidianBorder,
                shape = RoundedCornerShape(topStart = 20.dp, bottomStart = 20.dp)
            )
            .testTag("quick_buttons_panel"),
        shape = RoundedCornerShape(topStart = 20.dp, bottomStart = 20.dp),
        color = ObsidianSurface.copy(alpha = 0.96f),
        tonalElevation = 12.dp
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 16.dp, vertical = 14.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(
                    text = stringResource(R.string.quick_buttons),
                    color = TextPrimary,
                    fontSize = 15.sp,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f)
                )
                Row(verticalAlignment = Alignment.CenterVertically) {
                    IconButton(
                        onClick = onRefreshClick,
                        enabled = !isLoading,
                        modifier = Modifier.size(36.dp)
                    ) {
                        if (isLoading) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(16.dp),
                                color = PresenterCyan,
                                strokeWidth = 2.dp
                            )
                        } else {
                            Icon(
                                imageVector = Icons.Outlined.Refresh,
                                contentDescription = "Refresh",
                                tint = PresenterCyan,
                                modifier = Modifier.size(18.dp)
                            )
                        }
                    }
                    IconButton(
                        onClick = onCloseClick,
                        modifier = Modifier.size(36.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Outlined.Close,
                            contentDescription = "Close",
                            tint = TextSecondary,
                            modifier = Modifier.size(18.dp)
                        )
                    }
                }
            }

            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 8.dp)
                    .height(1.dp)
                    .background(ObsidianBorder)
            )

            if (buttons.isEmpty()) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = stringResource(R.string.no_custom_buttons),
                        color = TextMuted,
                        fontSize = 12.sp
                    )
                }
            } else {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f)
                        .verticalScroll(rememberScrollState()),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    buttons.forEach { button ->
                        Surface(
                            onClick = { onButtonClick(button) },
                            enabled = !isNavigating,
                            shape = RoundedCornerShape(12.dp),
                            color = ObsidianCard,
                            border = BorderStroke(
                                1.dp,
                                if (isNavigating) ObsidianBorder else PresenterCyan.copy(alpha = 0.45f)
                            ),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Text(
                                text = button.label,
                                color = if (isNavigating) TextMuted else TextPrimary,
                                fontSize = 14.sp,
                                fontWeight = FontWeight.Medium,
                                maxLines = 2,
                                overflow = TextOverflow.Ellipsis,
                                modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp)
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun VerseNavButton(
    text: String,
    icon: ImageVector,
    enabled: Boolean,
    onClick: () -> Unit,
    testTag: String,
    isNext: Boolean = false
) {
    var isFocused by remember { mutableStateOf(false) }
    val alpha = if (enabled) 1.0f else 0.35f
    val borderColor = when {
        isFocused && enabled -> PresenterCyan
        enabled -> PresenterCyan.copy(alpha = 0.65f)
        else -> ObsidianBorder.copy(alpha = 0.5f)
    }
    val borderWidth = if (isFocused && enabled) 2.5.dp else 1.dp
    val bgColor = if (isFocused && enabled) ObsidianCard else ObsidianSurface.copy(alpha = 0.90f * alpha)
    val contentColor = if (enabled) PresenterCyan else TextMuted

    Surface(
        onClick = onClick,
        enabled = enabled,
        shape = RoundedCornerShape(50),
        color = bgColor,
        border = BorderStroke(borderWidth, borderColor),
        modifier = Modifier
            .height(44.dp)
            .scale(if (isFocused && enabled) 1.06f else 1f)
            .onFocusChanged { isFocused = it.isFocused }
            .testTag(testTag)
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)
        ) {
            if (!isNext) {
                Icon(
                    imageVector = icon,
                    contentDescription = text,
                    tint = contentColor,
                    modifier = Modifier.size(16.dp)
                )
            }
            Text(
                text = text,
                color = if (enabled) TextPrimary else TextMuted,
                fontSize = 13.sp,
                fontWeight = FontWeight.SemiBold
            )
            if (isNext) {
                Icon(
                    imageVector = icon,
                    contentDescription = text,
                    tint = contentColor,
                    modifier = Modifier.size(16.dp)
                )
            }
        }
    }
}
