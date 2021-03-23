# NOTE: patch for wslpath
JAVA_HOME_=$(wslpath -u $(scoop prefix openjdk11))
export JAVA_HOME=${JAVA_HOME_//$'\r'/}
export PATH=$PATH:$JAVA_HOME/bin
