#!/bin/bash

xmodmap -e 'keycode 255=space'
xmodmap -e 'keycode 65=Shift_L';
PID=`pidof xcape`
if [ -z ${PID} ]; then
	xcape -e '#65=space'
fi

xcape -e '#134=Henkan'
xcape -e '#108=Pause'

	#xcape -e '#253=Super_L'

#
#xmodmap -e 'keycode 253=Super_L'
#if [ -x $(command -v xcape)  ] && [ -z $(pgrep xcape | head -1) ]; then
#  xcape -e 'Super_R=Control_L|Next'
#fi
