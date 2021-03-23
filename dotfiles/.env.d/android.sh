# NOTE: patch for wslpath
ANDROID_HOME_=$(wslpath -u $(scoop prefix android-sdk))
export ANDROID_HOME=${ANDROID_HOME_//$'\r'/}
export PATH=$PATH:$ANDROID_HOME/emulator
export PATH=$PATH:$ANDROID_HOME/tools
export PATH=$PATH:$ANDROID_HOME/tools/bin
export PATH=$PATH:$ANDROID_HOME/platform-tools
