#!/bin/sh
set -eu
cd "$(dirname "$0")"

if [ -z "${JAVA_HOME:-}" ]; then
  JAVA_HOME="$(echo "$HOME"/Library/Java/jdk-21*/Contents/Home)"
  export JAVA_HOME
fi
export PATH="$JAVA_HOME/bin:$PATH"

SDK="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
printf 'sdk.dir=%s\n' "$SDK" > local.properties

if [ ! -f keystore/pantalla-upload.jks ]; then
  mkdir -p keystore
  PASS="$(openssl rand -base64 18 | tr -d '\n')"
  keytool -genkeypair -v \
    -keystore keystore/pantalla-upload.jks \
    -storepass "$PASS" \
    -keypass "$PASS" \
    -alias pantalla \
    -keyalg RSA -keysize 2048 -validity 10000 \
    -dname "CN=RENACE Pantalla, O=RENACE Tech, C=DO"
  cat > key.properties <<EOF
storeFile=keystore/pantalla-upload.jks
storePassword=$PASS
keyAlias=pantalla
keyPassword=$PASS
EOF
  printf '%s\n' "$PASS" > keystore/PASSWORD.txt
  chmod 600 key.properties keystore/PASSWORD.txt keystore/pantalla-upload.jks
  echo "Keystore nuevo. Guarda android/keystore/ y android/key.properties. Sin ellos no podrás actualizar la app en Play."
fi

chmod +x ./gradlew
./gradlew assembleRelease bundleRelease
echo "APK: app/build/outputs/apk/release/app-release.apk"
echo "AAB: app/build/outputs/bundle/release/app-release.aab"
