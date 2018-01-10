# https://stackoverflow.com/questions/27537301/most-efficient-way-to-implement-clock-with-alarm-clock-in-python
import datetime
import threading
import sys


def setup():
    print('#######')


def ring_ring():
    sys.stdout.write('ring ring\n')
    sys.stdout.flush()


class Clock:

    def __init__(self, setup=None):
        self.alarm_time = None
        self._alarm_thread = None
        self.update_interval = 1
        self.event = threading.Event()
        if setup:
            setup()

    def run(self):
        while True:
            self.event.wait(self.update_interval)
            if self.event.isSet():
                break
            now = datetime.datetime.now()
            if self._alarm_thread and self._alarm_thread.is_alive():
                alarm_symbol = '+'
            else:
                alarm_symbol = ' '
            sys.stdout.write("\r%02d:%02d:%02d %s" % (now.hour, now.minute, now.second,
                                                      alarm_symbol))
            sys.stdout.flush()

    def set_alarm(self, hour, minute, ring_ring):
        now = datetime.datetime.now()
        alarm = now.replace(hour=int(hour), minute=int(minute))
        delta = int((alarm - now).total_seconds())
        if delta <= 0:
            alarm = alarm.replace(day=alarm.day + 1)
            delta = int((alarm - now).total_seconds())
        if self._alarm_thread:
            self._alarm_thread.cancel()
        self._alarm_thread = threading.Timer(delta, ring_ring)
        self._alarm_thread.daemon = True
        self._alarm_thread.start()


if __name__ == '__main__':
    clock = Clock(setup)
    clock.set_alarm(sys.argv[1], sys.argv[2], ring_ring)
    clock.run()
