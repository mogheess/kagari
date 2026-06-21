# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# Add any project specific keep options here:

# ---------------------------------------------------------------------------
# Extension engine keep rules.
#
# Tachiyomi/Mihon extension APKs are compiled against these classes as
# `compileOnly` and resolve their symbols from THIS host process at runtime via
# the shared classloader. If R8 renames or removes them, every extension fails
# to load. These rules let `enableProguardInReleaseBuilds = true` be turned on
# safely for a smaller release APK.
# ---------------------------------------------------------------------------

# The vendored Tachiyomi/Mihon source API (must keep original names).
-keep class eu.kanade.tachiyomi.** { *; }
-keep interface eu.kanade.tachiyomi.** { *; }
-dontwarn eu.kanade.tachiyomi.**

# Our native engine + RN bridge + DTOs (referenced by name across the bridge).
-keep class com.manhwa.engine.** { *; }

# kotlinx.serialization: keep @Serializable models and their generated serializers.
-keepattributes *Annotation*, InnerClasses, Signature, RuntimeVisibleAnnotations
-keepclassmembers class **$$serializer { *; }
-keepclasseswithmembers, includedescriptorclasses class com.manhwa.** {
    kotlinx.serialization.KSerializer serializer(...);
}
-keepclassmembers class com.manhwa.** {
    *** Companion;
}

# RxJava 1 — extensions implement the Observable-based fetch* source API.
-keep class rx.** { *; }
-dontwarn rx.**

# Injekt DI fork — extensions call Injekt.get()/injectLazy().
-keep class uy.kohesive.injekt.** { *; }
-dontwarn uy.kohesive.injekt.**

# OkHttp / Okio / jsoup used by sources at runtime.
-keep class org.jsoup.** { *; }
-dontwarn okhttp3.**
-dontwarn okio.**
-dontwarn org.jsoup.**

# androidx.preference — referenced by ConfigurableSource extensions.
-keep class androidx.preference.** { *; }
