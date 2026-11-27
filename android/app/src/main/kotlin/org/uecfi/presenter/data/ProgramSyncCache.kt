package org.uecfi.presenter.data

import android.net.Uri
import android.webkit.WebResourceResponse
import java.io.File
import java.io.FileInputStream
import java.util.concurrent.ConcurrentHashMap
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull
import okhttp3.OkHttpClient
import okhttp3.Request
import org.uecfi.presenter.model.ProgramItem

data class CacheStats(
  val version: Int = 0,
  val programName: String = "",
  val itemCount: Int = 0,
  val mediaFileCount: Int = 0,
  val totalBytes: Long = 0L,
  val isSyncing: Boolean = false,
)

/**
 * Persists the desktop's program items, logoSlide, and referenced visual slide media
 * (images, backgrounds, .glb 3D models — excluding audio and Studio assets) to local app
 * storage so slide switching is instant and resilient to brief Wi-Fi drops.
 */
class ProgramSyncCache(
  cacheRoot: File,
  private val json: Json,
) {
  private val syncDir = cacheRoot.apply { mkdirs() }
  private val mediaDir = File(syncDir, "media").apply { mkdirs() }
  private val bundleFile = File(syncDir, "bundle.json")
  private val mediaMetaFile = File(syncDir, "media_meta.json")
  private val syncMutex = Mutex()

  @Volatile
  private var cachedVersion: Int = 0

  private val itemJsonById = ConcurrentHashMap<String, JsonObject>()
  private val itemModelById = ConcurrentHashMap<String, ProgramItem>()
  private val mediaMetaByName = ConcurrentHashMap<String, String>()

  private val _cacheStats = MutableStateFlow(CacheStats())
  val cacheStats: StateFlow<CacheStats> = _cacheStats.asStateFlow()

  @Volatile
  private var cachedProgramName: String = ""

  init {
    loadFromDisk()
  }

  private fun refreshStats(isSyncing: Boolean = false) {
    val mediaFiles = mediaDir.listFiles()?.filter { it.isFile && !it.name.endsWith(".tmp") }.orEmpty()
    val mediaBytes = mediaFiles.sumOf { it.length() }
    val bundleBytes = if (bundleFile.exists()) bundleFile.length() else 0L
    _cacheStats.value = CacheStats(
      version = cachedVersion,
      programName = cachedProgramName,
      itemCount = itemJsonById.size,
      mediaFileCount = mediaFiles.size,
      totalBytes = mediaBytes + bundleBytes,
      isSyncing = isSyncing,
    )
  }

  private fun loadFromDisk() {
    runCatching {
      if (mediaMetaFile.exists()) {
        val metaObj = json.parseToJsonElement(mediaMetaFile.readText()).jsonObject
        metaObj.forEach { (k, v) ->
          (v as? JsonPrimitive)?.content?.let { mediaMetaByName[k] = it }
        }
      }
      if (bundleFile.exists()) {
        val bundleObj = json.parseToJsonElement(bundleFile.readText()).jsonObject
        cachedVersion = bundleObj["version"]?.jsonPrimitive?.intOrNull ?: 0
        cachedProgramName = bundleObj["programName"]?.jsonPrimitive?.content.orEmpty()
        indexBundleItems(bundleObj["items"]?.jsonArray)
      }
    }
    refreshStats()
  }

  suspend fun clearCache() = withContext(Dispatchers.IO) {
    syncMutex.withLock {
      cachedVersion = 0
      cachedProgramName = ""
      itemJsonById.clear()
      itemModelById.clear()
      mediaMetaByName.clear()
      runCatching { bundleFile.delete() }
      runCatching { mediaMetaFile.delete() }
      mediaDir.listFiles()?.forEach { runCatching { it.delete() } }
      refreshStats(isSyncing = false)
    }
  }

  private fun indexBundleItems(itemsArray: JsonArray?) {
    if (itemsArray == null) return
    val nextJson = HashMap<String, JsonObject>(itemsArray.size)
    val nextModels = HashMap<String, ProgramItem>(itemsArray.size)
    for (el in itemsArray) {
      val obj = el as? JsonObject ?: continue
      val id = obj["id"]?.jsonPrimitive?.content ?: continue
      nextJson[id] = obj
      runCatching { json.decodeFromJsonElement(ProgramItem.serializer(), obj) }
        .getOrNull()
        ?.let { nextModels[id] = it }
    }
    itemJsonById.clear()
    itemJsonById.putAll(nextJson)
    itemModelById.clear()
    itemModelById.putAll(nextModels)
  }

  fun resolveCachedItemJson(itemId: String): JsonObject? = itemJsonById[itemId]

  fun resolveCachedItemModel(itemId: String): ProgramItem? = itemModelById[itemId]

  /**
   * Intercepts WebView requests to `/media/<fileName>` and serves the pre-cached local file
   * directly from disk with CORS headers so images and .glb 3D models render with 0ms LAN latency.
   */
  fun openCachedMedia(requestUrl: String): WebResourceResponse? {
    val parsed = runCatching { Uri.parse(requestUrl) }.getOrNull() ?: return null
    val path = parsed.path ?: return null
    if (!path.startsWith("/media/")) return null
    val fileName = Uri.decode(path.removePrefix("/media/")).substringAfterLast('/')
    if (fileName.isBlank()) return null

    val localFile = File(mediaDir, fileName)
    if (!localFile.exists() || !localFile.isFile || localFile.length() == 0L) return null

    val mimeType = mimeTypeForFile(fileName)
    val headers = mapOf(
      "Access-Control-Allow-Origin" to "*",
      "Cache-Control" to "public, max-age=31536000, immutable",
    )
    return runCatching {
      WebResourceResponse(
        mimeType,
        null,
        200,
        "OK",
        headers,
        FileInputStream(localFile),
      )
    }.getOrNull()
  }

  private fun mimeTypeForFile(fileName: String): String {
    return when (fileName.substringAfterLast('.', "").lowercase()) {
      "png" -> "image/png"
      "jpg", "jpeg", "jfif" -> "image/jpeg"
      "webp" -> "image/webp"
      "gif" -> "image/gif"
      "bmp" -> "image/bmp"
      "glb" -> "model/gltf-binary"
      else -> "application/octet-stream"
    }
  }

  suspend fun syncFromServer(
    httpBaseUrl: String,
    targetVersion: Int,
    client: OkHttpClient,
  ) = withContext(Dispatchers.IO) {
    syncMutex.withLock {
      if (targetVersion > 0 && cachedVersion == targetVersion && bundleFile.exists()) {
        refreshStats(isSyncing = false)
        return@withLock
      }
      refreshStats(isSyncing = true)
      val base = httpBaseUrl.trimEnd('/')
      val req = Request.Builder().url("$base/api/sync-bundle").build()
      val bodyText = runCatching {
        client.newCall(req).execute().use { resp ->
          if (!resp.isSuccessful || resp.code == 204) return@use null
          resp.body?.string()
        }
      }.getOrNull()
      if (bodyText == null) {
        refreshStats(isSyncing = false)
        return@withLock
      }

      val bundleObj = runCatching { json.parseToJsonElement(bodyText).jsonObject }.getOrNull()
      if (bundleObj == null) {
        refreshStats(isSyncing = false)
        return@withLock
      }

      val serverVersion = bundleObj["version"]?.jsonPrimitive?.intOrNull ?: targetVersion
      cachedProgramName = bundleObj["programName"]?.jsonPrimitive?.content.orEmpty()
      indexBundleItems(bundleObj["items"]?.jsonArray)
      runCatching { bundleFile.writeText(bodyText) }
      cachedVersion = serverVersion

      // Sync visual media files referenced by the program items
      val mediaArray = bundleObj["mediaFiles"]?.jsonArray ?: JsonArray(emptyList())

      for (el in mediaArray) {
        val mObj = el as? JsonObject ?: continue
        val fileName = mObj["fileName"]?.jsonPrimitive?.content ?: continue
        val url = mObj["url"]?.jsonPrimitive?.content ?: continue
        val size = mObj["size"]?.jsonPrimitive?.longOrNull ?: -1L
        val mtimeMs = mObj["mtimeMs"]?.jsonPrimitive?.longOrNull ?: -1L
        val stamp = "$size:$mtimeMs"

        val destFile = File(mediaDir, fileName)
        if (destFile.exists() && destFile.length() == size && mediaMetaByName[fileName] == stamp) {
          continue
        }

        val mediaReq = Request.Builder().url(url).build()
        runCatching {
          client.newCall(mediaReq).execute().use { resp ->
            if (!resp.isSuccessful) return@use
            val bytes = resp.body?.bytes() ?: return@use
            val tmpFile = File(mediaDir, "$fileName.tmp")
            tmpFile.writeBytes(bytes)
            if (!tmpFile.renameTo(destFile)) {
              destFile.writeBytes(bytes)
              tmpFile.delete()
            }
            mediaMetaByName[fileName] = stamp
          }
        }
      }

      // Only clean up incomplete .tmp files; keep previously cached media files so
      // removed/re-added items appear instantly without re-downloading. (Use Clear Cache to purge.)
      mediaDir.listFiles()?.forEach { file ->
        if (file.name.endsWith(".tmp")) {
          file.delete()
        }
      }

      runCatching {
        val metaJson = JsonObject(mediaMetaByName.mapValues { JsonPrimitive(it.value) })
        mediaMetaFile.writeText(metaJson.toString())
      }
      refreshStats(isSyncing = false)
    }
  }
}
