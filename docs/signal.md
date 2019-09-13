|   |   |   |   |
|---|---|---|---|
|SIGHUP|1|Term|制御端末の切断（ハングアップ）、仮想端末の終了|
|SIGINT|2|Term|キーボードからの割り込みシグナル（通常は［CTRL］＋［C］）|
|SIGQUIT|3|Core|キーボードによる中止シグナル（通常は［CTRL］＋［\］）|
|SIGFPE|8|Core|不正な浮動小数点演算（ゼロ除算やオーバーフローなど）の発生|
|SIGKILL|9|Term|強制終了シグナル（KILLシグナル）|
|SIGSEGV|11|Core|不正なメモリ参照の発生|
|SIGPIPE|13|Term|読み手のいないパイプへの書き込み （通常はこのシグナルを受け取ると即時終了する）|
|SIGALRM|14|Term|タイマー（Alarm）による終了|
|SIGTERM|15|Term|終了シグナル（「kill」コマンドのデフォルトシグナル）|
|SIGCHLD|17|Ignore|子プロセスの状態（終了、停止または再開）が変わった|
|SIGCONT|18|Cont|一時停止しているジョブへの再開シグナル|
|SIGSTOP|19|Stop|一時停止シグナル|
|SIGTSTP|20|Stop|端末からの一時停止シグナル（通常は［CTRL］＋［Z］）|
|SIGTTIN|21|Stop|バックグラウンドジョブ／プロセスのキーボード入力待ち|
|SIGTTOU|22|Stop|バックグラウンドジョブ／プロセスの端末出力待ち|
|SIGXCPU|24|Core|CPU時間制限を越えた|
|SIGXFSZ|25|Core|ファイルサイズ制限を越えた|
|SIGWINCH|28|Ignore|ウィンドウのサイズが変更された|

