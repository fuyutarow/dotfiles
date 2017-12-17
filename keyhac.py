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

    keymap.replaceKey('Space', 'RShift')
    keymap_global['O-RShift'] = 'Space'

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

    keymap_global['U0-a'] = 'End'
    keymap_global['U0-o'] = 'End', 'S-Return'
    keymap_global['S-U0-o'] = 'Home', 'S-Return', 'Up'
    keymap_global['S-U0-d'] = 'S-End', 'Delete'
    keymap_global['U0-d'] = keymap.defineMultiStrokeKeymap('')
    keymap_global['U0-d']['U0-d'] = 'Home', 'S-End', 'C-x'
    def launch_ubuntu():
        shellExecute(None, "ubuntu.exe", "", "")

    keymap_global['U0-t'] = launch_ubuntu
    #keymap_global['U0-t'] = keymap.ShellExecuteCommand( None, None, 'bash.exe', '', '')

    #keymap_global['U0-t'] = launch(ur'')
