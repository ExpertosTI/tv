package tech.renace.pantalla

import android.content.Context
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File

class MediaCache(context: Context, private val http: OkHttpClient) {
    private val dir = File(context.filesDir, "menu").apply { mkdirs() }

    fun ensure(slide: Slide): File {
        val ext = when {
            slide.mime.contains("gif") -> ".gif"
            slide.mime.contains("png") -> ".png"
            slide.mime.contains("webp") -> ".webp"
            slide.mime.contains("webm") -> ".webm"
            slide.mime.contains("quicktime") -> ".mov"
            slide.kind == "video" -> ".mp4"
            else -> ".jpg"
        }
        val safeRev = slide.rev.replace(Regex("[^A-Za-z0-9._-]"), "_")
        val target = File(dir, "${slide.mediaId}-$safeRev$ext")
        if (target.exists() && target.length() > 0L && (slide.bytes <= 0L || target.length() == slide.bytes)) {
            return target
        }
        val part = File(dir, "${target.name}.part")
        val request = Request.Builder().url(slide.url).build()
        http.newCall(request).execute().use { response ->
            if (!response.isSuccessful) error("No se pudo bajar el archivo (${response.code})")
            part.outputStream().use { output ->
                response.body?.byteStream()?.copyTo(output) ?: error("Archivo vacío")
            }
        }
        if (part.length() == 0L) {
            part.delete()
            error("Archivo vacío")
        }
        if (target.exists()) target.delete()
        if (!part.renameTo(target)) error("No se pudo guardar el archivo")
        dir.listFiles()?.forEach { file ->
            val sameMedia = file.name.startsWith(slide.mediaId) && file.name != target.name && !file.name.endsWith(".part")
            if (sameMedia) file.delete()
        }
        return target
    }
}
