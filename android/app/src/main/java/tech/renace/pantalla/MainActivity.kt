package tech.renace.pantalla

import android.net.Uri
import android.os.Bundle
import android.provider.Settings
import android.view.KeyEvent
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.EditText
import android.widget.ImageView
import android.widget.LinearLayout
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.TextView
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.lifecycle.lifecycleScope
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.PlayerView
import coil.load
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlin.coroutines.resume
import android.graphics.Color

class MainActivity : AppCompatActivity() {
    private lateinit var store: DeviceStore
    private lateinit var api: ApiClient
    private lateinit var cache: MediaCache
    private lateinit var exo: ExoPlayer
    private lateinit var pairingPanel: LinearLayout
    private lateinit var codeText: TextView
    private lateinit var statusText: TextView
    private lateinit var waitingText: TextView
    private lateinit var imageView: ImageView
    private lateinit var playerView: PlayerView
    private lateinit var boardView: WebView
    private lateinit var newCodeButton: Button

    private var pollJob: Job? = null
    private var playJob: Job? = null
    private var activeVersion: String? = null
    private var pending: Playlist? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        setContentView(R.layout.activity_main)
        store = DeviceStore(this)
        api = ApiClient(store)
        cache = MediaCache(this, api.http)
        pairingPanel = findViewById(R.id.pairingPanel)
        codeText = findViewById(R.id.codeText)
        statusText = findViewById(R.id.statusText)
        waitingText = findViewById(R.id.waitingText)
        imageView = findViewById(R.id.stageImage)
        playerView = findViewById(R.id.stageVideo)
        boardView = findViewById(R.id.stageBoard)
        boardView.setBackgroundColor(Color.BLACK)
        boardView.settings.javaScriptEnabled = true
        boardView.settings.domStorageEnabled = true
        boardView.settings.mediaPlaybackRequiresUserGesture = false
        boardView.webViewClient = WebViewClient()
        newCodeButton = findViewById(R.id.newCodeButton)
        playerView.useController = false
        playerView.setShutterBackgroundColor(Color.BLACK)
        exo = ExoPlayer.Builder(this).build()
        exo.setAudioAttributes(
            AudioAttributes.Builder()
                .setUsage(C.USAGE_MEDIA)
                .setContentType(C.AUDIO_CONTENT_TYPE_MOVIE)
                .build(),
            false,
        )
        playerView.player = exo
        newCodeButton.setOnClickListener { regenerateCode() }
        findViewById<Button>(R.id.serverButton).setOnClickListener { editServer() }
        hideSystemBars()
    }

    override fun onStart() {
        super.onStart()
        hideSystemBars()
        startPolling()
    }

    override fun onStop() {
        pollJob?.cancel()
        playJob?.cancel()
        exo.pause()
        super.onStop()
    }

    override fun onDestroy() {
        if (::exo.isInitialized) exo.release()
        super.onDestroy()
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) hideSystemBars()
    }

    override fun onKeyDown(keyCode: Int, event: KeyEvent): Boolean {
        if (keyCode == KeyEvent.KEYCODE_MENU) {
            editServer()
            return true
        }
        return super.onKeyDown(keyCode, event)
    }

    private fun hideSystemBars() {
        WindowCompat.setDecorFitsSystemWindows(window, false)
        val controller = WindowInsetsControllerCompat(window, window.decorView)
        controller.hide(WindowInsetsCompat.Type.systemBars())
        controller.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
    }

    private fun startPolling() {
        pollJob?.cancel()
        pollJob = lifecycleScope.launch {
            var delayMs = 0L
            while (isActive) {
                if (delayMs > 0) delay(delayMs)
                try {
                    val state = withContext(Dispatchers.IO) { api.sync() }
                    onState(state)
                    delayMs = if (state.paired && state.playlist?.items?.isNotEmpty() == true) 4_000L else 3_000L
                } catch (error: CancellationException) {
                    throw error
                } catch (_: Exception) {
                    if (pairingPanel.visibility == View.VISIBLE) statusText.text = getString(R.string.offline)
                    delayMs = 5_000L
                }
            }
        }
    }

    private fun onState(state: DeviceState) {
        statusText.text = ""
        val playlist = state.playlist
        if (!state.paired) {
            showPairing(state.pairingCode)
            stopPlayback()
            return
        }
        if (playlist == null || playlist.items.isEmpty()) {
            showWaiting(getString(R.string.waiting))
            stopPlayback()
            return
        }
        showPlayer()
        if (playJob?.isActive != true) startPlayback(playlist)
        else if (playlist.version != activeVersion) pending = playlist
    }

    private fun showPairing(code: String?) {
        val wasHidden = pairingPanel.visibility != View.VISIBLE
        waitingText.visibility = View.GONE
        imageView.visibility = View.GONE
        playerView.visibility = View.GONE
        hideBoard()
        pairingPanel.visibility = View.VISIBLE
        if (!code.isNullOrBlank()) codeText.text = code
        if (wasHidden) newCodeButton.requestFocus()
    }

    private fun showWaiting(message: String) {
        pairingPanel.visibility = View.GONE
        imageView.visibility = View.GONE
        playerView.visibility = View.GONE
        hideBoard()
        waitingText.visibility = View.VISIBLE
        waitingText.text = message
    }

    private fun showPlayer() {
        pairingPanel.visibility = View.GONE
        waitingText.visibility = View.GONE
    }

    private fun stopPlayback() {
        playJob?.cancel()
        playJob = null
        activeVersion = null
        pending = null
        exo.stop()
        exo.clearMediaItems()
        imageView.setImageDrawable(null)
        hideBoard()
    }

    private fun hideBoard() {
        if (!::boardView.isInitialized) return
        boardView.visibility = View.GONE
        boardView.loadUrl("about:blank")
    }

    private fun startPlayback(playlist: Playlist) {
        playJob?.cancel()
        pending = null
        activeVersion = playlist.version
        playJob = lifecycleScope.launch {
            var index = 0
            var current = playlist
            while (isActive) {
                val next = pending
                if (next != null) {
                    current = next
                    pending = null
                    activeVersion = current.version
                    index = 0
                }
                if (current.items.isEmpty()) break
                val slide = current.items[index % current.items.size]
                try {
                    if (imageView.visibility != View.VISIBLE && playerView.visibility != View.VISIBLE && boardView.visibility != View.VISIBLE) {
                        showWaiting(getString(R.string.preparing))
                    }
                    val file = if (slide.kind == "board") null else withContext(Dispatchers.IO) { cache.ensure(slide) }
                    showPlayer()
                    playOne(slide, file, current)
                } catch (error: CancellationException) {
                    throw error
                } catch (_: Exception) {
                    delay(1200)
                }
                index += 1
            }
        }
    }

    private suspend fun playOne(slide: Slide, file: java.io.File?, playlist: Playlist) {
        val cover = playlist.fit != "contain"
        if (slide.kind == "board") {
            exo.stop()
            playerView.visibility = View.GONE
            imageView.visibility = View.GONE
            boardView.visibility = View.VISIBLE
            var shown = slide
            if (shown.url.isNotBlank()) boardView.loadUrl(shown.url)
            val seconds = (slide.durationSeconds ?: 45).coerceIn(5, 600)
            var elapsed = 0
            while (elapsed < seconds * 1000) {
                delay(250)
                elapsed += 250
                val live = pending?.items?.find { it.mediaId == shown.mediaId && it.kind == "board" }
                if (live != null && live.rev != shown.rev && live.url.isNotBlank()) {
                    boardView.loadUrl(live.url)
                    shown = live
                }
            }
            hideBoard()
        } else if (slide.kind == "video" && file != null) {
            hideBoard()
            imageView.setImageDrawable(null)
            imageView.visibility = View.GONE
            playerView.visibility = View.VISIBLE
            playerView.resizeMode = if (cover) {
                AspectRatioFrameLayout.RESIZE_MODE_ZOOM
            } else {
                AspectRatioFrameLayout.RESIZE_MODE_FIT
            }
            exo.volume = if (playlist.sound) 1f else 0f
            exo.setMediaItem(MediaItem.fromUri(Uri.fromFile(file)))
            exo.prepare()
            exo.playWhenReady = true
            val cap = slide.durationSeconds?.takeIf { it > 0 }?.times(1000L)
            awaitPlayback(cap)
            exo.stop()
            exo.clearMediaItems()
            playerView.visibility = View.GONE
        } else if (file != null) {
            hideBoard()
            exo.stop()
            playerView.visibility = View.GONE
            imageView.visibility = View.VISIBLE
            imageView.scaleType = if (cover) ImageView.ScaleType.CENTER_CROP else ImageView.ScaleType.FIT_CENTER
            imageView.load(file)
            if (motionEnabled()) {
                imageView.alpha = 0f
                imageView.animate().alpha(1f).setDuration(200).start()
            } else {
                imageView.alpha = 1f
            }
            val seconds = (slide.durationSeconds ?: playlist.imageSeconds).coerceIn(1, 600)
            delay(seconds * 1000L)
        }
    }

    private suspend fun awaitPlayback(capMs: Long?) {
        suspendCancellableCoroutine { continuation ->
            val listener = object : Player.Listener {
                override fun onPlaybackStateChanged(playbackState: Int) {
                    if (playbackState == Player.STATE_ENDED) finish()
                }

                override fun onPlayerError(error: PlaybackException) {
                    finish()
                }

                fun finish() {
                    if (!continuation.isActive) return
                    exo.removeListener(this)
                    continuation.resume(Unit)
                }
            }
            exo.addListener(listener)
            val capJob = if (capMs != null) {
                lifecycleScope.launch {
                    delay(capMs)
                    if (continuation.isActive) {
                        exo.removeListener(listener)
                        continuation.resume(Unit)
                    }
                }
            } else null
            continuation.invokeOnCancellation {
                capJob?.cancel()
                exo.removeListener(listener)
            }
        }
    }

    private fun motionEnabled(): Boolean {
        val scale = Settings.Global.getFloat(contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f)
        return scale > 0f
    }

    private fun regenerateCode() {
        newCodeButton.isEnabled = false
        lifecycleScope.launch {
            try {
                val state = withContext(Dispatchers.IO) { api.regenerate() }
                onState(state)
            } catch (error: CancellationException) {
                throw error
            } catch (error: Exception) {
                statusText.text = error.message ?: getString(R.string.offline)
            } finally {
                newCodeButton.isEnabled = true
            }
        }
    }

    private fun editServer() {
        val input = EditText(this)
        input.setText(store.serverBase())
        input.setSingleLine(true)
        input.setPadding(48, 32, 48, 32)
        AlertDialog.Builder(this)
            .setTitle(R.string.server_title)
            .setMessage(R.string.server_message)
            .setView(input)
            .setPositiveButton(R.string.save) { _, _ ->
                val value = input.text.toString().trim().trimEnd('/')
                if (value.startsWith("http://") || value.startsWith("https://")) {
                    store.setServerBase(value)
                    stopPlayback()
                    startPolling()
                } else {
                    statusText.text = getString(R.string.server_invalid)
                }
            }
            .setNegativeButton(R.string.cancel, null)
            .show()
        input.requestFocus()
    }
}
