export const PROTOCOL_VERSION = 2;

export type RemoteCommandAction =
  | 'NEXT'
  | 'PREV'
  | 'SELECT_BLOCK'
  | 'SELECT_ITEM'
  | 'TOGGLE_BLACKOUT'
  | 'TOGGLE_CLEAR_TEXT'
  | 'TOGGLE_LOGO'
  | 'CLEAR_OVERRIDE'
  | 'AUDIO_TOGGLE_PLAY'
  | 'AUDIO_STOP'
  | 'AUDIO_RESTART'
  | 'AUDIO_SET_VOLUME'
  | 'TOGGLE_RETURN_AUDIO'
  | 'PRESENT_VERSE';

export interface RemoteCommandMessage {
  action: RemoteCommandAction;
  blockIndex?: number;
  itemId?: string;
  volume?: number;
  bookIndex?: number;
  chapterNum?: number;
  verseNum?: number;
}

export type ContentType = 'song' | 'verse' | 'slide' | 'programItem';

export type LyricsDisplayMode = 'slide' | 'timed';

export type BibleLayoutMode = 'primary' | 'secondary' | 'stacked';

export type OutputOverride = 'none' | 'clearText' | 'blackout' | 'showLogo';

export type RemoteViewMode = 'mainScreen' | 'overflow';

export interface BibleVerse {
  number: number;
  text: string;
}

export interface BibleChapter {
  number: number;
  verses: BibleVerse[];
}

export interface BibleBook {
  name: string;
  chapters: BibleChapter[];
}

export interface BibleVersion {
  id: string;
  title: string;
  copyright?: string;
  books: BibleBook[];
}

export type CanvasElementAnchor =
  | 'center'
  | 'topLeft'
  | 'topRight'
  | 'bottomLeft'
  | 'bottomRight'
  | 'bottomCenter';

export type ShapeVariant =
  // Lines
  | 'line'
  | 'lineArrowRight'
  | 'lineDoubleArrow'
  | 'lineChevronArrow'
  | 'lineDoubleChevronArrow'
  | 'lineDottedArrow'
  | 'lineDottedDoubleArrow'
  | 'lineCircleEnds'
  | 'lineHollowCircleEnds'
  | 'lineSquareEnds'
  | 'lineHollowSquareEnds'
  | 'lineDiamondEnds'
  | 'lineHollowDiamondEnds'
  | 'lineBarEnds'
  | 'lineDashed'
  | 'lineDotted'
  | 'lineWaveThick'
  | 'lineZigzagWaveThick'
  // Basic shapes
  | 'rectangle'
  | 'roundedRect'
  | 'circle'
  | 'triangle'
  | 'triangleDown'
  | 'diamond'
  | 'cross'
  | 'ring'
  // Polygons
  | 'pentagon'
  | 'hexagon'
  | 'hexagonFlat'
  | 'heptagon'
  | 'octagon'
  | 'chamferRect'
  // Stars
  | 'star4'
  | 'star'
  | 'star6'
  | 'star8'
  | 'star12'
  | 'burst'
  // Arrows
  | 'arrowRight'
  | 'arrowLeft'
  | 'arrowUp'
  | 'arrowDown'
  | 'arrowLeftRight'
  | 'chevronRight'
  // Flowchart shapes
  | 'flowchartHex'
  | 'pill'
  | 'roundedSquare'
  | 'parallelogram'
  | 'wave'
  | 'trapezoid'
  // Speech bubbles
  | 'speechSquare'
  | 'speechOval'
  | 'thoughtCloud'
  | 'speechRounded'
  | 'speechTailLeft'
  // Clouds
  | 'cloud'
  | 'cloudSoft'
  | 'cloudFlat'
  | 'cloudPuffy'
  // Hearts
  | 'heart'
  | 'heartTall'
  | 'heartWide'
  | 'heartSoft'
  // Banners
  | 'bannerRibbon'
  | 'bannerShield'
  | 'bannerBookmark'
  | 'bannerTag'
  | 'bannerArch'
  // Teardrops
  | 'teardrop'
  | 'teardropSlim'
  | 'teardropWide'
  | 'teardropFlame'
  // Cogs
  | 'cog'
  | 'cogThin'
  | 'sunburstCog'
  | 'gearHole'
  // Square stars
  | 'asterisk6'
  | 'asterisk8'
  | 'plusThick'
  | 'spark5'
  // Organic shapes
  | 'flower6'
  | 'flower8'
  | 'clover'
  | 'blob'
  // Abstract shapes
  | 'quatrefoil'
  | 'hourglass'
  | 'archStack'
  | 'diagonalCut';

export type CanvasAnimationType =
  | 'none'
  | 'fadeIn'
  | 'rise'
  | 'slideLeft'
  | 'slideRight'
  | 'pop'
  | 'smokeDissolve'
  | 'maskRise'
  | 'powerOn'
  | 'strokeDraw'
  | 'float'
  | 'pulse'
  | 'glow'
  | 'spin'
  | 'sway'
  | 'vaporHaze'
  | 'squishy'
  | 'ripple'
  | 'wobble3d'
  | 'deconstructed';

export type FrameVariant =
  | 'circle'
  | 'square'
  | 'rounded'
  | 'arch'
  | 'heart'
  | 'star'
  | 'hexagon'
  | 'diamond'
  | 'oval';

export type CanvasThreeDAnimation = 'none' | 'spin' | 'float' | 'tilt' | 'flip' | 'orbit';

export type CanvasThreeDMaterial = 'matte' | 'metallic' | 'glossy' | 'neon' | 'ice' | 'glass';

export interface CanvasThreeDConfig {
  enabled: boolean;
  depth: number; // Extrusion depth (0.04..0.55)
  bevel: number; // Bevel thickness/size (0..0.05)
  material: CanvasThreeDMaterial;
  edgeColor: string;
  edgeMode?: 'solid' | 'matchImage'; // 'solid' = uniform edgeColor, 'matchImage' = pulled-candy PNG edge colors
  animation: CanvasThreeDAnimation;
  speed: number; // Animation speed multiplier (0.25..3)
  tiltX: number; // Base X tilt in degrees (-45..45)
  tiltY: number; // Base Y tilt in degrees (-45..45)
}

export type LineRouteType = 'straight' | 'elbowed' | 'curved';
export type LineDashPattern = 'solid' | 'dashed' | 'shortDashed' | 'dotted';
export type LineCapStyle =
  | 'none'
  | 'arrow'
  | 'arrowFilled'
  | 'circleOutline'
  | 'circleFilled'
  | 'squareOutline'
  | 'squareFilled'
  | 'diamondOutline'
  | 'diamondFilled'
  | 'bar';

export interface CanvasElement {
  id: string;
  name?: string; // Optional human-readable layer name (e.g. icon name, stock tags, or image filename)
  kind: 'text' | 'shape' | 'image' | 'divider' | 'participantWidget' | 'frame' | 'model3d' | 'line';
  groupId?: string;
  shapeType?: ShapeVariant;
  frameShape?: FrameVariant;
  x: number; // 0..100 (% of stage width)
  y: number; // 0..100 (% of stage height)
  width: number; // 1..100 (% of stage width)
  height: number; // 1..100 (% of stage height)
  zIndex: number;
  anchor?: CanvasElementAnchor;
  text?: string;
  fontFamily?: string;
  fontSize?: number; // Base px at 1080p height (scales proportionally)
  fontWeight?: '400' | '600' | '700' | '800' | '900';
  fontStyle?: 'normal' | 'italic';
  textDecoration?: 'none' | 'underline';
  textTransform?: 'none' | 'uppercase';
  listStyle?: 'none' | 'bullet' | 'number';
  textPosition?: 'normal' | 'superscript' | 'subscript';
  color?: string;
  outlineWidth?: number;
  outlineColor?: string;
  glowBlur?: number; // Base px at 1080p height (scales proportionally)
  glowColor?: string;
  textEffect?: 'none' | 'rainbow' | 'rainbowRipple' | 'prismSpin' | 'shimmer' | 'override' | 'voltage' | 'threeDGlow' | 'trace' | 'threeDExtrude' | 'popArt' | 'retroStack' | 'slideStripes' | 'block3d' | 'amazingPop'; // Animated CSS text color effects
  shimmerDensity?: number; // Particle density multiplier for shimmer (0..3, default 1 = 5 stars)
  shimmerGlow?: number; // Particle glow intensity multiplier for shimmer (0..2, default 1 = 100%)
  shimmerParticleSize?: number; // Particle size multiplier for shimmer (0.5..3, default 1 = 100%)
  textShadowEnabled?: boolean; // Optional configurable drop shadow (off by default)
  textShadowColor?: string;
  textShadowBlur?: number; // 0..100
  textShadowDirection?: number; // -180..180 degrees
  textShadowOffset?: number; // 0..100
  textShadowOffsetX?: number; // Legacy base px at 1080p height
  textShadowOffsetY?: number; // Legacy base px at 1080p height
  textShadowOpacity?: number; // 0..1 (default 0.55)
  lineHeight?: number;
  letterSpacing?: number; // in em units (scales proportionally with fontSize)
  textAlign?: 'left' | 'center' | 'right';
  backgroundColor?: string;
  borderRadius?: number;
  opacity?: number;
  thickness?: number; // Line thickness in 1080p px for divider elements
  lineType?: LineRouteType;
  lineDash?: LineDashPattern;
  lineRoundedCaps?: boolean;
  lineStrokeWidth?: number; // Base px at 1080p height (default 4)
  lineStartCap?: LineCapStyle;
  lineEndCap?: LineCapStyle;
  lineX1?: number; // 0..100 (% of stage width)
  lineY1?: number; // 0..100 (% of stage height)
  lineX2?: number; // 0..100 (% of stage width)
  lineY2?: number; // 0..100 (% of stage height)
  lineCx?: number; // Handle point X (% of stage width) for curved/elbowed routing
  lineCy?: number; // Handle point Y (% of stage height) for curved/elbowed routing
  linePoints?: Array<{ x: number; y: number }>; // Intermediate curving handles (% of stage) for multi-point curved lines
  imageSrc?: string;
  modelSrc?: string; // Local media URL (.glb) for imported 3D model elements
  cropTop?: number; // Non-destructive top trim fraction (0..1) for image elements
  cropRight?: number; // Non-destructive right trim fraction (0..1) for image elements
  cropBottom?: number; // Non-destructive bottom trim fraction (0..1) for image elements
  cropLeft?: number; // Non-destructive left trim fraction (0..1) for image elements
  imageScale?: number; // Inner crop scale inside a frame (default 1)
  imageOffsetX?: number; // Inner crop X offset (%) inside a frame (default 0)
  imageOffsetY?: number; // Inner crop Y offset (%) inside a frame (default 0)
  imageRotation?: number; // Inner crop rotation (deg) inside a frame (default 0)
  svgTemplate?: string; // Raw SVG template (with currentColor) for recolorable vector icons/graphics
  flipX?: boolean;
  flipY?: boolean;
  locked?: boolean;
  rotation?: number; // Rotation angle in degrees (-180..180)
  animation?: CanvasAnimationType;
  animationDuration?: number; // Duration in seconds
  animationDelay?: number; // Entrance delay in seconds
  animationUnit?: 'character' | 'word' | 'line';
  animationDirection?: 'left' | 'right' | 'up' | 'down';
  animationIntensity?: number; // Intensity multiplier (0.3..2)
  threeD?: CanvasThreeDConfig; // Optional Three.js 3D extrusion/effect/animation for image elements
  widgetTitleColor?: string;
  widgetTitleSize?: number;
  widgetNameColor?: string;
  widgetNameSize?: number;
  widgetCentroColor?: string;
  widgetCentroSize?: number;
  widgetAccentColor?: string;
  widgetInlineTitle?: boolean;
}

export interface SlideBlock {
  id: string;
  label?: string; // e.g., "Verse 1", "Chorus", "John 3:16", "Announcement"
  groupHeader?: string; // Reference group header (e.g., "Genesis 1:1-3")
  lines: string[];
  secondaryLabel?: string; // Secondary Bible reference/version when dual-Bible is active
  secondaryLines?: string[]; // Secondary Bible text when dual-Bible is active
  canvasElements?: CanvasElement[]; // Canva-style positioned elements
  background?: string; // Per-slide independent CSS background (overrides item.themeBackground)
  startTimeSec?: number; // Audio-synced start timestamp in seconds
  lineTimingsSec?: (number | undefined)[]; // Per-line audio timestamps in seconds
  notes?: string;
  verseRef?: {
    bookIndex: number;
    chapterNum: number;
    verseNum: number;
  };
}

export interface ProgramItem {
  id: string;
  sourceId?: string; // Links Program items to their Library counterpart for two-way sync
  title: string;
  subtitle?: string;
  type: ContentType;
  lyricsMode?: LyricsDisplayMode; // Applicable for songs
  songTextColor?: string;
  songTitleColor?: string;
  songHighlightColor?: string;
  songOutlineWidth?: number;
  songOutlineColor?: string;
  songHighlightOutlineWidth?: number;
  songHighlightOutlineColor?: string;
  audioUrl?: string; // Attached audio track (Data URL) for timed lyrics
  audioFileName?: string; // Display name for attached audio track
  bibleLayout?: BibleLayoutMode; // Applicable for verses
  followActiveBible?: boolean; // When true, re-resolves verseRef blocks if active Bible version changes in Settings
  verseMaxFontSize?: number; // Max font size in px for auto-scaling verses
  verseTextColor?: string;
  verseRefColor?: string;
  verseStackedPrimaryTextColor?: string;
  verseStackedPrimaryRefColor?: string;
  verseStackedSecondaryTextColor?: string;
  verseStackedSecondaryRefColor?: string;
  verseBgDim?: number; // 0..85 (%) dimming overlay behind single-bible verse text
  verseStackedThemeBackground?: string; // Independent background for stacked dual-bible layout
  verseStackedBgDim?: number; // 0..85 (%) dimming overlay for stacked dual-bible layout
  docMaxFontSize?: number; // Max font size in px for auto-scaling docs
  docTextColor?: string;
  docTitleColor?: string;
  docOutlineWidth?: number;
  docOutlineColor?: string;
  docBulletStyle?: 'accent' | 'pill' | 'superscript' | 'plain';
  docBulletColor?: string;
  docBgDim?: number; // 0..85 (%) dimming overlay for docs
  songBgDim?: number; // 0..85 (%) dimming overlay for songs
  themeBackground?: string; // CSS background gradient or color
  blocks: SlideBlock[];
}

export interface Program {
  id: string;
  name: string;
  date: string;
  items: ProgramItem[];
}

export interface ProgramItemSummary {
  id: string;
  title: string;
  subtitle?: string;
  type: ProgramItem['type'];
  lyricsMode?: LyricsDisplayMode;
  blockCount: number;
}

export interface OverflowCameraAngle {
  id: string;
  label: string;
  deviceId: string;
}

export interface RemoteReturnFeedConfig {
  sendVideo: boolean;
  audioDeviceId: string;
  autoMuteWhenLive: boolean;
  echoCancellation?: boolean;
}

export interface OverflowStageConfig {
  enabled: boolean;
  feedSource?: 'auto' | 'remote' | 'camera';
  layout: 'full' | 'custom';
  fullCropSides?: boolean;
  studioBackground?: string;
  studioPresentationBox?: StudioBoxRect;
  studioParticipantBox?: StudioBoxRect;
  studioElements?: CanvasElement[];
}

export interface LiveState {
  protocolVersion?: number;
  programId: string;
  programName: string;
  activeItemId: string | null;
  activeBlockIndex: number;
  override: OutputOverride;
  lyricsMode: LyricsDisplayMode;
  audioCurrentTimeSec?: number;
  audioPlaying?: boolean;
  audioVolume?: number;
  bibleLayout: BibleLayoutMode;
  verseMaxFontSize?: number;
  activeItem: ProgramItem | null;
  programItems?: ProgramItemSummary[];
  nextItemTitle: string | null;
  logoSlide?: ProgramItem | null;
  participants?: ParticipantStageConfig;
  participantList?: RemoteParticipant[];
  overflow?: OverflowStageConfig;
  returnAudioActive?: boolean;
  returnAudioMuted?: boolean;
  updatedAt: number;
}

export interface SyncBundleMediaFile {
  fileName: string;
  url: string;
  size: number;
  mtimeMs: number;
}

export interface SyncBundlePayload {
  version: number;
  programId: string;
  programName: string;
  items: ProgramItem[];
  logoSlide: ProgramItem | null;
  mediaFiles: SyncBundleMediaFile[];
}

export interface BibleSyncBundlePayload {
  version: number;
  primaryBible: BibleVersion | null;
  secondaryBible: BibleVersion | null;
  verseStyle?: Partial<ProgramItem>;
  mediaFiles?: SyncBundleMediaFile[];
}

export interface OperatorChatMessage {
  id: string;
  sender: 'desktop' | 'android';
  senderName: string;
  text: string;
  timestamp: number;
}

export type ParticipantStatus = 'greenRoom' | 'live';

export type ParticipantLayoutMode = 'full' | 'custom';

export interface StudioBoxRect {
  x: number;
  y: number;
  width: number;
  height: number;
  borderRadius?: number;
}

export interface RemoteParticipant {
  id: string;
  name: string;
  title?: string;
  centroOrPosition?: string;
  joinedAt: number;
  status: ParticipantStatus;
  audioEnabled: boolean;
  videoEnabled: boolean;
  mutedByOperator: boolean;
  videoHiddenByOperator: boolean;
  source: 'lan' | 'online';
}

export interface ParticipantStageConfig {
  layout: ParticipantLayoutMode;
  liveParticipantIds: string[];
  fullCropSides?: boolean;
  showNameplate?: boolean;
  studioBackground?: string;
  studioPresentationBox?: StudioBoxRect;
  studioParticipantBox?: StudioBoxRect;
  studioElements?: CanvasElement[];
}

export type ParticipantModerationAction =
  | 'PUT_LIVE'
  | 'MOVE_TO_GREEN_ROOM'
  | 'SET_MUTED'
  | 'SET_VIDEO_HIDDEN'
  | 'KICK';

export interface ParticipantIceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface ParticipantNetworkSettings {
  signalingRelayUrl: string;
  onlineSessionCode: string;
  onlinePin: string;
  stunUrl: string;
  turnUrl: string;
  turnUsername: string;
  turnCredential: string;
}

export type ParticipantSignalMessage =
  | {
      type: 'PARTICIPANT_JOIN';
      name: string;
      pin?: string;
      sessionCode?: string;
      audioEnabled: boolean;
      videoEnabled: boolean;
      source?: 'lan' | 'online';
    }
  | {
      type: 'PARTICIPANT_JOINED';
      ok: boolean;
      participantId?: string;
      status?: ParticipantStatus;
      error?: string;
    }
  | {
      type: 'PARTICIPANT_MEDIA_STATE';
      participantId: string;
      audioEnabled: boolean;
      videoEnabled: boolean;
    }
  | {
      type: 'PARTICIPANT_STATE';
      participants: RemoteParticipant[];
      stage: ParticipantStageConfig;
    }
  | {
      type: 'PARTICIPANT_MODERATION';
      participantId: string;
      action: ParticipantModerationAction;
      value?: boolean;
    }
  | {
      type: 'RTC_SUBSCRIBE';
      viewerId: string; // e.g. 'screen:main' | 'screen:operator' | 'screen:stage:<id>'
      participantId: string;
    }
  | {
      type: 'RTC_OFFER';
      fromId: string;
      toId: string;
      sdp: { type: 'offer'; sdp: string };
    }
  | {
      type: 'RTC_ANSWER';
      fromId: string;
      toId: string;
      sdp: { type: 'answer'; sdp: string };
    }
  | {
      type: 'RTC_ICE';
      fromId: string;
      toId: string;
      candidate: { candidate: string; sdpMid?: string | null; sdpMLineIndex?: number | null };
    };

export interface DisplayInfo {
  id: number;
  label: string;
  bounds: { x: number; y: number; width: number; height: number };
  isPrimary: boolean;
  isMainScreen: boolean;
}

export interface WhitelistedDevice {
  id: string;
  name: string;
  createdAt: number;
  lastSeenAt: number;
}

export interface RemoteConnectionInfo {
  localUrl: string;
  wsUrl: string;
  port: number;
  localPin?: string | null;
  serverError?: string | null;
  connectedClients: number;
  onlineSessionCode: string | null;
  onlinePin: string | null;
  onlineConnected: boolean;
}
