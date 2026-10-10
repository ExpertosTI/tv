package tech.renace.pantalla

import android.app.Application
import android.os.Build
import coil.Coil
import coil.ImageLoader
import coil.decode.GifDecoder
import coil.decode.ImageDecoderDecoder

class PantallaApp : Application() {
    override fun onCreate() {
        super.onCreate()
        val loader = ImageLoader.Builder(this)
            .components {
                if (Build.VERSION.SDK_INT >= 28) add(ImageDecoderDecoder.Factory())
                else add(GifDecoder.Factory())
            }
            .build()
        Coil.setImageLoader(loader)
    }
}
