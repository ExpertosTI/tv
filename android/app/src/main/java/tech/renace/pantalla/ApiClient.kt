package tech.renace.pantalla

import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.io.IOException
import java.util.concurrent.TimeUnit

class ApiClient(private val store: DeviceStore) {
    val http: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(180, TimeUnit.SECONDS)
        .build()

    fun sync(): DeviceState = post("/api/device/sync")

    fun regenerate(): DeviceState = post("/api/device/code")

    private fun post(path: String, retry: Boolean = true): DeviceState {
        val request = Request.Builder()
            .url(store.serverBase() + path)
            .header("X-Device-Id", store.deviceId())
            .header("X-Device-Secret", store.deviceSecret())
            .header("Accept", "application/json")
            .post("{}".toRequestBody("application/json".toMediaType()))
            .build()
        http.newCall(request).execute().use { response ->
            val text = response.body?.string().orEmpty()
            if (response.code == 401 && retry) {
                store.resetIdentity()
                return post(path, retry = false)
            }
            if (!response.isSuccessful) {
                val message = runCatching { JSONObject(text).optString("error") }.getOrDefault("")
                throw IOException(message.ifBlank { "No se pudo hablar con el servidor (${response.code})" })
            }
            return parseState(text)
        }
    }
}
