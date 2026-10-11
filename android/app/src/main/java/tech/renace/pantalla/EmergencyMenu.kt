package tech.renace.pantalla

import android.content.Context
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.security.MessageDigest

class EmergencyMenu(
    context: Context,
    private val http: OkHttpClient,
    private val cache: MediaCache,
    private val serverBase: () -> String,
) {
    private val dir = File(context.filesDir, "emergency").apply { mkdirs() }

    fun warm(raw: String?) {
        if (raw.isNullOrBlank()) return
        val playlist = runCatching { JSONObject(raw) }.getOrNull() ?: return
        ensureShell()
        val items = playlist.optJSONArray("items") ?: return
        for (index in 0 until items.length()) {
            val item = items.optJSONObject(index) ?: continue
            if (item.optString("kind") == "board") {
                runCatching { writeBoard(item) }
            } else {
                runCatching { cache.ensure(slideOf(item)) }
            }
        }
    }

    fun boardUrl(mediaId: String): String? {
        val file = File(dir, "board-$mediaId.html")
        if (!file.exists() || file.length() == 0L) return null
        return "https://pantalla.local/board-$mediaId.html"
    }

    fun fileFor(urlPath: String): File? {
        val name = urlPath.trimStart('/').substringBefore('?')
        if (name.isBlank() || name.contains("..") || name.contains('/')) return null
        val file = File(dir, name)
        return file.takeIf { it.exists() && it.length() > 0L }
    }

    private fun writeBoard(item: JSONObject) {
        val mediaId = item.optString("mediaId").ifBlank { item.optString("boardId") }
        if (mediaId.isBlank()) return
        val content = item.optJSONObject("content") ?: return
        val local = rewrite(content) as? JSONObject ?: content
        val payload = JSONObject()
            .put("templateId", item.optString("templateId", "aurora"))
            .put("content", local)
            .toString()
            .replace("<", "\\u003c")
        val html = """
            <!DOCTYPE html>
            <html lang="es">
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1">
              <link rel="stylesheet" href="boards.css">
              <style>html,body{margin:0;height:100%;background:#000}#stage{position:fixed;inset:0}</style>
            </head>
            <body>
              <div id="stage"></div>
              <script id="board-data" type="application/json">$payload</script>
              <script src="boards.js"></script>
            </body>
            </html>
        """.trimIndent()
        File(dir, "board-$mediaId.html").writeText(html)
    }

    private fun rewrite(node: Any?): Any? {
        return when (node) {
            is JSONObject -> {
                val copy = JSONObject()
                val keys = node.keys()
                while (keys.hasNext()) {
                    val key = keys.next()
                    val value = node.get(key)
                    copy.put(key, when {
                        key in URL_KEYS && value is String -> localUrl(value)
                        key == "backgroundVideoUrl" && value is String && value.startsWith("https://") &&
                            !value.contains("youtube") && !value.contains("youtu.be") && !value.contains("vimeo") -> localUrl(value)
                        key == "interludeUrls" && value is JSONArray -> JSONArray().apply {
                            for (index in 0 until value.length()) put(localUrl(value.optString(index)))
                        }
                        else -> rewrite(value) ?: JSONObject.NULL
                    })
                }
                copy
            }
            is JSONArray -> JSONArray().apply {
                for (index in 0 until node.length()) put(rewrite(node.get(index)))
            }
            else -> node
        }
    }

    private fun localUrl(url: String): String {
        if (!url.startsWith("http")) return url
        val ext = when {
            url.contains(".png") -> ".png"
            url.contains(".webp") -> ".webp"
            url.contains(".gif") -> ".gif"
            url.contains(".webm") -> ".webm"
            url.contains(".mp4") -> ".mp4"
            url.contains(".svg") -> ".svg"
            else -> ".jpg"
        }
        val name = "m-" + sha(url).take(20) + ext
        val file = File(dir, name)
        if (!file.exists() || file.length() == 0L) {
            if (!download(url, file)) return url
        }
        return "https://pantalla.local/$name"
    }

    private fun ensureShell() {
        for (name in listOf("boards.js", "boards.css", "mark.svg", "pattern.svg", "favicon.svg")) {
            val file = File(dir, name)
            val stale = !file.exists() || file.length() == 0L || System.currentTimeMillis() - file.lastModified() > 6 * 60 * 60 * 1000
            if (stale) download(serverBase().trimEnd('/') + "/" + name, file)
        }
        val css = File(dir, "boards.css")
        if (css.exists()) {
            val text = css.readText()
            if (text.contains("url(\"/mark.svg\")") || text.contains("url(\"/pattern.svg\")")) {
                css.writeText(
                    text.replace("url(\"/mark.svg\")", "url(\"mark.svg\")")
                        .replace("url(\"/pattern.svg\")", "url(\"pattern.svg\")"),
                )
            }
        }
    }

    private fun download(url: String, file: File): Boolean {
        return runCatching {
            val request = Request.Builder().url(url).build()
            http.newCall(request).execute().use { response ->
                if (!response.isSuccessful) return false
                val part = File(dir, file.name + ".part")
                part.outputStream().use { output ->
                    response.body?.byteStream()?.copyTo(output) ?: return false
                }
                if (part.length() == 0L) {
                    part.delete()
                    return false
                }
                if (file.exists()) file.delete()
                part.renameTo(file)
            }
            true
        }.getOrDefault(false)
    }

    private fun sha(value: String): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(value.toByteArray())
        return digest.joinToString("") { "%02x".format(it) }
    }

    private companion object {
        val URL_KEYS = setOf("backgroundUrl", "logoUrl", "imageUrl")
    }
}

private fun slideOf(item: JSONObject): Slide {
    return Slide(
        id = item.optString("id"),
        mediaId = item.optString("mediaId").ifBlank { item.optString("id") },
        kind = item.optString("kind", "image"),
        mime = item.optString("mime", "image/jpeg"),
        durationSeconds = if (item.isNull("durationSeconds")) null else item.optInt("durationSeconds"),
        bytes = item.optLong("bytes"),
        rev = item.optString("rev"),
        url = item.optString("url"),
    )
}
