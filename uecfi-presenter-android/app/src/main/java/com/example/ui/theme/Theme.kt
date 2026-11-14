package com.example.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable

private val PresenterDarkColorScheme = darkColorScheme(
    primary = PresenterCyan,
    onPrimary = PureBlack,
    primaryContainer = PresenterCyanDark,
    onPrimaryContainer = TextPrimary,
    secondary = PresenterGold,
    onSecondary = PureBlack,
    background = PureBlack,
    onBackground = TextPrimary,
    surface = ObsidianSurface,
    onSurface = TextPrimary,
    surfaceVariant = ObsidianCard,
    onSurfaceVariant = TextSecondary,
    outline = ObsidianBorder,
    error = ErrorRed
)

@Composable
fun MyApplicationTheme(
    content: @Composable () -> Unit
) {
    MaterialTheme(
        colorScheme = PresenterDarkColorScheme,
        typography = Typography,
        content = content
    )
}
