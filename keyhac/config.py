from keyhac import *

#def launch(path, param=u"", workdir=u""):
#    if workdir == u"":
#        workdir = re.sub(ur"\\[^\\]*$", ur"", path)
#
#    def _launch():
#        if path != u"":
#            shellExecute(None, None, path, param, workdir, SW_NORMAL)
#
#    return _launch


def configure(keymap):
    keymap_global = keymap.defineWindowKeymap()

    ################################################################################
    # Space and Shift
    ################################################################################
    keymap.replaceKey('Space', 'RShift')
    keymap_global['O-RShift'] = 'Space'

    ################################################################################
    # vim like
    ################################################################################
    keymap.defineModifier('Semicolon', 'User0')
    for any in ("", "S-", "C-", "C-S-", "A-", "A-S-", "A-C-", "A-C-S-", "W-",
                "W-S-", "W-C-", "W-C-S-", "W-A-", "W-A-S-", "W-A-C-",
                "W-A-C-S-"):
        keymap_global[any + 'O-Space'] = any + 'Space'
        keymap_global[any + 'O-Semicolon'] = any + 'Semicolon'
        keymap_global[any + 'O-S-Semicolon'] = any + 'Colon'
        keymap_global[any + 'U0-h'] = any + 'Left'
        keymap_global[any + 'U0-j'] = any + 'Down'
        keymap_global[any + 'U0-k'] = any + 'Up'
        keymap_global[any + 'U0-l'] = any + 'Right'
        keymap_global[any + 'W-h'] = any + 'Left'
        keymap_global[any + 'W-j'] = any + 'Down'
        keymap_global[any + 'W-k'] = any + 'Up'
        keymap_global[any + 'W-l'] = any + 'Right'
        keymap_global[any + 'U0-q'] = any + 'Escape'
        keymap_global[any + 'U0-b'] = any + 'Back'
        keymap_global[any + 'U0-n'] = any + 'Return'
        keymap_global[any + 'U0-m'] = any + 'Return'

    keymap_global['U0-S-a'] = 'End'
    keymap_global['U0-S-i'] = 'Home'
    keymap_global['U0-o'] = 'End', 'S-Return'
    keymap_global['U0-x'] = 'Delete'
    keymap_global['U0-S-x'] = 'Left', 'Delete'
    keymap_global['U0-S-o'] = 'Home', 'S-Return', 'Up'
    keymap_global['U0-S-d'] = 'S-End', 'Delete'
    keymap_global['U0-d'] = keymap.defineMultiStrokeKeymap('')
    keymap_global['U0-d']['U0-d'] = 'Home', 'S-End', 'C-x'

    def launch_ubuntu():
        shellExecute(None, "ubuntu.exe", "", "")

    keymap_global['U0-t'] = launch_ubuntu

    ################################################################################
    # toggle IME
    ################################################################################
    def switch_ime(flag):
        BALLOON_TIMEOUT_MSEC = 500

        if flag:
            ime_status = 1
            message = u'[あ]'
        else:
            ime_status = 0
            message = u'[_A]'
        wnd = keymap.getTopLevelWindow()

        def wrap():
            keymap.wnd.setImeStatus(ime_status)
            keymap.popBalloon('ime_status', message, BALLOON_TIMEOUT_MSEC)

        return wrap

    keymap_global['D-LAlt'] = 'D-LAlt', 'LCtrl'
    keymap_global['D-RAlt'] = 'D-RAlt', 'LCtrl'
    keymap_global['O-LAlt'] = switch_ime(False)
    keymap_global['O-RAlt'] = switch_ime(True)
