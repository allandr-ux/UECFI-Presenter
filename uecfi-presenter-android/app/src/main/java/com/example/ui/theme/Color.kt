package com.example.ui.theme

import androidx.compose.ui.graphics.Color

// Pure black for OLED presentation stage letterboxing / pillarboxing
val PureBlack = Color(0xFF000000)

// Material 3 Dark Palette Tokens
val M3DarkPrimary = Color(0xFF7DD3FC)          // Sky 300
val M3DarkOnPrimary = Color(0xFF003549)
val M3DarkPrimaryContainer = Color(0xFF004D69)
val M3DarkOnPrimaryContainer = Color(0xFFC2E8FF)

val M3DarkSecondary = Color(0xFFFDE047)        // Amber 300
val M3DarkOnSecondary = Color(0xFF3B2F00)
val M3DarkSecondaryContainer = Color(0xFF554400)
val M3DarkOnSecondaryContainer = Color(0xFFFFE27C)

val M3DarkTertiary = Color(0xFF86EFAC)         // Emerald 300
val M3DarkOnTertiary = Color(0xFF00391A)

val M3DarkSurface = Color(0xFF0F172A)          // Slate 900
val M3DarkOnSurface = Color(0xFFF1F5F9)        // Slate 100
val M3DarkSurfaceVariant = Color(0xFF1E293B)   // Slate 800
val M3DarkOnSurfaceVariant = Color(0xFFCBD5E1) // Slate 300

// Material 3 Surface Containers
val M3DarkSurfaceContainerLowest = Color(0xFF090D16)
val M3DarkSurfaceContainerLow = Color(0xFF0F172A)
val M3DarkSurfaceContainer = Color(0xFF151F32)
val M3DarkSurfaceContainerHigh = Color(0xFF1E293B)
val M3DarkSurfaceContainerHighest = Color(0xFF283548)

val M3DarkOutline = Color(0xFF475569)          // Slate 600
val M3DarkOutlineVariant = Color(0xFF334155)   // Slate 700

val M3DarkError = Color(0xFFF87171)            // Red 400
val M3DarkOnError = Color(0xFF450A0A)
val M3DarkErrorContainer = Color(0xFF7F1D1D)
val M3DarkOnErrorContainer = Color(0xFFFECACA)

// Legacy aliases for backward compatibility across projection widgets
val ObsidianSurface = M3DarkSurfaceContainerLow
val ObsidianCard = M3DarkSurfaceContainerHigh
val ObsidianBorder = M3DarkOutlineVariant
val PresenterCyan = M3DarkPrimary
val PresenterCyanDark = M3DarkPrimaryContainer
val PresenterGold = M3DarkSecondary
val TextPrimary = M3DarkOnSurface
val TextSecondary = M3DarkOnSurfaceVariant
val TextMuted = M3DarkOutline
val ErrorRed = M3DarkError

