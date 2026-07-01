# tmux Scripts Collection

This directory contains tmux layout scripts and utilities.

## Layout Scripts

### layout-6pane-mixed.sh
**Educational script for understanding tmux pane number dynamics**

- Creates a 6-pane mixed layout with strategic splits
- **Important**: Demonstrates how pane numbers change dynamically when splitting
- Serves as a learning material for future LLMs working on tmux customization
- Used by `Alt+3` keybinding in `.tmux.conf`

**Key Learning Points:**
- Pane numbers are not fixed - they change when new panes are created
- Understanding the numbering system is crucial for complex layouts
- Always test pane number changes in each step
- Implement idempotency checks to prevent layout conflicts

## Usage

All scripts are executable and can be run directly:

```bash
~/dotfiles/tmux/scripts/layout-6pane-mixed.sh
```

Or called via tmux keybindings as configured in `.tmux.conf`.

## Development Notes

When creating new layout scripts:

1. **Plan the split sequence carefully**
2. **Track pane number changes at each step** 
3. **Test with `tmux list-panes` and `tmux display-panes`**
4. **Add comprehensive comments for future maintainers**
5. **Include idempotency checks**

The scripts in this directory are designed to be educational resources as well as functional tools.
