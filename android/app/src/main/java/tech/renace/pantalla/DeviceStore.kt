package tech.renace.pantalla

import android.content.Context
import java.security.SecureRandom
import java.util.UUID

class DeviceStore(context: Context) {
    private val prefs = context.getSharedPreferences("pantalla", Context.MODE_PRIVATE)

    fun deviceId(): String {
        val current = prefs.getString(KEY_ID, null)
        if (!current.isNullOrBlank()) return current
        val created = UUID.randomUUID().toString()
        prefs.edit().putString(KEY_ID, created).apply()
        return created
    }

    fun deviceSecret(): String {
        val current = prefs.getString(KEY_SECRET, null)
        if (current != null && current.length == 64) return current
        val bytes = ByteArray(32)
        SecureRandom().nextBytes(bytes)
        val created = bytes.joinToString("") { "%02x".format(it) }
        prefs.edit().putString(KEY_SECRET, created).apply()
        return created
    }

    fun resetIdentity() {
        prefs.edit().remove(KEY_ID).remove(KEY_SECRET).apply()
    }

    fun serverBase(): String {
        return prefs.getString(KEY_SERVER, null)?.trimEnd('/')
            ?: BuildConfig.DEFAULT_SERVER.trimEnd('/')
    }

    fun setServerBase(value: String) {
        prefs.edit().putString(KEY_SERVER, value.trim().trimEnd('/')).apply()
    }

    private companion object {
        const val KEY_ID = "device_id"
        const val KEY_SECRET = "device_secret"
        const val KEY_SERVER = "server_base"
    }
}
