package tech.renace.pantalla

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        if (intent?.action != Intent.ACTION_BOOT_COMPLETED) return
        val launch = Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        try {
            context.startActivity(launch)
        } catch (_: Exception) {
            // En Android 10+ el sistema puede impedir abrir la actividad desde el arranque.
            // Si la app es el launcher, la TV la abre sola.
        }
    }
}
