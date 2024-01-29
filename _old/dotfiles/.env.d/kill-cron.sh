cl () { ps ax | grep /usr/sbin/cron | awk '{print $1}' | xargs sudo kill -KILL && echo killed /usr/sbin/cron
}
