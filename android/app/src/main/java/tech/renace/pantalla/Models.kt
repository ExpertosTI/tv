package tech.renace.pantalla

import org.json.JSONObject

data class Slide(
    val id: String,
    val mediaId: String,
    val kind: String,
    val mime: String,
    val durationSeconds: Int?,
    val bytes: Long,
    val rev: String,
    val url: String,
)

data class Playlist(
    val id: String,
    val name: String,
    val fit: String,
    val sound: Boolean,
    val imageSeconds: Int,
    val version: String,
    val items: List<Slide>,
)

data class DeviceState(
    val paired: Boolean,
    val pairingCode: String?,
    val screenName: String?,
    val playlist: Playlist?,
)

fun parseState(json: String): DeviceState {
    val root = JSONObject(json)
    val playlistJson = root.optJSONObject("playlist")
    return DeviceState(
        paired = root.optBoolean("paired"),
        pairingCode = root.optString("pairingCode").ifBlank { null },
        screenName = root.optString("screenName").ifBlank { null },
        playlist = playlistJson?.let { parsePlaylist(it) },
    )
}

internal fun parsePlaylist(json: JSONObject): Playlist {
    val itemsJson = json.optJSONArray("items")
    val items = buildList {
        if (itemsJson != null) {
            for (index in 0 until itemsJson.length()) {
                val item = itemsJson.getJSONObject(index)
                add(
                    Slide(
                        id = item.getString("id"),
                        mediaId = item.optString("mediaId").ifBlank { item.optString("boardId", item.getString("id")) },
                        kind = item.optString("kind", "image"),
                        mime = item.optString("mime", "image/jpeg"),
                        durationSeconds = if (item.isNull("durationSeconds")) null else item.optInt("durationSeconds"),
                        bytes = item.optLong("bytes"),
                        rev = item.optString("rev"),
                        url = item.optString("url"),
                    )
                )
            }
        }
    }
    return Playlist(
        id = json.getString("id"),
        name = json.optString("name"),
        fit = json.optString("fit", "cover"),
        sound = json.optBoolean("sound"),
        imageSeconds = json.optInt("imageSeconds", 10).coerceIn(1, 600),
        version = json.optString("version"),
        items = items,
    )
}
