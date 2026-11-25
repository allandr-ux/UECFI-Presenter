# Keep @JavascriptInterface methods exposed to the mirror WebView
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Keep kotlinx.serialization models & companion serializers
-keepattributes *Annotation*,InnerClasses
-dontnote kotlinx.serialization.SerializationKt
-keep,includedescriptorclasses class org.uecfi.presenter.model.**$$serializer { *; }
-keepclassmembers class org.uecfi.presenter.model.** {
    *** Companion;
}
-keep,includedescriptorclasses class org.uecfi.presenter.network.DiscoveryResponsePayload$$serializer { *; }
-keepclassmembers class org.uecfi.presenter.network.DiscoveryResponsePayload {
    *** Companion;
}
